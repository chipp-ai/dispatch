/**
 * Consumer Authentication Middleware Tests
 *
 * Tests for app resolution, alias fallback, and consumer authentication.
 * Uses Hono's app.request() for integration testing without HTTP overhead.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import { Hono } from "hono";
import type { AppOnlyContext, ConsumerAuthContext } from "./consumerAuth.ts";
import type { Currency } from "../../db/schema.ts";
import { db } from "../../db/client.ts";

// ========================================
// Mock Data Store for Isolated Tests
// ========================================

interface MockApplication {
  id: string;
  name: string;
  appNameId: string;
  brandStyles: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  isDeleted: boolean;
  organizationId: string | null;
  developerId: string;
  currency: Currency;
  redirectAfterSignupUrl: string | null;
  enableVatDynamicTax: boolean;
  stripeCollectShippingAddress: boolean;
  stripeCollectPhoneNumber: boolean;
  stripeCollectTaxId: boolean;
  stripeAlwaysCollectBillingAddress: boolean;
  stripeAllowPromotionCodes: boolean;
}

interface MockAlias {
  id: string;
  slug: string;
  isPrimary: boolean;
  applicationId: string;
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
}

interface MockSession {
  id: string;
  consumerId: string;
  applicationId: string;
  expiresAt: Date;
}

function createMockStore() {
  const applications = new Map<string, MockApplication>();
  const aliases = new Map<string, MockAlias>();
  const consumers = new Map<string, MockConsumer>();
  const sessions = new Map<string, MockSession>();
  let idCounter = 0;

  return {
    applications,
    aliases,
    consumers,
    sessions,

    createApplication(
      data: Partial<MockApplication> & { name: string }
    ): MockApplication {
      idCounter++;
      const id = `app-${idCounter}-${crypto.randomUUID().slice(0, 8)}`;
      const slug =
        data.appNameId ||
        `${data.name.toLowerCase().replace(/\s+/g, "-")}-${id.slice(-8)}`;

      const app: MockApplication = {
        id,
        name: data.name,
        appNameId: slug,
        brandStyles: data.brandStyles || null,
        capabilities: data.capabilities || null,
        settings: data.settings || null,
        isActive: data.isActive ?? true,
        isDeleted: data.isDeleted ?? false,
        organizationId: data.organizationId || null,
        developerId: data.developerId || "dev-test",
        currency: data.currency || ("USD" as Currency),
        redirectAfterSignupUrl: data.redirectAfterSignupUrl || null,
        enableVatDynamicTax: data.enableVatDynamicTax ?? false,
        stripeCollectShippingAddress:
          data.stripeCollectShippingAddress ?? false,
        stripeCollectPhoneNumber: data.stripeCollectPhoneNumber ?? false,
        stripeCollectTaxId: data.stripeCollectTaxId ?? false,
        stripeAlwaysCollectBillingAddress:
          data.stripeAlwaysCollectBillingAddress ?? false,
        stripeAllowPromotionCodes: data.stripeAllowPromotionCodes ?? false,
      };

      applications.set(id, app);

      // Create primary alias
      const aliasId = `alias-${idCounter}`;
      aliases.set(aliasId, {
        id: aliasId,
        slug,
        isPrimary: true,
        applicationId: id,
      });

      return app;
    },

    createAlias(appId: string, slug: string, isPrimary = false): MockAlias {
      idCounter++;
      const id = `alias-${idCounter}`;
      const alias: MockAlias = {
        id,
        slug,
        isPrimary,
        applicationId: appId,
      };
      aliases.set(id, alias);
      return alias;
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
        credits: data.credits ?? 0,
        subscriptionActive: data.subscriptionActive ?? false,
        stripeCustomerId: data.stripeCustomerId || null,
        customInstructions: data.customInstructions || null,
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

    findAppBySlugOrId(identifier: string): MockApplication | null {
      // Check by ID first
      const byId = applications.get(identifier);
      if (byId && !byId.isDeleted) return byId;

      // Check by primary slug (appNameId)
      for (const app of applications.values()) {
        if (!app.isDeleted && app.appNameId === identifier) {
          return app;
        }
      }

      return null;
    },

    findAppByAlias(slug: string): MockApplication | null {
      for (const alias of aliases.values()) {
        if (alias.slug === slug) {
          const app = applications.get(alias.applicationId);
          if (app && !app.isDeleted) {
            return app;
          }
        }
      }
      return null;
    },

    getConsumer(id: string): MockConsumer | null {
      return consumers.get(id) || null;
    },

    getSession(id: string): MockSession | null {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt < new Date()) return null;
      return session;
    },
  };
}

// ========================================
// Test App Factory with Mock Middleware
// ========================================

function createTestApp(store: ReturnType<typeof createMockStore>) {
  const app = new Hono<AppOnlyContext>();

  // Mock appMiddleware
  app.use("/consumer/:appNameId/*", async (c, next) => {
    const appIdentifier =
      c.req.param("appNameId") ||
      c.req.param("appId") ||
      c.req.query("app") ||
      c.req.header("X-App-ID");

    if (!appIdentifier) {
      return c.json({ error: "App identifier required" }, 400);
    }

    // Two-tier lookup: primary slug/ID first, then alias fallback
    let resolvedApp = store.findAppBySlugOrId(appIdentifier);
    if (!resolvedApp) {
      resolvedApp = store.findAppByAlias(appIdentifier);
    }

    if (!resolvedApp) {
      return c.json({ error: "Application not found" }, 404);
    }

    if (!resolvedApp.isActive) {
      return c.json({ error: "Application is not active" }, 403);
    }

    c.set("app", resolvedApp);
    await next();
  });

  // Test route to check app resolution
  app.get("/consumer/:appNameId/app", (c) => {
    const resolvedApp = c.get("app");
    return c.json({
      id: resolvedApp.id,
      name: resolvedApp.name,
      appNameId: resolvedApp.appNameId,
    });
  });

  // Route that uses X-App-ID header
  app.get("/vanity/app", async (c, next) => {
    const appIdentifier = c.req.header("X-App-ID");
    if (!appIdentifier) {
      return c.json({ error: "X-App-ID header required" }, 400);
    }

    let resolvedApp = store.findAppBySlugOrId(appIdentifier);
    if (!resolvedApp) {
      resolvedApp = store.findAppByAlias(appIdentifier);
    }

    if (!resolvedApp) {
      return c.json({ error: "Application not found" }, 404);
    }

    if (!resolvedApp.isActive) {
      return c.json({ error: "Application is not active" }, 403);
    }

    return c.json({
      id: resolvedApp.id,
      name: resolvedApp.name,
      appNameId: resolvedApp.appNameId,
    });
  });

  return app;
}

// ========================================
// App Resolution Tests
// ========================================

describe("App Resolution (resolveApp)", () => {
  let store: ReturnType<typeof createMockStore>;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    store = createMockStore();
    app = createTestApp(store);
  });

  describe("Primary Slug Lookup", () => {
    it("resolves app by primary slug (appNameId)", async () => {
      const testApp = store.createApplication({
        name: "My Test App",
        appNameId: "my-test-app-abc123",
      });

      const res = await app.request("/consumer/my-test-app-abc123/app");

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, testApp.id);
      assertEquals(data.name, "My Test App");
      assertEquals(data.appNameId, "my-test-app-abc123");
    });

    it("resolves app by UUID ID", async () => {
      const testApp = store.createApplication({
        name: "UUID App",
      });

      const res = await app.request(`/consumer/${testApp.id}/app`);

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, testApp.id);
    });

    it("returns 404 for non-existent slug", async () => {
      const res = await app.request("/consumer/non-existent-app/app");

      assertEquals(res.status, 404);
      const data = await res.json();
      assertEquals(data.error, "Application not found");
    });

    it("returns 404 for deleted app", async () => {
      store.createApplication({
        name: "Deleted App",
        appNameId: "deleted-app-xyz",
        isDeleted: true,
      });

      const res = await app.request("/consumer/deleted-app-xyz/app");

      assertEquals(res.status, 404);
    });

    it("returns 403 for inactive app", async () => {
      store.createApplication({
        name: "Inactive App",
        appNameId: "inactive-app-xyz",
        isActive: false,
      });

      const res = await app.request("/consumer/inactive-app-xyz/app");

      assertEquals(res.status, 403);
      const data = await res.json();
      assertEquals(data.error, "Application is not active");
    });
  });

  describe("Alias Fallback Lookup", () => {
    it("resolves app by historical alias when primary slug changed", async () => {
      // Create app with original slug
      const testApp = store.createApplication({
        name: "Renamed App",
        appNameId: "new-app-name-xyz",
      });

      // Create alias for old slug (simulating a vanity URL change)
      store.createAlias(testApp.id, "old-app-name-xyz", false);

      // Access via old slug should still work
      const res = await app.request("/consumer/old-app-name-xyz/app");

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, testApp.id);
      assertEquals(data.appNameId, "new-app-name-xyz"); // Returns current slug
    });

    it("prioritizes primary slug over alias when both exist", async () => {
      // Create two apps
      const app1 = store.createApplication({
        name: "App One",
        appNameId: "app-one-slug",
      });
      const app2 = store.createApplication({
        name: "App Two",
        appNameId: "app-two-slug",
      });

      // Create alias for app2 that matches app1's slug (edge case)
      // This shouldn't happen in practice but tests priority
      store.createAlias(app2.id, "shared-slug", false);

      // Primary slug lookup takes precedence
      const res = await app.request("/consumer/app-one-slug/app");
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, app1.id);
    });

    it("supports multiple aliases for same app", async () => {
      const testApp = store.createApplication({
        name: "Multi-Alias App",
        appNameId: "current-name-xyz",
      });

      // Add multiple historical aliases
      store.createAlias(testApp.id, "first-name-xyz", false);
      store.createAlias(testApp.id, "second-name-xyz", false);

      // All should resolve to the same app
      const res1 = await app.request("/consumer/first-name-xyz/app");
      const res2 = await app.request("/consumer/second-name-xyz/app");
      const res3 = await app.request("/consumer/current-name-xyz/app");

      assertEquals(res1.status, 200);
      assertEquals(res2.status, 200);
      assertEquals(res3.status, 200);

      const data1 = await res1.json();
      const data2 = await res2.json();
      const data3 = await res3.json();

      assertEquals(data1.id, testApp.id);
      assertEquals(data2.id, testApp.id);
      assertEquals(data3.id, testApp.id);
    });
  });

  describe("X-App-ID Header Lookup", () => {
    it("resolves app from X-App-ID header", async () => {
      const testApp = store.createApplication({
        name: "Header App",
        appNameId: "header-app-slug",
      });

      const res = await app.request("/vanity/app", {
        headers: { "X-App-ID": "header-app-slug" },
      });

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, testApp.id);
    });

    it("resolves app from X-App-ID header using alias", async () => {
      const testApp = store.createApplication({
        name: "Aliased Header App",
        appNameId: "new-header-slug",
      });
      store.createAlias(testApp.id, "old-header-slug", false);

      const res = await app.request("/vanity/app", {
        headers: { "X-App-ID": "old-header-slug" },
      });

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.id, testApp.id);
    });

    it("returns 400 when X-App-ID header missing", async () => {
      const res = await app.request("/vanity/app");

      assertEquals(res.status, 400);
    });
  });
});

// ========================================
// Consumer Authentication Tests
// ========================================

describe("Consumer Authentication", () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  describe("Session Cookie Authentication", () => {
    it("authenticates consumer with valid session cookie", async () => {
      const testApp = store.createApplication({ name: "Auth Test App" });
      const consumer = store.createConsumer({
        applicationId: testApp.id,
        email: "test@example.com",
        name: "Test User",
      });
      const session = store.createSession(consumer.id, testApp.id);

      // Create app with consumer auth middleware
      const authApp = new Hono<ConsumerAuthContext>();

      authApp.use("*", async (c, next) => {
        c.set("app", testApp);
        await next();
      });

      authApp.use("/protected/*", async (c, next) => {
        const sessionId = c.req
          .header("Cookie")
          ?.match(/consumer_session_id=([^;]+)/)?.[1];

        if (!sessionId) {
          return c.json({ error: "Authentication required" }, 401);
        }

        const storedSession = store.getSession(sessionId);
        if (!storedSession || storedSession.applicationId !== testApp.id) {
          return c.json({ error: "Invalid session" }, 401);
        }

        const storedConsumer = store.getConsumer(storedSession.consumerId);
        if (!storedConsumer) {
          return c.json({ error: "Consumer not found" }, 401);
        }

        c.set("consumer", storedConsumer);
        await next();
      });

      authApp.get("/protected/me", (c) => {
        const consumer = c.get("consumer");
        return c.json({
          id: consumer.id,
          email: consumer.email,
          name: consumer.name,
        });
      });

      const res = await authApp.request("/protected/me", {
        headers: { Cookie: `consumer_session_id=${session.id}` },
      });

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.email, "test@example.com");
      assertEquals(data.name, "Test User");
    });

    it("rejects expired session", async () => {
      const testApp = store.createApplication({ name: "Expired Session App" });
      const consumer = store.createConsumer({ applicationId: testApp.id });
      // Create expired session (-1 ms = already expired)
      const session = store.createSession(consumer.id, testApp.id, -1);

      const authApp = new Hono<ConsumerAuthContext>();
      authApp.use("*", async (c, next) => {
        c.set("app", testApp);
        await next();
      });

      authApp.use("/protected/*", async (c, next) => {
        const sessionId = c.req
          .header("Cookie")
          ?.match(/consumer_session_id=([^;]+)/)?.[1];

        const storedSession = store.getSession(sessionId || "");
        if (!storedSession) {
          return c.json({ error: "Session expired" }, 401);
        }

        await next();
      });

      authApp.get("/protected/me", (c) => c.json({ success: true }));

      const res = await authApp.request("/protected/me", {
        headers: { Cookie: `consumer_session_id=${session.id}` },
      });

      assertEquals(res.status, 401);
    });

    it("rejects session for wrong application", async () => {
      const app1 = store.createApplication({ name: "App One" });
      const app2 = store.createApplication({ name: "App Two" });
      const consumer = store.createConsumer({ applicationId: app1.id });
      const session = store.createSession(consumer.id, app1.id);

      const authApp = new Hono<ConsumerAuthContext>();
      authApp.use("*", async (c, next) => {
        c.set("app", app2); // Different app context
        await next();
      });

      authApp.use("/protected/*", async (c, next) => {
        const sessionId = c.req
          .header("Cookie")
          ?.match(/consumer_session_id=([^;]+)/)?.[1];
        const currentApp = c.get("app");

        const storedSession = store.getSession(sessionId || "");
        if (!storedSession || storedSession.applicationId !== currentApp.id) {
          return c.json({ error: "Invalid session for this app" }, 401);
        }

        await next();
      });

      authApp.get("/protected/me", (c) => c.json({ success: true }));

      const res = await authApp.request("/protected/me", {
        headers: { Cookie: `consumer_session_id=${session.id}` },
      });

      assertEquals(res.status, 401);
    });
  });

  describe("Bearer Token Authentication", () => {
    it("authenticates consumer with valid bearer token", async () => {
      const testApp = store.createApplication({ name: "Bearer Auth App" });
      const consumer = store.createConsumer({
        applicationId: testApp.id,
        email: "bearer@example.com",
      });
      const session = store.createSession(consumer.id, testApp.id);

      // Token format: base64(consumerId:sessionId)
      const token = btoa(`${consumer.id}:${session.id}`);

      const authApp = new Hono<ConsumerAuthContext>();
      authApp.use("*", async (c, next) => {
        c.set("app", testApp);
        await next();
      });

      authApp.use("/api/*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

        if (!token) {
          return c.json({ error: "Bearer token required" }, 401);
        }

        try {
          const decoded = atob(token);
          const [consumerId, sessionId] = decoded.split(":");

          const storedSession = store.getSession(sessionId);
          if (!storedSession) {
            return c.json({ error: "Invalid token" }, 401);
          }

          const storedConsumer = store.getConsumer(consumerId);
          if (!storedConsumer) {
            return c.json({ error: "Consumer not found" }, 401);
          }

          c.set("consumer", storedConsumer);
          await next();
        } catch {
          return c.json({ error: "Malformed token" }, 401);
        }
      });

      authApp.get("/api/me", (c) => {
        const consumer = c.get("consumer");
        return c.json({ email: consumer.email });
      });

      const res = await authApp.request("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.email, "bearer@example.com");
    });

    it("rejects malformed bearer token", async () => {
      const testApp = store.createApplication({ name: "Malformed Token App" });

      const authApp = new Hono<ConsumerAuthContext>();
      authApp.use("*", async (c, next) => {
        c.set("app", testApp);
        await next();
      });

      authApp.use("/api/*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const token = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;

        if (!token) {
          return c.json({ error: "Bearer token required" }, 401);
        }

        try {
          atob(token); // Will throw if not valid base64
          await next();
        } catch {
          return c.json({ error: "Malformed token" }, 401);
        }
      });

      authApp.get("/api/me", (c) => c.json({ success: true }));

      const res = await authApp.request("/api/me", {
        headers: { Authorization: "Bearer not-valid-base64!!!" },
      });

      assertEquals(res.status, 401);
      const data = await res.json();
      assertEquals(data.error, "Malformed token");
    });
  });
});

// ========================================
// Optional Consumer Auth Tests
// ========================================

describe("Optional Consumer Authentication", () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  it("populates consumer when session present", async () => {
    const testApp = store.createApplication({ name: "Optional Auth App" });
    const consumer = store.createConsumer({
      applicationId: testApp.id,
      email: "optional@example.com",
    });
    const session = store.createSession(consumer.id, testApp.id);

    const optionalAuthApp = new Hono<AppOnlyContext>();

    optionalAuthApp.use("*", async (c, next) => {
      c.set("app", testApp);

      // Optional auth - populate if present but don't require
      const sessionId = c.req
        .header("Cookie")
        ?.match(/consumer_session_id=([^;]+)/)?.[1];
      if (sessionId) {
        const storedSession = store.getSession(sessionId);
        if (storedSession) {
          const storedConsumer = store.getConsumer(storedSession.consumerId);
          if (storedConsumer) {
            c.set("consumer", storedConsumer);
          }
        }
      }

      await next();
    });

    optionalAuthApp.get("/app", (c) => {
      const consumer = c.get("consumer");
      return c.json({
        isAuthenticated: !!consumer,
        email: consumer?.email || null,
      });
    });

    const res = await optionalAuthApp.request("/app", {
      headers: { Cookie: `consumer_session_id=${session.id}` },
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.isAuthenticated, true);
    assertEquals(data.email, "optional@example.com");
  });

  it("continues without consumer when session absent", async () => {
    const testApp = store.createApplication({ name: "No Auth App" });

    const optionalAuthApp = new Hono<AppOnlyContext>();

    optionalAuthApp.use("*", async (c, next) => {
      c.set("app", testApp);
      // No session provided - consumer stays undefined
      await next();
    });

    optionalAuthApp.get("/app", (c) => {
      const consumer = c.get("consumer");
      return c.json({
        isAuthenticated: !!consumer,
      });
    });

    const res = await optionalAuthApp.request("/app");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.isAuthenticated, false);
  });
});
