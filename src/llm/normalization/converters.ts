/**
 * Message Format Converters
 *
 * Converts between the legacy Message type (from llm/types.ts) and the new
 * UnifiedMessage type. This enables gradual migration while maintaining
 * backward compatibility.
 *
 * Legacy format (Message):
 * - content: string | ContentPart[] (ContentPart = TextContentPart | ImageContentPart | ToolUseContentPart)
 * - toolCallId?: string (for tool result messages)
 * - name?: string (for tool result messages)
 *
 * Unified format (UnifiedMessage):
 * - content: string | UnifiedContentPart[]
 * - toolCallId?: string
 * - toolName?: string
 */

import { log } from "@/lib/logger.ts";
import type {
  Message,
  ContentPart,
  TextContentPart,
  ImageContentPart,
  ToolUseContentPart,
} from "../types.ts";
import type {
  UnifiedMessage,
  UnifiedContentPart,
  UnifiedTextPart,
  UnifiedImagePart,
  UnifiedToolCallPart,
  UnifiedToolResultPart,
} from "./types.ts";

/**
 * Convert legacy Message to UnifiedMessage
 *
 * Handles all content types from the legacy format:
 * - text: Simple text content
 * - image_url: Image URLs (converted to unified image format)
 * - tool_use: Tool calls from assistant (converted to tool-call)
 */
export function toUnified(message: Message): UnifiedMessage;
export function toUnified(messages: Message[]): UnifiedMessage[];
export function toUnified(
  input: Message | Message[]
): UnifiedMessage | UnifiedMessage[] {
  if (Array.isArray(input)) {
    return input.map((m) => convertMessageToUnified(m));
  }
  return convertMessageToUnified(input);
}

/**
 * Convert UnifiedMessage to legacy Message format
 *
 * Handles conversion back to legacy format for existing code paths.
 */
export function fromUnified(message: UnifiedMessage): Message;
export function fromUnified(messages: UnifiedMessage[]): Message[];
export function fromUnified(
  input: UnifiedMessage | UnifiedMessage[]
): Message | Message[] {
  if (Array.isArray(input)) {
    return input.map((m) => convertMessageFromUnified(m));
  }
  return convertMessageFromUnified(input);
}

/**
 * Convert a single legacy Message to UnifiedMessage
 */
function convertMessageToUnified(message: Message): UnifiedMessage {
  // Handle null/undefined content
  if (message.content == null) {
    return {
      role: message.role,
      content: "",
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.name && { toolName: message.name }),
    };
  }

  // String content - simple conversion
  if (typeof message.content === "string") {
    return {
      role: message.role,
      content: message.content,
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.name && { toolName: message.name }),
    };
  }

  // Array content - convert each part
  const unifiedParts: UnifiedContentPart[] = [];

  for (const part of message.content) {
    const converted = convertContentPartToUnified(part);
    if (converted) {
      unifiedParts.push(converted);
    }
  }

  return {
    role: message.role,
    content: unifiedParts.length > 0 ? unifiedParts : "",
    ...(message.toolCallId && { toolCallId: message.toolCallId }),
    ...(message.name && { toolName: message.name }),
  };
}

/**
 * Convert a single legacy ContentPart to UnifiedContentPart
 */
function convertContentPartToUnified(
  part: ContentPart
): UnifiedContentPart | null {
  switch (part.type) {
    case "text":
      return convertTextPart(part as TextContentPart);
    case "image_url":
      return convertImagePart(part as ImageContentPart);
    case "tool_use":
      return convertToolUsePart(part as ToolUseContentPart);
    default:
      log.warn("Unknown content part type", {
        source: "llm",
        feature: "converters",
        partType: (part as ContentPart).type,
      });
      return null;
  }
}

/**
 * Convert text content part
 */
function convertTextPart(part: TextContentPart): UnifiedTextPart {
  return {
    type: "text",
    text: part.text,
  };
}

/**
 * Convert image content part
 *
 * The legacy format stores images as URLs. We preserve the URL and leave
 * base64 data empty - the encoder will fetch if needed.
 */
function convertImagePart(part: ImageContentPart): UnifiedImagePart {
  const url = part.image_url.url;

  // Check if it's a data URL (already base64)
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        type: "image",
        mediaType: match[1],
        data: match[2],
        url: undefined, // Original was data URL, no external URL
      };
    }
  }

  // URL reference - keep URL, encoder will fetch if needed
  return {
    type: "image",
    data: "", // Empty - encoder will fetch
    mediaType: inferMimeType(url),
    url,
  };
}

/**
 * Convert tool use content part (from assistant message)
 */
function convertToolUsePart(part: ToolUseContentPart): UnifiedToolCallPart {
  return {
    type: "tool-call",
    toolCallId: part.id,
    toolName: part.name,
    input: part.input,
  };
}

/**
 * Convert a single UnifiedMessage to legacy Message format
 */
function convertMessageFromUnified(message: UnifiedMessage): Message {
  // String content - simple conversion
  if (typeof message.content === "string") {
    return {
      role: message.role,
      content: message.content,
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.toolName && { name: message.toolName }),
    };
  }

  // Array content - convert each part
  const legacyParts: ContentPart[] = [];

  for (const part of message.content) {
    const converted = convertContentPartFromUnified(part);
    if (converted) {
      legacyParts.push(converted);
    }
  }

  // If no parts converted, return empty string content
  if (legacyParts.length === 0) {
    return {
      role: message.role,
      content: "",
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.toolName && { name: message.toolName }),
    };
  }

  // If only text parts, check if we can simplify to string
  const allText = legacyParts.every((p) => p.type === "text");
  if (allText) {
    const textContent = legacyParts
      .map((p) => (p as TextContentPart).text)
      .join("");
    return {
      role: message.role,
      content: textContent,
      ...(message.toolCallId && { toolCallId: message.toolCallId }),
      ...(message.toolName && { name: message.toolName }),
    };
  }

  return {
    role: message.role,
    content: legacyParts,
    ...(message.toolCallId && { toolCallId: message.toolCallId }),
    ...(message.toolName && { name: message.toolName }),
  };
}

/**
 * Convert a single UnifiedContentPart to legacy ContentPart
 */
function convertContentPartFromUnified(
  part: UnifiedContentPart
): ContentPart | null {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: part.text,
      };

    case "image":
      // Convert back to URL format
      if (part.url) {
        return {
          type: "image_url",
          image_url: { url: part.url },
        };
      }
      // Create data URL from base64
      if (part.data) {
        return {
          type: "image_url",
          image_url: { url: `data:${part.mediaType};base64,${part.data}` },
        };
      }
      return null;

    case "tool-call":
      return {
        type: "tool_use",
        id: part.toolCallId,
        name: part.toolName,
        input: part.input,
      };

    case "tool-result": {
      // Legacy format doesn't have tool-result as a content part type
      // Convert to text representation
      const output = part.output;
      let text: string;
      if (output.type === "text") {
        text = output.value;
      } else if (output.type === "json") {
        text = JSON.stringify(output.value);
      } else {
        text = `Error: ${output.value}`;
      }
      return {
        type: "text",
        text,
      };
    }

    case "reasoning":
      // Legacy format doesn't have reasoning type
      // Convert to text
      return {
        type: "text",
        text: `[Reasoning: ${part.text}]`,
      };

    default:
      log.warn("Unknown unified part type", {
        source: "llm",
        feature: "converters",
        partType: (part as UnifiedContentPart).type,
      });
      return null;
  }
}

/**
 * Infer MIME type from URL
 */
function inferMimeType(url: string): string {
  const lowercaseUrl = url.toLowerCase();
  if (lowercaseUrl.includes(".png")) return "image/png";
  if (lowercaseUrl.includes(".jpg") || lowercaseUrl.includes(".jpeg"))
    return "image/jpeg";
  if (lowercaseUrl.includes(".gif")) return "image/gif";
  if (lowercaseUrl.includes(".webp")) return "image/webp";
  return "image/jpeg"; // default
}

/**
 * Check if a message has multimodal content (images)
 */
export function hasMultimodalContent(message: UnifiedMessage): boolean {
  if (typeof message.content === "string") {
    return false;
  }
  return message.content.some((p) => p.type === "image");
}

/**
 * Extract all text content from a unified message
 */
export function extractAllText(message: UnifiedMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((p) => p.type === "text")
    .map((p) => (p as UnifiedTextPart).text)
    .join("");
}

/**
 * Check if messages need image fetching (have URL-only images)
 */
export function needsImageFetching(messages: UnifiedMessage[]): boolean {
  for (const msg of messages) {
    if (typeof msg.content === "string") continue;

    for (const part of msg.content) {
      if (part.type === "image" && part.url && !part.data) {
        return true;
      }
    }
  }
  return false;
}
