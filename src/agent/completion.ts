/**
 * Completion Wrapper
 *
 * Provides an onComplete callback pattern for streaming responses,
 * similar to AI SDK's `onFinish`. This enables centralized message
 * persistence that fires ONCE when streaming fully completes.
 *
 * Key features:
 * - Wraps agent stream and yields chunks unchanged
 * - Accumulates text, tool calls, tool results, and usage across iterations
 * - Fires onComplete ONCE when stream is fully exhausted
 * - Guards against duplicate processing and aborted streams
 */

import { log } from "@/lib/logger.ts";
import type { StreamChunk, TokenUsage } from "../llm/types.ts";

// ========================================
// Types
// ========================================

export interface CompletionResult {
  /** Accumulated text content from all text chunks */
  text: string;
  /** All tool calls made during the stream */
  toolCalls: Array<{ id: string; name: string; input: unknown }>;
  /** All tool results received during the stream */
  toolResults: Array<{
    callId: string;
    name: string;
    result: unknown;
    success: boolean;
  }>;
  /** Aggregated token usage across all iterations */
  usage: { inputTokens: number; outputTokens: number };
  /** Final finish reason (stop, tool_calls, etc.) */
  finishReason: string;
  /** Whether the stream was aborted */
  aborted: boolean;
}

export interface StreamWrapperOptions {
  /** Callback fired once when stream fully completes */
  onComplete?: (result: CompletionResult) => Promise<void> | void;
  /** Abort signal to cancel processing */
  abortSignal?: AbortSignal;
}

// ========================================
// Wrapper Implementation
// ========================================

/**
 * Wraps an agent stream to provide a centralized onComplete callback.
 *
 * This wrapper:
 * 1. Yields all chunks unchanged (transparent passthrough)
 * 2. Accumulates state: text, tool calls, tool results, usage
 * 3. Fires onComplete ONCE after the stream is fully exhausted
 * 4. Skips onComplete if aborted or already processed
 *
 * Usage:
 * ```ts
 * const stream = withOnComplete(agentLoop(...), {
 *   abortSignal: controller.signal,
 *   onComplete: async (result) => {
 *     await chatService.addMessage(sessionId, 'assistant', result.text, {
 *       toolCalls: result.toolCalls,
 *       toolResults: result.toolResults,
 *     });
 *   }
 * });
 *
 * for await (const chunk of stream) {
 *   // Handle SSE formatting - no persistence logic needed here
 * }
 * ```
 */
export async function* withOnComplete(
  stream: AsyncGenerator<StreamChunk>,
  options: StreamWrapperOptions = {}
): AsyncGenerator<StreamChunk> {
  const { onComplete, abortSignal } = options;

  // Accumulated state
  let text = "";
  const toolCalls: CompletionResult["toolCalls"] = [];
  const toolResults: CompletionResult["toolResults"] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason = "stop";

  // Guard against duplicate processing
  let hasProcessedFinalResult = false;

  // Map of pending tool calls by ID for name lookup when we get results
  const pendingToolCallNames = new Map<string, string>();

  try {
    for await (const chunk of stream) {
      // Check abort before processing
      if (abortSignal?.aborted) {
        log.debug("Stream aborted, stopping processing", { source: "agent", feature: "completion" });
        break;
      }

      // Yield chunk unchanged (transparent passthrough)
      yield chunk;

      // Accumulate state based on chunk type
      switch (chunk.type) {
        case "text":
          text += chunk.delta;
          break;

        case "tool_call":
          log.debug("Received tool_call", { source: "agent", feature: "completion", toolCallId: chunk.call.id, toolName: chunk.call.name });
          toolCalls.push({
            id: chunk.call.id,
            name: chunk.call.name,
            input: chunk.call.arguments,
          });
          // Track name for result lookup
          pendingToolCallNames.set(chunk.call.id, chunk.call.name);
          break;

        case "tool_result":
          toolResults.push({
            callId: chunk.callId,
            name: pendingToolCallNames.get(chunk.callId) ?? "unknown",
            result: chunk.result,
            success: true,
          });
          break;

        case "tool_error":
          toolResults.push({
            callId: chunk.callId,
            name: pendingToolCallNames.get(chunk.callId) ?? "unknown",
            result: { error: chunk.error },
            success: false,
          });
          break;

        case "done":
          // Accumulate usage from each iteration
          // (agent loop may have multiple done chunks across tool iterations)
          if (chunk.usage) {
            inputTokens += chunk.usage.inputTokens ?? 0;
            outputTokens += chunk.usage.outputTokens ?? 0;
          }
          finishReason = chunk.finishReason || "stop";
          break;
      }
    }
  } finally {
    // Fire onComplete ONCE after stream exhaustion
    // Guard: Skip if already processed or aborted
    if (!hasProcessedFinalResult && !abortSignal?.aborted) {
      hasProcessedFinalResult = true;

      const result: CompletionResult = {
        text,
        toolCalls,
        toolResults,
        usage: { inputTokens, outputTokens },
        finishReason,
        aborted: false,
      };

      log.info("onComplete", { source: "agent", feature: "completion", textLength: text.length, toolCallCount: toolCalls.length, toolResultCount: toolResults.length });

      if (onComplete) {
        try {
          await onComplete(result);
        } catch (err) {
          log.error("onComplete callback error", { source: "agent", feature: "completion", operation: "onComplete", textLength: text.length, toolCallCount: toolCalls.length, finishReason }, err);
          // Don't re-throw from finally block - it would mask any original exception
        }
      }
    } else if (abortSignal?.aborted && !hasProcessedFinalResult) {
      // Stream was aborted - fire onComplete with aborted flag
      hasProcessedFinalResult = true;

      const result: CompletionResult = {
        text,
        toolCalls,
        toolResults,
        usage: { inputTokens, outputTokens },
        finishReason: "abort",
        aborted: true,
      };

      log.info("onComplete (aborted)", { source: "agent", feature: "completion", textLength: text.length });

      if (onComplete) {
        try {
          await onComplete(result);
        } catch (err) {
          log.error("onComplete callback error", { source: "agent", feature: "completion", operation: "onComplete-aborted", textLength: text.length, toolCallCount: toolCalls.length, finishReason: "abort" }, err);
          // Don't re-throw from finally block - it would mask any original exception
        }
      }
    }
  }
}
