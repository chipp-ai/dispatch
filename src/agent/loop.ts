/**
 * Agent Loop
 *
 * Core execution loop that handles LLM streaming and tool execution.
 * ~100 LOC as per migration plan.
 */

import type {
  ContentPart,
  LLMProvider,
  Message,
  StreamChunk,
  StreamOptions,
  ToolCall,
} from "../llm/types.ts";
import type { ToolRegistry } from "./registry.ts";

// ========================================
// Types
// ========================================

export interface AgentOptions extends StreamOptions {
  maxIterations?: number;
  onToolStart?: (call: ToolCall) => void;
  onToolEnd?: (call: ToolCall, result: unknown) => void;
  /** Abort signal to cancel the agent loop (e.g., when client disconnects) */
  abortSignal?: AbortSignal;
}

// ========================================
// Agent Loop
// ========================================

/**
 * Run the agent loop with LLM streaming and tool execution
 *
 * This is an async generator that yields stream chunks to the client.
 * It automatically handles tool calls and re-invokes the LLM with results.
 */
export async function* agentLoop(
  messages: Message[],
  registry: ToolRegistry,
  adapter: LLMProvider,
  options: AgentOptions = {}
): AsyncGenerator<StreamChunk> {
  const maxIterations = options.maxIterations ?? 10;
  let iteration = 0;

  // Clone messages array to avoid mutating the input
  const conversationMessages = [...messages];

  while (iteration < maxIterations) {
    // Check if aborted before starting iteration
    if (options.abortSignal?.aborted) {
      console.log("[agent] Aborted before iteration", iteration);
      return;
    }

    iteration++;

    const tools = registry.getForLLM();
    const pendingToolCalls: ToolCall[] = [];
    let hasToolCalls = false;
    let assistantContent = "";

    // Stream from LLM
    for await (const chunk of adapter.stream(
      conversationMessages,
      tools,
      options
    )) {
      // Check if aborted during streaming
      if (options.abortSignal?.aborted) {
        console.log("[agent] Aborted during streaming");
        return;
      }

      yield chunk;

      // Accumulate text for message history
      if (chunk.type === "text") {
        assistantContent += chunk.delta;
      }

      // Collect tool calls
      if (chunk.type === "tool_call") {
        pendingToolCalls.push(chunk.call);
      }

      if (chunk.type === "done") {
        hasToolCalls = chunk.hasToolCalls;
      }
    }

    // Add assistant response to conversation
    // Include tool_use blocks for Anthropic API compatibility
    if (assistantContent || pendingToolCalls.length > 0) {
      if (pendingToolCalls.length > 0) {
        // Build content array with text (if any) and tool_use blocks
        const contentParts: ContentPart[] = [];
        if (assistantContent) {
          contentParts.push({ type: "text", text: assistantContent });
        }
        for (const call of pendingToolCalls) {
          contentParts.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        }
        conversationMessages.push({
          role: "assistant",
          content: contentParts,
        });
      } else {
        // No tool calls, just text content
        conversationMessages.push({
          role: "assistant",
          content: assistantContent,
        });
      }
    }

    // Execute tool calls if any
    if (hasToolCalls && pendingToolCalls.length > 0) {
      for (const call of pendingToolCalls) {
        // Check if aborted before tool execution
        if (options.abortSignal?.aborted) {
          console.log("[agent] Aborted before tool execution");
          return;
        }

        console.log(
          `[agent] Executing tool: ${call.name}`,
          JSON.stringify(call.arguments).substring(0, 200)
        );
        // Notify tool start
        options.onToolStart?.(call);

        const executionResult = await registry.execute(
          call.name,
          call.arguments
        );

        // Notify tool end
        options.onToolEnd?.(call, executionResult.result);

        if (executionResult.success) {
          // Add tool result to conversation
          conversationMessages.push({
            role: "tool",
            content: JSON.stringify(executionResult.result),
            toolCallId: call.id,
            name: call.name,
          });

          yield {
            type: "tool_result",
            callId: call.id,
            result: executionResult.result,
          };
        } else {
          // Add error to conversation
          conversationMessages.push({
            role: "tool",
            content: JSON.stringify({ error: executionResult.error }),
            toolCallId: call.id,
            name: call.name,
          });

          yield {
            type: "tool_error",
            callId: call.id,
            error: executionResult.error!,
          };
        }
      }

      // Continue loop - LLM will process tool results
      continue;
    }

    // No tool calls, agent is done
    break;
  }

  // Warn if we hit max iterations
  if (iteration >= maxIterations) {
    console.warn(`Agent loop hit max iterations (${maxIterations})`);
  }
}

/**
 * Run a single completion without tool loop
 */
export async function* singleCompletion(
  messages: Message[],
  adapter: LLMProvider,
  options: StreamOptions = {}
): AsyncGenerator<StreamChunk> {
  // No tools, just stream the response
  for await (const chunk of adapter.stream(messages, [], options)) {
    yield chunk;
  }
}
