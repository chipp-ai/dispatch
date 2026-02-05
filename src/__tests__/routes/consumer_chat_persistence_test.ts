/**
 * Integration tests for consumer chat route persistence
 *
 * Tests that the onComplete callback correctly persists messages
 * with tool calls and tool results to the database.
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
} from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import { db } from "../../db/client.ts";

// Test data IDs
const TEST_ORG_ID = "11111111-1111-1111-1111-111111111111";
const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
const TEST_APP_ID = "33333333-3333-3333-3333-333333333333";
const TEST_CONSUMER_ID = "44444444-4444-4444-4444-444444444444";
const TEST_SESSION_ID = "55555555-5555-5555-5555-555555555555";

describe({
  name: "Consumer Chat Persistence",
  // Database connection pool creates timers/TCP that outlive tests
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupTestData();

    // Create test organization
    await db
      .insertInto("app.organizations")
      .values({
        id: TEST_ORG_ID,
        name: "Test Org for Chat Persistence",
        subscriptionTier: "FREE",
        usageBasedBillingEnabled: false,
        creditsBalance: 0,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Create test user
    await db
      .insertInto("app.users")
      .values({
        id: TEST_USER_ID,
        email: "test-chat-persistence@example.com",
        name: "Test User",
        organizationId: TEST_ORG_ID,
        role: "owner",
        emailVerified: true,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Create test application
    await db
      .insertInto("app.applications")
      .values({
        id: TEST_APP_ID,
        name: "Chat Persistence Test App",
        appNameId: "chat-persistence-test-app",
        developerId: TEST_USER_ID,
        organizationId: TEST_ORG_ID,
        model: "gpt-4o",
        systemPrompt: "You are a test assistant.",
        isActive: true,
        isDeleted: false,
        temperature: 0.7,
        isPublic: false,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Create test consumer
    await db
      .insertInto("app.consumers")
      .values({
        id: TEST_CONSUMER_ID,
        applicationId: TEST_APP_ID,
        email: "consumer-test@example.com",
        name: "Test Consumer",
        identifier: "consumer-test@example.com",
        emailVerified: true,
        credits: 1000,
        subscriptionActive: false,
        mode: "LIVE",
        isDeleted: false,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    // Create consumer session
    await db
      .insertInto("app.consumer_sessions")
      .values({
        id: TEST_SESSION_ID,
        consumerId: TEST_CONSUMER_ID,
        applicationId: TEST_APP_ID,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Clean up chat sessions and messages before each test
    await db.deleteFrom("chat.messages").execute();
    await db.deleteFrom("chat.sessions").execute();
  });

  it("should persist message with tool calls and results from onComplete", async () => {
    // Import the chat service
    const { chatService } = await import("../../services/chat.service.ts");

    // Create a chat session
    const session = await chatService.createSession({
      applicationId: TEST_APP_ID,
      consumerId: TEST_CONSUMER_ID,
      source: "API",
    });

    // Simulate what onComplete passes to addMessage
    const toolCalls = [
      {
        id: "call_abc123",
        name: "getCurrentTime",
        input: {},
      },
      {
        id: "call_def456",
        name: "searchWeb",
        input: { query: "weather today" },
      },
    ];

    const toolResults = [
      {
        callId: "call_abc123",
        name: "getCurrentTime",
        result: { time: "2026-01-20T12:00:00Z" },
        success: true,
      },
      {
        callId: "call_def456",
        name: "searchWeb",
        result: { results: ["sunny", "72°F"] },
        success: true,
      },
    ];

    // Add message with tool data (as onComplete would)
    const message = await chatService.addMessage(
      session.id,
      "assistant",
      "The current time is 12:00 PM and it's sunny at 72°F.",
      {
        model: "gpt-4o",
        toolCalls,
        toolResults,
      }
    );

    // Verify message was created
    assertExists(message);
    assertEquals(message.role, "assistant");
    assertEquals(
      message.content,
      "The current time is 12:00 PM and it's sunny at 72°F."
    );

    // Retrieve the message from DB to verify tool data was persisted
    const savedMessage = await db
      .selectFrom("chat.messages")
      .selectAll()
      .where("id", "=", message.id)
      .executeTakeFirst();

    assertExists(savedMessage);
    assertExists(savedMessage.toolCalls);
    assertExists(savedMessage.toolResults);

    // Parse JSONB - may be returned as string depending on driver
    const savedToolCalls: typeof toolCalls =
      typeof savedMessage.toolCalls === "string"
        ? JSON.parse(savedMessage.toolCalls)
        : savedMessage.toolCalls;
    const savedToolResults: typeof toolResults =
      typeof savedMessage.toolResults === "string"
        ? JSON.parse(savedMessage.toolResults)
        : savedMessage.toolResults;

    // Verify tool calls
    assertEquals(savedToolCalls.length, 2);
    assertEquals(savedToolCalls[0].id, "call_abc123");
    assertEquals(savedToolCalls[0].name, "getCurrentTime");
    assertEquals(savedToolCalls[1].id, "call_def456");
    assertEquals(savedToolCalls[1].name, "searchWeb");

    // Verify tool results
    assertEquals(savedToolResults.length, 2);
    assertEquals(savedToolResults[0].callId, "call_abc123");
    assertEquals(savedToolResults[0].success, true);
    assertEquals(savedToolResults[1].callId, "call_def456");
    assertEquals(savedToolResults[1].success, true);
  });

  it("should not include tool data when arrays are empty", async () => {
    const { chatService } = await import("../../services/chat.service.ts");

    const session = await chatService.createSession({
      applicationId: TEST_APP_ID,
      consumerId: TEST_CONSUMER_ID,
      source: "API",
    });

    // Add message without tool data (empty arrays become undefined)
    const message = await chatService.addMessage(
      session.id,
      "assistant",
      "Hello, how can I help you?",
      {
        model: "gpt-4o",
        toolCalls: undefined, // Empty array would be converted to undefined by onComplete
        toolResults: undefined,
      }
    );

    // Retrieve from DB
    const savedMessage = await db
      .selectFrom("chat.messages")
      .selectAll()
      .where("id", "=", message.id)
      .executeTakeFirst();

    assertExists(savedMessage);
    // Tool data should be null when not provided
    assertEquals(savedMessage.toolCalls, null);
    assertEquals(savedMessage.toolResults, null);
  });

  it("should persist tool errors in tool results", async () => {
    const { chatService } = await import("../../services/chat.service.ts");

    const session = await chatService.createSession({
      applicationId: TEST_APP_ID,
      consumerId: TEST_CONSUMER_ID,
      source: "API",
    });

    const toolCalls = [
      { id: "call_error", name: "failingTool", input: { shouldFail: true } },
    ];

    const toolResults = [
      {
        callId: "call_error",
        name: "failingTool",
        result: { error: "Tool execution failed: timeout" },
        success: false,
      },
    ];

    const message = await chatService.addMessage(
      session.id,
      "assistant",
      "I encountered an error while trying to help you.",
      {
        model: "gpt-4o",
        toolCalls,
        toolResults,
      }
    );

    const savedMessage = await db
      .selectFrom("chat.messages")
      .selectAll()
      .where("id", "=", message.id)
      .executeTakeFirst();

    assertExists(savedMessage);
    // Parse JSONB - may be returned as string depending on driver
    const savedToolResults: typeof toolResults =
      typeof savedMessage.toolResults === "string"
        ? JSON.parse(savedMessage.toolResults)
        : savedMessage.toolResults;
    assertEquals(savedToolResults[0].success, false);
    assertEquals(
      savedToolResults[0].result.error,
      "Tool execution failed: timeout"
    );
  });

  it("should preserve complex tool input objects", async () => {
    const { chatService } = await import("../../services/chat.service.ts");

    const session = await chatService.createSession({
      applicationId: TEST_APP_ID,
      consumerId: TEST_CONSUMER_ID,
      source: "API",
    });

    const complexInput = {
      query: "test",
      filters: {
        dateRange: { start: "2026-01-01", end: "2026-12-31" },
        categories: ["tech", "science"],
        nested: { deep: { value: 123 } },
      },
      pagination: { page: 1, limit: 10 },
    };

    const toolCalls = [
      { id: "call_complex", name: "advancedSearch", input: complexInput },
    ];

    const message = await chatService.addMessage(
      session.id,
      "assistant",
      "Search completed.",
      {
        model: "gpt-4o",
        toolCalls,
        toolResults: [
          {
            callId: "call_complex",
            name: "advancedSearch",
            result: {},
            success: true,
          },
        ],
      }
    );

    const savedMessage = await db
      .selectFrom("chat.messages")
      .selectAll()
      .where("id", "=", message.id)
      .executeTakeFirst();

    assertExists(savedMessage);
    // Parse JSONB - may be returned as string depending on driver
    const savedToolCalls: typeof toolCalls =
      typeof savedMessage.toolCalls === "string"
        ? JSON.parse(savedMessage.toolCalls)
        : savedMessage.toolCalls;

    // Verify complex nested input was preserved
    assertEquals(savedToolCalls[0].input.query, "test");
    assertEquals(savedToolCalls[0].input.filters.categories.length, 2);
    assertEquals(savedToolCalls[0].input.filters.nested.deep.value, 123);
    assertEquals(savedToolCalls[0].input.pagination.limit, 10);
  });
});

async function cleanupTestData() {
  // Delete in reverse order of dependencies
  try {
    await db
      .deleteFrom("chat.messages")
      .where("sessionId", "in", (qb) =>
        qb
          .selectFrom("chat.sessions")
          .select("id")
          .where("applicationId", "=", TEST_APP_ID)
      )
      .execute();
  } catch {
    // Ignore if tables don't exist
  }

  try {
    await db
      .deleteFrom("chat.sessions")
      .where("applicationId", "=", TEST_APP_ID)
      .execute();
  } catch {
    // Ignore
  }

  try {
    await db
      .deleteFrom("app.consumer_sessions")
      .where("id", "=", TEST_SESSION_ID)
      .execute();
  } catch {
    // Ignore
  }

  try {
    await db
      .deleteFrom("app.consumers")
      .where("id", "=", TEST_CONSUMER_ID)
      .execute();
  } catch {
    // Ignore
  }

  try {
    await db
      .deleteFrom("app.applications")
      .where("id", "=", TEST_APP_ID)
      .execute();
  } catch {
    // Ignore
  }

  try {
    await db.deleteFrom("app.users").where("id", "=", TEST_USER_ID).execute();
  } catch {
    // Ignore
  }

  try {
    await db
      .deleteFrom("app.organizations")
      .where("id", "=", TEST_ORG_ID)
      .execute();
  } catch {
    // Ignore
  }
}
