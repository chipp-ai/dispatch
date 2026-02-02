/**
 * Auth & User Provisioning Tests
 *
 * Tests for authentication routes and user provisioning flow.
 * These test the automatic creation of organizations and workspaces
 * for new users signing up to chipp-deno (v2).
 *
 * ENDPOINTS TESTED:
 * - POST /auth/provision - Provision new user with org/workspace
 * - GET /auth/me - Get current user from session
 * - POST /auth/session - Create session for user
 * - POST /auth/logout - Logout and invalidate session
 *
 * USAGE:
 *   deno test src/__tests__/routes/auth_provisioning_test.ts
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
} from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import { sql, closeDatabase } from "../../db/client.ts";
import app from "../../api/index.ts";
import { unauthenticated, cleanupTestData } from "../setup.ts";

// Internal API key for server-to-server authentication in tests
const INTERNAL_API_KEY =
  Deno.env.get("INTERNAL_API_KEY") || "test-internal-key";

// Helper to create headers with internal auth
const internalAuthHeaders = (
  additionalHeaders: Record<string, string> = {}
) => ({
  "Content-Type": "application/json",
  "X-Internal-Auth": INTERNAL_API_KEY,
  ...additionalHeaders,
});

// ========================================
// Test Setup
// ========================================

describe("Auth & User Provisioning API", () => {
  // Track created test emails for cleanup
  const testEmails: string[] = [];

  beforeAll(async () => {
    // Clean up any leftover test data
    await cleanupTestData("provision_test_");
  });

  afterAll(async () => {
    // Clean up test data created during these tests
    for (const email of testEmails) {
      // Delete in correct order due to foreign keys
      await sql`
        DELETE FROM app.workspace_members
        WHERE user_id IN (SELECT id FROM app.users WHERE email = ${email})
      `;
      await sql`
        DELETE FROM app.sessions
        WHERE user_id IN (SELECT id FROM app.users WHERE email = ${email})
      `;
      await sql`
        DELETE FROM app.users WHERE email = ${email}
      `;
    }
    // Clean up workspaces and orgs created
    await sql`
      DELETE FROM app.workspaces
      WHERE name LIKE 'provision_test_%' OR name LIKE '%''s Workspace'
    `;
    await sql`
      DELETE FROM app.organizations
      WHERE name LIKE 'provision_test_%' OR name LIKE '%''s Organization'
    `;

    // Close database connection to prevent resource leaks
    await closeDatabase();
  });

  // ========================================
  // POST /auth/provision - New User Provisioning
  // ========================================

  describe("POST /auth/provision - Provision New User", () => {
    it("should create new user with organization and workspace", async () => {
      const email = `provision_test_${Date.now()}@example.com`;
      testEmails.push(email);

      const res = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({
          email,
          name: "Test Provision User",
          picture: "https://example.com/avatar.png",
          oauthProvider: "google",
          oauthId: "google-123",
        }),
      });

      assertEquals(res.status, 200);
      const body = (await res.json()) as {
        data: {
          userId: string;
          email: string;
          name: string;
          organizationId: string;
          workspaceId: string;
          role: string;
          isNewUser: boolean;
        };
      };

      // Verify response structure
      assertExists(body.data);
      assertExists(body.data.userId);
      assertEquals(body.data.email, email);
      assertEquals(body.data.name, "Test Provision User");
      assertExists(body.data.organizationId);
      assertExists(body.data.workspaceId);
      assertEquals(body.data.role, "owner");

      // Verify database records
      const [user] = await sql`
        SELECT id, email, name, organization_id, role
        FROM app.users WHERE email = ${email}
      `;
      assertExists(user);
      assertEquals(user.email, email);
      assertEquals(user.role, "owner");

      // Verify organization was created
      const [org] = await sql`
        SELECT id, name, subscription_tier
        FROM app.organizations WHERE id = ${body.data.organizationId}
      `;
      assertExists(org);
      assertEquals(org.subscription_tier, "FREE");

      // Verify workspace was created
      const [workspace] = await sql`
        SELECT id, name, organization_id
        FROM app.workspaces WHERE id = ${body.data.workspaceId}
      `;
      assertExists(workspace);
      assertEquals(workspace.organization_id, body.data.organizationId);

      // Verify workspace membership was created
      const [membership] = await sql`
        SELECT workspace_id, user_id, role
        FROM app.workspace_members WHERE user_id = ${body.data.userId}
      `;
      assertExists(membership);
      assertEquals(membership.role, "OWNER");
    });

    it("should return existing user if email already exists", async () => {
      const email = `provision_test_existing_${Date.now()}@example.com`;
      testEmails.push(email);

      // First call - creates user
      const res1 = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email, name: "First Call" }),
      });
      assertEquals(res1.status, 200);
      const body1 = (await res1.json()) as { data: { userId: string } };

      // Second call - returns existing user
      const res2 = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email, name: "Second Call" }),
      });
      assertEquals(res2.status, 200);
      const body2 = (await res2.json()) as { data: { userId: string } };

      // Should return same user ID
      assertEquals(body1.data.userId, body2.data.userId);
    });

    it("should fail without email", async () => {
      const res = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ name: "No Email User" }),
      });

      assertEquals(res.status, 400);
      // HTTPException returns text response, not JSON
      const text = await res.text();
      assert(text.includes("Email"));
    });

    it("should fail without internal auth header", async () => {
      const res = await app.request("/auth/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      assertEquals(res.status, 401);
    });

    it("should normalize email to lowercase", async () => {
      const email = `PROVISION_TEST_UPPER_${Date.now()}@EXAMPLE.COM`;
      const normalizedEmail = email.toLowerCase();
      testEmails.push(normalizedEmail);

      const res = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email }),
      });

      assertEquals(res.status, 200);
      const body = (await res.json()) as { data: { email: string } };
      assertEquals(body.data.email, normalizedEmail);
    });

    it("should create default names based on email when name not provided", async () => {
      const email = `provision_test_noname_${Date.now()}@example.com`;
      testEmails.push(email);

      const res = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email }),
      });

      assertEquals(res.status, 200);
      const body = (await res.json()) as {
        data: { organizationId: string; workspaceId: string };
      };

      // Check organization name
      const [org] = await sql`
        SELECT name FROM app.organizations WHERE id = ${body.data.organizationId}
      `;
      assertEquals(org.name, "Your Organization");

      // Check workspace name
      const [workspace] = await sql`
        SELECT name FROM app.workspaces WHERE id = ${body.data.workspaceId}
      `;
      assertEquals(workspace.name, "Your Workspace");
    });
  });

  // ========================================
  // POST /auth/session - Create Session
  // ========================================

  describe("POST /auth/session - Create Session", () => {
    it("should create session for existing user", async () => {
      // First provision a user
      const email = `provision_test_session_${Date.now()}@example.com`;
      testEmails.push(email);

      const provisionRes = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email }),
      });
      const provisionBody = (await provisionRes.json()) as {
        data: { userId: string };
      };

      // Create session
      const sessionRes = await app.request("/auth/session", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ userId: provisionBody.data.userId }),
      });

      assertEquals(sessionRes.status, 200);
      const sessionBody = (await sessionRes.json()) as {
        data: { sessionId: string; expiresAt: string };
      };

      assertExists(sessionBody.data.sessionId);
      assertExists(sessionBody.data.expiresAt);

      // Verify session in database
      const [session] = await sql`
        SELECT id, user_id, expires_at
        FROM app.sessions WHERE id = ${sessionBody.data.sessionId}
      `;
      assertExists(session);
      assertEquals(session.user_id, provisionBody.data.userId);

      // Verify cookie is set
      const setCookieHeader = sessionRes.headers.get("set-cookie");
      assertExists(setCookieHeader);
      assert(setCookieHeader.includes("session_id="));
    });

    it("should fail for non-existent user", async () => {
      const res = await app.request("/auth/session", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({
          userId: "00000000-0000-0000-0000-000000000000",
        }),
      });

      assertEquals(res.status, 404);
    });

    it("should fail without userId", async () => {
      const res = await app.request("/auth/session", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({}),
      });

      assertEquals(res.status, 400);
    });

    it("should fail without internal auth header", async () => {
      const res = await app.request("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "some-user-id" }),
      });

      assertEquals(res.status, 401);
    });
  });

  // ========================================
  // GET /auth/me - Get Current User
  // ========================================

  describe("GET /auth/me - Get Current User", () => {
    it("should return 401 without session cookie", async () => {
      const res = await app.request("/auth/me", {
        method: "GET",
      });

      assertEquals(res.status, 401);
    });

    it("should return user info with valid session", async () => {
      // Provision user and create session
      const email = `provision_test_me_${Date.now()}@example.com`;
      testEmails.push(email);

      const provisionRes = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email, name: "Me Test User" }),
      });
      const provisionBody = (await provisionRes.json()) as {
        data: { userId: string };
      };

      // Create session and get cookie
      const sessionRes = await app.request("/auth/session", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ userId: provisionBody.data.userId }),
      });
      const sessionBody = (await sessionRes.json()) as {
        data: { sessionId: string };
      };

      // Use session to get user info
      const meRes = await app.request("/auth/me", {
        method: "GET",
        headers: {
          Cookie: `session_id=${sessionBody.data.sessionId}`,
        },
      });

      assertEquals(meRes.status, 200);
      const meBody = (await meRes.json()) as {
        data: { email: string; name: string };
      };
      assertEquals(meBody.data.email, email);
      assertEquals(meBody.data.name, "Me Test User");
    });
  });

  // ========================================
  // POST /auth/logout - Logout
  // ========================================

  describe("POST /auth/logout - Logout", () => {
    it("should logout and invalidate session", async () => {
      // Provision user and create session
      const email = `provision_test_logout_${Date.now()}@example.com`;
      testEmails.push(email);

      const provisionRes = await app.request("/auth/provision", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ email }),
      });
      const provisionBody = (await provisionRes.json()) as {
        data: { userId: string };
      };

      const sessionRes = await app.request("/auth/session", {
        method: "POST",
        headers: internalAuthHeaders(),
        body: JSON.stringify({ userId: provisionBody.data.userId }),
      });
      const sessionBody = (await sessionRes.json()) as {
        data: { sessionId: string };
      };

      // Logout
      const logoutRes = await app.request("/auth/logout", {
        method: "POST",
        headers: {
          Cookie: `session_id=${sessionBody.data.sessionId}`,
        },
      });

      assertEquals(logoutRes.status, 200);

      // Session should be deleted
      const [session] = await sql`
        SELECT id FROM app.sessions WHERE id = ${sessionBody.data.sessionId}
      `;
      assertEquals(session, undefined);
    });

    it("should succeed even without session", async () => {
      const res = await app.request("/auth/logout", {
        method: "POST",
      });

      assertEquals(res.status, 200);
    });
  });
});
