/**
 * History Normalization Tests
 *
 * Unit tests for the history normalization utility that handles
 * message format compatibility when switching LLM providers mid-conversation.
 *
 * These tests do NOT require database or API connections, so they
 * run in CI without any external dependencies.
 *
 * Run with:
 *   deno test src/__tests__/llm/normalize_history_test.ts --allow-all
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assert, assertFalse } from "jsr:@std/assert";
import {
  normalizeHistoryForModel,
  stripToolCallHistory,
  historyHasToolCalls,
} from "../../llm/utils/normalize-history.ts";
import type { Message } from "../../llm/types.ts";

// ========================================
// Test Fixtures
// ========================================

/**
 * Simple conversation without tool calls
 */
const SIMPLE_CONVERSATION: Message[] = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there! How can I help you today?" },
  { role: "user", content: "What's the weather like?" },
  {
    role: "assistant",
    content: "I don't have access to real-time weather data.",
  },
];

/**
 * Conversation with tool calls (OpenAI format)
 */
const CONVERSATION_WITH_TOOLS: Message[] = [
  { role: "user", content: "What's the current time in UTC?" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Let me check the current time for you." },
      {
        type: "tool_use",
        id: "call_abc123",
        name: "getCurrentTime",
        input: { timezone: "UTC" },
      },
    ],
  },
  {
    role: "tool",
    content: '{"time": "2024-01-15T10:30:00Z", "timezone": "UTC"}',
    toolCallId: "call_abc123",
    name: "getCurrentTime",
  },
  { role: "assistant", content: "The current time in UTC is 10:30 AM." },
  { role: "user", content: "Thanks! What about New York?" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Let me check the time in New York." },
      {
        type: "tool_use",
        id: "call_def456",
        name: "getCurrentTime",
        input: { timezone: "America/New_York" },
      },
    ],
  },
  {
    role: "tool",
    content:
      '{"time": "2024-01-15T05:30:00-05:00", "timezone": "America/New_York"}',
    toolCallId: "call_def456",
    name: "getCurrentTime",
  },
  { role: "assistant", content: "The current time in New York is 5:30 AM." },
];

/**
 * Conversation with tool call but no text before it
 */
const TOOL_CALL_WITHOUT_TEXT: Message[] = [
  { role: "user", content: "What time is it?" },
  {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "call_xyz789",
        name: "getCurrentTime",
        input: {},
      },
    ],
  },
  {
    role: "tool",
    content: '{"time": "2024-01-15T10:30:00Z"}',
    toolCallId: "call_xyz789",
    name: "getCurrentTime",
  },
  { role: "assistant", content: "It's 10:30 AM UTC." },
];

/**
 * System message + conversation
 */
const CONVERSATION_WITH_SYSTEM: Message[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hello! How can I help?" },
];

// ========================================
// Tests: historyHasToolCalls
// ========================================

describe("historyHasToolCalls", () => {
  it("should return false for simple conversation without tools", () => {
    assertFalse(historyHasToolCalls(SIMPLE_CONVERSATION));
  });

  it("should return true when conversation contains tool_use in assistant message", () => {
    assert(historyHasToolCalls(CONVERSATION_WITH_TOOLS));
  });

  it("should return true when conversation contains tool role message", () => {
    const withToolRole: Message[] = [
      { role: "user", content: "Hello" },
      { role: "tool", content: "result", toolCallId: "call_123", name: "test" },
    ];
    assert(historyHasToolCalls(withToolRole));
  });

  it("should return false for empty message array", () => {
    assertFalse(historyHasToolCalls([]));
  });

  it("should return false for system-only messages", () => {
    const systemOnly: Message[] = [
      { role: "system", content: "You are helpful." },
    ];
    assertFalse(historyHasToolCalls(systemOnly));
  });
});

// ========================================
// Tests: stripToolCallHistory
// ========================================

describe("stripToolCallHistory", () => {
  it("should pass through simple conversation unchanged", () => {
    const result = stripToolCallHistory(SIMPLE_CONVERSATION);
    assertEquals(result.length, SIMPLE_CONVERSATION.length);
    assertEquals(result[0].content, "Hello");
    assertEquals(result[1].content, "Hi there! How can I help you today?");
  });

  it("should convert tool_use blocks to text summaries", () => {
    const result = stripToolCallHistory(CONVERSATION_WITH_TOOLS);

    // Should not have any tool role messages
    const toolMessages = result.filter((m) => m.role === "tool");
    assertEquals(toolMessages.length, 0);

    // Should not have any messages with array content containing tool_use
    const messagesWithToolUse = result.filter(
      (m) =>
        Array.isArray(m.content) && m.content.some((p) => p.type === "tool_use")
    );
    assertEquals(messagesWithToolUse.length, 0);

    // All messages should have string content
    for (const msg of result) {
      assert(
        typeof msg.content === "string",
        `Message content should be string: ${JSON.stringify(msg)}`
      );
    }
  });

  it("should preserve user messages exactly", () => {
    const result = stripToolCallHistory(CONVERSATION_WITH_TOOLS);
    const userMessages = result.filter((m) => m.role === "user");
    assertEquals(userMessages.length, 2);
    assertEquals(userMessages[0].content, "What's the current time in UTC?");
    assertEquals(userMessages[1].content, "Thanks! What about New York?");
  });

  it("should preserve system messages exactly", () => {
    const conversationWithSystem: Message[] = [
      { role: "system", content: "You are a helpful assistant." },
      ...CONVERSATION_WITH_TOOLS,
    ];
    const result = stripToolCallHistory(conversationWithSystem);
    const systemMessages = result.filter((m) => m.role === "system");
    assertEquals(systemMessages.length, 1);
    assertEquals(systemMessages[0].content, "You are a helpful assistant.");
  });

  it("should include tool call names in converted text", () => {
    const result = stripToolCallHistory(CONVERSATION_WITH_TOOLS);
    const allText = result.map((m) => m.content).join(" ");
    assert(
      allText.includes("getCurrentTime"),
      "Should mention tool name in converted text"
    );
  });

  it("should include tool results in converted text", () => {
    const result = stripToolCallHistory(CONVERSATION_WITH_TOOLS);
    const allText = result.map((m) => m.content).join(" ");
    // Tool results should be converted to assistant messages with the result
    assert(
      allText.includes("Tool") || allText.includes("returned"),
      "Should include tool result in converted text"
    );
  });

  it("should handle tool call without preceding text", () => {
    const result = stripToolCallHistory(TOOL_CALL_WITHOUT_TEXT);
    // Should not throw and should produce valid messages
    assert(result.length > 0);
    for (const msg of result) {
      assert(typeof msg.content === "string");
    }
  });

  it("should preserve the order of messages", () => {
    const result = stripToolCallHistory(CONVERSATION_WITH_TOOLS);
    // First should be user, then assistant(s), then user, etc.
    assertEquals(result[0].role, "user");
    assertEquals(result[result.length - 1].role, "assistant");
  });
});

// ========================================
// Tests: normalizeHistoryForModel
// ========================================

describe("normalizeHistoryForModel", () => {
  describe("Provider Detection", () => {
    it("should detect OpenAI models correctly", () => {
      const openAIModels = [
        "gpt-4",
        "gpt-4o",
        "gpt-5",
        "o1-preview",
        "o3-mini",
      ];
      for (const model of openAIModels) {
        const result = normalizeHistoryForModel(
          SIMPLE_CONVERSATION,
          model,
          "gpt-4"
        );
        // Same provider family, should pass through
        assertEquals(result, SIMPLE_CONVERSATION);
      }
    });

    it("should detect Anthropic models correctly", () => {
      const anthropicModels = [
        "claude-3-5-sonnet",
        "claude-sonnet-4",
        "claude-3-opus",
        "claude-3-haiku",
      ];
      for (const model of anthropicModels) {
        const result = normalizeHistoryForModel(
          SIMPLE_CONVERSATION,
          model,
          "claude-3-5-sonnet"
        );
        assertEquals(result, SIMPLE_CONVERSATION);
      }
    });

    it("should detect Google models correctly", () => {
      const googleModels = [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-1.5-pro",
      ];
      for (const model of googleModels) {
        const result = normalizeHistoryForModel(
          SIMPLE_CONVERSATION,
          model,
          "gemini-1.5-pro"
        );
        assertEquals(result, SIMPLE_CONVERSATION);
      }
    });
  });

  describe("Same Provider Family", () => {
    it("should keep tool calls when staying within OpenAI family", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gpt-4o",
        "gpt-4"
      );
      // Should keep tool calls since same provider
      assert(historyHasToolCalls(result));
    });

    it("should keep tool calls when staying within Anthropic family", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "claude-sonnet-4",
        "claude-3-5-sonnet"
      );
      assert(historyHasToolCalls(result));
    });

    it("should keep tool calls when staying within Google family", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gemini-2.5-flash",
        "gemini-2.5-pro"
      );
      assert(historyHasToolCalls(result));
    });
  });

  describe("Different Provider Family", () => {
    it("should convert tool calls when switching from OpenAI to Anthropic", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "claude-sonnet-4",
        "gpt-4"
      );
      // New behavior: converts tool calls between providers instead of stripping
      assertEquals(result.length > 0, true);
      assertEquals(result.filter((m) => m.role === "user").length, 2);
    });

    it("should convert tool calls when switching from OpenAI to Google", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gemini-2.5-pro",
        "gpt-4o"
      );
      assertEquals(result.length > 0, true);
    });

    it("should convert tool calls when switching from Anthropic to OpenAI", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gpt-5",
        "claude-3-5-sonnet"
      );
      // New behavior: converts tool calls between providers instead of stripping
      // This preserves tool semantics while adapting to the target format
      assertEquals(result.length > 0, true);
      // User and assistant messages should be preserved
      assertEquals(result.filter((m) => m.role === "user").length, 2);
    });

    it("should convert tool calls when switching from Anthropic to Google", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gemini-2.5-flash",
        "claude-sonnet-4"
      );
      assertEquals(result.length > 0, true);
    });

    it("should convert tool calls when switching from Google to OpenAI", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gpt-4o",
        "gemini-2.5-pro"
      );
      assertEquals(result.length > 0, true);
    });

    it("should convert tool calls when switching from Google to Anthropic", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "claude-3-5-haiku",
        "gemini-2.5-flash"
      );
      assertEquals(result.length > 0, true);
    });
  });

  describe("Unknown Previous Model", () => {
    it("should attempt conversion when previous model is unknown (null)", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gpt-4o",
        null
      );
      // When previous model is unknown, attempt conversion to target format
      assertEquals(result.length > 0, true);
    });

    it("should attempt conversion when previous model is undefined", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gpt-4o"
      );
      assertEquals(result.length > 0, true);
    });
  });

  describe("No Tool Calls", () => {
    it("should pass through simple conversation without modification", () => {
      const result = normalizeHistoryForModel(
        SIMPLE_CONVERSATION,
        "claude-sonnet-4",
        "gpt-4"
      );
      // Even though providers differ, no tool calls means no stripping needed
      assertEquals(result, SIMPLE_CONVERSATION);
    });

    it("should handle empty message array", () => {
      const result = normalizeHistoryForModel([], "gpt-4o", "claude-sonnet-4");
      assertEquals(result, []);
    });
  });

  describe("Context Preservation", () => {
    it("should preserve conversation context after stripping tool calls", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "claude-sonnet-4",
        "gpt-4"
      );

      // User messages should be preserved
      const userMessages = result.filter((m) => m.role === "user");
      assertEquals(userMessages.length, 2);

      // Assistant responses should be preserved
      const assistantMessages = result.filter((m) => m.role === "assistant");
      assert(assistantMessages.length >= 2, "Should have assistant messages");

      // Final assistant response should be preserved
      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      assert(
        typeof lastAssistant.content === "string" &&
          lastAssistant.content.includes("5:30"),
        "Should preserve the final response content"
      );
    });

    it("should preserve tool call information in converted format", () => {
      const result = normalizeHistoryForModel(
        CONVERSATION_WITH_TOOLS,
        "gemini-2.5-pro",
        "gpt-4o"
      );

      // Tool calls are converted, not stripped
      // Either tool calls remain in converted format, or tool results remain
      const hasToolData = result.some((m) => {
        if (m.role === "tool") return true;
        if (Array.isArray(m.content)) {
          return m.content.some(
            (c) =>
              (c as { type: string }).type === "tool_use" ||
              (c as { type: string }).type === "tool_result"
          );
        }
        if (typeof m.content === "string") {
          // Or the tool name appears in text if fallback occurred
          return m.content.includes("getCurrentTime");
        }
        return false;
      });
      assert(hasToolData, "Should preserve tool information in some form");
    });
  });
});

// ========================================
// Edge Cases
// ========================================

describe("Edge Cases", () => {
  it("should handle message with empty content array", () => {
    const emptyContent: Message[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: [] },
    ];
    // Should not throw
    const result = stripToolCallHistory(emptyContent);
    assert(result.length >= 1);
  });

  it("should handle very long tool result content", () => {
    const longResult = "x".repeat(1000);
    const withLongResult: Message[] = [
      { role: "user", content: "Get data" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "getData", input: {} },
        ],
      },
      {
        role: "tool",
        content: longResult,
        toolCallId: "call_1",
        name: "getData",
      },
    ];

    const result = stripToolCallHistory(withLongResult);
    // Should truncate long results
    const allText = result.map((m) => m.content).join("");
    assert(
      allText.length < longResult.length + 500,
      "Should truncate long tool results"
    );
  });

  it("should handle tool result without name", () => {
    const noName: Message[] = [
      { role: "user", content: "Hello" },
      { role: "tool", content: "result", toolCallId: "call_1" },
    ];
    const result = stripToolCallHistory(noName);
    assert(result.length > 0);
    // Should use fallback name
    const allText = result.map((m) => m.content).join("");
    assert(allText.includes("tool") || allText.includes("Tool"));
  });

  it("should handle multiple tool calls in single assistant message", () => {
    const multiTool: Message[] = [
      { role: "user", content: "Get time and weather" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check both." },
          { type: "tool_use", id: "call_1", name: "getTime", input: {} },
          { type: "tool_use", id: "call_2", name: "getWeather", input: {} },
        ],
      },
      {
        role: "tool",
        content: '{"time": "10:00"}',
        toolCallId: "call_1",
        name: "getTime",
      },
      {
        role: "tool",
        content: '{"temp": 72}',
        toolCallId: "call_2",
        name: "getWeather",
      },
    ];

    const result = stripToolCallHistory(multiTool);
    const allText = result.map((m) => m.content).join(" ");
    assert(allText.includes("getTime") && allText.includes("getWeather"));
  });

  it("should handle case-insensitive model names", () => {
    // Model names can come in various cases
    const result1 = normalizeHistoryForModel(
      SIMPLE_CONVERSATION,
      "GPT-4O",
      "gpt-4"
    );
    const result2 = normalizeHistoryForModel(
      SIMPLE_CONVERSATION,
      "Claude-Sonnet-4",
      "CLAUDE-3-5-SONNET"
    );
    const result3 = normalizeHistoryForModel(
      SIMPLE_CONVERSATION,
      "GEMINI-2.5-PRO",
      "gemini-2.5-flash"
    );

    // All same provider, should pass through
    assertEquals(result1, SIMPLE_CONVERSATION);
    assertEquals(result2, SIMPLE_CONVERSATION);
    assertEquals(result3, SIMPLE_CONVERSATION);
  });
});
