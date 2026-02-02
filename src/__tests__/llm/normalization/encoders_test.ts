/**
 * Tests for provider encoders
 *
 * Tests conversion from unified format to provider-specific formats.
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import { OpenAIEncoder } from "../../../llm/normalization/encoders/openai.ts";
import { AnthropicEncoder } from "../../../llm/normalization/encoders/anthropic.ts";
import { GoogleEncoder } from "../../../llm/normalization/encoders/google.ts";
import type {
  UnifiedMessage,
  UnifiedToolDefinition,
} from "../../../llm/normalization/types.ts";

describe("OpenAIEncoder", () => {
  const encoder = new OpenAIEncoder();

  describe("encodeMessages", () => {
    it("encodes simple text messages", async () => {
      const messages: UnifiedMessage[] = [
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded.length, 3);
      assertEquals(encoded[0].role, "system");
      assertEquals(encoded[1].role, "user");
      assertEquals(encoded[2].role, "assistant");
    });

    it("encodes assistant message with tool calls", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Searching..." },
            {
              type: "tool-call",
              toolCallId: "call_123",
              toolName: "search",
              input: { query: "weather" },
            },
          ],
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded.length, 1);
      const msg = encoded[0] as {
        role: string;
        content: string | null;
        tool_calls?: unknown[];
      };
      assertEquals(msg.role, "assistant");
      assertExists(msg.tool_calls);
      assertEquals(msg.tool_calls?.length, 1);

      const toolCall = msg.tool_calls[0] as {
        id: string;
        type: string;
        function: { name: string; arguments: string };
      };
      assertEquals(toolCall.id, "call_123");
      assertEquals(toolCall.type, "function");
      assertEquals(toolCall.function.name, "search");
      // OpenAI expects stringified arguments
      assertEquals(toolCall.function.arguments, '{"query":"weather"}');
    });

    it("encodes tool result as separate tool message", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "tool",
          content: "Sunny, 72°F",
          toolCallId: "call_123",
          toolName: "weather",
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded.length, 1);
      const msg = encoded[0] as {
        role: string;
        content: string;
        tool_call_id: string;
      };
      assertEquals(msg.role, "tool");
      assertEquals(msg.content, "Sunny, 72°F");
      assertEquals(msg.tool_call_id, "call_123");
    });
  });

  describe("encodeTools", () => {
    it("encodes tool definitions", () => {
      const tools: UnifiedToolDefinition[] = [
        {
          name: "search",
          description: "Search the web",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
            required: ["query"],
          },
        },
      ];

      const encoded = encoder.encodeTools(tools);

      assertEquals(encoded.length, 1);
      assertEquals(encoded[0].type, "function");
      assertEquals(encoded[0].function.name, "search");
      assertEquals(encoded[0].function.description, "Search the web");
    });
  });
});

describe("AnthropicEncoder", () => {
  const encoder = new AnthropicEncoder();

  describe("encodeMessages", () => {
    it("extracts system message to separate field", async () => {
      const messages: UnifiedMessage[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];

      const { messages: encoded, system } =
        await encoder.encodeMessages(messages);

      assertEquals(system, "You are helpful");
      assertEquals(encoded.length, 1); // System not in messages array
      assertEquals(encoded[0].role, "user");
    });

    it("encodes tool result in user message with tool_result block", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "tool",
          content: "Result data",
          toolCallId: "call_abc",
          toolName: "getData",
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded.length, 1);
      assertEquals(encoded[0].role, "user");

      const content = encoded[0].content as Array<{
        type: string;
        tool_use_id?: string;
      }>;
      assertExists(Array.isArray(content));
      assertEquals(content[0].type, "tool_result");
      assertEquals(content[0].tool_use_id, "call_abc");
    });

    it("encodes assistant tool calls with object input", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_xyz",
              toolName: "calculate",
              input: { a: 1, b: 2 },
            },
          ],
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded.length, 1);
      assertEquals(encoded[0].role, "assistant");

      const content = encoded[0].content as Array<{
        type: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
      assertExists(Array.isArray(content));
      assertEquals(content[0].type, "tool_use");
      assertEquals(content[0].id, "call_xyz");
      assertEquals(content[0].name, "calculate");
      // Anthropic expects object input (not stringified)
      assertEquals(content[0].input, { a: 1, b: 2 });
    });
  });
});

describe("GoogleEncoder", () => {
  const encoder = new GoogleEncoder();

  describe("encodeMessages", () => {
    it("extracts system to systemInstruction field", async () => {
      const messages: UnifiedMessage[] = [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ];

      const { messages: encoded, system } =
        await encoder.encodeMessages(messages);

      assertEquals(system, "Be concise");
      assertEquals(encoded.length, 1);
      assertEquals(encoded[0].role, "user");
    });

    it("maps assistant role to model role", async () => {
      const messages: UnifiedMessage[] = [
        { role: "assistant", content: "Hello!" },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded[0].role, "model");
    });

    it("encodes tool calls as functionCall parts", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_google_1",
              toolName: "search",
              input: { query: "test" },
            },
          ],
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded[0].role, "model");
      const parts = encoded[0].parts as Array<{
        functionCall?: { name: string; args: unknown };
      }>;
      assertExists(parts[0].functionCall);
      assertEquals(parts[0].functionCall?.name, "search");
      assertEquals(parts[0].functionCall?.args, { query: "test" });
    });

    it("encodes tool result as function role with functionResponse", async () => {
      const messages: UnifiedMessage[] = [
        {
          role: "tool",
          content: "42",
          toolCallId: "call_1",
          toolName: "calculate",
        },
      ];

      const { messages: encoded } = await encoder.encodeMessages(messages);

      assertEquals(encoded[0].role, "function");
      const parts = encoded[0].parts as Array<{
        functionResponse?: { name: string; response: unknown };
      }>;
      assertExists(parts[0].functionResponse);
      assertEquals(parts[0].functionResponse?.name, "calculate");
    });
  });

  describe("encodeTools", () => {
    it("wraps tools in functionDeclarations array", () => {
      const tools: UnifiedToolDefinition[] = [
        {
          name: "test",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ];

      const encoded = encoder.encodeTools(tools);

      assertEquals(encoded.length, 1);
      assertExists(encoded[0].functionDeclarations);
      assertEquals(encoded[0].functionDeclarations.length, 1);
      assertEquals(encoded[0].functionDeclarations[0].name, "test");
    });

    it("removes unsupported schema properties", () => {
      const tools: UnifiedToolDefinition[] = [
        {
          name: "test",
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
            },
          },
        },
      ];

      const encoded = encoder.encodeTools(tools);

      const params = encoded[0].functionDeclarations[0]
        .parameters as unknown as Record<string, unknown>;
      assertEquals(params.$schema, undefined);
      assertEquals(params.additionalProperties, undefined);
      assertExists(params.properties);
    });
  });
});
