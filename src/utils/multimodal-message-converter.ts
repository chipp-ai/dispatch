/**
 * Multimodal Message Converter
 *
 * Converts chat messages containing embedded image URLs (markdown format or metadata)
 * into proper multimodal content parts for models with native vision capabilities.
 *
 * This enables models like Claude Sonnet 4/4.5, GPT-4o, and Gemini to properly
 * "see" uploaded images instead of just receiving URLs as text.
 */

import { log } from "@/lib/logger.ts";
import type {
  Message,
  ContentPart,
  TextContentPart,
  ImageContentPart,
} from "../llm/types.ts";

// Re-export for convenience
export type { ContentPart, TextContentPart, ImageContentPart };

// Regex patterns for extracting image URLs
const MARKDOWN_IMAGE_PATTERN = /!\[\]\(([^)]+)\)/g;
const METADATA_IMAGES_PATTERN =
  /\(The user has uploaded images to this message\. Here are the URLs for the images: ([^)]+)\)/;

// Common image hosting domains we support
const SUPPORTED_IMAGE_DOMAINS = [
  "storage.googleapis.com",
  "storage.cloud.google.com",
  "chipp-images",
  "chipp-chat-images",
  "whatsapp-media",
  "files.slack.com",
  "cdn.discordapp.com",
  "i.imgur.com",
];

// Models that support native vision
const VISION_MODELS = new Set([
  // OpenAI
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-vision-preview",
  "gpt-4-turbo",
  // Anthropic
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-latest",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5",
  "claude-opus-4-20250514",
  // Google
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash-exp",
  "gemini-2.5-pro-preview-05-06",
]);

/**
 * Multimodal message format (same as Message from llm/types)
 */
export type MultimodalMessage = Message;

/**
 * Input message format (string content only)
 */
export interface StringMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
  name?: string;
}

/**
 * Generic message - alias for Message from llm/types
 */
export type GenericMessage = Message;

/**
 * Check if a model supports vision
 */
export function modelSupportsVision(model: string): boolean {
  // Check exact match first
  if (VISION_MODELS.has(model)) return true;

  // Check if model name contains vision-capable model identifiers
  const visionPatterns = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-4-vision",
    "claude-3",
    "claude-sonnet-4",
    "claude-opus-4",
    "gemini-1.5",
    "gemini-2",
  ];

  return visionPatterns.some((pattern) => model.includes(pattern));
}

/**
 * Extract all image URLs from a message string
 */
export function extractImageUrls(content: string | undefined | null): string[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  const urls: Set<string> = new Set();

  // Extract from markdown image syntax: ![](url)
  const markdownMatches = content.matchAll(MARKDOWN_IMAGE_PATTERN);
  for (const match of markdownMatches) {
    const url = match[1].trim();
    if (isValidImageUrl(url)) {
      urls.add(url);
    }
  }

  // Extract from metadata block
  const metadataMatch = content.match(METADATA_IMAGES_PATTERN);
  if (metadataMatch) {
    const urlsString = metadataMatch[1];
    const metadataUrls = urlsString.split(",").map((u) => u.trim());
    for (const url of metadataUrls) {
      if (isValidImageUrl(url)) {
        urls.add(url);
      }
    }
  }

  return Array.from(urls);
}

/**
 * Validate that a URL is a proper image URL
 */
export function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be http or https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // Check for common image extensions or known image hosting domains
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(
      parsed.pathname
    );
    const isKnownImageHost = SUPPORTED_IMAGE_DOMAINS.some(
      (domain) =>
        parsed.hostname.includes(domain) || parsed.pathname.includes(domain)
    );

    return hasImageExtension || isKnownImageHost;
  } catch {
    return false;
  }
}

/**
 * Remove image-related content from message text
 */
export function removeImageContentFromText(content: string): string {
  let cleaned = content;

  // Remove markdown images: ![](url)
  cleaned = cleaned.replace(/!\[\]\([^)]+\)/g, "");

  // Remove image metadata block
  cleaned = cleaned.replace(METADATA_IMAGES_PATTERN, "");

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Convert a single message to multimodal format if it contains images
 */
export function convertMessageToMultimodal(
  message: StringMessage
): MultimodalMessage {
  // Only process user messages - assistant and system messages stay as-is
  if (message.role !== "user") {
    return {
      role: message.role,
      content: message.content,
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.name && { name: message.name }),
    };
  }

  const imageUrls = extractImageUrls(message.content);

  // No images found, return as-is
  if (imageUrls.length === 0) {
    return {
      role: message.role,
      content: message.content,
    };
  }

  // Clean the text content (remove markdown images and metadata)
  const cleanedText = removeImageContentFromText(message.content);

  // Build multimodal content parts
  const contentParts: ContentPart[] = [];

  // Add text part first (if there's any text remaining)
  if (cleanedText.length > 0) {
    contentParts.push({
      type: "text",
      text: cleanedText,
    });
  }

  // Add image parts
  for (const url of imageUrls) {
    contentParts.push({
      type: "image_url",
      image_url: { url },
    });
  }

  log.debug("Converted message with images", { source: "multimodal", feature: "convert", imageCount: imageUrls.length });

  return {
    role: "user",
    content: contentParts.length > 0 ? contentParts : message.content,
  };
}

/**
 * Convert all messages to multimodal format for vision-capable models
 * Accepts both string-only and already-multimodal messages
 */
export function convertMessagesToMultimodal(
  messages: GenericMessage[],
  model: string
): MultimodalMessage[] {
  // Check if model supports vision
  const supportsVision = modelSupportsVision(model);

  if (!supportsVision) {
    log.debug("Model does not support vision, skipping conversion", {
      source: "multimodal",
      feature: "convert",
      model,
    });
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCallId && { toolCallId: m.toolCallId }),
      ...(m.name && { name: m.name }),
    }));
  }

  log.debug("Converting messages for vision model", { source: "multimodal", feature: "convert", model });

  const converted = messages.map((message) => {
    // Already multimodal - return as-is
    if (Array.isArray(message.content)) {
      return {
        role: message.role,
        content: message.content,
        ...(message.toolCallId && { toolCallId: message.toolCallId }),
        ...(message.name && { name: message.name }),
      };
    }
    // String content - convert to multimodal
    return convertMessageToMultimodal(message as StringMessage);
  });

  // Log summary
  const messagesWithImages = converted.filter(
    (m) =>
      Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
  );

  if (messagesWithImages.length > 0) {
    const totalImages = messagesWithImages.reduce((count, m) => {
      if (Array.isArray(m.content)) {
        return count + m.content.filter((p) => p.type === "image_url").length;
      }
      return count;
    }, 0);
    log.debug("Conversion complete", {
      source: "multimodal",
      feature: "convert",
      messagesWithImages: messagesWithImages.length,
      totalImages,
    });
  }

  return converted;
}

/**
 * Check if any messages contain embedded images
 * Accepts both string-only and multimodal messages
 */
export function hasEmbeddedImages(messages: GenericMessage[]): boolean {
  return messages.some((message) => {
    if (message.role !== "user") return false;

    // Already multimodal - check for image parts
    if (Array.isArray(message.content)) {
      return message.content.some((p) => p.type === "image_url");
    }

    // String content - check for embedded image URLs
    if (typeof message.content !== "string") return false;
    const imageUrls = extractImageUrls(message.content);
    return imageUrls.length > 0;
  });
}
