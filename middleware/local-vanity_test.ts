/**
 * Local Vanity URL Middleware Tests
 *
 * Tests for subdomain extraction, path rewriting, and internal forwarding.
 * Uses Hono's app.request() for integration testing.
 */

import { assertEquals, assertExists } from "@std/assert";
import { describe, it, beforeEach, afterEach } from "jsr:@std/testing/bdd";
import { Hono } from "hono";
import type { Context } from "hono";

// Type for vanity middleware context variables
interface VanityContextEnv {
  Variables: {
    vanityAppSlug: string | null;
    rewrittenPath: string | null;
  };
}

// ========================================
// Unit Tests for Helper Functions
// ========================================

/**
 * Extract app slug from subdomain
 * (Copy of the logic from local-vanity.ts for unit testing)
 */
function extractAppSlug(host: string, baseHost: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0];

  // Check if it ends with the base host
  if (!hostWithoutPort.endsWith(baseHost)) {
    return null;
  }

  // If the host is exactly the base host (no subdomain), return null
  if (hostWithoutPort === baseHost) {
    return null;
  }

  // Ensure there's a dot separator before the base host (proper subdomain format)
  const expectedDotPosition = hostWithoutPort.length - baseHost.length - 1;
  if (expectedDotPosition < 0 || hostWithoutPort[expectedDotPosition] !== ".") {
    return null;
  }

  // Extract subdomain (everything before the dot)
  const subdomain = hostWithoutPort.slice(0, expectedDotPosition);

  // No subdomain (e.g., just ".localhost")
  if (!subdomain || subdomain.length === 0) {
    return null;
  }

  return subdomain;
}

/**
 * Path mappings from vanity paths to consumer routes
 */
const VANITY_PATH_MAPPINGS: Record<string, string> = {
  "/chat": "/consumer/:appSlug/chat",
  "/app": "/consumer/:appSlug/app",
  "/manifest": "/consumer/:appSlug/manifest",
  "/auth/signup": "/consumer/:appSlug/auth/signup",
  "/auth/login": "/consumer/:appSlug/auth/login",
  "/auth/verify": "/consumer/:appSlug/auth/verify",
  "/auth/logout": "/consumer/:appSlug/auth/logout",
  "/auth/magic-link": "/consumer/:appSlug/auth/magic-link",
  "/auth/magic-link/verify": "/consumer/:appSlug/auth/magic-link/verify",
  "/auth/password-reset": "/consumer/:appSlug/auth/password-reset",
  "/auth/password-reset/confirm":
    "/consumer/:appSlug/auth/password-reset/confirm",
  "/auth/resend-otp": "/consumer/:appSlug/auth/resend-otp",
  "/user/me": "/consumer/:appSlug/user/me",
};

/**
 * Get rewritten path for vanity URL
 */
function getRewrittenPath(path: string, appSlug: string): string | null {
  // Check exact matches first
  for (const [vanityPath, consumerPath] of Object.entries(
    VANITY_PATH_MAPPINGS
  )) {
    if (path === vanityPath) {
      return consumerPath.replace(":appSlug", appSlug);
    }
  }

  // Check prefix matches
  if (path.startsWith("/chat/")) {
    return `/consumer/${appSlug}${path}`;
  }
  if (path.startsWith("/user/")) {
    return `/consumer/${appSlug}${path}`;
  }
  if (path.startsWith("/auth/")) {
    return `/consumer/${appSlug}${path}`;
  }

  return null;
}

// ========================================
// Subdomain Extraction Tests
// ========================================

describe("Subdomain Extraction (extractAppSlug)", () => {
  describe("Valid Subdomains", () => {
    it("extracts simple subdomain from localhost", () => {
      const slug = extractAppSlug("myapp.localhost", "localhost");
      assertEquals(slug, "myapp");
    });

    it("extracts subdomain with port number", () => {
      const slug = extractAppSlug("myapp.localhost:8000", "localhost");
      assertEquals(slug, "myapp");
    });

    it("extracts hyphenated subdomain", () => {
      const slug = extractAppSlug("my-awesome-app.localhost:8000", "localhost");
      assertEquals(slug, "my-awesome-app");
    });

    it("extracts subdomain with numbers", () => {
      const slug = extractAppSlug("app123.localhost:8000", "localhost");
      assertEquals(slug, "app123");
    });

    it("extracts subdomain from custom base host", () => {
      const slug = extractAppSlug("myapp.dev.local:3000", "dev.local");
      assertEquals(slug, "myapp");
    });

    it("extracts nested subdomain", () => {
      const slug = extractAppSlug("staging.myapp.localhost:8000", "localhost");
      assertEquals(slug, "staging.myapp");
    });
  });

  describe("No Subdomain Cases", () => {
    it("returns null for bare localhost", () => {
      const slug = extractAppSlug("localhost", "localhost");
      assertEquals(slug, null);
    });

    it("returns null for localhost with port", () => {
      const slug = extractAppSlug("localhost:8000", "localhost");
      assertEquals(slug, null);
    });

    it("returns null for different domain", () => {
      const slug = extractAppSlug("example.com:8000", "localhost");
      assertEquals(slug, null);
    });

    it("returns null for partial match (not ending with base host)", () => {
      const slug = extractAppSlug("localhostnot", "localhost");
      assertEquals(slug, null);
    });
  });

  describe("Edge Cases", () => {
    it("handles single character subdomain", () => {
      const slug = extractAppSlug("a.localhost:8000", "localhost");
      assertEquals(slug, "a");
    });

    it("handles subdomain with underscore", () => {
      const slug = extractAppSlug("my_app.localhost:8000", "localhost");
      assertEquals(slug, "my_app");
    });

    it("handles long subdomain", () => {
      const longSlug = "very-long-application-name-that-is-quite-lengthy";
      const slug = extractAppSlug(`${longSlug}.localhost:8000`, "localhost");
      assertEquals(slug, longSlug);
    });
  });
});

// ========================================
// Path Rewriting Tests
// ========================================

describe("Path Rewriting (getRewrittenPath)", () => {
  const appSlug = "myapp";

  describe("Exact Path Matches", () => {
    it("rewrites /chat to /consumer/:appSlug/chat", () => {
      const path = getRewrittenPath("/chat", appSlug);
      assertEquals(path, "/consumer/myapp/chat");
    });

    it("rewrites /app to /consumer/:appSlug/app", () => {
      const path = getRewrittenPath("/app", appSlug);
      assertEquals(path, "/consumer/myapp/app");
    });

    it("rewrites /manifest to /consumer/:appSlug/manifest", () => {
      const path = getRewrittenPath("/manifest", appSlug);
      assertEquals(path, "/consumer/myapp/manifest");
    });

    it("rewrites /user/me to /consumer/:appSlug/user/me", () => {
      const path = getRewrittenPath("/user/me", appSlug);
      assertEquals(path, "/consumer/myapp/user/me");
    });
  });

  describe("Auth Routes", () => {
    it("rewrites /auth/login", () => {
      const path = getRewrittenPath("/auth/login", appSlug);
      assertEquals(path, "/consumer/myapp/auth/login");
    });

    it("rewrites /auth/signup", () => {
      const path = getRewrittenPath("/auth/signup", appSlug);
      assertEquals(path, "/consumer/myapp/auth/signup");
    });

    it("rewrites /auth/verify", () => {
      const path = getRewrittenPath("/auth/verify", appSlug);
      assertEquals(path, "/consumer/myapp/auth/verify");
    });

    it("rewrites /auth/logout", () => {
      const path = getRewrittenPath("/auth/logout", appSlug);
      assertEquals(path, "/consumer/myapp/auth/logout");
    });

    it("rewrites /auth/magic-link", () => {
      const path = getRewrittenPath("/auth/magic-link", appSlug);
      assertEquals(path, "/consumer/myapp/auth/magic-link");
    });

    it("rewrites /auth/magic-link/verify", () => {
      const path = getRewrittenPath("/auth/magic-link/verify", appSlug);
      assertEquals(path, "/consumer/myapp/auth/magic-link/verify");
    });

    it("rewrites /auth/password-reset", () => {
      const path = getRewrittenPath("/auth/password-reset", appSlug);
      assertEquals(path, "/consumer/myapp/auth/password-reset");
    });

    it("rewrites /auth/password-reset/confirm", () => {
      const path = getRewrittenPath("/auth/password-reset/confirm", appSlug);
      assertEquals(path, "/consumer/myapp/auth/password-reset/confirm");
    });

    it("rewrites /auth/resend-otp", () => {
      const path = getRewrittenPath("/auth/resend-otp", appSlug);
      assertEquals(path, "/consumer/myapp/auth/resend-otp");
    });
  });

  describe("Prefix Path Matches", () => {
    it("rewrites /chat/* paths", () => {
      const path = getRewrittenPath("/chat/session/abc123", appSlug);
      assertEquals(path, "/consumer/myapp/chat/session/abc123");
    });

    it("rewrites /user/* paths", () => {
      const path = getRewrittenPath("/user/profile", appSlug);
      assertEquals(path, "/consumer/myapp/user/profile");
    });

    it("rewrites /auth/* paths not in exact mappings", () => {
      const path = getRewrittenPath("/auth/custom-endpoint", appSlug);
      assertEquals(path, "/consumer/myapp/auth/custom-endpoint");
    });

    it("preserves query-like segments in path", () => {
      const path = getRewrittenPath("/chat/session/abc?foo=bar", appSlug);
      // Note: actual query strings are URL encoded, this tests path-like segment
      assertEquals(path, "/consumer/myapp/chat/session/abc?foo=bar");
    });
  });

  describe("Non-Matching Paths", () => {
    it("returns null for /health", () => {
      const path = getRewrittenPath("/health", appSlug);
      assertEquals(path, null);
    });

    it("returns null for /api/*", () => {
      const path = getRewrittenPath("/api/workspaces", appSlug);
      assertEquals(path, null);
    });

    it("returns null for /webhooks/*", () => {
      const path = getRewrittenPath("/webhooks/stripe", appSlug);
      assertEquals(path, null);
    });

    it("returns null for root path", () => {
      const path = getRewrittenPath("/", appSlug);
      assertEquals(path, null);
    });

    it("returns null for /ws", () => {
      const path = getRewrittenPath("/ws", appSlug);
      assertEquals(path, null);
    });
  });
});

// ========================================
// Integration Tests with Hono App
// ========================================

describe("Local Vanity Middleware Integration", () => {
  // Simulates the vanity middleware behavior
  function createVanityTestApp() {
    const app = new Hono<VanityContextEnv>();

    // Track forwarded requests
    const forwardedRequests: Array<{
      originalHost: string;
      originalPath: string;
      rewrittenPath: string;
      appSlug: string;
    }> = [];

    // Mock vanity middleware
    app.use("*", async (c, next) => {
      const baseHost = "localhost";
      const host = c.req.header("host") || new URL(c.req.url).host;

      if (!host) {
        await next();
        return;
      }

      const appSlug = extractAppSlug(host, baseHost);

      if (appSlug) {
        // Store app ID in context (headers may be immutable in test mode)
        c.set("xAppId", appSlug);
        c.set("vanityAppSlug", appSlug);

        const originalPath = new URL(c.req.url).pathname;
        const rewrittenPath = getRewrittenPath(originalPath, appSlug);

        if (rewrittenPath) {
          forwardedRequests.push({
            originalHost: host,
            originalPath,
            rewrittenPath,
            appSlug,
          });

          // Simulate internal forwarding by setting a marker
          c.set("rewrittenPath", rewrittenPath);
        }
      }

      await next();
    });

    // Consumer routes (what vanity URLs map to)
    app.get("/consumer/:appSlug/app", (c) => {
      return c.json({
        appSlug: c.req.param("appSlug"),
        path: "/consumer/:appSlug/app",
        fromVanity: !!c.get("vanityAppSlug"),
      });
    });

    app.get("/consumer/:appSlug/chat", (c) => {
      return c.json({
        appSlug: c.req.param("appSlug"),
        path: "/consumer/:appSlug/chat",
        fromVanity: !!c.get("vanityAppSlug"),
      });
    });

    app.post("/consumer/:appSlug/auth/login", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return c.json({
        appSlug: c.req.param("appSlug"),
        path: "/consumer/:appSlug/auth/login",
        body,
      });
    });

    // Test endpoint to check vanity resolution
    app.get("/test/vanity-info", (c) => {
      return c.json({
        vanityAppSlug: c.get("vanityAppSlug") || null,
        xAppId: c.get("xAppId") || null,
        rewrittenPath: c.get("rewrittenPath") || null,
      });
    });

    // Health check (should not be rewritten)
    app.get("/health", (c) => {
      return c.json({ status: "ok" });
    });

    // Catch-all: return vanity info for paths that would be rewritten
    app.all("*", (c) => {
      const rewrittenPath = c.get("rewrittenPath");
      if (rewrittenPath) {
        return c.json({
          vanityAppSlug: c.get("vanityAppSlug") || null,
          xAppId: c.get("xAppId") || null,
          rewrittenPath,
        });
      }
      return c.json({ error: "Not found" }, 404);
    });

    return { app, forwardedRequests };
  }

  describe("Subdomain Detection", () => {
    it("detects app slug from subdomain and sets X-App-ID", async () => {
      const { app } = createVanityTestApp();

      const res = await app.request(
        "http://myapp.localhost:8000/test/vanity-info"
      );

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.vanityAppSlug, "myapp");
      assertEquals(data.xAppId, "myapp");
    });

    it("does not set vanity context for plain localhost", async () => {
      const { app } = createVanityTestApp();

      const res = await app.request("http://localhost:8000/test/vanity-info");

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.vanityAppSlug, null);
      assertEquals(data.xAppId, null);
    });
  });

  describe("Path Rewriting Detection", () => {
    it("identifies /chat as needing rewrite to /consumer/:appSlug/chat", async () => {
      const { app } = createVanityTestApp();

      const res = await app.request("http://myapp.localhost:8000/chat");

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.rewrittenPath, "/consumer/myapp/chat");
    });

    it("identifies /app as needing rewrite", async () => {
      const { app } = createVanityTestApp();

      const res = await app.request("http://myapp.localhost:8000/app");

      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.rewrittenPath, "/consumer/myapp/app");
    });

    it("does not rewrite /health endpoint", async () => {
      const { app } = createVanityTestApp();

      const res = await app.request("http://myapp.localhost:8000/health");

      assertEquals(res.status, 200);
      const data = await res.json();
      // /health returns { status: "ok" }, not vanity info
      assertEquals(data.status, "ok");
    });
  });

  describe("Request Tracking", () => {
    it("tracks forwarded vanity requests", async () => {
      const { app, forwardedRequests } = createVanityTestApp();

      await app.request("http://testapp.localhost:8000/chat");

      assertEquals(forwardedRequests.length, 1);
      assertEquals(forwardedRequests[0].originalHost, "testapp.localhost:8000");
      assertEquals(forwardedRequests[0].originalPath, "/chat");
      assertEquals(
        forwardedRequests[0].rewrittenPath,
        "/consumer/testapp/chat"
      );
      assertEquals(forwardedRequests[0].appSlug, "testapp");
    });

    it("does not track non-rewritable paths", async () => {
      const { app, forwardedRequests } = createVanityTestApp();

      await app.request("http://testapp.localhost:8000/health");

      assertEquals(forwardedRequests.length, 0);
    });
  });
});

// ========================================
// Local Vanity URL Helper Tests
// ========================================

describe("Local Vanity URL Generation", () => {
  /**
   * Helper to generate local vanity URL
   * (Copy of logic from local-vanity.ts)
   */
  function getLocalVanityUrl(
    appSlug: string,
    baseHost: string,
    port: string,
    path = ""
  ): string {
    return `http://${appSlug}.${baseHost}:${port}${path}`;
  }

  it("generates vanity URL for app slug", () => {
    const url = getLocalVanityUrl("myapp", "localhost", "8000");
    assertEquals(url, "http://myapp.localhost:8000");
  });

  it("generates vanity URL with path", () => {
    const url = getLocalVanityUrl("myapp", "localhost", "8000", "/chat");
    assertEquals(url, "http://myapp.localhost:8000/chat");
  });

  it("generates vanity URL with custom port", () => {
    const url = getLocalVanityUrl("myapp", "localhost", "3000");
    assertEquals(url, "http://myapp.localhost:3000");
  });

  it("generates vanity URL with custom base host", () => {
    const url = getLocalVanityUrl("myapp", "dev.local", "8000");
    assertEquals(url, "http://myapp.dev.local:8000");
  });

  it("generates vanity URL with complex path", () => {
    const url = getLocalVanityUrl(
      "myapp",
      "localhost",
      "8000",
      "/chat/session/abc123"
    );
    assertEquals(url, "http://myapp.localhost:8000/chat/session/abc123");
  });
});

// ========================================
// CORS for *.localhost Tests
// ========================================

describe("CORS for Vanity Subdomains", () => {
  function createCorsTestApp() {
    const app = new Hono();

    // Simplified CORS middleware mimicking the real one
    app.use("*", async (c, next) => {
      const origin = c.req.header("Origin");

      if (origin) {
        // Allow *.localhost subdomains for vanity URL testing
        if (origin.match(/^http:\/\/[a-z0-9-]+\.localhost(:\d+)?$/)) {
          c.res.headers.set("Access-Control-Allow-Origin", origin);
          c.res.headers.set("Access-Control-Allow-Credentials", "true");
        }
      }

      if (c.req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: c.res.headers,
        });
      }

      await next();
    });

    app.get("/test", (c) => c.json({ ok: true }));

    return app;
  }

  it("allows CORS from myapp.localhost:8000", async () => {
    const app = createCorsTestApp();

    const res = await app.request("/test", {
      headers: { Origin: "http://myapp.localhost:8000" },
    });

    assertEquals(res.status, 200);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "http://myapp.localhost:8000"
    );
    assertEquals(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });

  it("allows CORS from subdomain.localhost (no port)", async () => {
    const app = createCorsTestApp();

    const res = await app.request("/test", {
      headers: { Origin: "http://testapp.localhost" },
    });

    assertEquals(res.status, 200);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "http://testapp.localhost"
    );
  });

  it("allows CORS from hyphenated-subdomain.localhost:3000", async () => {
    const app = createCorsTestApp();

    const res = await app.request("/test", {
      headers: { Origin: "http://my-test-app.localhost:3000" },
    });

    assertEquals(res.status, 200);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "http://my-test-app.localhost:3000"
    );
  });

  it("does not set CORS headers for non-localhost origins", async () => {
    const app = createCorsTestApp();

    const res = await app.request("/test", {
      headers: { Origin: "http://example.com" },
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  });

  it("handles preflight OPTIONS request", async () => {
    const app = createCorsTestApp();

    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { Origin: "http://myapp.localhost:8000" },
    });

    assertEquals(res.status, 204);
    assertEquals(
      res.headers.get("Access-Control-Allow-Origin"),
      "http://myapp.localhost:8000"
    );
  });
});
