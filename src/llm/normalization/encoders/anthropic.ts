/**
 * Anthropic Message Encoder
 *
 * Converts unified message format to Anthropic's Messages API format.
 *
 * Key transformations:
 * - System messages are extracted to top-level 'system' field
 * - Tool results are inside user messages with tool_result blocks
 * - Tool call arguments are passed as objects (not stringified)
 * - Images must be base64 encoded (Anthropic doesn't support URL references)
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  UnifiedMessage,
  UnifiedContentPart,
  UnifiedToolDefinition,
  ProviderEncoder,
  JSONSchema7,
} from "../types.ts";

// Anthropic types
type AnthropicMessage = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;
type AnthropicContent =
  | string
  | Array<
      | Anthropic.TextBlockParam
      | Anthropic.ImageBlockParam
      | Anthropic.ToolUseBlockParam
      | Anthropic.ToolResultBlockParam
    >;

/**
 * Anthropic-specific encoder configuration
 */
export interface AnthropicEncoderConfig {
  /** Function to fetch image from URL and convert to base64 */
  fetchImageAsBase64?: (
    url: string
  ) => Promise<{ base64: string; mediaType: string } | null>;
}

/**
 * Default image fetcher for Anthropic
 */
async function defaultFetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[anthropic-encoder] Failed to fetch image: ${response.status}`
      );
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

    return { base64, mediaType: contentType };
  } catch (error) {
    console.error(`[anthropic-encoder] Error fetching image:`, error);
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
 * Anthropic Message Encoder
 */
export class AnthropicEncoder
  implements
    ProviderEncoder<
      AnthropicMessage[],
      AnthropicTool[],
      string | Anthropic.TextBlockParam[]
    >
{
  private config: AnthropicEncoderConfig;

  constructor(config: AnthropicEncoderConfig = {}) {
    this.config = {
      fetchImageAsBase64: defaultFetchImageAsBase64,
      ...config,
    };
  }

  /**
   * Encode unified messages to Anthropic format
   *
   * Anthropic format notes:
   * - System messages are extracted to a separate 'system' field
   * - Messages array only contains user/assistant messages
   * - Tool results go in user messages with tool_result blocks
   */
  async encodeMessages(messages: UnifiedMessage[]): Promise<{
    messages: AnthropicMessage[];
    system?: string | Anthropic.TextBlockParam[];
  }> {
    const result: AnthropicMessage[] = [];
    let systemContent: string | undefined;

    for (const msg of messages) {
      if (msg.role === "system") {
        // Extract system message
        systemContent =
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
      system: systemContent,
    };
  }

  /**
   * Encode a single unified message to Anthropic format
   */
  private async encodeMessage(
    msg: UnifiedMessage
  ): Promise<AnthropicMessage | null> {
    switch (msg.role) {
      case "user":
        return await this.encodeUserMessage(msg);
      case "assistant":
        return this.encodeAssistantMessage(msg);
      case "tool":
        return this.encodeToolResultMessage(msg);
      default:
        console.warn(`[anthropic-encoder] Skipping role: ${msg.role}`);
        return null;
    }
  }

  /**
   * Encode user message (may be multimodal)
   */
  private async encodeUserMessage(
    msg: UnifiedMessage
  ): Promise<AnthropicMessage> {
    if (typeof msg.content === "string") {
      return {
        role: "user",
        content: msg.content,
      };
    }

    // Build content blocks
    const contentBlocks: Array<
      Anthropic.TextBlockParam | Anthropic.ImageBlockParam
    > = [];

    for (const part of msg.content) {
      if (part.type === "text" && part.text) {
        contentBlocks.push({
          type: "text",
          text: part.text,
        });
      } else if (part.type === "image") {
        // Anthropic requires base64 images
        if (part.data) {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: part.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: part.data,
            },
          });
        } else if (part.url && this.config.fetchImageAsBase64) {
          // Fetch and convert to base64
          const imageData = await this.config.fetchImageAsBase64(part.url);
          if (imageData) {
            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: imageData.mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageData.base64,
              },
            });
          }
        }
      }
    }

    return {
      role: "user",
      content: contentBlocks.length > 0 ? contentBlocks : "",
    };
  }

  /**
   * Encode assistant message (may have tool calls)
   */
  private encodeAssistantMessage(msg: UnifiedMessage): AnthropicMessage {
    if (typeof msg.content === "string") {
      return {
        role: "assistant",
        content: msg.content,
      };
    }

    // Build content blocks
    const contentBlocks: Array<
      Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam
    > = [];

    for (const part of msg.content) {
      if (part.type === "text" && part.text) {
        contentBlocks.push({
          type: "text",
          text: part.text,
        });
      } else if (part.type === "tool-call") {
        contentBlocks.push({
          type: "tool_use",
          id: part.toolCallId,
          name: part.toolName,
          input: part.input,
        });
      }
    }

    if (contentBlocks.length === 0) {
      return {
        role: "assistant",
        content: "",
      };
    }

    return {
      role: "assistant",
      content: contentBlocks,
    };
  }

  /**
   * Encode tool result as user message with tool_result block
   *
   * In Anthropic's format, tool results are sent as user messages containing
   * tool_result blocks, not as separate 'tool' role messages.
   */
  private encodeToolResultMessage(msg: UnifiedMessage): AnthropicMessage {
    // Extract the tool result content
    let content: string;
    let isError = false;

    if (typeof msg.content === "string") {
      content = msg.content;
    } else {
      // Look for tool-result part
      const resultPart = msg.content.find((p) => p.type === "tool-result");
      if (resultPart && resultPart.type === "tool-result") {
        content = this.formatToolOutput(resultPart.output);
        isError = resultPart.output.type === "error";
      } else {
        // Fallback to text extraction
        content = this.extractTextFromParts(msg.content);
      }
    }

    const toolResultBlock: Anthropic.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: msg.toolCallId!,
      content,
      ...(isError ? { is_error: true } : {}),
    };

    return {
      role: "user",
      content: [toolResultBlock],
    };
  }

  /**
   * Format tool output to string
   */
  private formatToolOutput(
    output:
      | { type: "text"; value: string }
      | { type: "json"; value: unknown }
      | { type: "error"; value: string }
  ): string {
    switch (output.type) {
      case "text":
        return output.value;
      case "json":
        return JSON.stringify(output.value);
      case "error":
        return output.value;
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
   * Encode unified tool definitions to Anthropic format
   */
  encodeTools(tools: UnifiedToolDefinition[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      input_schema: this.cleanSchema(
        tool.inputSchema
      ) as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Clean JSON schema for Anthropic (remove $schema)
   */
  private cleanSchema(schema: JSONSchema7): JSONSchema7 {
    const cleaned: JSONSchema7 = {};

    for (const [key, value] of Object.entries(schema)) {
      if (key === "$schema") {
        continue;
      }

      if (value && typeof value === "object" && !Array.isArray(value)) {
        cleaned[key] = this.cleanSchema(value as JSONSchema7);
      } else if (Array.isArray(value)) {
        cleaned[key] = value.map((item) =>
          item && typeof item === "object"
            ? this.cleanSchema(item as JSONSchema7)
            : item
        );
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }
}

/**
 * Default Anthropic encoder instance
 */
export const anthropicEncoder = new AnthropicEncoder();
