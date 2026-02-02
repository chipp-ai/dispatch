/**
 * LLM Regression Tests
 *
 * Integration tests that send actual LLM requests to detect regressions
 * in model support, tool calling, and response formatting.
 *
 * These tests make REAL API calls to Stripe Token Billing, so they:
 * - Require valid Stripe API keys (STRIPE_SANDBOX_KEY or STRIPE_CHIPP_KEY)
 * - Incur actual API costs (minimal - simple test prompts)
 * - May be slow (5-30 seconds per model)
 *
 * Run with:
 *   deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all
 *
 * Or for a specific model:
 *   deno test src/__tests__/scenarios/llm_regression_test.ts --allow-all --filter "GPT-5"
 *
 * MODELS TESTED:
 * - GPT-5 (OpenAI via Responses API)
 * - GPT-4.1 (OpenAI)
 * - Claude Sonnet 4 (Anthropic)
 * - Claude 3.5 Haiku (Anthropic)
 * - Gemini 2.5 Pro (Google)
 * - Gemini 2.5 Flash (Google)
 *
 * TEST CASES:
 * - Basic text response (no tools)
 * - Tool calling (getCurrentTime)
 * - Response format validation (no metadata JSON)
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "jsr:@std/testing/bdd";
import {
  assertEquals,
  assertExists,
  assert,
  assertStringIncludes,
} from "jsr:@std/assert";
import { setupTests, teardownTests, app, sql } from "../setup.ts";
import { createIsolatedUser } from "../fixtures/users.ts";
import { createBasicApp, cleanupUserApps } from "../fixtures/applications.ts";
import type { TestUser, TestApplication } from "../setup.ts";

// ========================================
// Types
// ========================================

interface SSEEvent {
  event?: string;
  data: string;
}

interface StreamChunk {
  type: string; // Various types: text, text-delta, tool_call, tool-call, start, finish, etc.
  delta?: string;
  textDelta?: string; // Alternative field name for text content
  call?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  toolCall?: {
    // Alternative format for tool calls
    toolCallId?: string;
    toolName?: string;
    args?: Record<string, unknown>;
  };
  result?: unknown;
  error?: string;
  reason?: string;
}

// ========================================
// Model Configurations
// ========================================

const MODELS_TO_TEST = [
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    usesResponsesApi: true,
    timeout: 60000, // GPT-5 can be slow
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    usesResponsesApi: false,
    timeout: 30000,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    usesResponsesApi: false,
    timeout: 30000,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    usesResponsesApi: false,
    timeout: 30000,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    usesResponsesApi: false,
    timeout: 30000,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    usesResponsesApi: false,
    timeout: 30000,
  },
];

// ========================================
// Helper Functions
// ========================================

/**
 * Parse SSE stream into individual events
 */
function parseSSE(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = text.split("\n");
  let currentEvent: Partial<SSEEvent> = {};

  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      currentEvent.data = line.slice(5).trim();
      if (currentEvent.data) {
        events.push(currentEvent as SSEEvent);
      }
      currentEvent = {};
    }
  }

  return events;
}

/**
 * Parse SSE events into StreamChunks
 */
function parseStreamChunks(events: SSEEvent[]): StreamChunk[] {
  return events
    .filter((e) => e.data && e.data !== "[DONE]")
    .map((e) => {
      try {
        return JSON.parse(e.data) as StreamChunk;
      } catch {
        return null;
      }
    })
    .filter((c): c is StreamChunk => c !== null);
}

/**
 * Extract full text response from stream chunks
 * Handles both "text" and "text-delta" chunk types
 */
function extractTextFromChunks(chunks: StreamChunk[]): string {
  return chunks
    .filter(
      (c) =>
        (c.type === "text" || c.type === "text-delta") &&
        (c.delta || c.textDelta)
    )
    .map((c) => c.delta || c.textDelta || "")
    .join("");
}

/**
 * Extract tool calls from stream chunks
 * Handles multiple formats: tool_call, tool-call, tool-input-available
 */
function extractToolCalls(
  chunks: StreamChunk[]
): Array<{ id?: string; name: string; arguments?: Record<string, unknown> }> {
  const toolCalls: Array<{
    id?: string;
    name: string;
    arguments?: Record<string, unknown>;
  }> = [];

  for (const chunk of chunks) {
    // Format 1: tool_call with call object
    if (
      (chunk.type === "tool_call" || chunk.type === "tool-call") &&
      chunk.call
    ) {
      toolCalls.push({
        id: chunk.call.id,
        name: chunk.call.name,
        arguments: chunk.call.arguments,
      });
    }
    // Format 2: tool-input-available with toolName/toolCallId
    else if (chunk.type === "tool-input-available") {
      const c = chunk as unknown as {
        toolCallId?: string;
        toolName?: string;
        input?: Record<string, unknown>;
      };
      if (c.toolName) {
        toolCalls.push({
          id: c.toolCallId,
          name: c.toolName,
          arguments: c.input,
        });
      }
    }
    // Format 3: toolCall object (alternative)
    else if (chunk.toolCall?.toolName) {
      toolCalls.push({
        id: chunk.toolCall.toolCallId,
        name: chunk.toolCall.toolName,
        arguments: chunk.toolCall.args,
      });
    }
  }

  return toolCalls;
}

/**
 * Send a chat message and get the streamed response
 */
async function sendChatMessage(
  appId: string,
  user: TestUser,
  message: string,
  options: { sessionId?: string; timeout?: number } = {}
): Promise<{
  response: Response;
  text: string;
  chunks: StreamChunk[];
  events: SSEEvent[];
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || 30000
  );

  try {
    const response = await app.request(`/api/chat/${appId}/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        sessionId: options.sessionId,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const events = parseSSE(responseText);
    const chunks = parseStreamChunks(events);
    const text = extractTextFromChunks(chunks);

    return { response, text, chunks, events };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create a chat session directly in the database
 */
async function createSessionDirectly(appId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  await sql`
    INSERT INTO chat.sessions (
      id,
      application_id,
      source,
      started_at
    )
    VALUES (
      ${sessionId},
      ${appId},
      'APP'::chat_source,
      NOW()
    )
  `;
  return sessionId;
}

/**
 * Clean up test sessions
 */
async function cleanupTestSessions(appId: string): Promise<void> {
  await sql`
    DELETE FROM chat.messages
    WHERE session_id IN (
      SELECT id FROM chat.sessions WHERE application_id = ${appId}
    )
  `;
  await sql`
    DELETE FROM chat.sessions
    WHERE application_id = ${appId}
  `;
}

/**
 * Update application model
 */
async function updateAppModel(appId: string, model: string): Promise<void> {
  await sql`
    UPDATE app.applications
    SET model = ${model}
    WHERE id = ${appId}
  `;
}

/**
 * Set up Stripe billing for an organization (required for LLM calls)
 * Uses a real Stripe customer ID that exists in the account
 */
async function setupStripeBilling(organizationId: string): Promise<void> {
  // Use the existing Stripe customer ID from the database
  // This is a real customer in the Stripe account
  const existingCustomerId = "cus_TPBkB26zMD4AJY";

  await sql`
    UPDATE app.organizations
    SET 
      stripe_customer_id = ${existingCustomerId},
      credits_balance = 100000
    WHERE id = ${organizationId}
  `;
}

// ========================================
// Test Setup
// ========================================

describe("LLM Regression Tests", () => {
  let user: TestUser;
  let application: TestApplication;

  beforeAll(async () => {
    await setupTests();

    // Check for required environment variables
    const hasStripeKey =
      Deno.env.get("STRIPE_SANDBOX_KEY") || Deno.env.get("STRIPE_CHIPP_KEY");
    if (!hasStripeKey) {
      console.warn(
        "[llm-regression] WARNING: No Stripe API key found. Tests will fail."
      );
    }
  });

  afterAll(async () => {
    await teardownTests();
  });

  beforeEach(async () => {
    // Create a fresh user and app for each test
    user = await createIsolatedUser("PRO");
    application = await createBasicApp(user);
    // Set up Stripe billing (required for LLM calls)
    await setupStripeBilling(user.organizationId);
  });

  afterEach(async () => {
    await cleanupTestSessions(application.id);
    await cleanupUserApps(user);
  });

  // ========================================
  // Basic Response Tests (Per Model)
  // ========================================

  describe("Basic Text Response", () => {
    for (const model of MODELS_TO_TEST) {
      it(`${model.name}: should return a text response`, async () => {
        await updateAppModel(application.id, model.id);

        const { response, text, chunks } = await sendChatMessage(
          application.id,
          user,
          "Say 'hello' and nothing else.",
          { timeout: model.timeout }
        );

        assertEquals(response.status, 200);
        assert(
          text.length > 0,
          `${model.name}: Should have non-empty text response`
        );
        assert(
          text.toLowerCase().includes("hello"),
          `${model.name}: Response should contain 'hello', got: ${text.slice(0, 100)}`
        );

        // Verify no error chunks
        const errors = chunks.filter((c) => c.type === "error");
        assertEquals(
          errors.length,
          0,
          `${model.name}: Should have no error chunks, got: ${JSON.stringify(errors)}`
        );

        // Verify stream ends properly (server uses "finish" not "done")
        const finishChunks = chunks.filter((c) => c.type === "finish");
        assert(
          finishChunks.length >= 1,
          `${model.name}: Should have at least one finish chunk`
        );
      });
    }
  });

  // ========================================
  // Tool Calling Tests (Per Model)
  // ========================================

  describe("Tool Calling", () => {
    for (const model of MODELS_TO_TEST) {
      it(`${model.name}: should call getCurrentTime tool`, async () => {
        await updateAppModel(application.id, model.id);

        const { response, text, chunks } = await sendChatMessage(
          application.id,
          user,
          "What is the current time in UTC? Use the getCurrentTime tool.",
          { timeout: model.timeout }
        );

        assertEquals(response.status, 200);

        // Check for tool calls
        const toolCalls = extractToolCalls(chunks);
        assert(
          toolCalls.length > 0,
          `${model.name}: Should have at least one tool call, got chunks: ${JSON.stringify(chunks.slice(0, 5))}`
        );

        // Verify getCurrentTime was called
        const timeToolCall = toolCalls.find(
          (tc) => tc?.name === "getCurrentTime"
        );
        assertExists(
          timeToolCall,
          `${model.name}: Should have called getCurrentTime tool`
        );

        // Verify we got a text response after tool call
        assert(
          text.length > 0,
          `${model.name}: Should have text response after tool call`
        );

        // Response should contain time-related content
        const hasTimeContent =
          text.includes("UTC") ||
          text.includes("time") ||
          text.includes(":") || // time format like "15:30"
          /\d{1,2}:\d{2}/.test(text); // time pattern
        assert(
          hasTimeContent,
          `${model.name}: Response should contain time info, got: ${text.slice(0, 200)}`
        );
      });
    }
  });

  // ========================================
  // Response Format Validation
  // ========================================

  describe("Response Format Validation", () => {
    for (const model of MODELS_TO_TEST) {
      it(`${model.name}: should not include metadata JSON in response`, async () => {
        await updateAppModel(application.id, model.id);

        const { response, text } = await sendChatMessage(
          application.id,
          user,
          "What is 2 + 2?",
          { timeout: model.timeout }
        );

        assertEquals(response.status, 200);
        assert(
          text.length > 0,
          `${model.name}: Should have non-empty response`
        );

        // Check for common metadata patterns that should NOT appear
        const metadataPatterns = [
          '{"format"',
          '"verbosity"',
          '"type":"text"',
          '"reasoning"',
          '{"type":"output_text"',
        ];

        for (const pattern of metadataPatterns) {
          assert(
            !text.includes(pattern),
            `${model.name}: Response should not contain metadata pattern "${pattern}", got: ${text.slice(0, 300)}`
          );
        }
      });

      it(`${model.name}: text chunks should be strings, not objects`, async () => {
        await updateAppModel(application.id, model.id);

        const { chunks } = await sendChatMessage(
          application.id,
          user,
          "Count from 1 to 3.",
          { timeout: model.timeout }
        );

        const textChunks = chunks.filter((c) => c.type === "text");

        for (const chunk of textChunks) {
          assert(
            typeof chunk.delta === "string",
            `${model.name}: Text delta should be string, got: ${typeof chunk.delta} - ${JSON.stringify(chunk.delta)}`
          );
          assert(
            !chunk.delta?.includes("[object Object]"),
            `${model.name}: Text delta should not contain [object Object], got: ${chunk.delta}`
          );
        }
      });
    }
  });

  // ========================================
  // Multi-turn Conversation Tests
  // ========================================

  describe("Multi-turn Conversation", () => {
    for (const model of MODELS_TO_TEST) {
      it(`${model.name}: should maintain context across turns`, async () => {
        await updateAppModel(application.id, model.id);

        // First turn
        const sessionId = await createSessionDirectly(application.id);

        const { response: res1, text: text1 } = await sendChatMessage(
          application.id,
          user,
          "My name is TestUser123. Remember this.",
          { sessionId, timeout: model.timeout }
        );
        assertEquals(res1.status, 200);

        // Second turn - ask about the name
        const { response: res2, text: text2 } = await sendChatMessage(
          application.id,
          user,
          "What is my name?",
          { sessionId, timeout: model.timeout }
        );
        assertEquals(res2.status, 200);

        // The model should remember the name
        assert(
          text2.includes("TestUser123"),
          `${model.name}: Should remember user's name from previous turn, got: ${text2.slice(0, 200)}`
        );
      });
    }
  });

  // ========================================
  // Model Switching Tests
  // ========================================

  describe("Model Switching Mid-Conversation", () => {
    it("should handle switching from GPT to Claude without errors", async () => {
      // Start with GPT-4o
      await updateAppModel(application.id, "gpt-4o");
      const sessionId = await createSessionDirectly(application.id);

      // First turn with GPT
      const { response: res1, text: text1 } = await sendChatMessage(
        application.id,
        user,
        "What is the current time? Use the getCurrentTime tool.",
        { sessionId, timeout: 30000 }
      );
      assertEquals(res1.status, 200);
      assert(text1.length > 0, "GPT should respond");

      // Switch to Claude mid-conversation (with tool call history)
      await updateAppModel(application.id, "claude-sonnet-4-20250514");

      // Continue conversation with Claude
      const {
        response: res2,
        text: text2,
        chunks: chunks2,
      } = await sendChatMessage(
        application.id,
        user,
        "Thanks! What was the time you mentioned?",
        { sessionId, timeout: 30000 }
      );

      assertEquals(res2.status, 200, "Claude should not error on model switch");
      assert(text2.length > 0, "Claude should respond after model switch");

      // Should not have error chunks
      const errors = chunks2.filter((c) => c.type === "error");
      assertEquals(
        errors.length,
        0,
        `Should have no errors after model switch: ${JSON.stringify(errors)}`
      );
    });

    it("should handle switching from Claude to GPT without errors", async () => {
      // Start with Claude
      await updateAppModel(application.id, "claude-sonnet-4-20250514");
      const sessionId = await createSessionDirectly(application.id);

      // First turn with Claude
      const { response: res1, text: text1 } = await sendChatMessage(
        application.id,
        user,
        "What time is it now? Use getCurrentTime.",
        { sessionId, timeout: 30000 }
      );
      assertEquals(res1.status, 200);
      assert(text1.length > 0, "Claude should respond");

      // Switch to GPT mid-conversation
      await updateAppModel(application.id, "gpt-4o");

      // Continue conversation with GPT
      const {
        response: res2,
        text: text2,
        chunks: chunks2,
      } = await sendChatMessage(
        application.id,
        user,
        "Can you tell me the time again?",
        { sessionId, timeout: 30000 }
      );

      assertEquals(res2.status, 200, "GPT should not error on model switch");
      assert(text2.length > 0, "GPT should respond after model switch");

      const errors = chunks2.filter((c) => c.type === "error");
      assertEquals(
        errors.length,
        0,
        `Should have no errors after model switch: ${JSON.stringify(errors)}`
      );
    });

    it("should handle switching from GPT to Gemini without errors", async () => {
      // Start with GPT
      await updateAppModel(application.id, "gpt-4o");
      const sessionId = await createSessionDirectly(application.id);

      // First turn
      const { response: res1, text: text1 } = await sendChatMessage(
        application.id,
        user,
        "Use getCurrentTime to get the time.",
        { sessionId, timeout: 30000 }
      );
      assertEquals(res1.status, 200);
      assert(text1.length > 0, "GPT should respond");

      // Switch to Gemini
      await updateAppModel(application.id, "gemini-2.5-flash");

      // Continue with Gemini
      const {
        response: res2,
        text: text2,
        chunks: chunks2,
      } = await sendChatMessage(application.id, user, "What was that time?", {
        sessionId,
        timeout: 30000,
      });

      assertEquals(res2.status, 200, "Gemini should not error on model switch");
      assert(text2.length > 0, "Gemini should respond after model switch");

      const errors = chunks2.filter((c) => c.type === "error");
      assertEquals(
        errors.length,
        0,
        `Should have no errors after model switch: ${JSON.stringify(errors)}`
      );
    });

    it("should preserve conversation context when switching models", async () => {
      // Start conversation about a specific topic
      await updateAppModel(application.id, "gpt-4o");
      const sessionId = await createSessionDirectly(application.id);

      // Establish context
      const { response: res1 } = await sendChatMessage(
        application.id,
        user,
        "My favorite color is purple. Remember this.",
        { sessionId, timeout: 30000 }
      );
      assertEquals(res1.status, 200);

      // Switch model
      await updateAppModel(application.id, "claude-sonnet-4-20250514");

      // Ask about the context
      const { response: res2, text: text2 } = await sendChatMessage(
        application.id,
        user,
        "What is my favorite color?",
        { sessionId, timeout: 30000 }
      );

      assertEquals(res2.status, 200);
      assert(
        text2.toLowerCase().includes("purple"),
        `Should remember context after model switch. Got: ${text2.slice(0, 200)}`
      );
    });
  });

  // ========================================
  // Error Handling Tests
  // ========================================

  describe("Error Handling", () => {
    it("should handle invalid model gracefully", async () => {
      await updateAppModel(application.id, "invalid-model-xyz");

      const { response, chunks } = await sendChatMessage(
        application.id,
        user,
        "Hello",
        { timeout: 10000 }
      );

      // Should either return error status or error chunk
      const hasError =
        response.status >= 400 || chunks.some((c) => c.type === "error");

      assert(hasError, "Should handle invalid model with error");
    });
  });

  // ========================================
  // Performance Baseline Tests
  // ========================================

  describe("Performance Baseline", () => {
    for (const model of MODELS_TO_TEST) {
      it(`${model.name}: should respond within timeout`, async () => {
        await updateAppModel(application.id, model.id);

        const startTime = Date.now();

        const { response } = await sendChatMessage(application.id, user, "Hi", {
          timeout: model.timeout,
        });

        const elapsed = Date.now() - startTime;

        assertEquals(response.status, 200);
        assert(
          elapsed < model.timeout,
          `${model.name}: Response took ${elapsed}ms, expected under ${model.timeout}ms`
        );

        console.log(`[perf] ${model.name}: ${elapsed}ms`);
      });
    }
  });
});

// ========================================
// Quick Smoke Test (Single Model)
// ========================================

describe("Quick Smoke Test", () => {
  let user: TestUser;
  let application: TestApplication;

  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  beforeEach(async () => {
    user = await createIsolatedUser("PRO");
    application = await createBasicApp(user);
    // Set up Stripe billing (required for LLM calls)
    await setupStripeBilling(user.organizationId);
  });

  afterEach(async () => {
    await cleanupTestSessions(application.id);
    await cleanupUserApps(user);
  });

  it("GPT-4o quick test: text + tool call", async () => {
    await updateAppModel(application.id, "gpt-4o");

    // Test 1: Basic text
    const {
      text: textResp,
      response: res1,
      chunks: chunks1,
    } = await sendChatMessage(application.id, user, "Say 'test passed'", {
      timeout: 30000,
    });
    console.log("[test] Basic text response:", {
      status: res1.status,
      textLength: textResp.length,
      text: textResp.slice(0, 200),
      chunkTypes: chunks1.map((c) => c.type),
      textDeltas: chunks1
        .filter((c) => c.type === "text-delta")
        .map((c) => ({ delta: c.delta, textDelta: c.textDelta })),
    });
    assert(
      textResp.toLowerCase().includes("test") ||
        textResp.toLowerCase().includes("passed"),
      `Expected response to contain 'test' or 'passed', got: "${textResp.slice(0, 100)}"`
    );

    // Test 2: Tool call
    const { chunks: toolChunks, text: toolText } = await sendChatMessage(
      application.id,
      user,
      "Use getCurrentTime to tell me the time in UTC",
      { timeout: 30000 }
    );
    const toolCalls = extractToolCalls(toolChunks);
    console.log("[test] Tool call response:", {
      chunkTypes: toolChunks.map((c) => c.type),
      toolCallCount: toolCalls.length,
      toolNames: toolCalls.map((tc) => tc?.name),
      text: toolText.slice(0, 200),
    });
    assert(
      toolCalls.length > 0,
      `Should have tool calls, got chunks: ${JSON.stringify(toolChunks.slice(0, 5))}`
    );
  });
});
