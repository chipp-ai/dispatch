/**
 * Chat Route Tests
 *
 * Tests for /api/chat endpoints.
 * Covers session management, validation, and permissions.
 *
 * Note: Streaming chat tests require LLM mocking which is not
 * implemented in this suite. Focus is on API contract testing.
 *
 * ENDPOINTS TESTED:
 * - GET /api/chat/:appId/sessions - List chat sessions
 * - GET /api/chat/:appId/viewed - Get viewed session IDs
 * - POST /api/chat/:appId/viewed - Mark session as viewed
 * - GET /api/chat/sessions/:id - Get session with messages
 * - POST /api/chat/:appId/sessions - Create session
 * - DELETE /api/chat/sessions/:id - Delete session
 * - POST /api/chat/:appId/chat - Non-streaming chat (validation only)
 *
 * USAGE:
 *   deno test src/__tests__/routes/chat_test.ts
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import {
  setupTests,
  teardownTests,
  app,
  sql,
  generateTestToken,
} from "../setup.ts";
import { getProUser, createIsolatedUser } from "../fixtures/users.ts";
import { createBasicApp, cleanupUserApps } from "../fixtures/applications.ts";
import type { TestUser, TestApplication } from "../setup.ts";

// ========================================
// Types
// ========================================

interface ChatSession {
  id: string;
  applicationId: string;
  title?: string;
  source: string;
  createdAt: string;
  messages?: ChatMessage[];
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ListSessionsResponse {
  data: ChatSession[];
  pagination: {
    hasMore: boolean;
    total?: number;
  };
}

interface SessionResponse {
  data: ChatSession;
}

interface ViewedResponse {
  data: string[];
}

// ========================================
// Helper Functions
// ========================================

async function createChatSession(
  appId: string,
  user: TestUser,
  options: { title?: string; source?: string } = {}
): Promise<Response> {
  return app.request(`/api/chat/${appId}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: options.title,
      source: options.source ?? "APP",
    }),
  });
}

async function createSessionDirectly(
  appId: string,
  options: { title?: string; source?: string; consumerId?: string } = {}
): Promise<string> {
  const sessionId = crypto.randomUUID();
  await sql`
    INSERT INTO chat.sessions (
      id,
      application_id,
      consumer_id,
      source,
      title,
      started_at
    )
    VALUES (
      ${sessionId},
      ${appId},
      ${options.consumerId || null},
      ${options.source || "APP"}::chat_source,
      ${options.title || null},
      NOW()
    )
  `;
  return sessionId;
}

async function addMessageToSession(
  sessionId: string,
  role: string,
  content: string
): Promise<string> {
  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat.messages (
      id,
      session_id,
      role,
      content,
      created_at
    )
    VALUES (
      ${messageId},
      ${sessionId},
      ${role}::message_role,
      ${content},
      NOW()
    )
  `;
  return messageId;
}

async function cleanupTestSessions(appId: string): Promise<void> {
  // Delete messages first (foreign key) - PostgreSQL syntax
  await sql`
    DELETE FROM chat.messages
    WHERE session_id IN (
      SELECT id FROM chat.sessions WHERE application_id = ${appId}
    )
  `;
  // Then delete sessions
  await sql`
    DELETE FROM chat.sessions
    WHERE application_id = ${appId}
  `;
}

// ========================================
// Test Setup
// ========================================

describe("Chat API", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await teardownTests();
  });

  // ========================================
  // Session Creation Tests
  // ========================================

  describe("POST /api/chat/:appId/sessions", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should create a new chat session", async () => {
      const res = await createChatSession(application.id, user);
      assertEquals(res.status, 201);

      const body = (await res.json()) as SessionResponse;
      assertExists(body.data);
      assertExists(body.data.id);
      assertEquals(body.data.applicationId, application.id);
    });

    it("should create session with custom title", async () => {
      const res = await createChatSession(application.id, user, {
        title: "My Test Session",
      });
      assertEquals(res.status, 201);

      const body = (await res.json()) as SessionResponse;
      assertEquals(body.data.title, "My Test Session");
    });

    it("should create session with specific source", async () => {
      const res = await createChatSession(application.id, user, {
        source: "API",
      });
      assertEquals(res.status, 201);

      const body = (await res.json()) as SessionResponse;
      assertEquals(body.data.source, "API");
    });

    it("should validate source enum", async () => {
      const res = await app.request(`/api/chat/${application.id}/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "INVALID_SOURCE",
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 401);
    });

    it("should return 404 for non-existent app", async () => {
      const fakeAppId = crypto.randomUUID();
      const res = await createChatSession(fakeAppId, user);
      // Access check will fail - could be 403 or 404 depending on implementation
      assert(res.status === 404 || res.status === 403);
    });

    it("should return 403 for other user's app", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);

      const res = await createChatSession(otherApp.id, user);
      assertEquals(res.status, 403);

      await cleanupTestSessions(otherApp.id);
      await cleanupUserApps(otherUser);
    });
  });

  // ========================================
  // Session Listing Tests
  // ========================================

  describe("GET /api/chat/:appId/sessions", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should list sessions for an app", async () => {
      // Create a few sessions
      await createSessionDirectly(application.id, { title: "Session 1" });
      await createSessionDirectly(application.id, { title: "Session 2" });
      await createSessionDirectly(application.id, { title: "Session 3" });

      const res = await app.request(`/api/chat/${application.id}/sessions`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as ListSessionsResponse;
      assertExists(body.data);
      assertEquals(body.data.length, 3);
    });

    it("should return empty array when no sessions", async () => {
      const res = await app.request(`/api/chat/${application.id}/sessions`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as ListSessionsResponse;
      assertEquals(body.data.length, 0);
    });

    it("should filter by source", async () => {
      await createSessionDirectly(application.id, { source: "APP" });
      await createSessionDirectly(application.id, { source: "API" });
      await createSessionDirectly(application.id, { source: "WHATSAPP" });

      const res = await app.request(
        `/api/chat/${application.id}/sessions?source=API`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      assertEquals(res.status, 200);

      const body = (await res.json()) as ListSessionsResponse;
      assertEquals(body.data.length, 1);
      assertEquals(body.data[0].source, "API");
    });

    it("should paginate results", async () => {
      // Create many sessions
      for (let i = 0; i < 15; i++) {
        await createSessionDirectly(application.id, { title: `Session ${i}` });
      }

      // Request first page
      const res = await app.request(
        `/api/chat/${application.id}/sessions?limit=5`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      assertEquals(res.status, 200);

      const body = (await res.json()) as ListSessionsResponse;
      assertEquals(body.data.length, 5);
      assertExists(body.pagination);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/sessions`);
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's app", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);

      const res = await app.request(`/api/chat/${otherApp.id}/sessions`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 403);

      await cleanupUserApps(otherUser);
    });

    it("should include message preview in response", async () => {
      const sessionId = await createSessionDirectly(application.id);
      await addMessageToSession(sessionId, "user", "Hello there!");
      await addMessageToSession(sessionId, "assistant", "Hi! How can I help?");

      const res = await app.request(`/api/chat/${application.id}/sessions`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as ListSessionsResponse;
      assertEquals(body.data.length, 1);
      // Messages should be included in the list response
      assertExists(body.data[0].messages);
    });
  });

  // ========================================
  // Get Single Session Tests
  // ========================================

  describe("GET /api/chat/sessions/:sessionId", () => {
    let user: TestUser;
    let application: TestApplication;
    let sessionId: string;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
      sessionId = await createSessionDirectly(application.id, {
        title: "Test Session",
      });
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should get session with messages", async () => {
      // Add some messages
      await addMessageToSession(sessionId, "user", "Hello");
      await addMessageToSession(sessionId, "assistant", "Hi there!");
      await addMessageToSession(sessionId, "user", "How are you?");

      const res = await app.request(`/api/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as SessionResponse;
      assertExists(body.data);
      assertEquals(body.data.id, sessionId);
      assertEquals(body.data.title, "Test Session");
      assertExists(body.data.messages);
      assertEquals(body.data.messages.length, 3);
    });

    it("should return messages in order", async () => {
      await addMessageToSession(sessionId, "user", "First");
      await addMessageToSession(sessionId, "assistant", "Second");
      await addMessageToSession(sessionId, "user", "Third");

      const res = await app.request(`/api/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const body = (await res.json()) as SessionResponse;

      assertEquals(body.data.messages![0].content, "First");
      assertEquals(body.data.messages![1].content, "Second");
      assertEquals(body.data.messages![2].content, "Third");
    });

    it("should return 404 for non-existent session", async () => {
      const fakeSessionId = crypto.randomUUID();
      const res = await app.request(`/api/chat/sessions/${fakeSessionId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 404);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/sessions/${sessionId}`);
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's session", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);
      const otherSessionId = await createSessionDirectly(otherApp.id);

      const res = await app.request(`/api/chat/sessions/${otherSessionId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 403);

      await cleanupTestSessions(otherApp.id);
      await cleanupUserApps(otherUser);
    });
  });

  // ========================================
  // Session Deletion Tests
  // ========================================

  describe("DELETE /api/chat/sessions/:sessionId", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should delete a session", async () => {
      const sessionId = await createSessionDirectly(application.id);
      await addMessageToSession(sessionId, "user", "Test message");

      const res = await app.request(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as { success: boolean };
      assertEquals(body.success, true);

      // Verify session is deleted
      const getRes = await app.request(`/api/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(getRes.status, 404);
    });

    it("should delete session messages as well", async () => {
      const sessionId = await createSessionDirectly(application.id);
      await addMessageToSession(sessionId, "user", "Message 1");
      await addMessageToSession(sessionId, "assistant", "Message 2");

      await app.request(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });

      // Check messages are deleted from DB
      const [result] = await sql`
        SELECT COUNT(*) as count FROM chat.messages
        WHERE session_id = ${sessionId}
      `;
      // COUNT returns bigint which postgres.js returns as string
      assertEquals(Number(result.count), 0);
    });

    it("should return 404 for non-existent session", async () => {
      const fakeSessionId = crypto.randomUUID();
      const res = await app.request(`/api/chat/sessions/${fakeSessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 404);
    });

    it("should require authentication", async () => {
      const sessionId = await createSessionDirectly(application.id);
      const res = await app.request(`/api/chat/sessions/${sessionId}`, {
        method: "DELETE",
      });
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's session", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);
      const otherSessionId = await createSessionDirectly(otherApp.id);

      const res = await app.request(`/api/chat/sessions/${otherSessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 403);

      await cleanupTestSessions(otherApp.id);
      await cleanupUserApps(otherUser);
    });
  });

  // ========================================
  // Viewed Sessions Tests
  // ========================================

  describe("GET /api/chat/:appId/viewed", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should return list of viewed session IDs", async () => {
      const res = await app.request(`/api/chat/${application.id}/viewed`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as ViewedResponse;
      assertExists(body.data);
      assert(Array.isArray(body.data));
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/viewed`);
      assertEquals(res.status, 401);
    });
  });

  describe("POST /api/chat/:appId/viewed", () => {
    let user: TestUser;
    let application: TestApplication;
    let sessionId: string;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
      sessionId = await createSessionDirectly(application.id);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should mark session as viewed", async () => {
      const res = await app.request(`/api/chat/${application.id}/viewed`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      assertEquals(res.status, 200);

      const body = (await res.json()) as { success: boolean };
      assertEquals(body.success, true);
    });

    it("should require sessionId", async () => {
      const res = await app.request(`/api/chat/${application.id}/viewed`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      assertEquals(res.status, 401);
    });
  });

  // ========================================
  // Chat Validation Tests
  // ========================================

  describe("POST /api/chat/:appId/chat (validation)", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should require message field", async () => {
      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
    });

    it("should reject empty message", async () => {
      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "" }),
      });
      assertEquals(res.status, 400);
    });

    it("should validate temperature range", async () => {
      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello",
          temperature: 5.0, // Out of range (0-2)
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should validate sessionId format if provided", async () => {
      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello",
          sessionId: "not-a-uuid",
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's app", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);

      const res = await app.request(`/api/chat/${otherApp.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "Hello" }),
      });
      assertEquals(res.status, 403);

      await cleanupUserApps(otherUser);
    });
  });

  // ========================================
  // Stream Chat Validation Tests
  // ========================================

  describe("POST /api/chat/:appId/stream (validation)", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should require message field", async () => {
      const res = await app.request(`/api/chat/${application.id}/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
    });

    it("should reject empty message", async () => {
      const res = await app.request(`/api/chat/${application.id}/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "" }),
      });
      assertEquals(res.status, 400);
    });

    it("should require authentication", async () => {
      const res = await app.request(`/api/chat/${application.id}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's app", async () => {
      const otherUser = await createIsolatedUser("PRO");
      const otherApp = await createBasicApp(otherUser);

      const res = await app.request(`/api/chat/${otherApp.id}/stream`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "Hello" }),
      });
      assertEquals(res.status, 403);

      await cleanupUserApps(otherUser);
    });
  });

  // ========================================
  // Session with Existing Session ID Tests
  // ========================================

  describe("Session continuation", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeEach(async () => {
      user = await createIsolatedUser("PRO");
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupTestSessions(application.id);
      await cleanupUserApps(user);
    });

    it("should allow referencing existing session", async () => {
      // Create a session first
      const createRes = await createChatSession(application.id, user, {
        title: "Continuation Test",
      });
      const { data: session } = (await createRes.json()) as SessionResponse;

      // Add a message via direct DB
      await addMessageToSession(session.id, "user", "Initial message");
      await addMessageToSession(session.id, "assistant", "Response");

      // Get the session to verify messages are there
      const getRes = await app.request(`/api/chat/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      assertEquals(getRes.status, 200);

      const body = (await getRes.json()) as SessionResponse;
      assertEquals(body.data.messages!.length, 2);
    });

    it("should return 404 for invalid session ID in chat", async () => {
      const fakeSessionId = crypto.randomUUID();

      const res = await app.request(`/api/chat/${application.id}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Hello",
          sessionId: fakeSessionId,
        }),
      });
      // Session validation should fail
      assertEquals(res.status, 404);
    });
  });
});
