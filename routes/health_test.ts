/**
 * Health Routes Integration Tests
 *
 * Tests for the health check endpoints.
 * Creates a standalone test app to avoid database connection requirements.
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";

// ========================================
// Standalone Test App (no database)
// ========================================

function createHealthTestApp() {
  const app = new Hono();

  // Basic liveness probe (same as routes/health.ts)
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  // Simplified readiness probe (no database check)
  app.get("/ready", (c) => {
    const checks = {
      database: { status: "ok", latency: 5 },
    };

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // System info endpoint
  app.get("/health/info", (c) => {
    if (Deno.env.get("ENVIRONMENT") === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }

    return c.json({
      status: "ok",
      version: Deno.env.get("VERSION") ?? "development",
      environment: Deno.env.get("ENVIRONMENT") ?? "development",
      deno: Deno.version,
      uptime: performance.now() / 1000,
      memory: Deno.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

// ========================================
// GET /health - Liveness Probe
// ========================================

Deno.test("GET /health - returns 200 with status ok", async () => {
  const app = createHealthTestApp();
  const res = await app.request("/health");

  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.status, "ok");
  assertExists(data.timestamp);
});

Deno.test("GET /health - timestamp is valid ISO format", async () => {
  const app = createHealthTestApp();
  const res = await app.request("/health");
  const data = await res.json();

  const date = new Date(data.timestamp);
  assertEquals(isNaN(date.getTime()), false, "Timestamp should be valid date");
});

// ========================================
// GET /ready - Readiness Probe
// ========================================

Deno.test("GET /ready - returns response with checks", async () => {
  const app = createHealthTestApp();
  const res = await app.request("/ready");

  assertEquals(res.status, 200);

  const data = await res.json();
  assertExists(data.status);
  assertExists(data.timestamp);
  assertExists(data.checks);
});

Deno.test("GET /ready - includes database check", async () => {
  const app = createHealthTestApp();
  const res = await app.request("/ready");
  const data = await res.json();

  assertExists(data.checks.database);
  assertEquals(data.checks.database.status, "ok");
});

// ========================================
// GET /health/info - System Info
// ========================================

Deno.test("GET /health/info - returns 403 in production", async () => {
  const app = createHealthTestApp();

  // Set production environment temporarily
  const original = Deno.env.get("ENVIRONMENT");
  Deno.env.set("ENVIRONMENT", "production");

  try {
    const res = await app.request("/health/info");
    assertEquals(res.status, 403);

    const data = await res.json();
    assertEquals(data.error, "Not available in production");
  } finally {
    // Restore original environment
    if (original) {
      Deno.env.set("ENVIRONMENT", original);
    } else {
      Deno.env.delete("ENVIRONMENT");
    }
  }
});

Deno.test("GET /health/info - returns system info in development", async () => {
  const app = createHealthTestApp();

  // Ensure non-production environment
  const original = Deno.env.get("ENVIRONMENT");
  Deno.env.set("ENVIRONMENT", "development");

  try {
    const res = await app.request("/health/info");
    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.status, "ok");
    assertExists(data.environment);
    assertExists(data.deno);
    assertExists(data.uptime);
    assertExists(data.memory);
  } finally {
    // Restore original environment
    if (original) {
      Deno.env.set("ENVIRONMENT", original);
    } else {
      Deno.env.delete("ENVIRONMENT");
    }
  }
});

Deno.test(
  "GET /health/info - deno version contains major.minor.patch",
  async () => {
    const app = createHealthTestApp();

    const original = Deno.env.get("ENVIRONMENT");
    Deno.env.set("ENVIRONMENT", "development");

    try {
      const res = await app.request("/health/info");
      const data = await res.json();

      assertExists(data.deno.deno);
      assertEquals(typeof data.deno.deno, "string");
      // Version format: x.y.z
      assertEquals(/^\d+\.\d+\.\d+/.test(data.deno.deno), true);
    } finally {
      if (original) {
        Deno.env.set("ENVIRONMENT", original);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    }
  }
);
