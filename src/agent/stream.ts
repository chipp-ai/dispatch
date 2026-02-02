/**
 * Stream Orchestrator
 *
 * Handles SSE formatting and delivery to clients.
 * ~150 LOC as per migration plan.
 */

import type { StreamChunk } from "../llm/types.ts";

// ========================================
// SSE Stream Creation
// ========================================

/**
 * Create an SSE ReadableStream from an agent stream generator
 */
export function createSSEStream(
  agentStream: AsyncGenerator<StreamChunk>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let needsNewline = false;
  let isClosed = false;

  return new ReadableStream({
    async pull(controller) {
      if (isClosed) {
        return;
      }

      try {
        const { value, done } = await agentStream.next();

        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          isClosed = true;
          return;
        }

        // Handle spacing between tool results and text
        if (value.type === "text" && needsNewline) {
          controller.enqueue(
            encoder.encode('data: {"type":"text","delta":"\\n"}\n\n')
          );
          needsNewline = false;
        }

        // Mark that we need a newline after tool results
        if (value.type === "tool_result" || value.type === "tool_error") {
          needsNewline = true;
        }

        // Send chunk as SSE event
        const data = JSON.stringify(value);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      } catch (error) {
        // Send error as SSE event
        const errorData = JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Stream error",
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        isClosed = true;
      }
    },

    cancel() {
      isClosed = true;
    },
  });
}

/**
 * Create SSE Response headers
 */
export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  };
}

/**
 * Create a Response object for SSE streaming
 */
export function createSSEResponse(
  agentStream: AsyncGenerator<StreamChunk>
): Response {
  return new Response(createSSEStream(agentStream), {
    headers: sseHeaders(),
  });
}

// ========================================
// Client-side Utilities
// ========================================

/**
 * Parse SSE events from a ReadableStream
 * For use in clients (Svelte, tests, etc.)
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);

        // End of stream
        if (data === "[DONE]") {
          return;
        }

        try {
          const chunk = JSON.parse(data) as StreamChunk;
          yield chunk;
        } catch {
          console.error("Failed to parse SSE data:", data);
        }
      }
    }
  }
}

// ========================================
// Stream Accumulator
// ========================================

/**
 * Accumulate stream chunks into a final response
 */
export interface AccumulatedResponse {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
  finishReason: string;
}

export async function accumulateStream(
  stream: AsyncGenerator<StreamChunk>
): Promise<AccumulatedResponse> {
  const result: AccumulatedResponse = {
    content: "",
    toolCalls: [],
    finishReason: "unknown",
  };

  const toolCallMap = new Map<string, AccumulatedResponse["toolCalls"][0]>();

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text":
        result.content += chunk.delta;
        break;

      case "tool_call":
        toolCallMap.set(chunk.call.id, {
          id: chunk.call.id,
          name: chunk.call.name,
          arguments: chunk.call.arguments,
        });
        break;

      case "tool_result": {
        const toolCall = toolCallMap.get(chunk.callId);
        if (toolCall) {
          toolCall.result = chunk.result;
        }
        break;
      }

      case "done":
        result.finishReason = chunk.finishReason;
        break;
    }
  }

  result.toolCalls = Array.from(toolCallMap.values());
  return result;
}
