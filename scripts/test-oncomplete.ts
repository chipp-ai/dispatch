#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Test script for withOnComplete wrapper
 *
 * This tests the streaming completion wrapper with a mock LLM response
 * that includes tool calls, to verify the onComplete callback fires
 * exactly once with all accumulated data.
 */

import {
  withOnComplete,
  type CompletionResult,
} from "../src/agent/completion.ts";
import type { StreamChunk } from "../src/llm/types.ts";
import process from "node:process";

// Simulate a realistic agent stream with tool calls
async function* simulateAgentStream(): AsyncGenerator<StreamChunk> {
  console.log("[mock] Starting simulated agent stream...");

  // First iteration: LLM decides to call a tool
  yield { type: "text", delta: "Let me " };
  await delay(50);
  yield { type: "text", delta: "search for that..." };
  await delay(50);

  yield {
    type: "tool_call",
    call: {
      id: "call_abc123",
      name: "searchWeb",
      arguments: { query: "test query" },
    },
  };

  yield {
    type: "done",
    finishReason: "tool_calls",
    hasToolCalls: true,
    usage: {
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      model: "gpt-4o",
    },
  };

  // Simulate tool execution delay
  await delay(100);

  yield {
    type: "tool_result",
    callId: "call_abc123",
    result: { results: ["result 1", "result 2"] },
  };

  // Second iteration: LLM processes tool result
  yield { type: "text", delta: "\n\nBased on my search, " };
  await delay(50);
  yield { type: "text", delta: "I found 2 results." };
  await delay(50);

  yield {
    type: "done",
    finishReason: "stop",
    hasToolCalls: false,
    usage: {
      inputTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
      model: "gpt-4o",
    },
  };

  console.log("[mock] Stream complete");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Testing withOnComplete wrapper ===\n");

  let onCompleteCallCount = 0;
  let capturedResult: CompletionResult | null = null;

  const wrappedStream = withOnComplete(simulateAgentStream(), {
    onComplete: async (result) => {
      onCompleteCallCount++;
      capturedResult = result;
      console.log("\n[onComplete] Callback fired!");
      console.log("[onComplete] Call count:", onCompleteCallCount);

      // Simulate async persistence (like saving to database)
      await delay(50);
      console.log("[onComplete] Persistence complete (simulated)");
    },
  });

  // Consume the stream (like the SSE handler would)
  console.log("[consumer] Starting to consume stream...\n");
  let chunkCount = 0;

  for await (const chunk of wrappedStream) {
    chunkCount++;

    switch (chunk.type) {
      case "text":
        process.stdout.write(chunk.delta);
        break;
      case "tool_call":
        console.log(
          `\n[consumer] Tool call: ${chunk.call.name}(${JSON.stringify(chunk.call.arguments)})`
        );
        break;
      case "tool_result":
        console.log(
          `[consumer] Tool result for ${chunk.callId}: ${JSON.stringify(chunk.result)}`
        );
        break;
      case "done":
        console.log(
          `\n[consumer] Done: ${chunk.finishReason} (usage: ${chunk.usage?.inputTokens ?? 0}in/${chunk.usage?.outputTokens ?? 0}out)`
        );
        break;
    }
  }

  console.log("\n\n=== Results ===");
  console.log("Total chunks processed:", chunkCount);
  console.log("onComplete call count:", onCompleteCallCount);

  if (capturedResult) {
    console.log("\nCaptured Result:");
    console.log("  - Text length:", capturedResult.text.length);
    console.log(
      "  - Text preview:",
      capturedResult.text.substring(0, 50) + "..."
    );
    console.log("  - Tool calls:", capturedResult.toolCalls.length);
    if (capturedResult.toolCalls.length > 0) {
      console.log(
        "    -",
        capturedResult.toolCalls.map((tc) => `${tc.name}(${tc.id})`).join(", ")
      );
    }
    console.log("  - Tool results:", capturedResult.toolResults.length);
    if (capturedResult.toolResults.length > 0) {
      console.log(
        "    -",
        capturedResult.toolResults
          .map((tr) => `${tr.name}: ${tr.success ? "success" : "error"}`)
          .join(", ")
      );
    }
    console.log(
      "  - Usage: input=",
      capturedResult.usage.inputTokens,
      "output=",
      capturedResult.usage.outputTokens
    );
    console.log("  - Finish reason:", capturedResult.finishReason);
    console.log("  - Aborted:", capturedResult.aborted);
  }

  // Verify expectations
  console.log("\n=== Verification ===");
  const passed =
    onCompleteCallCount === 1 &&
    capturedResult !== null &&
    capturedResult.text.includes("Let me search") &&
    capturedResult.text.includes("I found 2 results") &&
    capturedResult.toolCalls.length === 1 &&
    capturedResult.toolResults.length === 1 &&
    capturedResult.usage.inputTokens === 300 && // 100 + 200
    capturedResult.usage.outputTokens === 75; // 25 + 50

  if (passed) {
    console.log("✓ All checks passed!");
  } else {
    console.log("✗ Some checks failed:");
    if (onCompleteCallCount !== 1)
      console.log(
        `  - onComplete called ${onCompleteCallCount} times (expected 1)`
      );
    if (!capturedResult) console.log("  - No result captured");
    else {
      if (!capturedResult.text.includes("Let me search"))
        console.log("  - Missing text content");
      if (capturedResult.toolCalls.length !== 1)
        console.log(
          `  - Tool calls: ${capturedResult.toolCalls.length} (expected 1)`
        );
      if (capturedResult.toolResults.length !== 1)
        console.log(
          `  - Tool results: ${capturedResult.toolResults.length} (expected 1)`
        );
      if (capturedResult.usage.inputTokens !== 300)
        console.log(
          `  - Input tokens: ${capturedResult.usage.inputTokens} (expected 300)`
        );
      if (capturedResult.usage.outputTokens !== 75)
        console.log(
          `  - Output tokens: ${capturedResult.usage.outputTokens} (expected 75)`
        );
    }
  }
}

main().catch(console.error);
