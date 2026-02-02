/**
 * Chat Routes Unit Tests
 *
 * Standalone unit tests for chat API routes that don't require a real database.
 * Uses in-memory data stores to simulate database operations.
 * Following the pattern from health_test.ts for isolated testing.
 */

import { assertEquals, assertExists, assert } from "@std/assert";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "npm:uuid";

// ============================================================
// In-Memory Data Stores (simulate database)
// ============================================================

interface Application {
  id: string;
  name: string;
  organization_id: string;
  is_active: boolean;
  is_deleted: boolean;
  system_prompt: string | null;
  model: string;
}

interface ApiCredential {
  id: string;
  api_key: string;
  developer_id: string;
  application_id: string | null;
  scopes: string[];
  is_active: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: string;
}

interface Session {
  id: string;
  user_id: string;
  expires_at: Date;
}

interface ChatSession {
  id: string;
  application_id: string;
  source: string;
  metadata: unknown;
  started_at: Date;
  ended_at: Date | null;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: Date;
}

// In-memory stores
let applications: Application[] = [];
let apiCredentials: ApiCredential[] = [];
let users: User[] = [];
let sessions: Session[] = [];
let chatSessions: ChatSession[] = [];
let chatMessages: ChatMessage[] = [];

function resetStores() {
  applications = [];
  apiCredentials = [];
  users = [];
  sessions = [];
  chatSessions = [];
  chatMessages = [];
}

// ============================================================
// Test Data Helpers
// ============================================================

function createApplication(overrides: Partial<Application> = {}): Application {
  const app: Application = {
    id: overrides.id || uuidv4(),
    name: overrides.name || "Test App",
    organization_id: overrides.organization_id || uuidv4(),
    is_active: overrides.is_active ?? true,
    is_deleted: overrides.is_deleted ?? false,
    system_prompt: overrides.system_prompt ?? null,
    model: overrides.model || "gpt-4o",
  };
  applications.push(app);
  return app;
}

function createApiCredential(
  overrides: Partial<ApiCredential> = {}
): ApiCredential {
  const cred: ApiCredential = {
    id: overrides.id || uuidv4(),
    api_key: overrides.api_key || `test_api_key_${uuidv4()}`,
    developer_id: overrides.developer_id || uuidv4(),
    application_id: overrides.application_id ?? null,
    scopes: overrides.scopes || ["chat"],
    is_active: overrides.is_active ?? true,
  };
  apiCredentials.push(cred);
  return cred;
}

function createUser(overrides: Partial<User> = {}): User {
  const user: User = {
    id: overrides.id || uuidv4(),
    email: overrides.email || `test-${Date.now()}@example.com`,
    name: overrides.name || "Test User",
    organization_id: overrides.organization_id || uuidv4(),
    role: overrides.role || "member",
  };
  users.push(user);
  return user;
}

function createSession(
  overrides: Partial<Session> & { user_id: string }
): Session {
  const session: Session = {
    id: overrides.id || uuidv4(),
    user_id: overrides.user_id,
    expires_at: overrides.expires_at || new Date(Date.now() + 3600000),
  };
  sessions.push(session);
  return session;
}

function createChatSession(
  applicationId: string,
  source: string = "API"
): ChatSession {
  const chatSession: ChatSession = {
    id: uuidv4(),
    application_id: applicationId,
    source,
    metadata: {},
    started_at: new Date(),
    ended_at: null,
  };
  chatSessions.push(chatSession);
  return chatSession;
}

function createChatMessage(
  sessionId: string,
  role: string,
  content: string
): ChatMessage {
  const message: ChatMessage = {
    id: uuidv4(),
    session_id: sessionId,
    role,
    content,
    created_at: new Date(),
  };
  chatMessages.push(message);
  return message;
}

// ============================================================
// Create Test App with Mocked Routes
// ============================================================

// Define context variable types for the test app
type TestVariables = {
  user: {
    id: string;
    email: string;
    name: string;
    organizationId: string;
    role: string;
  };
  session: Session;
  apiCredential: {
    id: string;
    developerId: string;
    applicationId: string | null;
    scopes: string[];
  };
};

function createChatTestApp() {
  const app = new Hono<{ Variables: TestVariables }>();

  // Mock API key auth middleware
  const apiKeyAuth = async (c: any, next: () => Promise<void>) => {
    const apiKey = c.req.header("X-API-Key") ?? c.req.query("api_key");

    if (!apiKey) {
      return c.json({ error: "Missing API key" }, 401);
    }

    const credential = apiCredentials.find(
      (cred) => cred.api_key === apiKey && cred.is_active
    );

    if (!credential) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    const developer = users.find((u) => u.id === credential.developer_id);
    if (!developer) {
      return c.json({ error: "Developer not found" }, 401);
    }

    c.set("user", {
      id: developer.id,
      email: developer.email,
      name: developer.name,
      organizationId: developer.organization_id,
      role: developer.role,
    });

    c.set("apiCredential", {
      id: credential.id,
      developerId: credential.developer_id,
      applicationId: credential.application_id,
      scopes: credential.scopes,
    });

    await next();
  };

  // Mock auth middleware for admin routes
  const authMiddleware = async (c: any, next: () => Promise<void>) => {
    const cookies = c.req.header("Cookie") ?? "";
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    const sessionId = sessionIdMatch?.[1];

    if (!sessionId) {
      return c.json({ error: "Missing session" }, 401);
    }

    const session = sessions.find(
      (s) => s.id === sessionId && s.expires_at > new Date()
    );

    if (!session) {
      return c.json({ error: "Session expired or invalid" }, 401);
    }

    const user = users.find((u) => u.id === session.user_id);
    if (!user) {
      return c.json({ error: "User not found" }, 401);
    }

    c.set("user", {
      id: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organization_id,
      role: user.role,
    });
    c.set("session", session);

    await next();
  };

  // Schemas
  const createSessionSchema = z.object({
    applicationId: z.string().uuid(),
    source: z
      .enum(["APP", "API", "WIDGET", "WHATSAPP", "SLACK"])
      .default("API"),
    metadata: z.record(z.unknown()).optional(),
  });

  const sendMessageSchema = z.object({
    content: z.string().min(1).max(32000),
    stream: z.boolean().default(true),
  });

  // POST /chat/sessions - Create session
  app.post(
    "/chat/sessions",
    apiKeyAuth,
    zValidator("json", createSessionSchema),
    async (c) => {
      const data = c.req.valid("json");

      const application = applications.find(
        (a) => a.id === data.applicationId && !a.is_deleted
      );

      if (!application) {
        return c.json({ error: "Application not found" }, 404);
      }

      if (!application.is_active) {
        return c.json({ error: "Application is not active" }, 400);
      }

      const session: ChatSession = {
        id: uuidv4(),
        application_id: data.applicationId,
        source: data.source,
        metadata: data.metadata ?? {},
        started_at: new Date(),
        ended_at: null,
      };
      chatSessions.push(session);

      return c.json({ session }, 201);
    }
  );

  // GET /chat/sessions/:sessionId - Get session
  app.get("/chat/sessions/:sessionId", apiKeyAuth, async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = chatSessions.find((s) => s.id === sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ session });
  });

  // GET /chat/sessions/:sessionId/messages - List messages
  app.get("/chat/sessions/:sessionId/messages", apiKeyAuth, async (c) => {
    const sessionId = c.req.param("sessionId");
    const limit = parseInt(c.req.query("limit") ?? "50");
    const offset = parseInt(c.req.query("offset") ?? "0");

    const session = chatSessions.find((s) => s.id === sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const messages = chatMessages
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .slice(offset, offset + limit);

    return c.json({ messages });
  });

  // POST /chat/sessions/:sessionId/messages - Send message
  app.post(
    "/chat/sessions/:sessionId/messages",
    apiKeyAuth,
    zValidator("json", sendMessageSchema),
    async (c) => {
      const sessionId = c.req.param("sessionId");
      const data = c.req.valid("json");

      const session = chatSessions.find((s) => s.id === sessionId);
      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }

      const application = applications.find(
        (a) => a.id === session.application_id
      );
      if (!application) {
        return c.json({ error: "Application not found" }, 404);
      }

      // Save user message
      const userMessage: ChatMessage = {
        id: uuidv4(),
        session_id: sessionId,
        role: "user",
        content: data.content,
        created_at: new Date(),
      };
      chatMessages.push(userMessage);

      // Create placeholder assistant response
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        session_id: sessionId,
        role: "assistant",
        content: "This is a placeholder response. AI integration coming soon.",
        created_at: new Date(),
      };
      chatMessages.push(assistantMessage);

      return c.json({ userMessage, assistantMessage });
    }
  );

  // POST /chat/sessions/:sessionId/end - End session
  app.post("/chat/sessions/:sessionId/end", apiKeyAuth, async (c) => {
    const sessionId = c.req.param("sessionId");

    const session = chatSessions.find((s) => s.id === sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    session.ended_at = new Date();
    return c.json({ success: true });
  });

  // GET /chat/admin/applications/:appId/sessions - Admin list sessions
  app.get(
    "/chat/admin/applications/:appId/sessions",
    authMiddleware,
    async (c) => {
      const user = c.get("user") as { organizationId: string };
      const appId = c.req.param("appId");
      const limit = parseInt(c.req.query("limit") ?? "20");
      const offset = parseInt(c.req.query("offset") ?? "0");

      const application = applications.find(
        (a) => a.id === appId && a.organization_id === user.organizationId
      );

      if (!application) {
        return c.json({ error: "Application not found" }, 404);
      }

      const appSessions = chatSessions
        .filter((s) => s.application_id === appId)
        .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())
        .slice(offset, offset + limit);

      return c.json({ sessions: appSessions });
    }
  );

  return app;
}

// ============================================================
// Tests
// ============================================================

// Test app instance
let app: ReturnType<typeof createChatTestApp>;
let testApp: Application;
let testUser: User;
let testCredential: ApiCredential;

// ============================================================
// POST /chat/sessions - Create Session Tests
// ============================================================

Deno.test("Chat Routes Setup", () => {
  resetStores();
  app = createChatTestApp();

  // Create test data
  testUser = createUser({
    email: "chat-test@example.com",
    name: "Chat Test User",
  });

  testApp = createApplication({
    name: "Test Chat App",
    organization_id: testUser.organization_id,
    is_active: true,
  });

  testCredential = createApiCredential({
    developer_id: testUser.id,
    application_id: testApp.id,
  });

  assertExists(testApp.id);
  assertExists(testUser.id);
  assertExists(testCredential.api_key);
});

Deno.test(
  "POST /chat/sessions - creates session with valid API key",
  async () => {
    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: testApp.id,
        source: "API",
      }),
    });

    assertEquals(res.status, 201);

    const data = await res.json();
    assertExists(data.session);
    assertExists(data.session.id);
    assertEquals(data.session.application_id, testApp.id);
    assertEquals(data.session.source, "API");
  }
);

Deno.test("POST /chat/sessions - creates session with metadata", async () => {
  const metadata = { userId: "user123", platform: "web" };

  const res = await app.request("/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": testCredential.api_key,
    },
    body: JSON.stringify({
      applicationId: testApp.id,
      source: "WIDGET",
      metadata,
    }),
  });

  assertEquals(res.status, 201);

  const data = await res.json();
  assertExists(data.session);
  assertEquals(data.session.source, "WIDGET");
});

Deno.test("POST /chat/sessions - returns 401 without API key", async () => {
  const res = await app.request("/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      applicationId: testApp.id,
    }),
  });

  assertEquals(res.status, 401);

  const data = await res.json();
  assertEquals(data.error, "Missing API key");
});

Deno.test(
  "POST /chat/sessions - returns 401 with invalid API key",
  async () => {
    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "invalid_key_123",
      },
      body: JSON.stringify({
        applicationId: testApp.id,
      }),
    });

    assertEquals(res.status, 401);

    const data = await res.json();
    assertEquals(data.error, "Invalid API key");
  }
);

Deno.test(
  "POST /chat/sessions - returns 404 for non-existent application",
  async () => {
    const fakeAppId = uuidv4();

    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: fakeAppId,
      }),
    });

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Application not found");
  }
);

Deno.test(
  "POST /chat/sessions - returns 400 for inactive application",
  async () => {
    const inactiveApp = createApplication({
      name: "Inactive App",
      organization_id: testUser.organization_id,
      is_active: false,
    });

    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: inactiveApp.id,
      }),
    });

    assertEquals(res.status, 400);

    const data = await res.json();
    assertEquals(data.error, "Application is not active");
  }
);

Deno.test(
  "POST /chat/sessions - returns 400 for invalid applicationId format",
  async () => {
    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: "not-a-uuid",
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test("POST /chat/sessions - returns 400 for invalid source", async () => {
  const res = await app.request("/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": testCredential.api_key,
    },
    body: JSON.stringify({
      applicationId: testApp.id,
      source: "INVALID_SOURCE",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test(
  "POST /chat/sessions - accepts API key from query parameter",
  async () => {
    const res = await app.request(
      `/chat/sessions?api_key=${testCredential.api_key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: testApp.id,
        }),
      }
    );

    assertEquals(res.status, 201);
  }
);

Deno.test("POST /chat/sessions - supports all valid source types", async () => {
  const sources = ["APP", "API", "WIDGET", "WHATSAPP", "SLACK"];

  for (const source of sources) {
    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: testApp.id,
        source,
      }),
    });

    assertEquals(res.status, 201, `Failed for source: ${source}`);
    const data = await res.json();
    assertEquals(data.session.source, source);
  }
});

// ============================================================
// GET /chat/sessions/:sessionId - Get Session Tests
// ============================================================

Deno.test("GET /chat/sessions/:sessionId - returns session by ID", async () => {
  const chatSession = createChatSession(testApp.id);

  const res = await app.request(`/chat/sessions/${chatSession.id}`, {
    headers: {
      "X-API-Key": testCredential.api_key,
    },
  });

  assertEquals(res.status, 200);

  const data = await res.json();
  assertExists(data.session);
  assertEquals(data.session.id, chatSession.id);
  assertEquals(data.session.application_id, testApp.id);
});

Deno.test(
  "GET /chat/sessions/:sessionId - returns 404 for non-existent session",
  async () => {
    const fakeSessionId = uuidv4();

    const res = await app.request(`/chat/sessions/${fakeSessionId}`, {
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Session not found");
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId - returns 401 without API key",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}`);

    assertEquals(res.status, 401);
  }
);

// ============================================================
// GET /chat/sessions/:sessionId/messages - List Messages Tests
// ============================================================

Deno.test(
  "GET /chat/sessions/:sessionId/messages - returns messages for session",
  async () => {
    const chatSession = createChatSession(testApp.id);
    createChatMessage(chatSession.id, "user", "Hello!");
    createChatMessage(chatSession.id, "assistant", "Hi there!");
    createChatMessage(chatSession.id, "user", "How are you?");

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertExists(data.messages);
    assertEquals(data.messages.length, 3);
    assertEquals(data.messages[0].content, "Hello!");
    assertEquals(data.messages[1].content, "Hi there!");
    assertEquals(data.messages[2].content, "How are you?");
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId/messages - returns empty array for session without messages",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertExists(data.messages);
    assertEquals(data.messages.length, 0);
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId/messages - respects limit parameter",
  async () => {
    const chatSession = createChatSession(testApp.id);
    for (let i = 0; i < 10; i++) {
      createChatMessage(chatSession.id, "user", `Message ${i}`);
    }

    const res = await app.request(
      `/chat/sessions/${chatSession.id}/messages?limit=5`,
      {
        headers: {
          "X-API-Key": testCredential.api_key,
        },
      }
    );

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.messages.length, 5);
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId/messages - respects offset parameter",
  async () => {
    const chatSession = createChatSession(testApp.id);
    for (let i = 0; i < 10; i++) {
      createChatMessage(chatSession.id, "user", `Message ${i}`);
    }

    const res = await app.request(
      `/chat/sessions/${chatSession.id}/messages?offset=5&limit=5`,
      {
        headers: {
          "X-API-Key": testCredential.api_key,
        },
      }
    );

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.messages.length, 5);
    assertEquals(data.messages[0].content, "Message 5");
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId/messages - returns 404 for non-existent session",
  async () => {
    const fakeSessionId = uuidv4();

    const res = await app.request(`/chat/sessions/${fakeSessionId}/messages`, {
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Session not found");
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId/messages - returns messages in chronological order",
  async () => {
    const chatSession = createChatSession(testApp.id);

    // Create messages with different timestamps
    const msg1 = createChatMessage(chatSession.id, "user", "First");
    msg1.created_at = new Date(Date.now() - 2000);
    const msg2 = createChatMessage(chatSession.id, "assistant", "Second");
    msg2.created_at = new Date(Date.now() - 1000);
    const msg3 = createChatMessage(chatSession.id, "user", "Third");
    msg3.created_at = new Date();

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.messages[0].content, "First");
    assertEquals(data.messages[1].content, "Second");
    assertEquals(data.messages[2].content, "Third");
  }
);

// ============================================================
// POST /chat/sessions/:sessionId/messages - Send Message Tests
// ============================================================

Deno.test(
  "POST /chat/sessions/:sessionId/messages - sends message and receives response",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: "Hello, world!",
      }),
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertExists(data.userMessage);
    assertExists(data.assistantMessage);
    assertEquals(data.userMessage.role, "user");
    assertEquals(data.userMessage.content, "Hello, world!");
    assertEquals(data.assistantMessage.role, "assistant");
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - persists messages in store",
  async () => {
    const chatSession = createChatSession(testApp.id);
    const initialCount = chatMessages.filter(
      (m) => m.session_id === chatSession.id
    ).length;

    await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: "Test persistence",
      }),
    });

    const newCount = chatMessages.filter(
      (m) => m.session_id === chatSession.id
    ).length;
    assertEquals(newCount, initialCount + 2); // User + Assistant
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - returns 404 for non-existent session",
  async () => {
    const fakeSessionId = uuidv4();

    const res = await app.request(`/chat/sessions/${fakeSessionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: "Hello!",
      }),
    });

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Session not found");
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - returns 400 for empty content",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: "",
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - returns 400 for missing content",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - accepts stream parameter",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: "Test with stream",
        stream: false,
      }),
    });

    assertEquals(res.status, 200);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - handles long content near limit",
  async () => {
    const chatSession = createChatSession(testApp.id);
    const longContent = "A".repeat(30000); // Close to 32000 limit

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: longContent,
      }),
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.userMessage.content.length, 30000);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - rejects content over limit",
  async () => {
    const chatSession = createChatSession(testApp.id);
    const tooLongContent = "A".repeat(33000); // Over 32000 limit

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: tooLongContent,
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - handles special characters",
  async () => {
    const chatSession = createChatSession(testApp.id);
    const specialContent =
      "Hello! <script>alert('xss')</script> \"quotes\" 'apostrophe' & ampersand";

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: specialContent,
      }),
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.userMessage.content, specialContent);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/messages - handles unicode content",
  async () => {
    const chatSession = createChatSession(testApp.id);
    const unicodeContent = "Hello! 你好 Привет \u{1F680} مرحبا";

    const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: unicodeContent,
      }),
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.userMessage.content, unicodeContent);
  }
);

// ============================================================
// POST /chat/sessions/:sessionId/end - End Session Tests
// ============================================================

Deno.test(
  "POST /chat/sessions/:sessionId/end - ends session successfully",
  async () => {
    const chatSession = createChatSession(testApp.id);

    const res = await app.request(`/chat/sessions/${chatSession.id}/end`, {
      method: "POST",
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.success, true);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/end - sets ended_at timestamp",
  async () => {
    const chatSession = createChatSession(testApp.id);
    assertEquals(chatSession.ended_at, null);

    await app.request(`/chat/sessions/${chatSession.id}/end`, {
      method: "POST",
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertExists(chatSession.ended_at);
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/end - returns 404 for non-existent session",
  async () => {
    const fakeSessionId = uuidv4();

    const res = await app.request(`/chat/sessions/${fakeSessionId}/end`, {
      method: "POST",
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Session not found");
  }
);

Deno.test(
  "POST /chat/sessions/:sessionId/end - can end already ended session",
  async () => {
    const chatSession = createChatSession(testApp.id);

    // End once
    await app.request(`/chat/sessions/${chatSession.id}/end`, {
      method: "POST",
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    // End again - should still succeed
    const res = await app.request(`/chat/sessions/${chatSession.id}/end`, {
      method: "POST",
      headers: {
        "X-API-Key": testCredential.api_key,
      },
    });

    assertEquals(res.status, 200);
  }
);

// ============================================================
// GET /chat/admin/applications/:appId/sessions - Admin List Sessions Tests
// ============================================================

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - returns sessions with auth",
  async () => {
    const authSession = createSession({ user_id: testUser.id });

    // Create some chat sessions
    createChatSession(testApp.id);
    createChatSession(testApp.id);
    createChatSession(testApp.id);

    const res = await app.request(
      `/chat/admin/applications/${testApp.id}/sessions`,
      {
        headers: {
          Cookie: `session_id=${authSession.id}`,
        },
      }
    );

    assertEquals(res.status, 200);

    const data = await res.json();
    assertExists(data.sessions);
    assert(data.sessions.length >= 3);
  }
);

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - returns 401 without auth",
  async () => {
    const res = await app.request(
      `/chat/admin/applications/${testApp.id}/sessions`
    );

    assertEquals(res.status, 401);

    const data = await res.json();
    assertEquals(data.error, "Missing session");
  }
);

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - returns 404 for app in different org",
  async () => {
    const otherUser = createUser({
      email: "other@example.com",
      organization_id: uuidv4(), // Different org
    });
    const otherApp = createApplication({
      name: "Other App",
      organization_id: otherUser.organization_id,
    });

    const authSession = createSession({ user_id: testUser.id });

    const res = await app.request(
      `/chat/admin/applications/${otherApp.id}/sessions`,
      {
        headers: {
          Cookie: `session_id=${authSession.id}`,
        },
      }
    );

    assertEquals(res.status, 404);

    const data = await res.json();
    assertEquals(data.error, "Application not found");
  }
);

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - respects limit parameter",
  async () => {
    const authSession = createSession({ user_id: testUser.id });

    // Create multiple sessions
    for (let i = 0; i < 5; i++) {
      createChatSession(testApp.id);
    }

    const res = await app.request(
      `/chat/admin/applications/${testApp.id}/sessions?limit=3`,
      {
        headers: {
          Cookie: `session_id=${authSession.id}`,
        },
      }
    );

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.sessions.length, 3);
  }
);

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - respects offset parameter",
  async () => {
    const authSession = createSession({ user_id: testUser.id });

    const res = await app.request(
      `/chat/admin/applications/${testApp.id}/sessions?offset=2&limit=2`,
      {
        headers: {
          Cookie: `session_id=${authSession.id}`,
        },
      }
    );

    assertEquals(res.status, 200);

    const data = await res.json();
    assertExists(data.sessions);
  }
);

Deno.test(
  "GET /chat/admin/applications/:appId/sessions - returns 401 with expired session",
  async () => {
    const expiredSession = createSession({
      user_id: testUser.id,
      expires_at: new Date(Date.now() - 3600000), // 1 hour ago
    });

    const res = await app.request(
      `/chat/admin/applications/${testApp.id}/sessions`,
      {
        headers: {
          Cookie: `session_id=${expiredSession.id}`,
        },
      }
    );

    assertEquals(res.status, 401);

    const data = await res.json();
    assertEquals(data.error, "Session expired or invalid");
  }
);

// ============================================================
// Inactive API Credential Tests
// ============================================================

Deno.test("API routes return 401 with inactive API credential", async () => {
  const inactiveCredential = createApiCredential({
    developer_id: testUser.id,
    application_id: testApp.id,
    is_active: false,
  });

  const res = await app.request("/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": inactiveCredential.api_key,
    },
    body: JSON.stringify({
      applicationId: testApp.id,
    }),
  });

  assertEquals(res.status, 401);

  const data = await res.json();
  assertEquals(data.error, "Invalid API key");
});

// ============================================================
// Edge Cases
// ============================================================

Deno.test(
  "POST /chat/sessions - returns 404 for deleted application",
  async () => {
    const deletedApp = createApplication({
      name: "Deleted App",
      organization_id: testUser.organization_id,
      is_deleted: true,
    });

    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: deletedApp.id,
      }),
    });

    assertEquals(res.status, 404);
  }
);

Deno.test("Multiple sessions can be created for same application", async () => {
  const sessionIds: string[] = [];

  for (let i = 0; i < 3; i++) {
    const res = await app.request("/chat/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        applicationId: testApp.id,
      }),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    sessionIds.push(data.session.id);
  }

  // All session IDs should be unique
  const uniqueIds = new Set(sessionIds);
  assertEquals(uniqueIds.size, 3);
});

Deno.test("Session maintains message history", async () => {
  const chatSession = createChatSession(testApp.id);

  // Send multiple messages
  for (let i = 0; i < 3; i++) {
    await app.request(`/chat/sessions/${chatSession.id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": testCredential.api_key,
      },
      body: JSON.stringify({
        content: `Message ${i + 1}`,
      }),
    });
  }

  // Verify all messages are stored
  const res = await app.request(`/chat/sessions/${chatSession.id}/messages`, {
    headers: {
      "X-API-Key": testCredential.api_key,
    },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  // 3 user messages + 3 assistant responses = 6 total
  assertEquals(data.messages.length, 6);
});
