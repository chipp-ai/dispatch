/**
 * Reconstruct History Tests
 *
 * Unit tests for the reconstructHistory utility that converts DB message records
 * into properly structured LLM messages, preserving tool calls and results.
 *
 * These tests do NOT require database or API connections.
 *
 * Run with:
 *   deno test src/__tests__/llm/reconstruct_history_test.ts --allow-all
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import { reconstructHistory } from "../../llm/utils/reconstruct-history.ts";
import type { Message as DBMessage } from "../../services/chat.service.ts";

// ========================================
// Test Helpers
// ========================================

function makeDBMessage(overrides: Partial<DBMessage>): DBMessage {
  return {
    id: overrides.id || "msg-" + Math.random().toString(36).slice(2, 10),
    sessionId: overrides.sessionId || "session-1",
    role: overrides.role || "user",
    content: overrides.content || "",
    toolCalls: overrides.toolCalls ?? null,
    toolResults: overrides.toolResults ?? null,
    model: overrides.model ?? null,
    tokenCount: overrides.tokenCount ?? null,
    latencyMs: overrides.latencyMs ?? null,
    tags: overrides.tags ?? null,
    audioUrl: overrides.audioUrl ?? null,
    audioDurationMs: overrides.audioDurationMs ?? null,
    videoUrl: overrides.videoUrl ?? null,
    videoMimeType: overrides.videoMimeType ?? null,
    createdAt: overrides.createdAt || new Date(),
  };
}

// ========================================
// Plain Text Messages
// ========================================

describe("reconstructHistory - plain text messages", () => {
  it("reconstructs a simple user/assistant conversation", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({
        role: "assistant",
        content: "Hi! How can I help?",
        model: "gpt-4o",
      }),
      makeDBMessage({ role: "user", content: "What's 2+2?" }),
      makeDBMessage({
        role: "assistant",
        content: "2+2 is 4.",
        model: "gpt-4o",
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 4);
    assertEquals(messages[0], { role: "user", content: "Hello" });
    assertEquals(messages[1], {
      role: "assistant",
      content: "Hi! How can I help?",
    });
    assertEquals(messages[2], { role: "user", content: "What's 2+2?" });
    assertEquals(messages[3], { role: "assistant", content: "2+2 is 4." });
  });

  it("handles empty history", () => {
    const messages = reconstructHistory([]);
    assertEquals(messages.length, 0);
  });

  it("preserves empty assistant content as empty string", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({ role: "assistant", content: "", model: "gpt-4o" }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 2);
    assertEquals(messages[1], { role: "assistant", content: "" });
  });
});

// ========================================
// Tool Calls
// ========================================

describe("reconstructHistory - tool calls", () => {
  it("reconstructs assistant message with tool calls as ContentParts", () => {
    const toolCalls = [
      {
        id: "call_abc",
        name: "retrieveUrl",
        input: { url: "https://example.com" },
      },
    ];
    const toolResults = [
      {
        callId: "call_abc",
        name: "retrieveUrl",
        result: { content: "Page content" },
        success: true,
      },
    ];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "What's on example.com?" }),
      makeDBMessage({
        role: "assistant",
        content: "Let me check that for you.",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
    ];

    const messages = reconstructHistory(history);

    // Should produce 3 messages: user, assistant (with tool_use), tool result
    assertEquals(messages.length, 3);

    // User message
    assertEquals(messages[0].role, "user");
    assertEquals(messages[0].content, "What's on example.com?");

    // Assistant message with tool_use ContentParts
    assertEquals(messages[1].role, "assistant");
    const assistantContent = messages[1].content;
    assertEquals(Array.isArray(assistantContent), true);
    const parts = assistantContent as Array<Record<string, unknown>>;
    assertEquals(parts.length, 2); // text + tool_use
    assertEquals(parts[0].type, "text");
    assertEquals(parts[0].text, "Let me check that for you.");
    assertEquals(parts[1].type, "tool_use");
    assertEquals(parts[1].id, "call_abc");
    assertEquals(parts[1].name, "retrieveUrl");

    // Tool result message
    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "call_abc");
    assertEquals(messages[2].name, "retrieveUrl");
    assertEquals(
      messages[2].content,
      JSON.stringify({ content: "Page content" })
    );
  });

  it("handles assistant with tool calls but no text content", () => {
    const toolCalls = [
      { id: "call_123", name: "browseWeb", input: { query: "weather Austin" } },
    ];
    const toolResults = [
      {
        callId: "call_123",
        name: "browseWeb",
        result: { summary: "Sunny, 85F" },
        success: true,
      },
    ];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "What's the weather?" }),
      makeDBMessage({
        role: "assistant",
        content: "", // No text, only tool calls
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 3); // user, assistant, tool

    // Assistant should only have tool_use, no text part
    const parts = messages[1].content as Array<Record<string, unknown>>;
    assertEquals(parts.length, 1);
    assertEquals(parts[0].type, "tool_use");
  });

  it("handles multiple tool calls in a single message", () => {
    const toolCalls = [
      { id: "call_1", name: "browseWeb", input: { query: "Austin weather" } },
      {
        id: "call_2",
        name: "retrieveUrl",
        input: { url: "https://weather.com" },
      },
    ];
    const toolResults = [
      {
        callId: "call_1",
        name: "browseWeb",
        result: { summary: "Sunny" },
        success: true,
      },
      {
        callId: "call_2",
        name: "retrieveUrl",
        result: { content: "Detailed forecast" },
        success: true,
      },
    ];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Get weather info" }),
      makeDBMessage({
        role: "assistant",
        content: "Let me search for that.",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant + 2 tool results = 4
    assertEquals(messages.length, 4);

    const parts = messages[1].content as Array<Record<string, unknown>>;
    assertEquals(parts.length, 3); // text + 2 tool_use

    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "call_1");
    assertEquals(messages[3].role, "tool");
    assertEquals(messages[3].toolCallId, "call_2");
  });

  it("handles tool calls with results but no text in assistant message", () => {
    const toolCalls = [
      { id: "call_x", name: "searchKnowledge", input: { query: "docs" } },
    ];
    const toolResults = [
      {
        callId: "call_x",
        name: "searchKnowledge",
        result: [{ text: "Found doc" }],
        success: true,
      },
    ];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Search docs" }),
      makeDBMessage({
        role: "assistant",
        content: "",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
      makeDBMessage({
        role: "assistant",
        content: "Based on the docs, here's what I found.",
        model: "gpt-4o",
      }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant(tool_use) + tool + assistant(text) = 4
    assertEquals(messages.length, 4);
    assertEquals(messages[0].role, "user");
    assertEquals(messages[1].role, "assistant");
    assertEquals(messages[2].role, "tool");
    assertEquals(messages[3].role, "assistant");
    assertEquals(
      messages[3].content,
      "Based on the docs, here's what I found."
    );
  });
});

// ========================================
// JSON Parsing (Kysely returns strings)
// ========================================

describe("reconstructHistory - JSON parsing", () => {
  it("parses toolCalls and toolResults from JSON strings", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({
        role: "assistant",
        content: "Using tool.",
        model: "gpt-4o",
        toolCalls: JSON.stringify([
          { id: "tc_1", name: "myTool", input: { key: "value" } },
        ]),
        toolResults: JSON.stringify([
          { callId: "tc_1", name: "myTool", result: "done", success: true },
        ]),
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 3);
    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "tc_1");
  });

  it("handles already-parsed objects (not strings)", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({
        role: "assistant",
        content: "Using tool.",
        model: "gpt-4o",
        // Already parsed (not stringified) - can happen in some code paths
        toolCalls: [
          { id: "tc_2", name: "myTool", input: { key: "value" } },
        ] as unknown,
        toolResults: [
          { callId: "tc_2", name: "myTool", result: "done", success: true },
        ] as unknown,
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 3);
    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "tc_2");
  });

  it("handles invalid JSON gracefully (falls back to text-only)", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({
        role: "assistant",
        content: "Response text.",
        model: "gpt-4o",
        toolCalls: "not valid json{{{" as unknown,
        toolResults: "also invalid" as unknown,
      }),
    ];

    const messages = reconstructHistory(history);
    // Should fall back to plain text assistant message
    assertEquals(messages.length, 2);
    assertEquals(messages[1].role, "assistant");
    assertEquals(messages[1].content, "Response text.");
  });

  it("handles null toolCalls and toolResults", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
      makeDBMessage({
        role: "assistant",
        content: "Just text.",
        model: "gpt-4o",
        toolCalls: null,
        toolResults: null,
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 2);
    assertEquals(messages[1], { role: "assistant", content: "Just text." });
  });
});

// ========================================
// Corruption Safeguards
// ========================================

describe("reconstructHistory - corruption safeguards", () => {
  it("limits tool results to 50 (hard limit)", () => {
    // Generate 60 tool calls and results
    const toolCalls = Array.from({ length: 60 }, (_, i) => ({
      id: `call_${i}`,
      name: `tool_${i}`,
      input: {},
    }));
    const toolResults = Array.from({ length: 60 }, (_, i) => ({
      callId: `call_${i}`,
      name: `tool_${i}`,
      result: `result_${i}`,
      success: true,
    }));

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Do many things" }),
      makeDBMessage({
        role: "assistant",
        content: "Processing...",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
    ];

    const messages = reconstructHistory(history);

    // Should be: user + assistant + 50 tool results = 52
    assertEquals(messages.length, 52);

    // Count tool messages
    const toolMessages = messages.filter((m) => m.role === "tool");
    assertEquals(toolMessages.length, 50);
  });

  it("skips tool results without callId", () => {
    const toolCalls = [
      { id: "call_valid", name: "validTool", input: {} },
      { id: "call_missing", name: "missingTool", input: {} },
    ];
    const toolResults = [
      { callId: "call_valid", name: "validTool", result: "ok", success: true },
      { callId: "", name: "missingTool", result: "ok", success: true }, // empty callId
    ];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Test" }),
      makeDBMessage({
        role: "assistant",
        content: "",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: JSON.stringify(toolResults),
      }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant + 1 valid tool result = 3 (skipped the one without callId)
    assertEquals(messages.length, 3);
    const toolMessages = messages.filter((m) => m.role === "tool");
    assertEquals(toolMessages.length, 1);
    assertEquals(toolMessages[0].toolCallId, "call_valid");
  });

  it("handles tool calls with no corresponding results", () => {
    const toolCalls = [{ id: "call_orphan", name: "orphanTool", input: {} }];

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Test" }),
      makeDBMessage({
        role: "assistant",
        content: "Calling tool.",
        model: "gpt-4o",
        toolCalls: JSON.stringify(toolCalls),
        toolResults: null, // No results stored
      }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant (with tool_use) = 2, no tool result messages
    assertEquals(messages.length, 2);
    const parts = messages[1].content as Array<Record<string, unknown>>;
    assertEquals(parts.length, 2); // text + tool_use
    assertEquals(parts[1].type, "tool_use");
  });

  it("handles empty toolCalls array", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Test" }),
      makeDBMessage({
        role: "assistant",
        content: "Normal response.",
        model: "gpt-4o",
        toolCalls: JSON.stringify([]), // empty array
        toolResults: JSON.stringify([]),
      }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 2);
    // Empty array should be treated as no tool calls
    assertEquals(messages[1], {
      role: "assistant",
      content: "Normal response.",
    });
  });
});

// ========================================
// Mixed Conversations (realistic scenario)
// ========================================

describe("reconstructHistory - mixed conversations", () => {
  it("reconstructs a realistic multi-turn conversation with tool use", () => {
    const history: DBMessage[] = [
      // Turn 1: Simple greeting
      makeDBMessage({ role: "user", content: "What's the weather in Austin?" }),
      // Turn 2: Assistant uses browseWeb tool
      makeDBMessage({
        role: "assistant",
        content: "Let me look that up for you.",
        model: "gpt-4o",
        toolCalls: JSON.stringify([
          {
            id: "call_browse",
            name: "browseWeb",
            input: { query: "weather Austin TX" },
          },
        ]),
        toolResults: JSON.stringify([
          {
            callId: "call_browse",
            name: "browseWeb",
            result: { summary: "Austin TX: 85°F, sunny, humidity 45%" },
            success: true,
          },
        ]),
      }),
      // Turn 3: Assistant's final response after tool
      makeDBMessage({
        role: "assistant",
        content:
          "The weather in Austin is currently 85°F and sunny with 45% humidity.",
        model: "gpt-4o",
      }),
      // Turn 4: Follow-up (THIS is the message that triggers the bug without reconstruction)
      makeDBMessage({ role: "user", content: "Thanks!" }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant(tool_use) + tool + assistant(text) + user = 5
    assertEquals(messages.length, 5);

    assertEquals(messages[0].role, "user");
    assertEquals(messages[0].content, "What's the weather in Austin?");

    assertEquals(messages[1].role, "assistant");
    const toolParts = messages[1].content as Array<Record<string, unknown>>;
    assertEquals(toolParts[0].type, "text");
    assertEquals(toolParts[1].type, "tool_use");
    assertEquals(toolParts[1].name, "browseWeb");

    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "call_browse");

    assertEquals(messages[3].role, "assistant");
    assertEquals(
      messages[3].content,
      "The weather in Austin is currently 85°F and sunny with 45% humidity."
    );

    assertEquals(messages[4].role, "user");
    assertEquals(messages[4].content, "Thanks!");
  });

  it("reconstructs conversation with multiple tool-using turns", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Search for React docs" }),
      makeDBMessage({
        role: "assistant",
        content: "",
        model: "gpt-4o",
        toolCalls: JSON.stringify([
          {
            id: "call_1",
            name: "browseWeb",
            input: { query: "React documentation" },
          },
        ]),
        toolResults: JSON.stringify([
          {
            callId: "call_1",
            name: "browseWeb",
            result: { url: "https://react.dev" },
            success: true,
          },
        ]),
      }),
      makeDBMessage({
        role: "assistant",
        content: "",
        model: "gpt-4o",
        toolCalls: JSON.stringify([
          {
            id: "call_2",
            name: "retrieveUrl",
            input: { url: "https://react.dev" },
          },
        ]),
        toolResults: JSON.stringify([
          {
            callId: "call_2",
            name: "retrieveUrl",
            result: { content: "React docs content..." },
            success: true,
          },
        ]),
      }),
      makeDBMessage({
        role: "assistant",
        content: "Here's what I found in the React documentation.",
        model: "gpt-4o",
      }),
      makeDBMessage({ role: "user", content: "Thanks, that's helpful" }),
    ];

    const messages = reconstructHistory(history);

    // user + assistant(tool_use) + tool + assistant(tool_use) + tool + assistant(text) + user = 7
    assertEquals(messages.length, 7);

    assertEquals(messages[0].role, "user");
    assertEquals(messages[1].role, "assistant");
    assertEquals(messages[2].role, "tool");
    assertEquals(messages[2].toolCallId, "call_1");
    assertEquals(messages[3].role, "assistant");
    assertEquals(messages[4].role, "tool");
    assertEquals(messages[4].toolCallId, "call_2");
    assertEquals(messages[5].role, "assistant");
    assertEquals(
      messages[5].content,
      "Here's what I found in the React documentation."
    );
    assertEquals(messages[6].role, "user");
  });
});

// ========================================
// Options
// ========================================

describe("reconstructHistory - options", () => {
  it("accepts custom log prefix", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
    ];

    // Should not throw; log prefix is for console.log output
    const messages = reconstructHistory(history, { logPrefix: "[test]" });
    assertEquals(messages.length, 1);
  });

  it("works without options", () => {
    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "Hello" }),
    ];

    const messages = reconstructHistory(history);
    assertEquals(messages.length, 1);
  });
});

// ========================================
// The Bug Scenario
// ========================================

describe("reconstructHistory - bug scenario: tool calls stripped from history", () => {
  it("preserves tool context so follow-up messages don't trigger hallucinated tool calls", () => {
    // This is the exact bug scenario: consumer chat was sending only msg.content,
    // stripping tool calls. The LLM would see:
    //   user: "what's the weather?"
    //   assistant: "Let me look that up."  <-- tool_use stripped!
    //   user: "thanks!"
    // And would try to call retrieveUrl again because it didn't know the tool was already used.

    const history: DBMessage[] = [
      makeDBMessage({ role: "user", content: "What's the weather in Austin?" }),
      makeDBMessage({
        role: "assistant",
        content: "Let me look that up for you.",
        model: "gpt-4o",
        toolCalls: JSON.stringify([
          {
            id: "call_weather",
            name: "browseWeb",
            input: { query: "weather Austin" },
          },
        ]),
        toolResults: JSON.stringify([
          {
            callId: "call_weather",
            name: "browseWeb",
            result: { summary: "85°F, sunny" },
            success: true,
          },
        ]),
      }),
      makeDBMessage({
        role: "assistant",
        content: "It's currently 85°F and sunny in Austin.",
        model: "gpt-4o",
      }),
      makeDBMessage({ role: "user", content: "thanks!" }),
    ];

    const messages = reconstructHistory(history);

    // Verify tool_use is present in the assistant message
    const assistantWithTools = messages.find(
      (m) => m.role === "assistant" && Array.isArray(m.content)
    );
    assertExists(
      assistantWithTools,
      "Should have an assistant message with ContentParts"
    );

    const parts = assistantWithTools!.content as Array<Record<string, unknown>>;
    const toolUsePart = parts.find((p) => p.type === "tool_use");
    assertExists(toolUsePart, "Should have a tool_use ContentPart");
    assertEquals(toolUsePart!.name, "browseWeb");

    // Verify tool result is present
    const toolResultMsg = messages.find((m) => m.role === "tool");
    assertExists(toolResultMsg, "Should have a tool result message");
    assertEquals(toolResultMsg!.toolCallId, "call_weather");

    // The LLM now sees the full tool interaction, preventing hallucinated re-calls
  });
});
