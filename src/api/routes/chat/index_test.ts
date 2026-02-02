/**
 * Chat Routes Integration Tests
 *
 * Comprehensive tests for chat session and streaming endpoints.
 * Uses Hono's app.request() for testing without HTTP overhead.
 *
 * Note: These tests use mocked services. For service-level tests, see services/chat.service_test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext, User } from "../../middleware/auth.ts";
import {
  createSessionSchema,
  listSessionsQuerySchema,
  streamChatSchema,
  type ChatSessionSource,
  type SenderType,
} from "../../validators/chat.ts";

// ========================================
// Mock Service for Unit Testing Routes
// ========================================

interface MockSession {
  id: string;
  applicationId: number;
  authorUserId: number;
  title: string;
  source: ChatSessionSource;
  isPublic: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  messageCount?: number;
}

interface MockMessage {
  id: string;
  chatSessionId: string;
  senderType: SenderType;
  senderUserId: number;
  content: string;
  modelUsed: string | null;
  metadata: unknown | null;
  createdAt: string;
  updatedAt: string;
}

const mockSessions = new Map<string, MockSession>();
const mockMessages = new Map<string, MockMessage[]>();
const mockAppAccess = new Map<number, Set<string>>(); // appId -> Set of userIds

const mockChatService = {
  listSessions: async (params: {
    applicationId: number;
    source?: ChatSessionSource;
    limit?: number;
    cursor?: string;
  }) => {
    const sessions = Array.from(mockSessions.values())
      .filter(
        (s) =>
          s.applicationId === params.applicationId &&
          s.deletedAt === null &&
          (!params.source || s.source === params.source)
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    let filteredSessions = sessions;
    if (params.cursor) {
      const cursorSession = mockSessions.get(params.cursor);
      if (cursorSession) {
        const cursorTime = new Date(cursorSession.updatedAt).getTime();
        filteredSessions = sessions.filter(
          (s) => new Date(s.updatedAt).getTime() < cursorTime
        );
      }
    }

    const limit = params.limit || 50;
    const result = filteredSessions.slice(0, limit);

    // Add message counts
    return result.map((session) => ({
      ...session,
      messageCount: mockMessages.get(session.id)?.length || 0,
    }));
  },

  getSession: async (sessionId: string) => {
    const session = mockSessions.get(sessionId);
    if (!session || session.deletedAt !== null) {
      throw new Error("Chat session not found");
    }

    return {
      ...session,
      messages: mockMessages.get(sessionId) || [],
    };
  },

  createSession: async (params: {
    applicationId: number;
    authorUserId: number;
    title?: string;
    source?: ChatSessionSource;
  }) => {
    const session: MockSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      applicationId: params.applicationId,
      authorUserId: params.authorUserId,
      title: params.title || "New Chat",
      source: params.source || "APP",
      isPublic: false,
      isShared: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    mockSessions.set(session.id, session);
    mockMessages.set(session.id, []);
    return session;
  },

  deleteSession: async (sessionId: string, userId: number) => {
    const session = mockSessions.get(sessionId);
    if (!session || session.deletedAt !== null) {
      throw new Error("Chat session not found");
    }
    if (session.authorUserId !== userId) {
      throw new Error("You can only delete your own chat sessions");
    }
    session.deletedAt = new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    mockSessions.set(sessionId, session);
  },

  addMessage: async (
    sessionId: string,
    senderType: SenderType,
    senderUserId: number,
    content: string,
    modelUsed?: string,
    metadata?: unknown
  ) => {
    const messages = mockMessages.get(sessionId) || [];
    const message: MockMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      chatSessionId: sessionId,
      senderType,
      senderUserId,
      content,
      modelUsed: modelUsed || null,
      metadata: metadata || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    messages.push(message);
    mockMessages.set(sessionId, messages);

    // Update session's updatedAt
    const session = mockSessions.get(sessionId);
    if (session) {
      session.updatedAt = new Date().toISOString();
      mockSessions.set(sessionId, session);
    }

    return message;
  },

  verifyAppAccess: async (appId: number, userId: string) => {
    const users = mockAppAccess.get(appId);
    if (!users?.has(userId)) {
      throw new Error("You don't have access to this application");
    }
    return { id: appId, name: `App ${appId}` };
  },
};

// ========================================
// Test App with Mock Service
// ========================================

function createTestApp() {
  const app = new Hono<AuthContext>();

  // Mock auth middleware that sets a test user
  app.use("*", async (c, next) => {
    const user: User = {
      id: "123", // Use numeric string so parseInt works correctly
      email: "test@example.com",
      name: "Test User",
      organizationId: "org-123",
      activeWorkspaceId: null,
      role: "owner",
    };
    c.set("user", user);
    await next();
  });

  // Chat routes (following the pattern from index.ts with mock service)
  app.get(
    "/:appId/sessions",
    zValidator("query", listSessionsQuerySchema),
    async (c) => {
      const user = c.get("user");
      const appId = parseInt(c.req.param("appId"), 10);
      const query = c.req.valid("query");

      try {
        await mockChatService.verifyAppAccess(appId, user.id);
        const sessions = await mockChatService.listSessions({
          applicationId: appId,
          source: query.source,
          limit: query.limit,
          cursor: query.cursor,
        });

        return c.json({
          data: sessions,
          pagination: {
            limit: query.limit,
            hasMore: sessions.length === query.limit,
            nextCursor:
              sessions.length > 0 ? sessions[sessions.length - 1].id : null,
          },
        });
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
  );

  app.get("/sessions/:sessionId", async (c) => {
    const user = c.get("user");
    const { sessionId } = c.req.param();

    try {
      const session = await mockChatService.getSession(sessionId);
      await mockChatService.verifyAppAccess(session.applicationId, user.id);
      return c.json({ data: session });
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return c.json({ error: "Chat session not found" }, 404);
      }
      return c.json({ error: "Forbidden" }, 403);
    }
  });

  app.post(
    "/:appId/sessions",
    zValidator("json", createSessionSchema),
    async (c) => {
      const user = c.get("user");
      const appId = parseInt(c.req.param("appId"), 10);
      const body = c.req.valid("json");

      try {
        await mockChatService.verifyAppAccess(appId, user.id);
        const session = await mockChatService.createSession({
          applicationId: appId,
          authorUserId: parseInt(user.id, 10),
          title: body.title,
          source: body.source,
        });
        return c.json({ data: session }, 201);
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
  );

  app.delete("/sessions/:sessionId", async (c) => {
    const user = c.get("user");
    const { sessionId } = c.req.param();

    try {
      const session = await mockChatService.getSession(sessionId);
      await mockChatService.verifyAppAccess(session.applicationId, user.id);
      await mockChatService.deleteSession(sessionId, parseInt(user.id, 10));
      return c.json({ success: true });
    } catch (error) {
      if ((error as Error).message.includes("not found")) {
        return c.json({ error: "Chat session not found" }, 404);
      }
      if ((error as Error).message.includes("only delete your own")) {
        return c.json({ error: "Forbidden" }, 403);
      }
      return c.json({ error: "Forbidden" }, 403);
    }
  });

  app.post(
    "/:appId/stream",
    zValidator("json", streamChatSchema),
    async (c) => {
      const user = c.get("user");
      const appId = parseInt(c.req.param("appId"), 10);
      const body = c.req.valid("json");

      try {
        await mockChatService.verifyAppAccess(appId, user.id);

        // Get or create session
        let sessionId = body.sessionId;
        if (!sessionId) {
          const session = await mockChatService.createSession({
            applicationId: appId,
            authorUserId: parseInt(user.id, 10),
          });
          sessionId = session.id;
        }

        // Save the user message
        await mockChatService.addMessage(
          sessionId,
          "USER",
          parseInt(user.id, 10),
          body.message
        );

        // Return SSE stream
        return streamSSE(c, async (stream) => {
          // Send session ID event
          await stream.writeSSE({
            event: "session",
            data: JSON.stringify({ sessionId }),
          });

          // Send stub response
          const stubResponse = `Received: ${body.message}`;
          await stream.writeSSE({
            event: "content",
            data: JSON.stringify({
              type: "text",
              text: stubResponse,
            }),
          });

          // Save bot response
          await mockChatService.addMessage(
            sessionId,
            "BOT",
            parseInt(user.id, 10),
            stubResponse,
            "stub-model"
          );

          // Send done event
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({
              sessionId,
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                model: "stub-model",
              },
            }),
          });
        });
      } catch {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
  );

  return app;
}

// Clean up between tests
function resetMocks() {
  mockSessions.clear();
  mockMessages.clear();
  mockAppAccess.clear();
}

// Helper to grant app access to test user
function grantAppAccess(appId: number, userId: string = "123") {
  if (!mockAppAccess.has(appId)) {
    mockAppAccess.set(appId, new Set());
  }
  mockAppAccess.get(appId)!.add(userId);
}

// ========================================
// GET /:appId/sessions Tests
// ========================================

Deno.test(
  "GET /:appId/sessions - returns empty array when no sessions",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/1/sessions");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
    assertEquals(data.data.length, 0);
    assertExists(data.pagination);
  }
);

Deno.test(
  "GET /:appId/sessions - returns sessions for application",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    // Create sessions
    await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
      title: "Session 1",
    });
    await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
      title: "Session 2",
    });

    const res = await app.request("/1/sessions");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.length, 2);
    assertEquals(data.pagination.limit, 50);
  }
);

Deno.test("GET /:appId/sessions - filters by source", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
    source: "APP",
  });
  await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
    source: "API",
  });
  await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
    source: "WHATSAPP",
  });

  const res = await app.request("/1/sessions?source=API");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].source, "API");
});

Deno.test("GET /:appId/sessions - respects limit parameter", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  // Create 5 sessions
  for (let i = 0; i < 5; i++) {
    await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
    });
  }

  const res = await app.request("/1/sessions?limit=3");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 3);
  assertEquals(data.pagination.limit, 3);
  assertEquals(data.pagination.hasMore, true);
});

Deno.test("GET /:appId/sessions - validates limit range", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/sessions?limit=150");

  assertEquals(res.status, 400); // Exceeds max of 100
});

Deno.test("GET /:appId/sessions - returns 403 without app access", async () => {
  resetMocks();
  const app = createTestApp();
  // Don't grant access

  const res = await app.request("/1/sessions");

  assertEquals(res.status, 403);
});

Deno.test("GET /:appId/sessions - excludes deleted sessions", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const session = await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
  });
  await mockChatService.deleteSession(session.id, 123);

  const res = await app.request("/1/sessions");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 0);
});

Deno.test("GET /:appId/sessions - includes message count", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const session = await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
  });
  await mockChatService.addMessage(session.id, "USER", 123, "Hello");
  await mockChatService.addMessage(session.id, "BOT", 123, "Hi there");

  const res = await app.request("/1/sessions");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data[0].messageCount, 2);
});

// ========================================
// GET /sessions/:sessionId Tests
// ========================================

Deno.test(
  "GET /sessions/:sessionId - returns session with messages",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const session = await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
      title: "Test Session",
    });
    await mockChatService.addMessage(session.id, "USER", 123, "Hello");

    const res = await app.request(`/sessions/${session.id}`);

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.id, session.id);
    assertEquals(data.data.title, "Test Session");
    assertEquals(Array.isArray(data.data.messages), true);
    assertEquals(data.data.messages.length, 1);
  }
);

Deno.test(
  "GET /sessions/:sessionId - returns 404 for non-existent session",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/sessions/non-existent-id");

    assertEquals(res.status, 404);
  }
);

Deno.test(
  "GET /sessions/:sessionId - returns 403 without app access",
  async () => {
    resetMocks();
    const app = createTestApp();
    // Create session but don't grant access
    const session = await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
    });

    const res = await app.request(`/sessions/${session.id}`);

    assertEquals(res.status, 403);
  }
);

Deno.test(
  "GET /sessions/:sessionId - returns 404 for deleted session",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const session = await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
    });
    await mockChatService.deleteSession(session.id, 123);

    const res = await app.request(`/sessions/${session.id}`);

    assertEquals(res.status, 404);
  }
);

// ========================================
// POST /:appId/sessions Tests
// ========================================

Deno.test(
  "POST /:appId/sessions - creates session with valid data",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "My Chat Session",
        source: "API",
      }),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.title, "My Chat Session");
    assertEquals(data.data.source, "API");
    assertEquals(data.data.applicationId, 1);
    assertExists(data.data.id);
  }
);

Deno.test(
  "POST /:appId/sessions - creates session with minimal data",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.title, "New Chat");
    assertEquals(data.data.source, "APP");
  }
);

Deno.test("POST /:appId/sessions - validates source enum", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "INVALID_SOURCE",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /:appId/sessions - validates title length", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "a".repeat(256), // Exceeds max of 255
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test(
  "POST /:appId/sessions - returns 403 without app access",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 403);
  }
);

Deno.test(
  "POST /:appId/sessions - creates session with all sources",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const sources: ChatSessionSource[] = [
      "APP",
      "API",
      "WHATSAPP",
      "SLACK",
      "EMAIL",
    ];

    for (const source of sources) {
      const res = await app.request("/1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });

      assertEquals(res.status, 201);
      const data = await res.json();
      assertEquals(data.data.source, source);
    }
  }
);

// ========================================
// DELETE /sessions/:sessionId Tests
// ========================================

Deno.test("DELETE /sessions/:sessionId - deletes session", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  // Create session with matching user ID (test user is 123 after parseInt)
  const session = await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123, // Must match parseInt("test-user-123", 10) from test user
  });

  const res = await app.request(`/sessions/${session.id}`, {
    method: "DELETE",
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);

  // Verify session is soft-deleted
  const deletedSession = mockSessions.get(session.id);
  assertExists(deletedSession?.deletedAt);
});

Deno.test(
  "DELETE /sessions/:sessionId - returns 404 for non-existent session",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/sessions/non-existent-id", {
      method: "DELETE",
    });

    assertEquals(res.status, 404);
  }
);

Deno.test(
  "DELETE /sessions/:sessionId - returns 403 without app access",
  async () => {
    resetMocks();
    const app = createTestApp();

    const session = await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 123,
    });

    const res = await app.request(`/sessions/${session.id}`, {
      method: "DELETE",
    });

    assertEquals(res.status, 403);
  }
);

Deno.test(
  "DELETE /sessions/:sessionId - prevents deleting others' sessions",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    // Create session with different author
    const session = await mockChatService.createSession({
      applicationId: 1,
      authorUserId: 999, // Different user
    });

    const res = await app.request(`/sessions/${session.id}`, {
      method: "DELETE",
    });

    assertEquals(res.status, 403);
  }
);

// ========================================
// POST /:appId/stream Tests
// ========================================

Deno.test(
  "POST /:appId/stream - creates new session and streams response",
  async () => {
    resetMocks();
    const app = createTestApp();
    grantAppAccess(1);

    const res = await app.request("/1/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Hello, bot!",
      }),
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/event-stream");

    // Read SSE stream
    const text = await res.text();
    assertEquals(text.includes("event: session"), true);
    assertEquals(text.includes("event: content"), true);
    assertEquals(text.includes("event: done"), true);
  }
);

Deno.test("POST /:appId/stream - uses existing session", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  // Create existing session with proper UUID format
  const session = await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
  });

  // Generate a valid UUID for the session (mock service generates timestamp-based IDs)
  // We need to update the session ID to be a valid UUID
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";
  mockSessions.delete(session.id);
  const updatedSession = { ...session, id: validUUID };
  mockSessions.set(validUUID, updatedSession);
  mockMessages.set(validUUID, mockMessages.get(session.id) || []);
  mockMessages.delete(session.id);

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: validUUID,
      message: "Follow-up message",
    }),
  });

  assertEquals(res.status, 200);
  const text = await res.text();
  assertEquals(text.includes(validUUID), true);

  // Verify message was added to existing session
  const messages = mockMessages.get(validUUID);
  assertEquals(messages?.length, 2); // USER + BOT
});

Deno.test("POST /:appId/stream - validates message is required", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /:appId/stream - validates message is not empty", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /:appId/stream - validates sessionId is UUID", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "not-a-uuid",
      message: "Hello",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /:appId/stream - returns 403 without app access", async () => {
  resetMocks();
  const app = createTestApp();

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hello",
    }),
  });

  assertEquals(res.status, 403);
});

Deno.test("POST /:appId/stream - saves user and bot messages", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const session = await mockChatService.createSession({
    applicationId: 1,
    authorUserId: 123,
  });

  // Convert to valid UUID
  const validUUID = "550e8400-e29b-41d4-a716-446655440001";
  mockSessions.delete(session.id);
  const updatedSession = { ...session, id: validUUID };
  mockSessions.set(validUUID, updatedSession);
  mockMessages.set(validUUID, mockMessages.get(session.id) || []);
  mockMessages.delete(session.id);

  const response = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: validUUID,
      message: "Test message",
    }),
  });

  // Consume the response stream to allow messages to be saved
  await response.text();

  const messages = mockMessages.get(validUUID);
  assertEquals(messages?.length, 2);
  assertEquals(messages?.[0].senderType, "USER");
  assertEquals(messages?.[0].content, "Test message");
  assertEquals(messages?.[1].senderType, "BOT");
  assertEquals(messages?.[1].modelUsed, "stub-model");
});

Deno.test("POST /:appId/stream - includes usage in done event", async () => {
  resetMocks();
  const app = createTestApp();
  grantAppAccess(1);

  const res = await app.request("/1/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hello",
    }),
  });

  const text = await res.text();
  assertEquals(text.includes("usage"), true);
  assertEquals(text.includes("model"), true);
});
