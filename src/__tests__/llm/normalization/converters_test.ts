/**
 * Tests for message format converters
 *
 * Tests conversion between legacy Message format and UnifiedMessage format.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  toUnified,
  fromUnified,
} from "../../../llm/normalization/converters.ts";
import type { Message } from "../../../llm/types.ts";
import type { UnifiedMessage } from "../../../llm/normalization/types.ts";

describe("toUnified", () => {
  it("converts simple text message", () => {
    const message: Message = {
      role: "user",
      content: "Hello, world!",
    };

    const unified = toUnified(message);

    assertEquals(unified.role, "user");
    assertEquals(unified.content, "Hello, world!");
  });

  it("converts system message", () => {
    const message: Message = {
      role: "system",
      content: "You are a helpful assistant.",
    };

    const unified = toUnified(message);

    assertEquals(unified.role, "system");
    assertEquals(unified.content, "You are a helpful assistant.");
  });

  it("converts assistant message with tool calls", () => {
    const message: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me search for that." },
        {
          type: "tool_use",
          id: "call_123",
          name: "search",
          input: { query: "weather" },
        },
      ],
    };

    const unified = toUnified(message);

    assertEquals(unified.role, "assistant");
    assertExists(Array.isArray(unified.content));
    const content = unified.content as UnifiedMessage["content"];
    if (Array.isArray(content)) {
      assertEquals(content.length, 2);
      assertEquals(content[0].type, "text");
      assertEquals(content[1].type, "tool-call");
      if (content[1].type === "tool-call") {
        assertEquals(content[1].toolCallId, "call_123");
        assertEquals(content[1].toolName, "search");
        assertEquals(content[1].input, { query: "weather" });
      }
    }
  });

  it("converts tool result message", () => {
    const message: Message = {
      role: "tool",
      content: '{"temperature": 72}',
      toolCallId: "call_123",
      name: "weather",
    };

    const unified = toUnified(message);

    assertEquals(unified.role, "tool");
    assertEquals(unified.content, '{"temperature": 72}');
    assertEquals(unified.toolCallId, "call_123");
    assertEquals(unified.toolName, "weather");
  });

  it("converts user message with image", () => {
    const message: Message = {
      role: "user",
      content: [
        { type: "text", text: "What's in this image?" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/image.png" },
        },
      ],
    };

    const unified = toUnified(message);

    assertEquals(unified.role, "user");
    assertExists(Array.isArray(unified.content));
    const content = unified.content as UnifiedMessage["content"];
    if (Array.isArray(content)) {
      assertEquals(content.length, 2);
      assertEquals(content[0].type, "text");
      assertEquals(content[1].type, "image");
      if (content[1].type === "image") {
        assertEquals(content[1].url, "https://example.com/image.png");
      }
    }
  });

  it("converts array of messages", () => {
    const messages: Message[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];

    const unified = toUnified(messages);

    assertEquals(unified.length, 3);
    assertEquals(unified[0].role, "system");
    assertEquals(unified[1].role, "user");
    assertEquals(unified[2].role, "assistant");
  });
});

describe("fromUnified", () => {
  it("converts simple text message back", () => {
    const unified: UnifiedMessage = {
      role: "user",
      content: "Hello, world!",
    };

    const message = fromUnified(unified);

    assertEquals(message.role, "user");
    assertEquals(message.content, "Hello, world!");
  });

  it("converts assistant message with tool calls back", () => {
    const unified: UnifiedMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me search." },
        {
          type: "tool-call",
          toolCallId: "call_456",
          toolName: "search",
          input: { query: "news" },
        },
      ],
    };

    const message = fromUnified(unified);

    assertEquals(message.role, "assistant");
    assertExists(Array.isArray(message.content));
    const content = message.content as Message["content"];
    if (Array.isArray(content)) {
      assertEquals(content.length, 2);
      assertEquals(content[0].type, "text");
      assertEquals(content[1].type, "tool_use");
      if (content[1].type === "tool_use") {
        assertEquals(content[1].id, "call_456");
        assertEquals(content[1].name, "search");
      }
    }
  });

  it("converts tool result message back", () => {
    const unified: UnifiedMessage = {
      role: "tool",
      content: '{"result": "data"}',
      toolCallId: "call_789",
      toolName: "getData",
    };

    const message = fromUnified(unified);

    assertEquals(message.role, "tool");
    assertEquals(message.content, '{"result": "data"}');
    assertEquals(message.toolCallId, "call_789");
    assertEquals(message.name, "getData");
  });

  it("round-trips messages without loss", () => {
    const original: Message[] = [
      { role: "system", content: "System prompt" },
      { role: "user", content: "User question" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Response text" },
          {
            type: "tool_use",
            id: "call_abc",
            name: "myTool",
            input: { arg: "value" },
          },
        ],
      },
      {
        role: "tool",
        content: "Tool output",
        toolCallId: "call_abc",
        name: "myTool",
      },
      { role: "assistant", content: "Final response" },
    ];

    const unified = toUnified(original);
    const roundTripped = fromUnified(unified);

    assertEquals(roundTripped.length, original.length);

    // Check each message
    assertEquals(roundTripped[0].role, "system");
    assertEquals(roundTripped[0].content, "System prompt");

    assertEquals(roundTripped[1].role, "user");
    assertEquals(roundTripped[1].content, "User question");

    assertEquals(roundTripped[2].role, "assistant");
    assertExists(Array.isArray(roundTripped[2].content));

    assertEquals(roundTripped[3].role, "tool");
    assertEquals(roundTripped[3].content, "Tool output");
    assertEquals(roundTripped[3].toolCallId, "call_abc");

    assertEquals(roundTripped[4].role, "assistant");
    assertEquals(roundTripped[4].content, "Final response");
  });
});
