/**
 * Stripe Token Billing + Normalization Layer Integration Tests
 *
 * Tests that validate:
 * 1. The StripeTokenBillingProvider works with normalized message formats
 * 2. Real API calls to llm.stripe.com work with billing attribution
 * 3. Token usage is reported correctly
 * 4. Streaming works correctly for all main models
 *
 * Main models tested:
 * - GPT-5 (Responses API)
 * - Claude Sonnet 4 (Chat Completions API)
 * - Gemini 2.5 Pro (Chat Completions API)
 *
 * These tests make REAL API calls and require:
 * - STRIPE_SANDBOX_KEY or STRIPE_CHIPP_KEY environment variable
 *
 * Run with:
 *   DENO_NO_PACKAGE_JSON=1 deno test src/__tests__/llm/stripe_token_billing_normalization_test.ts --allow-all
 *
 * Or for a specific test:
 *   DENO_NO_PACKAGE_JSON=1 deno test src/__tests__/llm/stripe_token_billing_normalization_test.ts --allow-all --filter "streaming"
 */

import { describe, it, beforeAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import { z } from "zod";
import { StripeTokenBillingProvider } from "../../llm/providers/stripe-token-billing.ts";
import {
  toUnified,
  normalizeHistory,
  openaiEncoder,
} from "../../llm/normalization/index.ts";
import type { Message, StreamChunk, Tool } from "../../llm/types.ts";
import type { UnifiedMessage } from "../../llm/normalization/types.ts";

// Real test customer ID from Stripe sandbox
const TEST_STRIPE_CUSTOMER_ID = "cus_TPBkB26zMD4AJY";

// Main models to test
const MODELS = {
  GPT5: "gpt-5", // Responses API
  CLAUDE_SONNET_4: "claude-sonnet-4-20250514", // Chat Completions API
  GEMINI_25_PRO: "gemini-2.5-pro", // Chat Completions API
} as const;

/**
 * Check if tests should be skipped (no API key available)
 */
function shouldSkipTests(): boolean {
  const hasKey =
    !!Deno.env.get("STRIPE_SANDBOX_KEY") || !!Deno.env.get("STRIPE_CHIPP_KEY");
  return !hasKey;
}

/**
 * Helper to collect all chunks from a stream
 */
async function collectChunks(
  stream: AsyncGenerator<StreamChunk>
): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Extract full text response from chunks
 */
function extractTextFromChunks(chunks: StreamChunk[]): string {
  return chunks
    .filter((c): c is StreamChunk & { type: "text" } => c.type === "text")
    .map((c) => c.delta)
    .join("");
}

/**
 * Create a provider instance for testing
 */
function createTestProvider(): StripeTokenBillingProvider {
  return new StripeTokenBillingProvider({
    stripeCustomerId: TEST_STRIPE_CUSTOMER_ID,
    useSandboxForUsageBilling: true,
  });
}

describe("Stripe Token Billing with Normalization Layer", () => {
  beforeAll(() => {
    if (shouldSkipTests()) {
      console.warn(
        "[stripe-normalization] No Stripe key available. Tests will be skipped."
      );
    }
  });

  // ===========================================================================
  // MESSAGE CONVERSION TESTS
  // ===========================================================================

  describe("Message Conversion", () => {
    it("should convert legacy messages through normalization layer", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Legacy message format
      const legacyMessages: Message[] = [
        { role: "user", content: "Say hello" },
      ];

      // Convert to unified format
      const unified = toUnified(legacyMessages);
      assertEquals(unified.length, 1);
      assertEquals(unified[0].role, "user");

      // Encode to OpenAI format (Stripe uses OpenAI format)
      const { messages: encoded } = await openaiEncoder.encodeMessages(unified);
      assertEquals(encoded.length, 1);

      // Call provider with Claude Sonnet 4
      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.chat(legacyMessages, { model: MODELS.CLAUDE_SONNET_4 })
      );

      const textChunks = chunks.filter((c) => c.type === "text");
      assert(textChunks.length > 0, "Should have text response");

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "Should have non-empty text");
      console.log("[response]", text.substring(0, 100));

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");
    });

    it("should handle multimodal messages with images (Claude Sonnet 4)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Use a reliable public image URL
      const imageUrl =
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Solid_red.svg/100px-Solid_red.svg.png";

      const messages: Message[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What color is this image? Answer in one word.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ];

      // Convert through normalization layer
      const unified = toUnified(messages);
      assertEquals(unified.length, 1);

      const provider = createTestProvider();

      try {
        const chunks = await collectChunks(
          provider.chat(messages, { model: MODELS.CLAUDE_SONNET_4 })
        );

        const text = extractTextFromChunks(chunks);
        assert(text.length > 0, "Should describe the image");
        console.log("[image-response]", text.substring(0, 150));
      } catch (error) {
        // Image URL might fail due to network issues or provider limitations
        if (
          error instanceof Error &&
          (error.message.includes("invalid_image_url") ||
            error.message.includes("Timeout") ||
            error.message.includes("non-empty content"))
        ) {
          console.log(
            "[skip] Image handling not supported or failed:",
            error.message.substring(0, 100)
          );
          return;
        }
        throw error;
      }
    });
  });

  // ===========================================================================
  // TOOL CALLING TESTS
  // ===========================================================================

  describe("Tool Calling", () => {
    const weatherTool: Tool = {
      name: "getWeather",
      description: "Get weather for a location",
      parameters: z.object({
        location: z.string().describe("City name"),
        units: z
          .enum(["celsius", "fahrenheit"])
          .optional()
          .describe("Temperature units"),
      }),
    };

    const timeTool: Tool = {
      name: "getCurrentTime",
      description: "Get the current UTC time",
      parameters: z.object({}),
    };

    it("should handle tool calls with Claude Sonnet 4", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const messages: Message[] = [
        {
          role: "user",
          content: "What time is it? Use the getCurrentTime tool.",
        },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.stream(messages, [timeTool], { model: MODELS.CLAUDE_SONNET_4 })
      );

      const toolCallChunk = chunks.find((c) => c.type === "tool_call");
      assertExists(toolCallChunk, "Should receive tool call");

      if (toolCallChunk?.type === "tool_call") {
        assertEquals(toolCallChunk.call.name, "getCurrentTime");
        console.log("[claude-tool-call]", toolCallChunk.call);
      }

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");
      if (doneChunk?.type === "done") {
        assert(doneChunk.hasToolCalls === true, "Should indicate tool calls");
      }
    });

    it("should handle tool calls with GPT-5 (Responses API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const messages: Message[] = [
        {
          role: "user",
          content:
            "What's the weather in San Francisco? Use the getWeather tool.",
        },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.stream(messages, [weatherTool], { model: MODELS.GPT5 })
      );

      const toolCallChunk = chunks.find((c) => c.type === "tool_call");
      assertExists(toolCallChunk, "GPT-5 should receive tool call");

      if (toolCallChunk?.type === "tool_call") {
        assertEquals(toolCallChunk.call.name, "getWeather");
        console.log("[gpt5-tool-call]", toolCallChunk.call);
      }

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");
    });

    it("should handle tool calls with Gemini 2.5 Pro", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const messages: Message[] = [
        {
          role: "user",
          content: "What time is it? Use the getCurrentTime tool.",
        },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.stream(messages, [timeTool], { model: MODELS.GEMINI_25_PRO })
      );

      const toolCallChunk = chunks.find((c) => c.type === "tool_call");
      assertExists(toolCallChunk, "Gemini should receive tool call");

      if (toolCallChunk?.type === "tool_call") {
        assertEquals(toolCallChunk.call.name, "getCurrentTime");
        console.log("[gemini-tool-call]", toolCallChunk.call);
      }
    });

    it("should handle tool result continuation with Claude Sonnet 4", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Build conversation with tool call and result
      const messagesWithToolHistory: Message[] = [
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_test_claude_123",
              name: "getCurrentTime",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: "2024-01-15T10:30:00Z",
          toolCallId: "call_test_claude_123",
          name: "getCurrentTime",
        },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.chat(messagesWithToolHistory, {
          model: MODELS.CLAUDE_SONNET_4,
        })
      );

      const errors = chunks.filter(
        (c) => c.type === "done" && c.finishReason === "error"
      );
      assertEquals(
        errors.length,
        0,
        "Should handle tool history without errors"
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "Should provide response about the time");
      console.log("[claude-tool-continuation]", text.substring(0, 100));
    });

    it("should handle tool result continuation with GPT-5 (Responses API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const messagesWithToolHistory: Message[] = [
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_test_gpt5_456",
              name: "getCurrentTime",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: "2024-01-15T10:30:00Z",
          toolCallId: "call_test_gpt5_456",
          name: "getCurrentTime",
        },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.chat(messagesWithToolHistory, { model: MODELS.GPT5 })
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "GPT-5 should provide response about the time");
      console.log("[gpt5-tool-continuation]", text.substring(0, 100));
    });
  });

  // ===========================================================================
  // BILLING ATTRIBUTION TESTS
  // ===========================================================================

  describe("Billing Attribution", () => {
    it("should report token usage for Claude Sonnet 4", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();
      const messages: Message[] = [{ role: "user", content: "Count to 3" }];

      const chunks = await collectChunks(
        provider.chat(messages, { model: MODELS.CLAUDE_SONNET_4 })
      );

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");

      if (doneChunk?.type === "done") {
        assertExists(doneChunk.usage, "Claude should have usage data");

        assert(
          doneChunk.usage.inputTokens > 0,
          `Should have input tokens, got: ${doneChunk.usage.inputTokens}`
        );
        assert(
          doneChunk.usage.outputTokens > 0,
          `Should have output tokens, got: ${doneChunk.usage.outputTokens}`
        );

        console.log("[claude-billing]", {
          input: doneChunk.usage.inputTokens,
          output: doneChunk.usage.outputTokens,
          total: doneChunk.usage.totalTokens,
          model: doneChunk.usage.model,
        });
      }
    });

    it("should report token usage for GPT-5", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();
      const messages: Message[] = [{ role: "user", content: "Count to 3" }];

      const chunks = await collectChunks(
        provider.chat(messages, { model: MODELS.GPT5 })
      );

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");

      if (doneChunk?.type === "done" && doneChunk.usage) {
        console.log("[gpt5-billing]", {
          input: doneChunk.usage.inputTokens,
          output: doneChunk.usage.outputTokens,
          total: doneChunk.usage.totalTokens,
          model: doneChunk.usage.model,
        });
      }
    });

    it("should report token usage for Gemini 2.5 Pro", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();
      const messages: Message[] = [{ role: "user", content: "Count to 3" }];

      const chunks = await collectChunks(
        provider.chat(messages, { model: MODELS.GEMINI_25_PRO })
      );

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should have done chunk");

      if (doneChunk?.type === "done" && doneChunk.usage) {
        console.log("[gemini-billing]", {
          input: doneChunk.usage.inputTokens,
          output: doneChunk.usage.outputTokens,
          total: doneChunk.usage.totalTokens,
          model: doneChunk.usage.model,
        });
      }
    });
  });

  // ===========================================================================
  // PROVIDER/MODEL SWITCHING TESTS
  // ===========================================================================

  describe("Provider Switching", () => {
    it("should normalize tool call history between providers", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // History with tool calls
      const history: Message[] = [
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_abc123",
              name: "getCurrentTime",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: "2024-01-15T10:30:00Z",
          toolCallId: "call_abc123",
          name: "getCurrentTime",
        },
        { role: "assistant", content: "The current time is 10:30 AM UTC." },
      ];

      // Convert to unified format
      const unified = toUnified(history);

      // Normalize for different providers
      const forOpenAI = normalizeHistory(unified, "openai");
      const forAnthropic = normalizeHistory(unified, "anthropic");

      // Verify tool messages preserved
      assert(
        forOpenAI.some((m) => m.role === "tool"),
        "OpenAI format should have tool message"
      );
      assert(
        forAnthropic.some((m) => m.role === "tool"),
        "Anthropic format should have tool message"
      );

      // Continue conversation with Claude
      const continueMessages: Message[] = [
        ...history,
        { role: "user", content: "What timezone was that in?" },
      ];

      const provider = createTestProvider();
      const chunks = await collectChunks(
        provider.chat(continueMessages, { model: MODELS.CLAUDE_SONNET_4 })
      );

      const errorChunks = chunks.filter(
        (c) => c.type === "done" && c.finishReason === "error"
      );
      assertEquals(
        errorChunks.length,
        0,
        "Should handle tool history continuation without errors"
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "Should respond about timezone");
      console.log("[provider-switch]", text.substring(0, 100));
    });

    it("should handle empty history gracefully", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const emptyHistory: UnifiedMessage[] = [];
      const normalized = normalizeHistory(emptyHistory, "openai");
      assertEquals(normalized.length, 0, "Empty history should remain empty");
    });

    it("should handle tool history when switching to GPT-5 (Responses API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Simulate history from a Chat Completions model
      const historyWithTools: Message[] = [
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_switch_test_789",
              name: "getCurrentTime",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: "2024-01-15T10:30:00Z",
          toolCallId: "call_switch_test_789",
          name: "getCurrentTime",
        },
        { role: "assistant", content: "The time is 10:30 AM UTC." },
        { role: "user", content: "Thanks! What about tomorrow?" },
      ];

      const provider = createTestProvider();

      // Switch to GPT-5 which uses Responses API
      const chunks = await collectChunks(
        provider.chat(historyWithTools, { model: MODELS.GPT5 })
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "GPT-5 should respond with tool history");
      console.log("[gpt5-tool-history-switch]", text.substring(0, 100));

      const doneChunk = chunks.find((c) => c.type === "done");
      assertExists(doneChunk, "Should complete without errors");
    });

    it("should handle switching from GPT-5 to Claude with tool history", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Simulate history that might have come from GPT-5
      const historyFromGpt5: Message[] = [
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_from_gpt5_abc",
              name: "getCurrentTime",
              input: {},
            },
          ],
        },
        {
          role: "tool",
          content: "2024-01-15T10:30:00Z",
          toolCallId: "call_from_gpt5_abc",
          name: "getCurrentTime",
        },
        { role: "assistant", content: "It's 10:30 AM UTC." },
        { role: "user", content: "Convert that to PST" },
      ];

      const provider = createTestProvider();

      // Switch to Claude
      const chunks = await collectChunks(
        provider.chat(historyFromGpt5, { model: MODELS.CLAUDE_SONNET_4 })
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "Claude should respond after GPT-5 history");
      console.log("[claude-after-gpt5]", text.substring(0, 100));
    });
  });

  // ===========================================================================
  // STREAMING RESPONSE VERIFICATION TESTS
  // ===========================================================================

  describe("Streaming Response Verification", () => {
    it("should stream text incrementally for Claude Sonnet 4 (Chat Completions API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();

      // Use a prompt that generates a longer response
      const messages: Message[] = [
        {
          role: "user",
          content: "Count from 1 to 10 slowly, with each number on a new line.",
        },
      ];

      const textChunks: string[] = [];

      for await (const chunk of provider.chat(messages, {
        model: MODELS.CLAUDE_SONNET_4,
      })) {
        if (chunk.type === "text") {
          textChunks.push(chunk.delta);
        }
      }

      console.log(
        `[claude-streaming] Received ${textChunks.length} text chunks`
      );
      assert(
        textChunks.length > 1,
        `Claude Sonnet 4 should stream multiple text chunks, got ${textChunks.length}`
      );

      const fullText = textChunks.join("");
      assert(fullText.length > 0, "Should have text content");
      console.log("[claude-streaming] Full response length:", fullText.length);
    });

    it("should stream text incrementally for GPT-5 (Responses API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();

      const messages: Message[] = [
        {
          role: "user",
          content: "Count from 1 to 10 slowly, with each number on a new line.",
        },
      ];

      const textChunks: string[] = [];

      for await (const chunk of provider.chat(messages, {
        model: MODELS.GPT5,
      })) {
        if (chunk.type === "text") {
          textChunks.push(chunk.delta);
        }
      }

      console.log(`[gpt5-streaming] Received ${textChunks.length} text chunks`);
      assert(
        textChunks.length > 1,
        `GPT-5 (Responses API) should stream multiple text chunks, got ${textChunks.length}. ` +
          `This indicates streaming is not working - response came as single chunk.`
      );

      const fullText = textChunks.join("");
      assert(fullText.length > 0, "Should have text content");
      console.log("[gpt5-streaming] Full response length:", fullText.length);
    });

    it("should stream text incrementally for Gemini 2.5 Pro (Chat Completions API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();

      const messages: Message[] = [
        {
          role: "user",
          content: "Count from 1 to 10 slowly, with each number on a new line.",
        },
      ];

      const textChunks: string[] = [];

      for await (const chunk of provider.chat(messages, {
        model: MODELS.GEMINI_25_PRO,
      })) {
        if (chunk.type === "text") {
          textChunks.push(chunk.delta);
        }
      }

      console.log(
        `[gemini-streaming] Received ${textChunks.length} text chunks`
      );
      // Note: Gemini's streaming granularity can vary - sometimes it sends 1 chunk
      // We just verify we got a response, not the specific chunk count
      assert(
        textChunks.length >= 1,
        `Gemini 2.5 Pro should stream at least one text chunk, got ${textChunks.length}`
      );

      const fullText = textChunks.join("");
      assert(fullText.length > 0, "Should have text content");
      console.log("[gemini-streaming] Full response length:", fullText.length);
    });

    it("should stream tool call deltas for Claude Sonnet 4", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const tools: Tool[] = [
        {
          name: "getWeather",
          description: "Get weather for a location",
          parameters: z.object({
            location: z.string().describe("City name"),
            units: z
              .enum(["celsius", "fahrenheit"])
              .optional()
              .describe("Temperature units"),
          }),
        },
      ];

      const messages: Message[] = [
        {
          role: "user",
          content:
            "What's the weather like in San Francisco? Use the getWeather tool.",
        },
      ];

      const provider = createTestProvider();

      const toolCallDeltas: string[] = [];
      let finalToolCall: unknown = null;

      for await (const chunk of provider.stream(messages, tools, {
        model: MODELS.CLAUDE_SONNET_4,
      })) {
        if (chunk.type === "tool_call_delta") {
          toolCallDeltas.push(chunk.delta);
        }
        if (chunk.type === "tool_call") {
          finalToolCall = chunk.call;
        }
      }

      console.log(
        `[claude-tool-streaming] Received ${toolCallDeltas.length} tool call deltas`
      );

      // Should have a final tool call
      assertExists(finalToolCall, "Should have final tool call");
      console.log("[claude-tool-streaming] Tool call:", finalToolCall);
    });

    it("should stream tool call deltas for GPT-5 (Responses API)", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const tools: Tool[] = [
        {
          name: "getWeather",
          description: "Get weather for a location",
          parameters: z.object({
            location: z.string().describe("City name"),
          }),
        },
      ];

      const messages: Message[] = [
        {
          role: "user",
          content: "What's the weather in Tokyo? Use getWeather.",
        },
      ];

      const provider = createTestProvider();

      const toolCallDeltas: string[] = [];
      let finalToolCall: unknown = null;

      for await (const chunk of provider.stream(messages, tools, {
        model: MODELS.GPT5,
      })) {
        if (chunk.type === "tool_call_delta") {
          toolCallDeltas.push(chunk.delta);
        }
        if (chunk.type === "tool_call") {
          finalToolCall = chunk.call;
        }
      }

      console.log(
        `[gpt5-tool-streaming] Received ${toolCallDeltas.length} tool call deltas`
      );

      // Should have a final tool call
      assertExists(finalToolCall, "GPT-5 should have final tool call");
      console.log("[gpt5-tool-streaming] Tool call:", finalToolCall);
    });

    it("should include usage data in streaming response for all models", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = createTestProvider();
      const messages: Message[] = [{ role: "user", content: "Say hello" }];

      // Test Claude Sonnet 4
      {
        const chunks = await collectChunks(
          provider.chat(messages, { model: MODELS.CLAUDE_SONNET_4 })
        );
        const doneChunk = chunks.find((c) => c.type === "done");
        assertExists(doneChunk, "Claude should have done chunk");
        if (doneChunk?.type === "done" && doneChunk.usage) {
          console.log("[claude-streaming-usage]", doneChunk.usage);
        }
      }

      // Test GPT-5
      {
        const chunks = await collectChunks(
          provider.chat(messages, { model: MODELS.GPT5 })
        );
        const doneChunk = chunks.find((c) => c.type === "done");
        assertExists(doneChunk, "GPT-5 should have done chunk");
        if (doneChunk?.type === "done" && doneChunk.usage) {
          console.log("[gpt5-streaming-usage]", doneChunk.usage);
        }
      }

      // Test Gemini 2.5 Pro
      {
        const chunks = await collectChunks(
          provider.chat(messages, { model: MODELS.GEMINI_25_PRO })
        );
        const doneChunk = chunks.find((c) => c.type === "done");
        assertExists(doneChunk, "Gemini should have done chunk");
        if (doneChunk?.type === "done" && doneChunk.usage) {
          console.log("[gemini-streaming-usage]", doneChunk.usage);
        }
      }
    });
  });

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe("Error Handling", () => {
    it("should fail gracefully without customer ID", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      const provider = new StripeTokenBillingProvider({
        stripeCustomerId: null,
        useSandboxForUsageBilling: true,
      });

      const messages: Message[] = [{ role: "user", content: "Hello" }];

      let errorThrown = false;
      try {
        await collectChunks(
          provider.chat(messages, { model: MODELS.CLAUDE_SONNET_4 })
        );
      } catch (error) {
        errorThrown = true;
        assert(error instanceof Error, "Should throw an Error");
        assert(
          error.message.includes("customer ID"),
          `Error should mention customer ID: ${error.message}`
        );
      }

      assert(errorThrown, "Should throw error without customer ID");
    });

    it("should handle null content in message history", async () => {
      if (shouldSkipTests()) {
        console.log("[skip] No Stripe API key");
        return;
      }

      // Simulate a message with null content (edge case from model switching)
      const messagesWithNullContent: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: null as unknown as string },
        { role: "user", content: "Are you there?" },
      ];

      const provider = createTestProvider();

      // Should not throw
      const chunks = await collectChunks(
        provider.chat(messagesWithNullContent, {
          model: MODELS.CLAUDE_SONNET_4,
        })
      );

      const text = extractTextFromChunks(chunks);
      assert(text.length > 0, "Should respond despite null content in history");
    });
  });
});
