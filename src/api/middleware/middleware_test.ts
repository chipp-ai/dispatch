/**
 * Middleware Tests
 *
 * Tests for error handler and request ID middleware.
 */

import { assertEquals, assertExists, assertMatch } from "@std/assert";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { z } from "zod";
import {
  errorHandler,
  HttpError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
} from "../../../middleware/error.ts";
import { requestId } from "../../../middleware/request-id.ts";
import type { AppEnv } from "../../../types.ts";

// ========================================
// Test App Setup
// ========================================

function createTestApp() {
  const app = new Hono<AppEnv>();

  // Apply middleware
  app.use("*", requestId);

  // Register error handler
  app.onError(errorHandler);

  return app;
}

// ========================================
// Request ID Middleware Tests
// ========================================

Deno.test("requestId - generates unique ID for each request", async () => {
  const app = createTestApp();
  app.get("/test", (c) => {
    const id = c.get("requestId");
    return c.json({ requestId: id });
  });

  const res1 = await app.request("/test");
  const data1 = await res1.json();
  const res2 = await app.request("/test");
  const data2 = await res2.json();

  assertExists(data1.requestId);
  assertExists(data2.requestId);
  // IDs should be different
  assertEquals(data1.requestId !== data2.requestId, true);
});

Deno.test("requestId - uses client-provided X-Request-ID", async () => {
  const app = createTestApp();
  app.get("/test", (c) => {
    const id = c.get("requestId");
    return c.json({ requestId: id });
  });

  const clientId = "custom-request-id-123";
  const res = await app.request("/test", {
    headers: { "X-Request-ID": clientId },
  });

  const data = await res.json();
  assertEquals(data.requestId, clientId);
});

Deno.test("requestId - adds X-Request-ID to response headers", async () => {
  const app = createTestApp();
  app.get("/test", (c) => c.json({ ok: true }));

  const res = await app.request("/test");
  const responseId = res.headers.get("X-Request-ID");

  assertExists(responseId);
  // UUID format from crypto.randomUUID()
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assertMatch(responseId, uuidRegex);
});

Deno.test("requestId - echoes client ID in response headers", async () => {
  const app = createTestApp();
  app.get("/test", (c) => c.json({ ok: true }));

  const clientId = "client-123";
  const res = await app.request("/test", {
    headers: { "X-Request-ID": clientId },
  });

  assertEquals(res.headers.get("X-Request-ID"), clientId);
});

Deno.test(
  "requestId - ID is available in context throughout request lifecycle",
  async () => {
    const app = createTestApp();
    let capturedId: string | undefined;

    app.get("/test", (c) => {
      capturedId = c.get("requestId");
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    const headerValue = res.headers.get("X-Request-ID");

    assertEquals(capturedId, headerValue);
  }
);

// ========================================
// Error Handler - HttpError Classes
// ========================================

Deno.test("errorHandler - handles HttpError with 404 status", async () => {
  const app = createTestApp();
  app.get("/test", () => {
    throw NotFound("User not found");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 404);
  assertEquals(data.error, "NOT_FOUND");
  assertEquals(data.message, "User not found");
  assertExists(data.requestId);
});

Deno.test("errorHandler - handles Unauthorized error", async () => {
  const app = createTestApp();
  app.get("/test", () => {
    throw Unauthorized("Invalid credentials");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 401);
  assertEquals(data.error, "UNAUTHORIZED");
  assertEquals(data.message, "Invalid credentials");
  assertExists(data.requestId);
});

Deno.test("errorHandler - handles Forbidden error", async () => {
  const app = createTestApp();
  app.get("/test", () => {
    throw Forbidden("Access denied");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 403);
  assertEquals(data.error, "FORBIDDEN");
  assertEquals(data.message, "Access denied");
  assertExists(data.requestId);
});

Deno.test("errorHandler - handles BadRequest with details", async () => {
  const app = createTestApp();
  app.get("/test", () => {
    throw BadRequest("Invalid input", { field: "email" });
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 400);
  assertEquals(data.error, "BAD_REQUEST");
  assertEquals(data.message, "Invalid input");
  assertEquals(data.details?.field, "email");
  assertExists(data.requestId);
});

Deno.test(
  "errorHandler - handles HttpError with custom status and code",
  async () => {
    const app = createTestApp();
    app.get("/test", () => {
      throw new HttpError(429, "Too many requests", "RATE_LIMITED");
    });

    const res = await app.request("/test");
    const data = await res.json();

    assertEquals(res.status, 429);
    assertEquals(data.error, "RATE_LIMITED");
    assertEquals(data.message, "Too many requests");
    assertExists(data.requestId);
  }
);

// ========================================
// Error Handler - Zod Validation Errors
// ========================================

Deno.test("errorHandler - handles ZodError with error details", async () => {
  const app = createTestApp();
  const schema = z.object({
    email: z.string().email(),
    age: z.number().min(18),
  });

  app.post("/test", async (c) => {
    const body = await c.req.json();
    schema.parse(body); // Will throw ZodError
    return c.json({ ok: true });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", age: 15 }),
  });

  const data = await res.json();

  assertEquals(res.status, 400);
  assertEquals(data.error, "VALIDATION_ERROR");
  // Message may include error details, so just check it starts with "Validation failed"
  assertExists(data.message);
  assertEquals(data.message.startsWith("Validation failed"), true);
  assertExists(data.details?.issues);
  assertEquals(Array.isArray(data.details.issues), true);
  assertExists(data.requestId);
});

// ========================================
// Error Handler - JSON Parse Errors
// ========================================

Deno.test("errorHandler - handles invalid JSON", async () => {
  const app = createTestApp();
  app.post("/test", async (c) => {
    await c.req.json(); // Will throw SyntaxError
    return c.json({ ok: true });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ invalid json }",
  });

  const data = await res.json();

  assertEquals(res.status, 400);
  assertEquals(data.error, "INVALID_JSON");
  assertEquals(data.message, "Invalid JSON in request body");
  assertExists(data.requestId);
});

// ========================================
// Error Handler - Unknown Errors
// ========================================

Deno.test("errorHandler - handles unknown Error with 500 status", async () => {
  const app = createTestApp();
  app.get("/test", () => {
    throw new Error("Something went wrong");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 500);
  assertEquals(data.error, "INTERNAL_ERROR");
  assertEquals(data.message, "Internal server error");
  assertExists(data.requestId);
});

Deno.test("errorHandler - includes stack trace in development", async () => {
  const originalEnv = Deno.env.get("ENVIRONMENT");
  Deno.env.set("ENVIRONMENT", "development");

  const app = createTestApp();
  app.get("/test", () => {
    throw new Error("Detailed error message");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 500);
  assertEquals(data.error, "INTERNAL_ERROR");
  assertExists(data.stack);

  // Restore original env
  if (originalEnv) {
    Deno.env.set("ENVIRONMENT", originalEnv);
  } else {
    Deno.env.delete("ENVIRONMENT");
  }
});

Deno.test("errorHandler - hides stack trace in production", async () => {
  const originalEnv = Deno.env.get("ENVIRONMENT");
  Deno.env.set("ENVIRONMENT", "production");

  const app = createTestApp();
  app.get("/test", () => {
    throw new Error("Internal database error");
  });

  const res = await app.request("/test");
  const data = await res.json();

  assertEquals(res.status, 500);
  assertEquals(data.error, "INTERNAL_ERROR");
  assertEquals(data.message, "Internal server error");
  assertEquals(data.stack, undefined);

  // Restore original env
  if (originalEnv) {
    Deno.env.set("ENVIRONMENT", originalEnv);
  } else {
    Deno.env.delete("ENVIRONMENT");
  }
});

// ========================================
// Integration Tests
// ========================================

Deno.test(
  "integration - requestId persists through error handling",
  async () => {
    const app = createTestApp();
    app.get("/test", () => {
      throw NotFound("Resource not found");
    });

    const clientId = "integration-test-123";
    const res = await app.request("/test", {
      headers: { "X-Request-ID": clientId },
    });

    const data = await res.json();

    assertEquals(res.status, 404);
    assertEquals(data.requestId, clientId);
    assertEquals(res.headers.get("X-Request-ID"), clientId);
  }
);

Deno.test(
  "integration - error response always includes requestId",
  async () => {
    const app = createTestApp();

    // Test various error types
    const errorRoutes = [
      { path: "/404", error: NotFound("Item not found") },
      { path: "/401", error: Unauthorized() },
      { path: "/403", error: Forbidden() },
      { path: "/400", error: BadRequest("Bad data") },
      { path: "/500", error: new Error("Unknown error") },
    ];

    for (const route of errorRoutes) {
      app.get(route.path, () => {
        throw route.error;
      });
    }

    for (const route of errorRoutes) {
      const res = await app.request(route.path);
      const data = await res.json();

      assertExists(data.requestId, `requestId missing for ${route.path}`);
      // Request IDs can be UUIDs (from crypto.randomUUID()) or timestamp-based
      assertExists(data.requestId);
    }
  }
);

Deno.test(
  "integration - successful requests have requestId in context",
  async () => {
    const app = createTestApp();
    app.get("/success", (c) => {
      const requestId = c.get("requestId");
      return c.json({ success: true, requestId });
    });

    const res = await app.request("/success");
    const data = await res.json();

    assertEquals(res.status, 200);
    assertEquals(data.success, true);
    assertExists(data.requestId);
    assertEquals(res.headers.get("X-Request-ID"), data.requestId);
  }
);

Deno.test("integration - requestId format is consistent", async () => {
  const app = createTestApp();
  app.get("/test", (c) => c.json({ id: c.get("requestId") }));

  // Generate multiple IDs
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const res = await app.request("/test");
    const data = await res.json();
    ids.push(data.id);
  }

  // All should be valid UUIDs (crypto.randomUUID() format)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const id of ids) {
    assertMatch(id, uuidRegex, `Invalid UUID format: ${id}`);
  }

  // All should be unique
  const uniqueIds = new Set(ids);
  assertEquals(uniqueIds.size, ids.length);
});
