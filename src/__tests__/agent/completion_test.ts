/**
 * Tests for the withOnComplete wrapper
 *
 * Tests the completion wrapper's ability to accumulate stream data
 * and fire onComplete callback once at stream exhaustion.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  withOnComplete,
  type CompletionResult,
} from "../../agent/completion.ts";
import type { StreamChunk } from "../../llm/types.ts";

// Helper to create a mock stream
async function* mockStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("withOnComplete", () => {
  it("should yield chunks unchanged (transparent passthrough)", async () => {
    const inputChunks: StreamChunk[] = [
      { type: "text", delta: "Hello " },
      { type: "text", delta: "world" },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const outputChunks: StreamChunk[] = [];
    const stream = withOnComplete(mockStream(inputChunks), {});

    for await (const chunk of stream) {
      outputChunks.push(chunk);
    }

    assertEquals(outputChunks.length, inputChunks.length);
    assertEquals(outputChunks[0], { type: "text", delta: "Hello " });
    assertEquals(outputChunks[1], { type: "text", delta: "world" });
    assertEquals(outputChunks[2].type, "done");
  });

  it("should accumulate text content", async () => {
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Hello " },
      { type: "text", delta: "world" },
      { type: "text", delta: "!" },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    // Exhaust the stream
    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    assertEquals(result.text, "Hello world!");
    assertEquals(result.aborted, false);
  });

  it("should accumulate tool calls and results", async () => {
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Let me search" },
      {
        type: "tool_call",
        call: { id: "call_1", name: "search", arguments: { query: "test" } },
      },
      { type: "tool_result", callId: "call_1", result: { found: true } },
      { type: "text", delta: " - done!" },
      { type: "done", finishReason: "stop", hasToolCalls: true },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    assertEquals(result.text, "Let me search - done!");
    assertEquals(result.toolCalls.length, 1);
    assertEquals(result.toolCalls[0].name, "search");
    assertEquals(result.toolCalls[0].id, "call_1");
    assertEquals(result.toolResults.length, 1);
    assertEquals(result.toolResults[0].callId, "call_1");
    assertEquals(result.toolResults[0].success, true);
  });

  it("should accumulate tool errors", async () => {
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [
      {
        type: "tool_call",
        call: { id: "call_1", name: "badTool", arguments: {} },
      },
      { type: "tool_error", callId: "call_1", error: "Tool failed" },
      { type: "done", finishReason: "stop", hasToolCalls: true },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    assertEquals(result.toolResults.length, 1);
    assertEquals(result.toolResults[0].success, false);
    assertEquals(result.toolResults[0].result, { error: "Tool failed" });
  });

  it("should accumulate usage across multiple done chunks", async () => {
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "First " },
      {
        type: "done",
        finishReason: "tool_calls",
        hasToolCalls: true,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          model: "gpt-4",
        },
      },
      { type: "text", delta: "Second" },
      {
        type: "done",
        finishReason: "stop",
        hasToolCalls: false,
        usage: {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          model: "gpt-4",
        },
      },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    // Usage should be accumulated: 100+200=300 input, 50+100=150 output
    assertEquals(result.usage.inputTokens, 300);
    assertEquals(result.usage.outputTokens, 150);
    assertEquals(result.finishReason, "stop"); // Last finish reason
  });

  it("should fire onComplete only once", async () => {
    let callCount = 0;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Hello" },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: () => {
        callCount++;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertEquals(callCount, 1);
  });

  it("should respect abort signal", async () => {
    let capturedResult: CompletionResult | undefined;
    const controller = new AbortController();

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Hello " },
      { type: "text", delta: "world" },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      abortSignal: controller.signal,
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    const outputChunks: StreamChunk[] = [];
    for await (const chunk of stream) {
      outputChunks.push(chunk);
      if (chunk.type === "text" && chunk.delta === "Hello ") {
        controller.abort();
      }
    }

    // Should have stopped after abort
    assertEquals(outputChunks.length, 1);

    // onComplete should still fire with aborted flag
    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    assertEquals(result.aborted, true);
    assertEquals(result.text, "Hello ");
  });

  it("should handle empty stream", async () => {
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Nothing to consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;
    assertEquals(result.text, "");
    assertEquals(result.toolCalls.length, 0);
    assertEquals(result.toolResults.length, 0);
    assertEquals(result.aborted, false);
  });

  it("should handle async onComplete callback", async () => {
    let callbackCompleted = false;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Hello" },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callbackCompleted = true;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    // The async callback should have completed
    assertEquals(callbackCompleted, true);
  });

  it("should accumulate across multiple tool-calling iterations", async () => {
    // This simulates the real agent loop behavior where:
    // 1. LLM makes a tool call
    // 2. Tool executes and returns result
    // 3. LLM processes result and makes another tool call
    // 4. Tool executes and returns result
    // 5. LLM generates final response
    let capturedResult: CompletionResult | undefined;

    const chunks: StreamChunk[] = [
      // First iteration: LLM calls tool
      { type: "text", delta: "Let me check " },
      {
        type: "tool_call",
        call: { id: "call_1", name: "getCurrentTime", arguments: {} },
      },
      {
        type: "done",
        finishReason: "tool_calls",
        hasToolCalls: true,
        usage: {
          inputTokens: 50,
          outputTokens: 20,
          totalTokens: 70,
          model: "gpt-4o",
        },
      },

      // Tool result
      {
        type: "tool_result",
        callId: "call_1",
        result: { time: "2026-01-20T12:00:00Z" },
      },

      // Second iteration: LLM calls another tool
      { type: "text", delta: "the time. Now let me " },
      {
        type: "tool_call",
        call: {
          id: "call_2",
          name: "searchWeb",
          arguments: { query: "weather" },
        },
      },
      {
        type: "done",
        finishReason: "tool_calls",
        hasToolCalls: true,
        usage: {
          inputTokens: 100,
          outputTokens: 30,
          totalTokens: 130,
          model: "gpt-4o",
        },
      },

      // Tool result
      { type: "tool_result", callId: "call_2", result: { weather: "sunny" } },

      // Final iteration: LLM generates response
      { type: "text", delta: "search for weather. " },
      { type: "text", delta: "It's sunny!" },
      {
        type: "done",
        finishReason: "stop",
        hasToolCalls: false,
        usage: {
          inputTokens: 150,
          outputTokens: 40,
          totalTokens: 190,
          model: "gpt-4o",
        },
      },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;

    // Text should be concatenated from all iterations
    assertEquals(
      result.text,
      "Let me check the time. Now let me search for weather. It's sunny!"
    );

    // Should have both tool calls
    assertEquals(result.toolCalls.length, 2);
    assertEquals(result.toolCalls[0].name, "getCurrentTime");
    assertEquals(result.toolCalls[0].id, "call_1");
    assertEquals(result.toolCalls[1].name, "searchWeb");
    assertEquals(result.toolCalls[1].id, "call_2");

    // Should have both tool results
    assertEquals(result.toolResults.length, 2);
    assertEquals(result.toolResults[0].callId, "call_1");
    assertEquals(result.toolResults[0].success, true);
    assertEquals(result.toolResults[1].callId, "call_2");
    assertEquals(result.toolResults[1].success, true);

    // Usage should be accumulated across all iterations
    assertEquals(result.usage.inputTokens, 300); // 50 + 100 + 150
    assertEquals(result.usage.outputTokens, 90); // 20 + 30 + 40

    // Final finish reason should be "stop"
    assertEquals(result.finishReason, "stop");
    assertEquals(result.aborted, false);
  });

  it("should fire onComplete once even with multiple done chunks from tool iterations", async () => {
    let callCount = 0;

    const chunks: StreamChunk[] = [
      { type: "text", delta: "Calling tool..." },
      {
        type: "tool_call",
        call: { id: "call_1", name: "test", arguments: {} },
      },
      { type: "done", finishReason: "tool_calls", hasToolCalls: true },
      { type: "tool_result", callId: "call_1", result: {} },
      { type: "text", delta: " Done." },
      { type: "done", finishReason: "stop", hasToolCalls: false },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: () => {
        callCount++;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    // onComplete should fire exactly once, after stream exhaustion
    assertEquals(callCount, 1);
  });

  it("should preserve tool call input in accumulated data", async () => {
    let capturedResult: CompletionResult | undefined;

    const toolInput = {
      query: "test query",
      limit: 10,
      filters: { active: true },
    };
    const chunks: StreamChunk[] = [
      {
        type: "tool_call",
        call: { id: "call_1", name: "complexSearch", arguments: toolInput },
      },
      { type: "tool_result", callId: "call_1", result: { results: [] } },
      { type: "done", finishReason: "stop", hasToolCalls: true },
    ];

    const stream = withOnComplete(mockStream(chunks), {
      onComplete: (result) => {
        capturedResult = result;
      },
    });

    for await (const _chunk of stream) {
      // Just consume
    }

    assertNotEquals(capturedResult, undefined);
    const result = capturedResult as CompletionResult;

    // Tool call input should be preserved
    assertEquals(result.toolCalls[0].input, toolInput);
  });
});
