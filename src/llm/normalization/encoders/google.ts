/**
 * Google Gemini Message Encoder
 *
 * Converts unified message format to Google's Generative AI API format.
 *
 * Key transformations:
 * - System messages are extracted to 'systemInstruction' field
 * - Assistant role becomes 'model'
 * - Tool results are 'function' role messages with functionResponse
 * - Tool calls are functionCall parts
 * - Images must be base64 encoded as inlineData
 * - JSON Schema 7 must be converted to OpenAPI Schema 3.0 format
 */

import * as Sentry from "@sentry/deno";
import type {
  Content,
  FunctionDeclaration,
  Part,
} from "npm:@google/generative-ai@0.21.0";
import type {
  UnifiedMessage,
  UnifiedContentPart,
  UnifiedToolDefinition,
  ProviderEncoder,
  JSONSchema7,
} from "../types.ts";

// Google types
type GoogleMessage = Content;
type GoogleTool = { functionDeclarations: FunctionDeclaration[] };

/**
 * Google-specific encoder configuration
 */
export interface GoogleEncoderConfig {
  /** Function to fetch image from URL and convert to base64 */
  fetchImageAsBase64?: (
    url: string
  ) => Promise<{ base64: string; mimeType: string } | null>;
}

/**
 * Default image fetcher for Google
 */
async function defaultFetchImageAsBase64(
  url: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[google-encoder] Failed to fetch image: ${response.status}`
      );
      Sentry.captureMessage(`[google-encoder] Failed to fetch image: ${response.status}`, {
        level: "error",
        tags: { source: "llm", feature: "encoder", provider: "google" },
        extra: { imageUrl: url, statusCode: response.status },
      });
      return null;
    }

    const contentType =
      response.headers.get("content-type") || inferMimeType(url);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    return { base64, mimeType: contentType };
  } catch (error) {
    console.error(`[google-encoder] Error fetching image:`, error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "llm", feature: "encoder", provider: "google" },
      extra: { imageUrl: url },
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
  return "image/jpeg";
}

/**
 * Google Gemini Message Encoder
 */
export class GoogleEncoder
  implements ProviderEncoder<GoogleMessage[], GoogleTool[], string>
{
  private config: GoogleEncoderConfig;

  constructor(config: GoogleEncoderConfig = {}) {
    this.config = {
      fetchImageAsBase64: defaultFetchImageAsBase64,
      ...config,
    };
  }

  /**
   * Encode unified messages to Google Gemini format
   *
   * Google format notes:
   * - System instruction is a separate field, not in messages
   * - Messages array contains user/model/function role messages
   * - Tool calls are functionCall parts in model messages
   * - Tool results are functionResponse parts in function role messages
   */
  async encodeMessages(
    messages: UnifiedMessage[]
  ): Promise<{ messages: GoogleMessage[]; system?: string }> {
    const result: GoogleMessage[] = [];
    let systemInstruction: string | undefined;

    for (const msg of messages) {
      if (msg.role === "system") {
        // Extract system instruction
        systemInstruction =
          typeof msg.content === "string"
            ? msg.content
            : this.extractTextFromParts(msg.content);
        continue;
      }

      const encoded = await this.encodeMessage(msg);
      if (encoded) {
        result.push(encoded);
      }
    }

    return {
      messages: result,
      system: systemInstruction,
    };
  }

  /**
   * Encode a single unified message to Google format
   */
  private async encodeMessage(
    msg: UnifiedMessage
  ): Promise<GoogleMessage | null> {
    switch (msg.role) {
      case "user":
        return await this.encodeUserMessage(msg);
      case "assistant":
        return await this.encodeModelMessage(msg);
      case "tool":
        return this.encodeFunctionResponseMessage(msg);
      default:
        console.warn(`[google-encoder] Skipping role: ${msg.role}`);
        return null;
    }
  }

  /**
   * Encode user message (may be multimodal)
   */
  private async encodeUserMessage(msg: UnifiedMessage): Promise<GoogleMessage> {
    if (typeof msg.content === "string") {
      return {
        role: "user",
        parts: [{ text: msg.content }],
      };
    }

    const parts: Part[] = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "image") {
        // Google requires base64 inlineData
        if (part.data) {
          parts.push({
            inlineData: {
              mimeType: part.mediaType,
              data: part.data,
            },
          });
        } else if (part.url && this.config.fetchImageAsBase64) {
          const imageData = await this.config.fetchImageAsBase64(part.url);
          if (imageData) {
            parts.push({
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.base64,
              },
            });
          }
        }
      }
    }

    return {
      role: "user",
      parts: parts.length > 0 ? parts : [{ text: "" }],
    };
  }

  /**
   * Encode assistant (model) message (may have function calls)
   */
  private async encodeModelMessage(
    msg: UnifiedMessage
  ): Promise<GoogleMessage> {
    if (typeof msg.content === "string") {
      return {
        role: "model",
        parts: [{ text: msg.content }],
      };
    }

    const parts: Part[] = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        parts.push({ text: part.text });
      } else if (part.type === "tool-call") {
        // Google uses functionCall format
        parts.push({
          functionCall: {
            name: part.toolName,
            args: part.input,
          },
        });
      } else if (part.type === "image") {
        // Handle images in assistant messages (unusual but possible)
        if (part.data) {
          parts.push({
            inlineData: {
              mimeType: part.mediaType,
              data: part.data,
            },
          });
        } else if (part.url && this.config.fetchImageAsBase64) {
          const imageData = await this.config.fetchImageAsBase64(part.url);
          if (imageData) {
            parts.push({
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.base64,
              },
            });
          }
        }
      }
    }

    return {
      role: "model",
      parts: parts.length > 0 ? parts : [{ text: "" }],
    };
  }

  /**
   * Encode tool result as function response message
   *
   * In Google's format, tool results are sent as 'function' role messages
   * with functionResponse parts. Google correlates by function name, not ID.
   */
  private encodeFunctionResponseMessage(msg: UnifiedMessage): GoogleMessage {
    // Extract the function name and result
    const functionName = msg.toolName || "unknown";
    let result: Record<string, unknown>;

    if (typeof msg.content === "string") {
      result = { result: msg.content };
    } else {
      // Look for tool-result part
      const resultPart = msg.content.find((p) => p.type === "tool-result");
      if (resultPart && resultPart.type === "tool-result") {
        result = { result: this.formatToolOutput(resultPart.output) };
      } else {
        // Fallback to text extraction
        result = { result: this.extractTextFromParts(msg.content) };
      }
    }

    return {
      role: "function",
      parts: [
        {
          functionResponse: {
            name: functionName,
            response: result as object,
          },
        },
      ],
    };
  }

  /**
   * Format tool output
   */
  private formatToolOutput(
    output:
      | { type: "text"; value: string }
      | { type: "json"; value: unknown }
      | { type: "error"; value: string }
  ): string | unknown {
    switch (output.type) {
      case "text":
        return output.value;
      case "json":
        return output.value;
      case "error":
        return `Error: ${output.value}`;
    }
  }

  /**
   * Extract text content from content parts
   */
  private extractTextFromParts(parts: UnifiedContentPart[]): string {
    return parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("");
  }

  /**
   * Encode unified tool definitions to Google format
   *
   * Google uses a wrapped format: { functionDeclarations: [...] }
   * and requires OpenAPI 3.0 schema format (not JSON Schema 7)
   */
  encodeTools(tools: UnifiedToolDefinition[]): GoogleTool[] {
    const functionDeclarations = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      // Convert JSON Schema 7 to OpenAPI Schema 3.0 format
      // The type assertion is needed because our schema converter returns a generic object
      parameters: this.convertToOpenApiSchema(
        tool.inputSchema
      ) as unknown as FunctionDeclaration["parameters"],
    }));

    return [{ functionDeclarations }];
  }

  /**
   * Convert JSON Schema 7 to OpenAPI Schema 3.0 format
   *
   * Key differences:
   * - Remove $schema, additionalProperties
   * - nullable instead of type: ["string", "null"]
   * - Some keywords not supported
   */
  private convertToOpenApiSchema(schema: JSONSchema7): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(schema)) {
      // Skip unsupported properties
      if (key === "$schema" || key === "additionalProperties") {
        continue;
      }

      // Handle type arrays (nullable)
      if (key === "type" && Array.isArray(value)) {
        const types = value.filter((t) => t !== "null");
        const isNullable = value.includes("null");

        if (types.length === 1) {
          result.type = types[0];
          if (isNullable) {
            result.nullable = true;
          }
        } else if (types.length > 1) {
          // Multiple non-null types - keep as is (Google may not fully support)
          result.type = types[0]; // Use first type
        }
        continue;
      }

      // Recursively convert nested objects
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.convertToOpenApiSchema(value as JSONSchema7);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          item && typeof item === "object"
            ? this.convertToOpenApiSchema(item as JSONSchema7)
            : item
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Default Google encoder instance
 */
export const googleEncoder = new GoogleEncoder();
