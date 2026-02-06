/**
 * Google Gemini Provider
 *
 * Streaming chat completions with tool support using Google's Generative AI SDK.
 */

import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "npm:@google/generative-ai@0.21.0";
import { zodToJsonSchema } from "npm:zod-to-json-schema@3.23.5";
import type {
  LLMProvider,
  Message,
  Tool,
  StreamChunk,
  StreamOptions,
  ToolCall,
} from "../types.ts";
import * as Sentry from "@sentry/deno";

export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    if (!key) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY environment variable is required"
      );
    }
    this.client = new GoogleGenerativeAI(key);
  }

  /**
   * Convenience method for streaming chat without tools
   */
  chat(
    messages: Message[],
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk> {
    return this.stream(messages, [], options);
  }

  async *stream(
    messages: Message[],
    tools: Tool[],
    options: StreamOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const {
      model = "gemini-2.0-flash",
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
    } = options;

    // Validate temperature - ensure it's a valid number between 0 and 2
    const validTemperature =
      typeof temperature === "number" && !isNaN(temperature)
        ? Math.max(0, Math.min(2, temperature))
        : 0.7;

    const genModel = this.client.getGenerativeModel({
      model,
      generationConfig: {
        temperature: validTemperature,
        maxOutputTokens: maxTokens,
      },
      systemInstruction: systemPrompt || undefined,
    });

    // formatMessages is now async to handle image URL fetching
    const formattedMessages = await this.formatMessages(messages);
    const formattedTools =
      tools.length > 0 ? this.formatTools(tools) : undefined;

    const chat = genModel.startChat({
      history: formattedMessages.slice(0, -1),
      tools: formattedTools,
    });

    // Get the last message to send
    const lastMessage = formattedMessages[formattedMessages.length - 1];
    const lastParts = lastMessage?.parts || [{ text: "" }];

    const result = await chat.sendMessageStream(lastParts);

    let currentToolCalls: ToolCall[] = [];

    for await (const chunk of result.stream) {
      const text = chunk.text();

      // Text content
      if (text) {
        yield { type: "text", delta: text };
      }

      // Check for function calls
      const functionCalls = chunk.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          const toolCall: ToolCall = {
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: fc.name,
            arguments: fc.args as Record<string, unknown>,
          };
          currentToolCalls.push(toolCall);
          yield {
            type: "tool_call",
            call: toolCall,
          };
        }
      }
    }

    // Stream finished
    yield {
      type: "done",
      finishReason: currentToolCalls.length > 0 ? "tool_calls" : "stop",
      hasToolCalls: currentToolCalls.length > 0,
    };
  }

  private async formatMessages(messages: Message[]): Promise<Content[]> {
    const contents: Content[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        // System messages are handled via systemInstruction
        continue;
      }

      if (m.role === "tool") {
        // Tool results in Gemini format - use name field for function name
        const content =
          typeof m.content === "string"
            ? m.content
            : m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
        contents.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: m.name || "unknown",
                response: { result: content },
              },
            },
          ],
        });
        continue;
      }

      const role = m.role === "assistant" ? "model" : "user";

      // Handle multimodal content for user messages or assistant messages with tool_use
      if (Array.isArray(m.content)) {
        const parts: Part[] = [];
        for (const part of m.content) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "tool_use") {
            // Convert tool_use to Gemini's functionCall format
            parts.push({
              functionCall: {
                name: part.name,
                args: part.input,
              },
            });
          } else if (part.type === "image_url") {
            // For Gemini, we need to fetch the image and convert to base64 (inlineData)
            // fileUri only works with files uploaded via Google's File API
            const imageData = await this.fetchMediaAsBase64(part.image_url.url);
            if (imageData) {
              parts.push({
                inlineData: {
                  mimeType: imageData.mimeType,
                  data: imageData.base64,
                },
              });
            }
          } else if (part.type === "input_audio") {
            // Audio is already base64-encoded — pass directly as inlineData
            const formatToMime: Record<string, string> = {
              webm: "audio/webm",
              wav: "audio/wav",
              mp3: "audio/mp3",
              mp4: "audio/mp4",
              ogg: "audio/ogg",
            };
            const mimeType =
              formatToMime[part.input_audio.format] || "audio/webm";
            parts.push({
              inlineData: {
                mimeType,
                data: part.input_audio.data,
              },
            });
          } else if (part.type === "input_video") {
            // Fetch video and convert to base64 inlineData for Gemini
            const videoData = await this.fetchMediaAsBase64(
              part.input_video.url
            );
            if (videoData) {
              parts.push({
                inlineData: {
                  mimeType: part.input_video.mimeType,
                  data: videoData.base64,
                },
              });
            }
          }
        }
        contents.push({ role, parts });
        continue;
      }

      // String content (array case handled above with continue)
      const content = m.content as string;
      const parts: Part[] = [{ text: content }];
      contents.push({ role, parts });
    }

    return contents;
  }

  /**
   * Fetch media (image/video) from URL and convert to base64
   */
  private async fetchMediaAsBase64(
    url: string
  ): Promise<{ base64: string; mimeType: string } | null> {
    try {
      console.log(`[google] Fetching media for base64 conversion: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[google] Failed to fetch media: ${response.status}`);
        Sentry.captureMessage(`[google] Failed to fetch media: ${response.status}`, {
          level: "error",
          tags: { source: "llm", provider: "google", feature: "fetch-media" },
          extra: { mediaUrl: url, statusCode: response.status },
        });
        return null;
      }

      const contentType =
        response.headers.get("content-type") || this.getMimeTypeFromUrl(url);
      const arrayBuffer = await response.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      console.log(
        `[google] Media converted: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB, type: ${contentType}`
      );
      return { base64, mimeType: contentType };
    } catch (error) {
      console.error(`[google] Error fetching media:`, error);
      Sentry.captureException(error, {
        tags: { source: "google-provider", feature: "fetch-media" },
        extra: { mediaUrl: url },
      });
      return null;
    }
  }

  /**
   * Infer MIME type from URL
   */
  private getMimeTypeFromUrl(url: string): string {
    const lowercaseUrl = url.toLowerCase();
    if (lowercaseUrl.includes(".png")) return "image/png";
    if (lowercaseUrl.includes(".jpg") || lowercaseUrl.includes(".jpeg"))
      return "image/jpeg";
    if (lowercaseUrl.includes(".gif")) return "image/gif";
    if (lowercaseUrl.includes(".webp")) return "image/webp";
    return "image/jpeg"; // default
  }

  private formatTools(
    tools: Tool[]
  ): { functionDeclarations: FunctionDeclaration[] }[] {
    const functionDeclarations = tools.map((t) => {
      const schema = zodToJsonSchema(t.parameters) as Record<string, unknown>;
      // Clean schema for Google's API - remove unsupported properties
      const cleanedSchema = this.cleanSchemaForGoogle(schema);

      return {
        name: t.name,
        description: t.description,
        // Cast through unknown - zodToJsonSchema produces compatible output but types don't overlap
        parameters:
          cleanedSchema as unknown as FunctionDeclaration["parameters"],
      } satisfies FunctionDeclaration;
    });

    return [{ functionDeclarations }];
  }

  /**
   * Recursively clean JSON schema to remove properties not supported by Google's API
   */
  private cleanSchemaForGoogle(
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(schema)) {
      // Skip unsupported properties
      if (key === "$schema" || key === "additionalProperties") {
        continue;
      }

      // Recursively clean nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        cleaned[key] = this.cleanSchemaForGoogle(
          value as Record<string, unknown>
        );
      } else if (Array.isArray(value)) {
        // Handle arrays (e.g., for "anyOf", "oneOf", etc.)
        cleaned[key] = value.map((item) =>
          item && typeof item === "object"
            ? this.cleanSchemaForGoogle(item as Record<string, unknown>)
            : item
        );
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }
}
