/**
 * Tests for history normalizer
 *
 * Tests provider switching and tool call preservation/conversion.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  normalizeHistory,
  historyHasToolCalls,
  detectProvider,
  isSameProviderFamily,
  fallbackToTextConversion,
} from "../../../llm/normalization/history-normalizer.ts";
import type {
  UnifiedMessage,
  UnifiedContentPart,
} from "../../../llm/normalization/types.ts";

describe("detectProvider", () => {
  it("detects OpenAI models", () => {
    assertEquals(detectProvider("gpt-4o"), "openai");
    assertEquals(detectProvider("gpt-4-turbo"), "openai");
    assertEquals(detectProvider("o1-preview"), "openai");
    assertEquals(detectProvider("o3-mini"), "openai");
  });

  it("detects Anthropic models", () => {
    assertEquals(detectProvider("claude-3-opus"), "anthropic");
    assertEquals(detectProvider("claude-sonnet-4"), "anthropic");
    assertEquals(detectProvider("claude-3-5-haiku"), "anthropic");
  });

  it("detects Google models", () => {
    assertEquals(detectProvider("gemini-2.0-flash"), "google");
    assertEquals(detectProvider("gemini-1.5-pro"), "google");
  });

  it("defaults to openai for unknown models", () => {
    assertEquals(detectProvider("unknown-model"), "openai");
    assertEquals(detectProvider("llama-3"), "openai");
  });
});

describe("isSameProviderFamily", () => {
  it("returns true for same provider", () => {
    assertEquals(isSameProviderFamily("openai", "openai"), true);
    assertEquals(isSameProviderFamily("anthropic", "anthropic"), true);
    assertEquals(isSameProviderFamily("google", "google"), true);
  });

  it("returns false for different providers", () => {
    assertEquals(isSameProviderFamily("openai", "anthropic"), false);
    assertEquals(isSameProviderFamily("anthropic", "google"), false);
    assertEquals(isSameProviderFamily("google", "openai"), false);
  });
});

describe("historyHasToolCalls", () => {
  it("returns false for simple text messages", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    assertEquals(historyHasToolCalls(messages), false);
  });

  it("returns true when assistant has tool calls", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Search for news" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Searching..." },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "search",
            input: { query: "news" },
          },
        ],
      },
    ];

    assertEquals(historyHasToolCalls(messages), true);
  });

  it("returns true when there are tool result messages", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Get data" },
      { role: "assistant", content: "Getting..." },
      {
        role: "tool",
        content: "data result",
        toolCallId: "call_1",
        toolName: "getData",
      },
    ];

    assertEquals(historyHasToolCalls(messages), true);
  });
});

describe("normalizeHistory", () => {
  it("passes through messages without tool calls", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];

    const normalized = normalizeHistory(messages, "anthropic", "openai");

    assertEquals(normalized, messages);
  });

  it("keeps tool calls when same provider family", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Search" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "search",
            input: { q: "test" },
          },
        ],
      },
      {
        role: "tool",
        content: "results",
        toolCallId: "call_1",
        toolName: "search",
      },
    ];

    // Same provider (openai -> openai) should keep tool calls
    const normalized = normalizeHistory(messages, "openai", "openai");

    assertEquals(normalized.length, 3);
    const assistantContent = normalized[1].content;
    assertExists(Array.isArray(assistantContent));
    if (Array.isArray(assistantContent)) {
      assertEquals(assistantContent[0].type, "tool-call");
    }
  });

  it("converts tool calls when switching providers", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Search" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Searching..." },
          {
            type: "tool-call",
            toolCallId: "call_openai_1",
            toolName: "search",
            input: { query: "news" },
          },
        ],
      },
      {
        role: "tool",
        content: "news results",
        toolCallId: "call_openai_1",
        toolName: "search",
      },
      { role: "assistant", content: "Here are the results." },
    ];

    // Switching from openai to anthropic
    const normalized = normalizeHistory(messages, "anthropic", "openai");

    // Should still have all messages
    assertEquals(normalized.length, 4);

    // Tool calls should be preserved (not stripped)
    const assistantContent = normalized[1].content;
    assertExists(Array.isArray(assistantContent));
    if (Array.isArray(assistantContent)) {
      const toolCallPart = assistantContent.find((p) => p.type === "tool-call");
      assertExists(toolCallPart);
    }
  });

  it("handles switching to Google (regenerates tool IDs)", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Calculate" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_anthropic_123",
            toolName: "calculator",
            input: { expression: "2+2" },
          },
        ],
      },
      {
        role: "tool",
        content: "4",
        toolCallId: "call_anthropic_123",
        toolName: "calculator",
      },
    ];

    // Switching to Google
    const normalized = normalizeHistory(messages, "google", "anthropic");

    assertEquals(normalized.length, 3);

    // Tool result should have the tool name for Google correlation
    assertEquals(normalized[2].toolName, "calculator");
  });
});

describe("fallbackToTextConversion", () => {
  it("converts tool calls to text descriptions", () => {
    const messages: UnifiedMessage[] = [
      { role: "user", content: "Search" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me search." },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "webSearch",
            input: { query: "weather" },
          },
        ],
      },
      {
        role: "tool",
        content: "Sunny, 72°F",
        toolCallId: "call_1",
        toolName: "webSearch",
      },
      { role: "assistant", content: "The weather is sunny." },
    ];

    const converted = fallbackToTextConversion(messages);

    // User message unchanged
    assertEquals(converted[0].role, "user");
    assertEquals(converted[0].content, "Search");

    // Assistant with tool call converted to text
    assertEquals(converted[1].role, "assistant");
    assertEquals(typeof converted[1].content, "string");
    const content1 = converted[1].content as string;
    assertEquals(content1.includes("webSearch"), true);

    // Tool result converted to assistant message
    assertEquals(converted[2].role, "assistant");
    assertEquals(typeof converted[2].content, "string");
    const content2 = converted[2].content as string;
    assertEquals(content2.includes("webSearch"), true);

    // Final assistant message unchanged
    assertEquals(converted[3].role, "assistant");
    assertEquals(converted[3].content, "The weather is sunny.");
  });

  it("preserves user and system messages", () => {
    const messages: UnifiedMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Help me" },
    ];

    const converted = fallbackToTextConversion(messages);

    assertEquals(converted[0].role, "system");
    assertEquals(converted[0].content, "You are helpful.");
    assertEquals(converted[1].role, "user");
    assertEquals(converted[1].content, "Help me");
  });
});
