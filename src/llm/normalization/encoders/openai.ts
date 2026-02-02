/**
 * OpenAI Message Encoder
 *
 * Converts unified message format to OpenAI's Chat Completions API format.
 *
 * Key transformations:
 * - System messages stay in the messages array
 * - Tool results are separate 'tool' role messages
 * - Tool call arguments are stringified JSON
 * - Images use URL references (OpenAI supports direct URLs)
 */

import type OpenAI from "openai";
import type {
  UnifiedMessage,
  UnifiedContentPart,
  UnifiedToolDefinition,
  ProviderEncoder,
  JSONSchema7,
} from "../types.ts";

// OpenAI message types
type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
type OpenAITool = OpenAI.Chat.ChatCompletionTool;

/**
 * OpenAI-specific encoder configuration
 */
export interface OpenAIEncoderConfig {
  /** Whether to use URL references for images (true) or inline base64 (false) */
  useImageUrls?: boolean;
}

/**
 * OpenAI Message Encoder
 */
export class OpenAIEncoder
  implements ProviderEncoder<OpenAIMessage[], OpenAITool[]>
{
  private config: OpenAIEncoderConfig;

  constructor(config: OpenAIEncoderConfig = {}) {
    this.config = {
      useImageUrls: true,
      ...config,
    };
  }

  /**
   * Encode unified messages to OpenAI format
   *
   * OpenAI format notes:
   * - System messages are in the messages array with role: 'system'
   * - Assistant messages with tool calls have tool_calls array
   * - Tool results are separate messages with role: 'tool'
   */
  async encodeMessages(
    messages: UnifiedMessage[]
  ): Promise<{ messages: OpenAIMessage[]; system?: string }> {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      const encoded = await this.encodeMessage(msg);
      if (encoded) {
        result.push(encoded);
      }
    }

    return { messages: result };
  }

  /**
   * Encode a single unified message to OpenAI format
   */
  private async encodeMessage(
    msg: UnifiedMessage
  ): Promise<OpenAIMessage | null> {
    switch (msg.role) {
      case "system":
        return this.encodeSystemMessage(msg);
      case "user":
        return await this.encodeUserMessage(msg);
      case "assistant":
        return this.encodeAssistantMessage(msg);
      case "tool":
        return this.encodeToolMessage(msg);
      default:
        console.warn(`[openai-encoder] Unknown role: ${msg.role}`);
        return null;
    }
  }

  /**
   * Encode system message
   */
  private encodeSystemMessage(
    msg: UnifiedMessage
  ): OpenAI.Chat.ChatCompletionSystemMessageParam {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : this.extractTextFromParts(msg.content);

    return {
      role: "system",
      content,
    };
  }

  /**
   * Encode user message (may be multimodal)
   */
  private async encodeUserMessage(
    msg: UnifiedMessage
  ): Promise<OpenAI.Chat.ChatCompletionUserMessageParam> {
    if (typeof msg.content === "string") {
      return {
        role: "user",
        content: msg.content,
      };
    }

    // Multimodal content
    const contentParts: Array<
      | OpenAI.Chat.ChatCompletionContentPartText
      | OpenAI.Chat.ChatCompletionContentPartImage
    > = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        contentParts.push({
          type: "text",
          text: part.text,
        });
      } else if (part.type === "image") {
        if (this.config.useImageUrls && part.url) {
          // Use URL reference
          contentParts.push({
            type: "image_url",
            image_url: { url: part.url },
          });
        } else {
          // Use base64 data URL
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${part.mediaType};base64,${part.data}`,
            },
          });
        }
      }
      // Skip other part types (tool-call, tool-result in user messages are unusual)
    }

    return {
      role: "user",
      content: contentParts.length > 0 ? contentParts : "",
    };
  }

  /**
   * Encode assistant message (may have tool calls)
   */
  private encodeAssistantMessage(
    msg: UnifiedMessage
  ): OpenAI.Chat.ChatCompletionAssistantMessageParam {
    if (typeof msg.content === "string") {
      return {
        role: "assistant",
        content: msg.content,
      };
    }

    // Extract text and tool calls
    const textParts: string[] = [];
    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

    for (const part of msg.content) {
      if (part.type === "text") {
        textParts.push(part.text);
      } else if (part.type === "tool-call") {
        toolCalls.push({
          id: part.toolCallId,
          type: "function",
          function: {
            name: part.toolName,
            arguments: JSON.stringify(part.input),
          },
        });
      }
    }

    const textContent = textParts.join("");

    if (toolCalls.length > 0) {
      return {
        role: "assistant",
        content: textContent || null,
        tool_calls: toolCalls,
      };
    }

    return {
      role: "assistant",
      content: textContent,
    };
  }

  /**
   * Encode tool result message
   */
  private encodeToolMessage(
    msg: UnifiedMessage
  ): OpenAI.Chat.ChatCompletionToolMessageParam {
    // For tool role messages, extract the tool result content
    let content: string;

    if (typeof msg.content === "string") {
      content = msg.content;
    } else {
      // Look for tool-result part
      const resultPart = msg.content.find((p) => p.type === "tool-result");
      if (resultPart && resultPart.type === "tool-result") {
        content = this.formatToolOutput(resultPart.output);
      } else {
        // Fallback to text extraction
        content = this.extractTextFromParts(msg.content);
      }
    }

    return {
      role: "tool",
      content,
      tool_call_id: msg.toolCallId!,
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
   * Encode unified tool definitions to OpenAI format
   */
  encodeTools(tools: UnifiedToolDefinition[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.cleanSchema(tool.inputSchema) as Record<
          string,
          unknown
        >,
      },
    }));
  }

  /**
   * Clean JSON schema for OpenAI (remove $schema, keep additionalProperties)
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
 * Default OpenAI encoder instance
 */
export const openaiEncoder = new OpenAIEncoder();
