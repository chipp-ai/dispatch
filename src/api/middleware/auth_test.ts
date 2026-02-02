/**
 * Auth Middleware Tests
 *
 * Tests for authentication and authorization middleware.
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  type AuthContext,
} from "./auth.ts";

// ========================================
// Test App Setup
// ========================================

function createTestApp() {
  const app = new Hono<AuthContext>();

  // Protected route
  app.get("/protected", authMiddleware, (c) => {
    const user = c.get("user");
    return c.json({ user });
  });

  // Optional auth route
  app.get("/optional", optionalAuthMiddleware, (c) => {
    const user = c.get("user");
    return c.json({ user: user || null });
  });

  // Role-restricted routes
  app.get("/admin", authMiddleware, requireRole("admin", "owner"), (c) => {
    return c.json({ message: "Admin access granted" });
  });

  app.get("/owner", authMiddleware, requireRole("owner"), (c) => {
    return c.json({ message: "Owner access granted" });
  });

  return app;
}

/**
 * Create a valid test token
 */
function createToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  return `${headerB64}.${payloadB64}.fake-signature`;
}

// ========================================
// authMiddleware Tests
// ========================================

Deno.test(
  "authMiddleware - rejects request without Authorization header",
  async () => {
    const app = createTestApp();
    const res = await app.request("/protected");

    assertEquals(res.status, 401);
    // HTTPException returns plain text by default
    const text = await res.text();
    assertEquals(text, "Authentication required");
  }
);

Deno.test(
  "authMiddleware - rejects request with invalid token format",
  async () => {
    const app = createTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer invalid" },
    });

    assertEquals(res.status, 401);
    const text = await res.text();
    assertEquals(text, "Authentication required");
  }
);

Deno.test("authMiddleware - rejects expired token", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "test@example.com",
    name: "Test User",
    organizationId: "org-123",
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  });

  const res = await app.request("/protected", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 401);
});

Deno.test("authMiddleware - accepts valid token", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "test@example.com",
    name: "Test User",
    organizationId: "org-123",
    role: "member",
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  });

  const res = await app.request("/protected", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.user.id, "user-123");
  assertEquals(data.user.email, "test@example.com");
  assertEquals(data.user.organizationId, "org-123");
});

Deno.test("authMiddleware - accepts token without Bearer prefix", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "test@example.com",
    name: "Test User",
    organizationId: "org-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/protected", {
    headers: { Authorization: token },
  });

  assertEquals(res.status, 200);
});

Deno.test("authMiddleware - uses developerId if sub not present", async () => {
  const app = createTestApp();
  const token = createToken({
    developerId: "dev-456",
    email: "dev@example.com",
    name: "Developer",
    organizationId: "org-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/protected", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.user.id, "dev-456");
});

Deno.test("authMiddleware - defaults role to member", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "test@example.com",
    organizationId: "org-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/protected", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.user.role, "member");
});

// ========================================
// optionalAuthMiddleware Tests
// ========================================

Deno.test("optionalAuthMiddleware - allows request without token", async () => {
  const app = createTestApp();
  const res = await app.request("/optional");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.user, null);
});

Deno.test(
  "optionalAuthMiddleware - populates user if valid token provided",
  async () => {
    const app = createTestApp();
    const token = createToken({
      sub: "user-123",
      email: "test@example.com",
      name: "Test User",
      organizationId: "org-123",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await app.request("/optional", {
      headers: { Authorization: `Bearer ${token}` },
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertExists(data.user);
    assertEquals(data.user.id, "user-123");
  }
);

Deno.test("optionalAuthMiddleware - ignores invalid token", async () => {
  const app = createTestApp();
  const res = await app.request("/optional", {
    headers: { Authorization: "Bearer invalid-token" },
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.user, null);
});

// ========================================
// requireRole Tests
// ========================================

Deno.test("requireRole - allows admin for admin-required route", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "admin@example.com",
    organizationId: "org-123",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
});

Deno.test("requireRole - allows owner for admin-required route", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "owner@example.com",
    organizationId: "org-123",
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
});

Deno.test("requireRole - rejects member for admin-required route", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "member@example.com",
    organizationId: "org-123",
    role: "member",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/admin", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 403);
  const text = await res.text();
  assertEquals(text, "Required role: admin or owner");
});

Deno.test("requireRole - rejects admin for owner-only route", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "admin@example.com",
    organizationId: "org-123",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/owner", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 403);
  const text = await res.text();
  assertEquals(text, "Required role: owner");
});

Deno.test("requireRole - allows owner for owner-only route", async () => {
  const app = createTestApp();
  const token = createToken({
    sub: "user-123",
    email: "owner@example.com",
    organizationId: "org-123",
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const res = await app.request("/owner", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);
});
