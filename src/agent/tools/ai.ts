/**
 * AI Tools for Chipp Deno Agent
 *
 * Provides image generation and analysis capabilities using Gemini.
 */

import { z } from "zod";
import type { ToolRegistry } from "../registry.ts";
import { uploadImageToPublicBucket } from "../../services/storage.service.ts";
import { GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/deno";

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Get the Gemini client instance
 */
function getGeminiClient(): GoogleGenAI {
  const apiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY environment variable not set"
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate an image using Gemini's image generation model
 */
async function generateImageWithGemini(
  prompt: string,
  imageUrls?: string[],
  options?: {
    characterConsistency?: boolean;
    blendMode?: "auto" | "manual";
  }
): Promise<string> {
  const genAI = getGeminiClient();

  // Build the request
  const contents: ContentPart[] = [{ text: prompt }];

  // Add reference images if provided
  if (imageUrls && imageUrls.length > 0) {
    for (const imageUrl of imageUrls) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.error(`Failed to fetch image: ${imageUrl}`);
          Sentry.captureMessage(`Failed to fetch reference image: ${response.status}`, {
            level: "error",
            tags: { source: "agent", feature: "tools", tool: "ai" },
            extra: { imageUrl, statusCode: response.status },
          });
          continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64Data = btoa(
          String.fromCharCode(...new Uint8Array(arrayBuffer))
        );
        contents.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        });
      } catch (error) {
        console.error(`Error fetching image ${imageUrl}:`, error);
        Sentry.captureException(error, {
          tags: { source: "agent-ai-tool", feature: "generate-image-fetch" },
          extra: { imageUrl },
        });
      }
    }
  }

  // Add character consistency hint if requested
  if (options?.characterConsistency && imageUrls && imageUrls.length > 0) {
    const textPart = contents[0] as { text: string };
    textPart.text = `${prompt}\n\nIMPORTANT: Maintain character consistency across the generated image.`;
  }

  // Call Gemini image generation
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents,
    config: {
      responseModalities: ["text", "image"],
    },
  });

  // Extract image from response
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Invalid response structure from Gemini");
  }

  const imagePart = parts.find(
    (part: { inlineData?: { mimeType?: string; data?: string } }) =>
      part.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart?.inlineData?.data) {
    // Get Gemini's explanation for why no image was generated
    const textPart = parts.find((part: { text?: string }) => part.text);
    const explanation = textPart?.text || "No explanation provided";
    const finishReason = response?.candidates?.[0]?.finishReason;

    throw new Error(
      `Gemini did not generate an image. ${finishReason ? `Reason: ${finishReason}. ` : ""}${explanation.substring(0, 200)}`
    );
  }

  // Decode base64 to buffer
  const binaryString = atob(imagePart.inlineData.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Upload to GCS
  const timestamp = Date.now();
  const filename = `chat-generations/generated-${timestamp}.jpg`;

  const publicUrl = await uploadImageToPublicBucket(
    bytes,
    filename,
    "image/jpeg"
  );

  return publicUrl;
}

type VideoPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/**
 * Determine video mime type from URL
 */
function getVideoMimeType(url: string): string {
  const urlLower = url.toLowerCase();
  if (urlLower.includes(".mov")) return "video/quicktime";
  if (urlLower.includes(".webm")) return "video/webm";
  if (urlLower.includes(".avi")) return "video/x-msvideo";
  return "video/mp4";
}

/**
 * Analyze a video using Gemini's native video understanding
 */
async function analyzeVideoWithGemini(
  query: string,
  videoUrl: string
): Promise<string> {
  const genAI = getGeminiClient();
  const mimeType = getVideoMimeType(videoUrl);

  // Check if this is a GCS URL - can use fileData.fileUri directly
  const gcsMatch = videoUrl.match(
    /storage\.googleapis\.com\/([^/]+)\/(.+?)(?:\?|$)/
  );

  if (gcsMatch) {
    const bucket = gcsMatch[1];
    const filePath = decodeURIComponent(gcsMatch[2]);
    const gcsUri = `gs://${bucket}/${filePath}`;

    console.log(
      `[analyzeVideo] Using GCS fileUri: ${gcsUri.substring(0, 50)}...`
    );

    // Use fileData.fileUri for GCS files (supports up to 2GB)
    const contents: VideoPart[] = [
      { text: query },
      {
        fileData: {
          mimeType,
          fileUri: gcsUri,
        },
      },
    ];

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-pro",
      contents,
    });

    if (!response?.candidates?.[0]?.content?.parts) {
      throw new Error("Invalid response format from Gemini");
    }

    const textParts = response.candidates[0].content.parts
      .filter((part: { text?: string }) => part.text)
      .map((part: { text?: string }) => part.text)
      .join("\n");

    return textParts;
  }

  // For non-GCS URLs, download and use inline base64
  console.log(
    `[analyzeVideo] Downloading video from: ${videoUrl.substring(0, 50)}...`
  );

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(
      `Failed to access video: ${videoResponse.status} ${videoResponse.statusText}`
    );
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const videoBytes = new Uint8Array(arrayBuffer);
  const sizeMB = videoBytes.length / 1024 / 1024;

  console.log(`[analyzeVideo] Video downloaded: ${sizeMB.toFixed(2)}MB`);

  // Gemini inline data limit is ~15MB, check if too large
  if (sizeMB > 15) {
    throw new Error(
      `Video file is too large (${sizeMB.toFixed(1)}MB). Maximum size for direct URLs is 15MB. ` +
        `For larger videos, please upload to cloud storage first.`
    );
  }

  // Convert to base64
  const base64Data = btoa(String.fromCharCode(...videoBytes));

  const contents: VideoPart[] = [
    { text: query },
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
  ];

  const response = await genAI.models.generateContent({
    model: "gemini-2.5-pro",
    contents,
  });

  if (!response?.candidates?.[0]?.content?.parts) {
    throw new Error("Invalid response format from Gemini");
  }

  const textParts = response.candidates[0].content.parts
    .filter((part: { text?: string }) => part.text)
    .map((part: { text?: string }) => part.text)
    .join("\n");

  return textParts;
}

/**
 * Register AI tools with the agent registry
 */
export function registerAITools(
  registry: ToolRegistry,
  options?: { skipVideoTool?: boolean }
): void {
  // Generate Image tool
  registry.register({
    name: "generateImage",
    description:
      "Generate an image based on a text description. Can also edit or transform existing images when URLs are provided.",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "A detailed description of the image to generate. Be specific about style, colors, composition, and subject matter."
        ),
      imageUrl: z
        .string()
        .optional()
        .describe(
          "Optional: URL of an existing image to edit or use as reference"
        ),
      imageUrls: z
        .array(z.string())
        .optional()
        .describe(
          "Optional: Multiple image URLs to blend or use as references"
        ),
      characterConsistency: z
        .boolean()
        .optional()
        .describe(
          "When true, attempts to maintain consistent character appearance across generated images"
        ),
      blendMode: z
        .enum(["auto", "manual"])
        .optional()
        .describe(
          "How to blend multiple images: 'auto' lets AI decide, 'manual' follows prompt instructions"
        ),
    }),
    execute: async ({
      prompt,
      imageUrl,
      imageUrls,
      characterConsistency,
      blendMode,
    }) => {
      // Combine imageUrl and imageUrls into a single array
      const allImageUrls: string[] = [];
      if (imageUrl) allImageUrls.push(imageUrl);
      if (imageUrls) allImageUrls.push(...imageUrls);

      try {
        const resultUrl = await generateImageWithGemini(prompt, allImageUrls, {
          characterConsistency,
          blendMode,
        });

        return {
          success: true,
          imageUrl: resultUrl,
          message: "Image generated successfully",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
          message: `Failed to generate image: ${errorMessage}`,
        };
      }
    },
  });

  // Analyze Video tool - skip when model handles video natively
  if (options?.skipVideoTool) {
    return;
  }
  registry.register({
    name: "analyzeVideo",
    description:
      "Analyze a video file to answer questions about its content. Can describe visual content, transcribe audio, identify objects and actions, and answer questions about the video. Supports uploaded video files and direct video URLs. YouTube URLs are not currently supported.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "The question or request about the video. Be specific about what you want to know. Examples: 'What happens in this video?', 'Describe the main events', 'Transcribe the spoken dialogue', 'What objects are visible?'"
        ),
      videoUrl: z
        .string()
        .url()
        .describe(
          "The URL of the video file to analyze. Supports direct video file links (mp4, mov, webm) and GCS/cloud storage URLs. YouTube URLs are not currently supported."
        ),
    }),
    execute: async ({ query, videoUrl }) => {
      // Check for YouTube URLs and provide helpful error
      if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
        return {
          success: false,
          error: "YouTube URLs not supported",
          message:
            "YouTube video analysis is not currently supported. Please provide a direct video URL or upload the video file.",
        };
      }

      try {
        const analysis = await analyzeVideoWithGemini(query, videoUrl);

        return {
          success: true,
          analysis,
          message: "Video analyzed successfully",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: errorMessage,
          message: `Failed to analyze video: ${errorMessage}`,
        };
      }
    },
  });
}
