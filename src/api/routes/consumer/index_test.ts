/**
 * Consumer Routes Integration Tests
 *
 * Comprehensive tests for consumer authentication, chat, credits, and forms endpoints.
 * Uses Hono's app.request() for testing without HTTP overhead.
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ConsumerUser } from "../../middleware/consumerAuth.ts";

// Extended ConsumerUser with customInstructions for testing
interface MockConsumerUser extends ConsumerUser {
  customInstructions: string | null;
}

// Test-specific context types (don't import from production to avoid coupling)
interface TestAppContext {
  Variables: {
    app: {
      id: string;
      name: string;
      appNameId: string;
      brandStyles: Record<string, unknown> | null;
      capabilities: Record<string, unknown> | null;
      settings: Record<string, unknown> | null;
      isActive: boolean;
      organizationId: string | null;
      customInstructionsEnabled: boolean;
    };
    consumer?: MockConsumerUser;
    requestId: string;
  };
}

// ========================================
// Mock Data Store
// ========================================

interface MockApplication {
  id: string;
  name: string;
  appNameId: string;
  brandStyles: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  developerId: string;
  organizationId: string | null;
  redirectAfterSignupUrl: string | null;
  currency: string;
  customInstructionsEnabled: boolean;
}

interface MockConsumer {
  id: string;
  email: string | null;
  name: string | null;
  identifier: string;
  applicationId: string;
  credits: number;
  subscriptionActive: boolean;
  stripeCustomerId: string | null;
  customInstructions: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
}

interface MockSession {
  id: string;
  consumerId: string;
  applicationId: string;
  expiresAt: Date;
}

interface MockChatSession {
  id: string;
  applicationId: string;
  consumerId: string;
  title: string;
  source: string;
  startedAt: Date;
  deletedAt: Date | null;
  messages: MockMessage[];
}

interface MockMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface MockLeadGenForm {
  id: number;
  applicationId: string;
  name: string;
  description: string | null;
  formPrompt: string | null;
  active: boolean;
  deletedAt: Date | null;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    ordinal: number;
  }>;
}

interface MockFormSubmission {
  id: number;
  formId: number;
  chatSessionId: string;
  data: Record<string, string>;
  createdAt: Date;
}

interface MockPackage {
  id: number;
  applicationId: string;
  name: string;
  tokenQty: number;
  price: number;
  type: "ONE_TIME" | "SUBSCRIPTION";
  isActive: boolean;
}

interface MockBookmark {
  id: string;
  consumerId: string;
  messageId: string;
  note: string | null;
  createdAt: Date;
}

function createMockStore() {
  const applications = new Map<string, MockApplication>();
  const consumers = new Map<string, MockConsumer>();
  const sessions = new Map<string, MockSession>();
  const chatSessions = new Map<string, MockChatSession>();
  const messages = new Map<string, MockMessage[]>();
  const leadGenForms = new Map<number, MockLeadGenForm>();
  const formSubmissions = new Map<number, MockFormSubmission>();
  const packages = new Map<number, MockPackage>();
  const bookmarks = new Map<string, MockBookmark>();
  const otpCodes = new Map<string, string>(); // email -> otp
  const magicLinkTokens = new Map<string, string>(); // token -> email
  let idCounter = 0;

  return {
    applications,
    consumers,
    sessions,
    chatSessions,
    messages,
    leadGenForms,
    formSubmissions,
    packages,
    bookmarks,
    otpCodes,
    magicLinkTokens,

    createApplication(
      data: Partial<MockApplication> & { name: string }
    ): MockApplication {
      idCounter++;
      const id = `app-${idCounter}`;
      const app: MockApplication = {
        id,
        name: data.name,
        appNameId:
          data.appNameId ||
          `${data.name.toLowerCase().replace(/\s+/g, "-")}-${id}`,
        brandStyles: data.brandStyles || null,
        capabilities: data.capabilities || null,
        settings: data.settings || null,
        isActive: data.isActive ?? true,
        developerId: data.developerId || `dev-${idCounter}`,
        organizationId: data.organizationId || null,
        redirectAfterSignupUrl: data.redirectAfterSignupUrl || null,
        currency: data.currency || "USD",
        customInstructionsEnabled: data.customInstructionsEnabled ?? true,
      };
      applications.set(id, app);
      return app;
    },

    createConsumer(
      data: Partial<MockConsumer> & { applicationId: string }
    ): MockConsumer {
      idCounter++;
      const id = `consumer-${idCounter}`;
      const consumer: MockConsumer = {
        id,
        email: data.email || null,
        name: data.name || null,
        identifier: data.identifier || `anon-${id}`,
        applicationId: data.applicationId,
        credits: data.credits ?? 100,
        subscriptionActive: data.subscriptionActive ?? false,
        stripeCustomerId: data.stripeCustomerId || null,
        customInstructions: data.customInstructions || null,
        passwordHash: data.passwordHash || null,
        emailVerified: data.emailVerified ?? false,
      };
      consumers.set(id, consumer);
      return consumer;
    },

    createSession(
      consumerId: string,
      applicationId: string,
      expiresIn = 3600000
    ): MockSession {
      idCounter++;
      const id = `session-${idCounter}`;
      const session: MockSession = {
        id,
        consumerId,
        applicationId,
        expiresAt: new Date(Date.now() + expiresIn),
      };
      sessions.set(id, session);
      return session;
    },

    createChatSession(
      data: Partial<MockChatSession> & {
        applicationId: string;
        consumerId: string;
      }
    ): MockChatSession {
      const id = crypto.randomUUID();
      const chatSession: MockChatSession = {
        id,
        applicationId: data.applicationId,
        consumerId: data.consumerId,
        title: data.title || "New Chat",
        source: data.source || "APP",
        startedAt: new Date(),
        deletedAt: null,
        messages: [],
      };
      chatSessions.set(id, chatSession);
      messages.set(id, []);
      return chatSession;
    },

    addMessage(sessionId: string, role: string, content: string): MockMessage {
      const id = crypto.randomUUID();
      const message: MockMessage = {
        id,
        sessionId,
        role,
        content,
        createdAt: new Date(),
      };
      const sessionMessages = messages.get(sessionId) || [];
      sessionMessages.push(message);
      messages.set(sessionId, sessionMessages);

      // Update chat session
      const chatSession = chatSessions.get(sessionId);
      if (chatSession) {
        chatSession.messages = sessionMessages;
      }
      return message;
    },

    createLeadGenForm(
      data: Partial<MockLeadGenForm> & { applicationId: string }
    ): MockLeadGenForm {
      idCounter++;
      const form: MockLeadGenForm = {
        id: idCounter,
        applicationId: data.applicationId,
        name: data.name || "Lead Form",
        description: data.description || null,
        formPrompt: data.formPrompt || null,
        active: data.active ?? true,
        deletedAt: null,
        fields: data.fields || [
          { name: "email", type: "email", required: true, ordinal: 1 },
          { name: "name", type: "text", required: false, ordinal: 2 },
        ],
      };
      leadGenForms.set(form.id, form);
      return form;
    },

    createFormSubmission(
      formId: number,
      chatSessionId: string,
      data: Record<string, string>
    ): MockFormSubmission {
      idCounter++;
      const submission: MockFormSubmission = {
        id: idCounter,
        formId,
        chatSessionId,
        data,
        createdAt: new Date(),
      };
      formSubmissions.set(submission.id, submission);
      return submission;
    },

    createPackage(
      data: Partial<MockPackage> & { applicationId: string }
    ): MockPackage {
      idCounter++;
      const pkg: MockPackage = {
        id: idCounter,
        applicationId: data.applicationId,
        name: data.name || "Credits Package",
        tokenQty: data.tokenQty ?? 100,
        price: data.price ?? 9.99,
        type: data.type || "ONE_TIME",
        isActive: data.isActive ?? true,
      };
      packages.set(pkg.id, pkg);
      return pkg;
    },

    createBookmark(
      consumerId: string,
      messageId: string,
      note?: string
    ): MockBookmark {
      const id = crypto.randomUUID();
      const bookmark: MockBookmark = {
        id,
        consumerId,
        messageId,
        note: note || null,
        createdAt: new Date(),
      };
      bookmarks.set(id, bookmark);
      return bookmark;
    },

    findAppBySlug(slug: string): MockApplication | null {
      for (const app of applications.values()) {
        if (app.appNameId === slug && app.isActive) {
          return app;
        }
      }
      return null;
    },

    getSession(id: string): MockSession | null {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt < new Date()) return null;
      return session;
    },

    getConsumer(id: string): MockConsumer | null {
      return consumers.get(id) || null;
    },

    getConsumerByEmail(
      email: string,
      applicationId: string
    ): MockConsumer | null {
      for (const consumer of consumers.values()) {
        if (
          consumer.email === email &&
          consumer.applicationId === applicationId
        ) {
          return consumer;
        }
      }
      return null;
    },

    reset() {
      applications.clear();
      consumers.clear();
      sessions.clear();
      chatSessions.clear();
      messages.clear();
      leadGenForms.clear();
      formSubmissions.clear();
      packages.clear();
      bookmarks.clear();
      otpCodes.clear();
      magicLinkTokens.clear();
      idCounter = 0;
    },
  };
}

// ========================================
// Test App Factory
// ========================================

function createConsumerTestApp(store: ReturnType<typeof createMockStore>) {
  const app = new Hono<TestAppContext>();

  // Mock app middleware
  app.use("/consumer/:appNameId/*", async (c, next) => {
    const appSlug = c.req.param("appNameId");
    const resolvedApp = store.findAppBySlug(appSlug);

    if (!resolvedApp) {
      return c.json({ error: "Application not found" }, 404);
    }

    c.set("app", resolvedApp);
    await next();
  });

  // ========================================
  // Auth Routes (no auth required)
  // ========================================

  // Signup
  app.post(
    "/consumer/:appNameId/auth/signup",
    zValidator(
      "json",
      z.object({
        email: z.string().email(),
        password: z.string().min(8).optional(),
        name: z.string().min(1).max(255).optional(),
      })
    ),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      // Check if consumer already exists
      const existing = store.getConsumerByEmail(body.email, resolvedApp.id);
      if (existing) {
        return c.json({ error: "Email already registered" }, 400);
      }

      // Create consumer
      const consumer = store.createConsumer({
        applicationId: resolvedApp.id,
        email: body.email,
        name: body.name,
        passwordHash: body.password ? `hash:${body.password}` : null,
      });

      // Generate OTP
      const otp = Math.random().toString().slice(2, 8);
      store.otpCodes.set(body.email, otp);

      return c.json(
        {
          success: true,
          message: "Account created. Please verify your email.",
          consumerId: consumer.id,
          requiresVerification: true,
        },
        201
      );
    }
  );

  // Verify OTP
  app.post(
    "/consumer/:appNameId/auth/verify",
    zValidator(
      "json",
      z.object({
        email: z.string().email(),
        otpCode: z.string().length(6),
      })
    ),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const storedOtp = store.otpCodes.get(body.email);
      if (!storedOtp || storedOtp !== body.otpCode) {
        return c.json({ error: "Invalid or expired OTP" }, 400);
      }

      const consumer = store.getConsumerByEmail(body.email, resolvedApp.id);
      if (!consumer) {
        return c.json({ error: "Consumer not found" }, 404);
      }

      // Mark as verified
      consumer.emailVerified = true;
      store.otpCodes.delete(body.email);

      // Create session
      const session = store.createSession(consumer.id, resolvedApp.id);

      return c.json({
        success: true,
        consumer: {
          id: consumer.id,
          email: consumer.email,
          name: consumer.name,
        },
        sessionId: session.id,
        expiresAt: session.expiresAt.toISOString(),
      });
    }
  );

  // Login
  app.post(
    "/consumer/:appNameId/auth/login",
    zValidator(
      "json",
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    ),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const consumer = store.getConsumerByEmail(body.email, resolvedApp.id);
      if (!consumer) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      // Verify password (mock)
      if (consumer.passwordHash !== `hash:${body.password}`) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      if (!consumer.emailVerified) {
        return c.json({ error: "Email not verified" }, 401);
      }

      // Create session
      const session = store.createSession(consumer.id, resolvedApp.id);

      return c.json({
        success: true,
        consumer: {
          id: consumer.id,
          email: consumer.email,
          name: consumer.name,
        },
        sessionId: session.id,
        expiresAt: session.expiresAt.toISOString(),
      });
    }
  );

  // Magic link request
  app.post(
    "/consumer/:appNameId/auth/magic-link",
    zValidator("json", z.object({ email: z.string().email() })),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const consumer = store.getConsumerByEmail(body.email, resolvedApp.id);
      if (consumer) {
        const token = crypto.randomUUID();
        store.magicLinkTokens.set(token, body.email);
      }

      // Always return success (don't reveal if email exists)
      return c.json({
        success: true,
        message: "If an account exists, a magic link has been sent.",
      });
    }
  );

  // Magic link verify
  app.post(
    "/consumer/:appNameId/auth/magic-link/verify",
    zValidator("json", z.object({ token: z.string().min(1) })),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const email = store.magicLinkTokens.get(body.token);
      if (!email) {
        return c.json({ error: "Invalid or expired magic link" }, 401);
      }

      const consumer = store.getConsumerByEmail(email, resolvedApp.id);
      if (!consumer) {
        return c.json({ error: "Consumer not found" }, 404);
      }

      // Mark as verified and create session
      consumer.emailVerified = true;
      store.magicLinkTokens.delete(body.token);
      const session = store.createSession(consumer.id, resolvedApp.id);

      return c.json({
        success: true,
        consumer: {
          id: consumer.id,
          email: consumer.email,
          name: consumer.name,
        },
        sessionId: session.id,
      });
    }
  );

  // Logout
  app.post("/consumer/:appNameId/auth/logout", async (c) => {
    const sessionId = c.req
      .header("Cookie")
      ?.match(/consumer_session_id=([^;]+)/)?.[1];
    if (sessionId) {
      store.sessions.delete(sessionId);
    }
    return c.json({ success: true });
  });

  // Resend OTP
  app.post(
    "/consumer/:appNameId/auth/resend-otp",
    zValidator("json", z.object({ email: z.string().email() })),
    async (c) => {
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const consumer = store.getConsumerByEmail(body.email, resolvedApp.id);
      if (!consumer) {
        return c.json({ error: "Consumer not found" }, 400);
      }

      const otp = Math.random().toString().slice(2, 8);
      store.otpCodes.set(body.email, otp);

      return c.json({
        success: true,
        message: "OTP sent to your email.",
      });
    }
  );

  // ========================================
  // App Info Routes
  // ========================================

  app.get("/consumer/:appNameId/app", async (c) => {
    const resolvedApp = c.get("app");

    // Get lead gen forms for this app
    const forms: MockLeadGenForm[] = [];
    for (const form of store.leadGenForms.values()) {
      if (
        form.applicationId === resolvedApp.id &&
        form.active &&
        !form.deletedAt
      ) {
        forms.push(form);
      }
    }

    return c.json({
      id: resolvedApp.id,
      name: resolvedApp.name,
      brandStyles: resolvedApp.brandStyles,
      leadGenerationForms: forms,
      isAuthenticated: false,
      consumer: null,
    });
  });

  // PWA Manifest
  app.get("/consumer/:appNameId/manifest", async (c) => {
    const resolvedApp = c.get("app");
    const brandStyles = (resolvedApp.brandStyles || {}) as Record<
      string,
      unknown
    >;

    return c.json(
      {
        name: resolvedApp.name,
        short_name: resolvedApp.name?.slice(0, 12) || "Chat",
        description: `Chat with ${resolvedApp.name}`,
        start_url: `/#/chat`,
        display: "standalone",
        background_color:
          (brandStyles["backgroundColor"] as string) || "#ffffff",
        theme_color: (brandStyles["primaryColor"] as string) || "#000000",
      },
      200,
      {
        "Content-Type": "application/manifest+json",
      }
    );
  });

  // ========================================
  // Form Submission Routes
  // ========================================

  app.post(
    "/consumer/:appNameId/forms/:formId/submissions",
    zValidator(
      "json",
      z.object({
        formData: z.record(z.string()),
        chatSessionId: z.string(),
      })
    ),
    async (c) => {
      const resolvedApp = c.get("app");
      const formId = parseInt(c.req.param("formId"), 10);
      const body = c.req.valid("json");

      if (isNaN(formId)) {
        return c.json({ error: "Invalid form ID" }, 400);
      }

      // Verify form exists and belongs to app
      const form = store.leadGenForms.get(formId);
      if (
        !form ||
        form.applicationId !== resolvedApp.id ||
        !form.active ||
        form.deletedAt
      ) {
        return c.json({ error: "Form not found" }, 404);
      }

      // Create submission
      const submission = store.createFormSubmission(
        formId,
        body.chatSessionId,
        body.formData
      );

      return c.json({
        message: "Form submission created successfully",
        data: submission,
      });
    }
  );

  // ========================================
  // Authenticated Routes (require consumer auth)
  // ========================================

  // Auth middleware for protected routes
  const authMiddleware = async (c: any, next: () => Promise<void>) => {
    const sessionId = c.req
      .header("Cookie")
      ?.match(/consumer_session_id=([^;]+)/)?.[1];
    const resolvedApp = c.get("app");

    if (!sessionId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const session = store.getSession(sessionId);
    if (!session || session.applicationId !== resolvedApp.id) {
      return c.json({ error: "Invalid session" }, 401);
    }

    const consumer = store.getConsumer(session.consumerId);
    if (!consumer) {
      return c.json({ error: "Consumer not found" }, 401);
    }

    c.set("consumer", consumer);
    await next();
  };

  // Profile
  app.get("/consumer/:appNameId/user/me", authMiddleware, async (c) => {
    const consumer = c.get("consumer")!;
    return c.json({
      id: consumer.id,
      email: consumer.email,
      name: consumer.name,
      identifier: consumer.identifier,
      credits: consumer.credits,
      subscriptionActive: consumer.subscriptionActive,
    });
  });

  app.patch(
    "/consumer/:appNameId/user/me",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(255).optional(),
      })
    ),
    async (c) => {
      const consumer = c.get("consumer")!;
      const body = c.req.valid("json");

      if (body.name) {
        consumer.name = body.name;
      }

      return c.json({
        id: consumer.id,
        email: consumer.email,
        name: consumer.name,
      });
    }
  );

  // ========================================
  // Credits Routes
  // ========================================

  app.get(
    "/consumer/:appNameId/credits/packages",
    authMiddleware,
    async (c) => {
      const resolvedApp = c.get("app");
      const appPackages: MockPackage[] = [];

      for (const pkg of store.packages.values()) {
        if (pkg.applicationId === resolvedApp.id && pkg.isActive) {
          appPackages.push(pkg);
        }
      }

      return c.json({
        data: appPackages.map((pkg) => ({
          id: pkg.id,
          name: pkg.name,
          credits: pkg.tokenQty,
          price: pkg.price,
          type: pkg.type,
        })),
      });
    }
  );

  app.get("/consumer/:appNameId/credits/balance", authMiddleware, async (c) => {
    const consumer = c.get("consumer")!;

    return c.json({
      credits: consumer.credits,
      subscriptionActive: consumer.subscriptionActive,
      hasUnlimitedCredits: consumer.subscriptionActive,
    });
  });

  // ========================================
  // Chat Session Routes
  // ========================================

  app.get(
    "/consumer/:appNameId/chat/sessions",
    authMiddleware,
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    ),
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const query = c.req.valid("query");

      const sessions: MockChatSession[] = [];
      for (const session of store.chatSessions.values()) {
        if (
          session.applicationId === resolvedApp.id &&
          session.consumerId === consumer.id &&
          !session.deletedAt
        ) {
          sessions.push(session);
        }
      }

      // Sort by startedAt desc
      sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

      const limited = sessions.slice(0, query.limit);

      return c.json({
        data: limited.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.startedAt.toISOString(),
          messageCount: s.messages.length,
        })),
        pagination: {
          limit: query.limit,
          hasMore: sessions.length > query.limit,
        },
      });
    }
  );

  app.post(
    "/consumer/:appNameId/chat/sessions",
    authMiddleware,
    zValidator("json", z.object({ title: z.string().max(255).optional() })),
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      const session = store.createChatSession({
        applicationId: resolvedApp.id,
        consumerId: consumer.id,
        title: body.title,
      });

      return c.json({ data: session }, 201);
    }
  );

  app.get(
    "/consumer/:appNameId/chat/sessions/:sessionId",
    authMiddleware,
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const { sessionId } = c.req.param();

      const session = store.chatSessions.get(sessionId);
      if (!session || session.deletedAt) {
        return c.json({ error: "Session not found" }, 404);
      }

      if (
        session.applicationId !== resolvedApp.id ||
        session.consumerId !== consumer.id
      ) {
        return c.json({ error: "Session not found" }, 404);
      }

      return c.json({
        data: {
          id: session.id,
          title: session.title,
          createdAt: session.startedAt.toISOString(),
          messages: session.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        },
      });
    }
  );

  app.delete(
    "/consumer/:appNameId/chat/sessions/:sessionId",
    authMiddleware,
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const { sessionId } = c.req.param();

      const session = store.chatSessions.get(sessionId);
      if (!session || session.deletedAt) {
        return c.json({ error: "Session not found" }, 404);
      }

      if (
        session.applicationId !== resolvedApp.id ||
        session.consumerId !== consumer.id
      ) {
        return c.json({ error: "Session not found" }, 404);
      }

      session.deletedAt = new Date();

      return c.json({ success: true });
    }
  );

  app.patch(
    "/consumer/:appNameId/chat/sessions/:sessionId",
    authMiddleware,
    zValidator("json", z.object({ title: z.string().min(1).max(255) })),
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const { sessionId } = c.req.param();
      const body = c.req.valid("json");

      const session = store.chatSessions.get(sessionId);
      if (!session || session.deletedAt) {
        return c.json({ error: "Session not found" }, 404);
      }

      if (
        session.applicationId !== resolvedApp.id ||
        session.consumerId !== consumer.id
      ) {
        return c.json({ error: "Session not found" }, 404);
      }

      session.title = body.title;

      return c.json({
        data: {
          id: session.id,
          title: session.title,
          createdAt: session.startedAt.toISOString(),
        },
      });
    }
  );

  // ========================================
  // Bookmark Routes
  // ========================================

  app.get("/consumer/:appNameId/chat/bookmarks", authMiddleware, async (c) => {
    const consumer = c.get("consumer")!;
    const resolvedApp = c.get("app");

    const consumerBookmarks: MockBookmark[] = [];
    for (const bookmark of store.bookmarks.values()) {
      if (bookmark.consumerId === consumer.id) {
        consumerBookmarks.push(bookmark);
      }
    }

    return c.json({
      data: consumerBookmarks.map((b) => ({
        id: b.id,
        messageId: b.messageId,
        note: b.note,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  });

  app.post(
    "/consumer/:appNameId/chat/bookmarks",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        messageId: z.string().uuid(),
        note: z.string().max(1000).optional(),
      })
    ),
    async (c) => {
      const consumer = c.get("consumer")!;
      const body = c.req.valid("json");

      // Check if already bookmarked
      for (const bookmark of store.bookmarks.values()) {
        if (
          bookmark.consumerId === consumer.id &&
          bookmark.messageId === body.messageId
        ) {
          return c.json({ error: "Message already bookmarked" }, 409);
        }
      }

      const bookmark = store.createBookmark(
        consumer.id,
        body.messageId,
        body.note
      );

      return c.json({ data: bookmark }, 201);
    }
  );

  app.delete(
    "/consumer/:appNameId/chat/bookmarks/:bookmarkId",
    authMiddleware,
    async (c) => {
      const consumer = c.get("consumer")!;
      const { bookmarkId } = c.req.param();

      const bookmark = store.bookmarks.get(bookmarkId);
      if (!bookmark || bookmark.consumerId !== consumer.id) {
        return c.json({ error: "Bookmark not found" }, 404);
      }

      store.bookmarks.delete(bookmarkId);

      return c.json({ success: true });
    }
  );

  // ========================================
  // Custom Instructions Routes
  // ========================================

  app.get(
    "/consumer/:appNameId/chat/custom-instructions",
    authMiddleware,
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");

      return c.json({
        customInstructions: consumer.customInstructions,
        enabled: resolvedApp.customInstructionsEnabled,
      });
    }
  );

  app.post(
    "/consumer/:appNameId/chat/custom-instructions",
    authMiddleware,
    zValidator(
      "json",
      z.object({
        customInstructions: z.string().max(1000).nullable(),
      })
    ),
    async (c) => {
      const consumer = c.get("consumer")!;
      const resolvedApp = c.get("app");
      const body = c.req.valid("json");

      if (!resolvedApp.customInstructionsEnabled) {
        return c.json(
          { error: "Custom instructions are disabled for this app" },
          403
        );
      }

      consumer.customInstructions = body.customInstructions || null;

      return c.json({
        customInstructions: consumer.customInstructions,
        enabled: true,
      });
    }
  );

  return app;
}

// ========================================
// Auth Route Tests
// ========================================

Deno.test("POST /auth/signup - creates consumer with valid data", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    }),
  });

  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.success, true);
  assertEquals(data.requiresVerification, true);
  assertExists(data.consumerId);
});

Deno.test("POST /auth/signup - fails for existing email", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "existing@example.com",
  });

  const res = await app.request("/consumer/test-app/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "existing@example.com",
      password: "password123",
    }),
  });

  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data.error, "Email already registered");
});

Deno.test("POST /auth/signup - validates email format", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "not-an-email",
      password: "password123",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /auth/signup - validates password length", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "short",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /auth/verify - verifies OTP and creates session", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
  });
  store.otpCodes.set("test@example.com", "123456");

  const res = await app.request("/consumer/test-app/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      otpCode: "123456",
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.consumer);
  assertExists(data.sessionId);
});

Deno.test("POST /auth/verify - fails with invalid OTP", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
  });
  store.otpCodes.set("test@example.com", "123456");

  const res = await app.request("/consumer/test-app/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      otpCode: "wrong1",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /auth/login - logs in with valid credentials", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
    passwordHash: "hash:password123",
    emailVerified: true,
  });

  const res = await app.request("/consumer/test-app/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
  assertExists(data.sessionId);
});

Deno.test("POST /auth/login - fails with wrong password", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
    passwordHash: "hash:password123",
    emailVerified: true,
  });

  const res = await app.request("/consumer/test-app/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "wrongpassword",
    }),
  });

  assertEquals(res.status, 401);
});

Deno.test("POST /auth/login - fails for unverified email", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
    passwordHash: "hash:password123",
    emailVerified: false,
  });

  const res = await app.request("/consumer/test-app/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });

  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Email not verified");
});

Deno.test("POST /auth/magic-link - always returns success", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/auth/magic-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nonexistent@example.com" }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

Deno.test("POST /auth/logout - returns success", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/auth/logout", {
    method: "POST",
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

// ========================================
// App Info Route Tests
// ========================================

Deno.test("GET /app - returns app info with lead gen forms", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
    brandStyles: { primaryColor: "#ff0000" },
  });
  store.createLeadGenForm({
    applicationId: testApp.id,
    name: "Contact Form",
    active: true,
  });

  const res = await app.request("/consumer/test-app/app");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.name, "Test App");
  assertEquals(data.brandStyles.primaryColor, "#ff0000");
  assertEquals(Array.isArray(data.leadGenerationForms), true);
  assertEquals(data.leadGenerationForms.length, 1);
  assertEquals(data.leadGenerationForms[0].name, "Contact Form");
});

Deno.test("GET /app - returns 404 for non-existent app", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);

  const res = await app.request("/consumer/non-existent/app");

  assertEquals(res.status, 404);
});

Deno.test("GET /manifest - returns PWA manifest", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({
    name: "My PWA App",
    appNameId: "my-pwa",
    brandStyles: { primaryColor: "#0000ff", backgroundColor: "#ffffff" },
  });

  const res = await app.request("/consumer/my-pwa/manifest");

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/manifest+json");

  const data = await res.json();
  assertEquals(data.name, "My PWA App");
  assertEquals(data.theme_color, "#0000ff");
  assertEquals(data.background_color, "#ffffff");
  assertEquals(data.display, "standalone");
});

// ========================================
// Form Submission Tests
// ========================================

Deno.test("POST /forms/:formId/submissions - creates submission", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const form = store.createLeadGenForm({ applicationId: testApp.id });

  const res = await app.request(
    `/consumer/test-app/forms/${form.id}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formData: { email: "lead@example.com", name: "Lead User" },
        chatSessionId: crypto.randomUUID(),
      }),
    }
  );

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.message, "Form submission created successfully");
  assertExists(data.data.id);
});

Deno.test(
  "POST /forms/:formId/submissions - fails for non-existent form",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    store.createApplication({ name: "Test App", appNameId: "test-app" });

    const res = await app.request("/consumer/test-app/forms/9999/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formData: { email: "lead@example.com" },
        chatSessionId: crypto.randomUUID(),
      }),
    });

    assertEquals(res.status, 404);
  }
);

Deno.test(
  "POST /forms/:formId/submissions - fails for inactive form",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const form = store.createLeadGenForm({
      applicationId: testApp.id,
      active: false,
    });

    const res = await app.request(
      `/consumer/test-app/forms/${form.id}/submissions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formData: { email: "lead@example.com" },
          chatSessionId: crypto.randomUUID(),
        }),
      }
    );

    assertEquals(res.status, 404);
  }
);

// ========================================
// Protected Route Tests
// ========================================

Deno.test("GET /user/me - requires authentication", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  store.createApplication({ name: "Test App", appNameId: "test-app" });

  const res = await app.request("/consumer/test-app/user/me");

  assertEquals(res.status, 401);
});

Deno.test("GET /user/me - returns profile with valid session", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({
    applicationId: testApp.id,
    email: "test@example.com",
    name: "Test User",
    credits: 50,
  });
  const session = store.createSession(consumer.id, testApp.id);

  const res = await app.request("/consumer/test-app/user/me", {
    headers: { Cookie: `consumer_session_id=${session.id}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.email, "test@example.com");
  assertEquals(data.name, "Test User");
  assertEquals(data.credits, 50);
});

Deno.test("PATCH /user/me - updates profile", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({
    applicationId: testApp.id,
    name: "Old Name",
  });
  const session = store.createSession(consumer.id, testApp.id);

  const res = await app.request("/consumer/test-app/user/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: `consumer_session_id=${session.id}`,
    },
    body: JSON.stringify({ name: "New Name" }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.name, "New Name");
});

// ========================================
// Credits Route Tests
// ========================================

Deno.test("GET /credits/packages - returns available packages", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const session = store.createSession(consumer.id, testApp.id);
  store.createPackage({
    applicationId: testApp.id,
    name: "Small Pack",
    tokenQty: 100,
    price: 9.99,
  });
  store.createPackage({
    applicationId: testApp.id,
    name: "Large Pack",
    tokenQty: 500,
    price: 39.99,
  });

  const res = await app.request("/consumer/test-app/credits/packages", {
    headers: { Cookie: `consumer_session_id=${session.id}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 2);
  assertEquals(data.data[0].name, "Small Pack");
  assertEquals(data.data[0].credits, 100);
});

Deno.test("GET /credits/balance - returns credit balance", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({
    applicationId: testApp.id,
    credits: 250,
    subscriptionActive: true,
  });
  const session = store.createSession(consumer.id, testApp.id);

  const res = await app.request("/consumer/test-app/credits/balance", {
    headers: { Cookie: `consumer_session_id=${session.id}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.credits, 250);
  assertEquals(data.subscriptionActive, true);
  assertEquals(data.hasUnlimitedCredits, true);
});

// ========================================
// Chat Session Tests
// ========================================

Deno.test(
  "GET /chat/sessions - returns empty array when no sessions",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer = store.createConsumer({ applicationId: testApp.id });
    const session = store.createSession(consumer.id, testApp.id);

    const res = await app.request("/consumer/test-app/chat/sessions", {
      headers: { Cookie: `consumer_session_id=${session.id}` },
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.length, 0);
  }
);

Deno.test("GET /chat/sessions - returns consumer's sessions", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const session = store.createSession(consumer.id, testApp.id);
  store.createChatSession({
    applicationId: testApp.id,
    consumerId: consumer.id,
    title: "Chat 1",
  });
  store.createChatSession({
    applicationId: testApp.id,
    consumerId: consumer.id,
    title: "Chat 2",
  });

  const res = await app.request("/consumer/test-app/chat/sessions", {
    headers: { Cookie: `consumer_session_id=${session.id}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 2);
});

Deno.test("POST /chat/sessions - creates new chat session", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const session = store.createSession(consumer.id, testApp.id);

  const res = await app.request("/consumer/test-app/chat/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `consumer_session_id=${session.id}`,
    },
    body: JSON.stringify({ title: "My New Chat" }),
  });

  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.data.title, "My New Chat");
  assertExists(data.data.id);
});

Deno.test(
  "GET /chat/sessions/:sessionId - returns session with messages",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer = store.createConsumer({ applicationId: testApp.id });
    const authSession = store.createSession(consumer.id, testApp.id);
    const chatSession = store.createChatSession({
      applicationId: testApp.id,
      consumerId: consumer.id,
      title: "Test Chat",
    });
    store.addMessage(chatSession.id, "user", "Hello!");
    store.addMessage(chatSession.id, "assistant", "Hi there!");

    const res = await app.request(
      `/consumer/test-app/chat/sessions/${chatSession.id}`,
      {
        headers: { Cookie: `consumer_session_id=${authSession.id}` },
      }
    );

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.title, "Test Chat");
    assertEquals(data.data.messages.length, 2);
    assertEquals(data.data.messages[0].content, "Hello!");
  }
);

Deno.test(
  "GET /chat/sessions/:sessionId - returns 404 for other consumer's session",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer1 = store.createConsumer({ applicationId: testApp.id });
    const consumer2 = store.createConsumer({ applicationId: testApp.id });
    const authSession = store.createSession(consumer1.id, testApp.id);
    const chatSession = store.createChatSession({
      applicationId: testApp.id,
      consumerId: consumer2.id, // Different consumer
    });

    const res = await app.request(
      `/consumer/test-app/chat/sessions/${chatSession.id}`,
      {
        headers: { Cookie: `consumer_session_id=${authSession.id}` },
      }
    );

    assertEquals(res.status, 404);
  }
);

Deno.test("DELETE /chat/sessions/:sessionId - deletes session", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  const chatSession = store.createChatSession({
    applicationId: testApp.id,
    consumerId: consumer.id,
  });

  const res = await app.request(
    `/consumer/test-app/chat/sessions/${chatSession.id}`,
    {
      method: "DELETE",
      headers: { Cookie: `consumer_session_id=${authSession.id}` },
    }
  );

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);

  // Verify session is soft-deleted
  const deleted = store.chatSessions.get(chatSession.id);
  assertExists(deleted?.deletedAt);
});

Deno.test("PATCH /chat/sessions/:sessionId - renames session", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  const chatSession = store.createChatSession({
    applicationId: testApp.id,
    consumerId: consumer.id,
    title: "Old Title",
  });

  const res = await app.request(
    `/consumer/test-app/chat/sessions/${chatSession.id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `consumer_session_id=${authSession.id}`,
      },
      body: JSON.stringify({ title: "New Title" }),
    }
  );

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.title, "New Title");
});

// ========================================
// Bookmark Tests
// ========================================

Deno.test("GET /chat/bookmarks - returns consumer's bookmarks", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  store.createBookmark(consumer.id, crypto.randomUUID(), "My note");

  const res = await app.request("/consumer/test-app/chat/bookmarks", {
    headers: { Cookie: `consumer_session_id=${authSession.id}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].note, "My note");
});

Deno.test("POST /chat/bookmarks - creates bookmark", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  const messageId = crypto.randomUUID();

  const res = await app.request("/consumer/test-app/chat/bookmarks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `consumer_session_id=${authSession.id}`,
    },
    body: JSON.stringify({ messageId, note: "Important message" }),
  });

  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.data.messageId, messageId);
  assertEquals(data.data.note, "Important message");
});

Deno.test("POST /chat/bookmarks - fails for duplicate bookmark", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  const messageId = crypto.randomUUID();
  store.createBookmark(consumer.id, messageId);

  const res = await app.request("/consumer/test-app/chat/bookmarks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `consumer_session_id=${authSession.id}`,
    },
    body: JSON.stringify({ messageId }),
  });

  assertEquals(res.status, 409);
});

Deno.test("DELETE /chat/bookmarks/:bookmarkId - deletes bookmark", async () => {
  const store = createMockStore();
  const app = createConsumerTestApp(store);
  const testApp = store.createApplication({
    name: "Test App",
    appNameId: "test-app",
  });
  const consumer = store.createConsumer({ applicationId: testApp.id });
  const authSession = store.createSession(consumer.id, testApp.id);
  const bookmark = store.createBookmark(consumer.id, crypto.randomUUID());

  const res = await app.request(
    `/consumer/test-app/chat/bookmarks/${bookmark.id}`,
    {
      method: "DELETE",
      headers: { Cookie: `consumer_session_id=${authSession.id}` },
    }
  );

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

Deno.test(
  "DELETE /chat/bookmarks/:bookmarkId - fails for other consumer's bookmark",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer1 = store.createConsumer({ applicationId: testApp.id });
    const consumer2 = store.createConsumer({ applicationId: testApp.id });
    const authSession = store.createSession(consumer1.id, testApp.id);
    const bookmark = store.createBookmark(consumer2.id, crypto.randomUUID()); // Different consumer

    const res = await app.request(
      `/consumer/test-app/chat/bookmarks/${bookmark.id}`,
      {
        method: "DELETE",
        headers: { Cookie: `consumer_session_id=${authSession.id}` },
      }
    );

    assertEquals(res.status, 404);
  }
);

// ========================================
// Custom Instructions Tests
// ========================================

Deno.test(
  "GET /chat/custom-instructions - returns custom instructions",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer = store.createConsumer({
      applicationId: testApp.id,
      customInstructions: "Be concise",
    });
    const authSession = store.createSession(consumer.id, testApp.id);

    const res = await app.request(
      "/consumer/test-app/chat/custom-instructions",
      {
        headers: { Cookie: `consumer_session_id=${authSession.id}` },
      }
    );

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.customInstructions, "Be concise");
    assertEquals(data.enabled, true);
  }
);

Deno.test(
  "POST /chat/custom-instructions - updates custom instructions",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
    });
    const consumer = store.createConsumer({ applicationId: testApp.id });
    const authSession = store.createSession(consumer.id, testApp.id);

    const res = await app.request(
      "/consumer/test-app/chat/custom-instructions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `consumer_session_id=${authSession.id}`,
        },
        body: JSON.stringify({
          customInstructions: "Always respond in French",
        }),
      }
    );

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.customInstructions, "Always respond in French");
  }
);

Deno.test(
  "POST /chat/custom-instructions - fails when disabled for app",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);
    const testApp = store.createApplication({
      name: "Test App",
      appNameId: "test-app",
      customInstructionsEnabled: false,
    });
    const consumer = store.createConsumer({ applicationId: testApp.id });
    const authSession = store.createSession(consumer.id, testApp.id);

    const res = await app.request(
      "/consumer/test-app/chat/custom-instructions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `consumer_session_id=${authSession.id}`,
        },
        body: JSON.stringify({ customInstructions: "Test" }),
      }
    );

    assertEquals(res.status, 403);
  }
);

// ========================================
// Session Isolation Tests
// ========================================

Deno.test(
  "Session isolation - consumer can only access own sessions across apps",
  async () => {
    const store = createMockStore();
    const app = createConsumerTestApp(store);

    const app1 = store.createApplication({
      name: "App One",
      appNameId: "app-one",
    });
    const app2 = store.createApplication({
      name: "App Two",
      appNameId: "app-two",
    });

    const consumer1 = store.createConsumer({ applicationId: app1.id });
    const consumer2 = store.createConsumer({ applicationId: app2.id });

    const session1 = store.createSession(consumer1.id, app1.id);
    const chatSession1 = store.createChatSession({
      applicationId: app1.id,
      consumerId: consumer1.id,
      title: "Consumer 1 Chat",
    });

    // Consumer 1 can access their own chat
    const res1 = await app.request(
      `/consumer/app-one/chat/sessions/${chatSession1.id}`,
      {
        headers: { Cookie: `consumer_session_id=${session1.id}` },
      }
    );
    assertEquals(res1.status, 200);

    // Consumer 1's session doesn't work on app-two
    const res2 = await app.request("/consumer/app-two/chat/sessions", {
      headers: { Cookie: `consumer_session_id=${session1.id}` },
    });
    assertEquals(res2.status, 401);
  }
);
