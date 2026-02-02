/**
 * OpenAI Response Decoder
 *
 * Converts OpenAI Chat Completions API responses to unified format.
 *
 * Key transformations:
 * - Parse stringified tool call arguments to objects
 * - Map finish_reason to unified finish reason
 * - Extract content blocks (text, tool_calls)
 */

import type OpenAI from "openai";
import type {
  UnifiedResponse,
  UnifiedContentPart,
  UnifiedFinishReason,
  UnifiedStreamChunk,
  UnifiedUsage,
  ProviderDecoder,
} from "../types.ts";

// OpenAI response types
type OpenAIResponse = OpenAI.Chat.ChatCompletion;
type OpenAIStreamChunk = OpenAI.Chat.ChatCompletionChunk;

/**
 * Map OpenAI finish reason to unified format
 */
function mapFinishReason(
  reason: string | null | undefined
): UnifiedFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    default:
      return "other";
  }
}

/**
 * OpenAI Response Decoder
 */
export class OpenAIDecoder
  implements ProviderDecoder<OpenAIResponse, OpenAIStreamChunk>
{
  /**
   * Decode a complete OpenAI response to unified format
   */
  decodeResponse(response: OpenAIResponse): UnifiedResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    if (!message) {
      return {
        content: [],
        finishReason: "error",
      };
    }

    const content: UnifiedContentPart[] = [];

    // Extract text content
    if (message.content) {
      content.push({
        type: "text",
        text: message.content,
      });
    }

    // Extract tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const tc of message.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments || "{}");
        } catch {
          console.warn(
            `[openai-decoder] Failed to parse tool call arguments for ${tc.function.name}`
          );
        }

        content.push({
          type: "tool-call",
          toolCallId: tc.id,
          toolName: tc.function.name,
          input: parsedArgs,
        });
      }
    }

    // Extract usage
    let usage: UnifiedUsage | undefined;
    if (response.usage) {
      usage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };
    }

    return {
      content,
      finishReason: mapFinishReason(choice?.finish_reason),
      usage,
      rawResponse: response,
    };
  }

  /**
   * Decode a streaming chunk to unified format
   *
   * Returns null for chunks that should be skipped (no content).
   */
  decodeStreamChunk(chunk: OpenAIStreamChunk): UnifiedStreamChunk | null {
    const delta = chunk.choices[0]?.delta;
    const finishReason = chunk.choices[0]?.finish_reason;

    // Text content delta
    if (delta?.content) {
      return {
        type: "text",
        delta: delta.content,
      };
    }

    // Tool call delta
    if (delta?.tool_calls?.[0]) {
      const tc = delta.tool_calls[0];

      // New tool call starting
      if (tc.id && tc.function?.name) {
        // Return tool call delta for argument streaming
        if (tc.function.arguments) {
          return {
            type: "tool-call-delta",
            id: tc.id,
            delta: tc.function.arguments,
          };
        }
        // Initial chunk with just id/name - skip (will be handled when args come)
        return null;
      }

      // Argument delta for ongoing tool call
      if (tc.function?.arguments && tc.index !== undefined) {
        // We need the ID, but deltas don't always include it
        // This is handled by the stream processor maintaining state
        return {
          type: "tool-call-delta",
          id: "", // Caller must maintain state to track ID
          delta: tc.function.arguments,
        };
      }
    }

    // Stream finished
    if (finishReason) {
      let usage: UnifiedUsage | undefined;
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }

      return {
        type: "done",
        finishReason: mapFinishReason(finishReason),
        hasToolCalls: finishReason === "tool_calls",
        usage,
      };
    }

    return null;
  }
}

/**
 * Default OpenAI decoder instance
 */
export const openaiDecoder = new OpenAIDecoder();

/**
 * Streaming state tracker for OpenAI
 *
 * Maintains state across stream chunks for tool call correlation.
 */
export class OpenAIStreamTracker {
  private currentToolCalls: Map<
    number,
    { id: string; name: string; rawArguments: string }
  > = new Map();

  /**
   * Process a stream chunk and return completed tool calls
   */
  processChunk(chunk: OpenAIStreamChunk): {
    textDelta?: string;
    completedToolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
  } {
    const delta = chunk.choices[0]?.delta;
    const result: {
      textDelta?: string;
      completedToolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }>;
    } = { completedToolCalls: [] };

    // Text content
    if (delta?.content) {
      result.textDelta = delta.content;
    }

    // Tool calls
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const index = tc.index;

        if (tc.id) {
          // New tool call
          this.currentToolCalls.set(index, {
            id: tc.id,
            name: tc.function?.name || "",
            rawArguments: tc.function?.arguments || "",
          });
        } else if (tc.function?.arguments) {
          // Argument delta
          const existing = this.currentToolCalls.get(index);
          if (existing) {
            existing.rawArguments += tc.function.arguments;
          }
        }
      }
    }

    // Check if stream is done to finalize tool calls
    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason) {
      // Finalize all tool calls
      for (const [_, toolCall] of this.currentToolCalls) {
        try {
          const parsedArgs = JSON.parse(toolCall.rawArguments || "{}");
          result.completedToolCalls.push({
            id: toolCall.id,
            name: toolCall.name,
            arguments: parsedArgs,
          });
        } catch {
          console.warn(
            `[openai-stream] Failed to parse tool call arguments for ${toolCall.name}`
          );
        }
      }
      this.currentToolCalls.clear();
    }

    return result;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.currentToolCalls.clear();
  }
}
