/**
 * Anthropic Response Decoder
 *
 * Converts Anthropic Messages API responses to unified format.
 *
 * Key transformations:
 * - Extract text and tool_use content blocks
 * - Tool call arguments are already objects (not stringified)
 * - Map stop_reason to unified finish reason
 */

import { log } from "@/lib/logger.ts";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  UnifiedResponse,
  UnifiedContentPart,
  UnifiedFinishReason,
  UnifiedStreamChunk,
  UnifiedUsage,
  ProviderDecoder,
} from "../types.ts";

// Anthropic response types
type AnthropicResponse = Anthropic.Message;
type AnthropicStreamEvent =
  | Anthropic.MessageStreamEvent
  | Anthropic.ContentBlockStartEvent
  | Anthropic.ContentBlockDeltaEvent
  | Anthropic.ContentBlockStopEvent
  | Anthropic.MessageStopEvent;

/**
 * Map Anthropic stop reason to unified format
 */
function mapFinishReason(
  reason: string | null | undefined
): UnifiedFinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool-calls";
    default:
      return "other";
  }
}

/**
 * Anthropic Response Decoder
 */
export class AnthropicDecoder
  implements ProviderDecoder<AnthropicResponse, AnthropicStreamEvent>
{
  /**
   * Decode a complete Anthropic response to unified format
   */
  decodeResponse(response: AnthropicResponse): UnifiedResponse {
    const content: UnifiedContentPart[] = [];

    // Process content blocks
    for (const block of response.content) {
      if (block.type === "text") {
        content.push({
          type: "text",
          text: block.text,
        });
      } else if (block.type === "tool_use") {
        content.push({
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
      // Skip other block types (thinking, etc.) for now
    }

    // Extract usage
    let usage: UnifiedUsage | undefined;
    if (response.usage) {
      usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    return {
      content,
      finishReason: mapFinishReason(response.stop_reason),
      usage,
      rawResponse: response,
    };
  }

  /**
   * Decode a streaming event to unified format
   *
   * Note: Anthropic uses an event-based streaming model, not simple deltas.
   * Returns null for events that don't produce output.
   */
  decodeStreamChunk(event: AnthropicStreamEvent): UnifiedStreamChunk | null {
    switch (event.type) {
      case "content_block_delta":
        return this.decodeContentBlockDelta(event);
      case "message_stop":
        return this.decodeMessageStop(event);
      default:
        return null;
    }
  }

  /**
   * Decode content block delta event
   */
  private decodeContentBlockDelta(
    event: Anthropic.ContentBlockDeltaEvent
  ): UnifiedStreamChunk | null {
    if (event.delta.type === "text_delta") {
      return {
        type: "text",
        delta: event.delta.text,
      };
    }

    if (event.delta.type === "input_json_delta") {
      return {
        type: "tool-call-delta",
        id: "", // Anthropic deltas don't include ID - caller must track from content_block_start
        delta: event.delta.partial_json,
      };
    }

    return null;
  }

  /**
   * Decode message stop event
   */
  private decodeMessageStop(
    _event: Anthropic.MessageStopEvent
  ): UnifiedStreamChunk {
    return {
      type: "done",
      finishReason: "stop", // Actual reason comes from message_delta
      hasToolCalls: false, // Will be updated by stream tracker
    };
  }
}

/**
 * Default Anthropic decoder instance
 */
export const anthropicDecoder = new AnthropicDecoder();

/**
 * Streaming state tracker for Anthropic
 *
 * Maintains state across stream events for tool call correlation.
 */
export class AnthropicStreamTracker {
  private currentToolCalls: Map<
    number,
    { id: string; name: string; rawInput: string }
  > = new Map();
  private hasToolCalls = false;
  private stopReason: string | null = null;

  /**
   * Process a stream event
   */
  processEvent(event: AnthropicStreamEvent): {
    textDelta?: string;
    toolCallDelta?: { id: string; delta: string };
    completedToolCall?: {
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };
    done?: { finishReason: UnifiedFinishReason; hasToolCalls: boolean };
  } {
    switch (event.type) {
      case "content_block_start":
        return this.handleContentBlockStart(event);
      case "content_block_delta":
        return this.handleContentBlockDelta(event);
      case "content_block_stop":
        return this.handleContentBlockStop(event);
      case "message_delta":
        return this.handleMessageDelta(event);
      case "message_stop":
        return this.handleMessageStop();
      default:
        return {};
    }
  }

  private handleContentBlockStart(event: Anthropic.ContentBlockStartEvent): {
    textDelta?: string;
    toolCallDelta?: { id: string; delta: string };
  } {
    if (event.content_block.type === "tool_use") {
      this.currentToolCalls.set(event.index, {
        id: event.content_block.id,
        name: event.content_block.name,
        rawInput: "",
      });
      this.hasToolCalls = true;
    }
    return {};
  }

  private handleContentBlockDelta(event: Anthropic.ContentBlockDeltaEvent): {
    textDelta?: string;
    toolCallDelta?: { id: string; delta: string };
  } {
    if (event.delta.type === "text_delta") {
      return { textDelta: event.delta.text };
    }

    if (event.delta.type === "input_json_delta") {
      const toolCall = this.currentToolCalls.get(event.index);
      if (toolCall) {
        toolCall.rawInput += event.delta.partial_json;
        return {
          toolCallDelta: {
            id: toolCall.id,
            delta: event.delta.partial_json,
          },
        };
      }
    }

    return {};
  }

  private handleContentBlockStop(event: Anthropic.ContentBlockStopEvent): {
    completedToolCall?: {
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };
  } {
    const toolCall = this.currentToolCalls.get(event.index);
    if (toolCall) {
      try {
        const parsedArgs = JSON.parse(toolCall.rawInput || "{}");
        this.currentToolCalls.delete(event.index);
        return {
          completedToolCall: {
            id: toolCall.id,
            name: toolCall.name,
            arguments: parsedArgs,
          },
        };
      } catch {
        log.warn("Failed to parse tool call arguments", {
          source: "llm",
          feature: "anthropic-stream",
          toolName: toolCall.name,
        });
      }
    }
    return {};
  }

  private handleMessageDelta(event: Anthropic.MessageDeltaEvent): {
    done?: { finishReason: UnifiedFinishReason; hasToolCalls: boolean };
  } {
    if (event.delta.stop_reason) {
      this.stopReason = event.delta.stop_reason;
    }
    return {};
  }

  private handleMessageStop(): {
    done: { finishReason: UnifiedFinishReason; hasToolCalls: boolean };
  } {
    const result = {
      done: {
        finishReason: mapFinishReason(this.stopReason),
        hasToolCalls: this.hasToolCalls,
      },
    };
    this.reset();
    return result;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.currentToolCalls.clear();
    this.hasToolCalls = false;
    this.stopReason = null;
  }
}
