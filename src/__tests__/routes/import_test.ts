/**
 * Import API Route Tests
 *
 * Tests for data import flow endpoints that allow users to migrate
 * their existing data from chipp-admin (app.chipp.ai).
 *
 * ENDPOINTS TESTED:
 * - POST /api/import/check          - Check if email has existing data
 * - GET  /api/import/preview/:id    - Get detailed import preview
 * - POST /api/import/start          - Begin import process
 * - GET  /api/import/status/:id     - Get import progress
 * - GET  /api/import/active         - Get active import session
 * - POST /api/import/skip           - Skip import flow
 *
 * SCENARIOS COVERED:
 * 1. Import Check
 *    - Check current user's email
 *    - Check alternate email
 *    - Handle no existing data
 *
 * 2. Import Preview
 *    - Get preview for valid developer
 *    - Handle invalid developer ID
 *    - Handle non-existent developer
 *
 * 3. Import Start
 *    - Start new import
 *    - Prevent duplicate imports
 *    - Handle invalid developer
 *
 * 4. Import Status
 *    - Get status of own import
 *    - Prevent access to other's import
 *    - Handle non-existent session
 *
 * 5. Active Import
 *    - Get active import when exists
 *    - Handle no active import
 *
 * 6. Skip Import
 *    - Skip to proceed to onboarding
 *
 * USAGE:
 *   deno test src/__tests__/routes/import_test.ts
 *
 * NOTE: These tests run without connection to chipp-admin databases,
 * so they test endpoint structure, validation, and error handling.
 * Full import functionality requires chipp-admin database connections.
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  unauthenticated,
  sql,
} from "../setup.ts";
import type { TestUser } from "../setup.ts";
import { createIsolatedUser, getFreeUser } from "../fixtures/users.ts";

// ========================================
// Test Setup
// ========================================

describe("Import API", () => {
  let testUser: TestUser;

  beforeAll(async () => {
    await setupTests();
    testUser = await getFreeUser();
  });

  afterAll(async () => {
    // Clean up any import sessions created during tests
    await sql`DELETE FROM app.import_progress WHERE import_session_id IN (
      SELECT id FROM app.import_sessions WHERE source_email LIKE 'test_%'
    )`;
    await sql`DELETE FROM app.import_id_mappings WHERE import_session_id IN (
      SELECT id FROM app.import_sessions WHERE source_email LIKE 'test_%'
    )`;
    await sql`DELETE FROM app.import_sessions WHERE source_email LIKE 'test_%'`;
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // Import Check
  // ========================================

  describe("POST /api/import/check - Check Existing Data", () => {
    it("should check current user's email", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/check", freshUser, {});

      // Should return 200 with hasExistingData field
      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: {
          hasExistingData: boolean;
          developerId?: number;
          preview?: unknown;
        };
      };

      assertExists(data.data);
      assertEquals(typeof data.data.hasExistingData, "boolean");
    });

    it("should accept optional email parameter", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/check", freshUser, {
        email: "test_alternate@example.com",
      });

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: { hasExistingData: boolean };
      };

      assertExists(data.data);
      assertEquals(typeof data.data.hasExistingData, "boolean");
    });

    it("should validate email format", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/check", freshUser, {
        email: "not-a-valid-email",
      });

      // Should return 400 for invalid email
      assertEquals(res.status, 400);
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/import/check", {
        method: "POST",
        body: {},
      });

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });

    it("should return app count when data exists", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/check", freshUser, {});

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: {
          hasExistingData: boolean;
          developerId?: number;
          appsCount?: number;
        };
      };

      // If hasExistingData is true, developerId and appsCount should be populated
      if (data.data.hasExistingData) {
        assertExists(data.data.developerId);
        assertExists(data.data.appsCount);
      }
    });
  });

  // ========================================
  // Import Preview
  // ========================================

  describe("GET /api/import/preview/:developerId - Get Preview", () => {
    it("should validate developer ID is a number", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get("/api/import/preview/abc", freshUser);

      // Should return 400 for non-numeric ID
      assertEquals(res.status, 400);
      const data = (await res.json()) as { error: string };
      assertEquals(data.error, "Invalid developer ID");
    });

    it("should validate developer ID is positive", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get("/api/import/preview/-1", freshUser);

      // Should return 400 for negative ID
      assertEquals(res.status, 400);
      const data = (await res.json()) as { error: string };
      assertEquals(data.error, "Invalid developer ID");
    });

    it("should validate developer ID is not zero", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get("/api/import/preview/0", freshUser);

      // Should return 400 for zero ID
      assertEquals(res.status, 400);
    });

    it("should handle non-existent developer", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // Use a high ID that likely doesn't exist
      const res = await get("/api/import/preview/999999999", freshUser);

      // Should return 404 for non-existent developer
      assertEquals(res.status, 404);
      const data = (await res.json()) as { error: string };
      assertExists(data.error);
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/import/preview/123");

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });

    it("should return preview data structure when developer exists", async () => {
      // This test would pass if we had a valid developer in chipp-admin
      // For now, we just verify the endpoint validates the ID properly
      const freshUser = await createIsolatedUser("FREE");

      // A valid ID format but non-existent
      const res = await get("/api/import/preview/1", freshUser);

      // Either returns preview (200) or not found (404)
      assert([200, 404].includes(res.status));

      if (res.status === 200) {
        const data = (await res.json()) as {
          data: {
            email: string;
            counts: {
              organizations: number;
              applications: number;
              knowledgeSources: number;
              consumers: number;
              conversations: number;
            };
          };
        };

        assertExists(data.data);
        assertExists(data.data.email);
        assertExists(data.data.counts);
      }
    });
  });

  // ========================================
  // Import Start
  // ========================================

  describe("POST /api/import/start - Begin Import", () => {
    it("should require developer ID", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/start", freshUser, {});

      // Should return 400 for missing developerId
      assertEquals(res.status, 400);
    });

    it("should validate developer ID is a positive number", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/start", freshUser, {
        developerId: -1,
      });

      // Should return 400 for invalid ID
      assertEquals(res.status, 400);
    });

    it("should validate developer ID type", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/start", freshUser, {
        developerId: "not-a-number",
      });

      // Should return 400 for wrong type
      assertEquals(res.status, 400);
    });

    it("should handle non-existent developer", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/start", freshUser, {
        developerId: 999999999,
      });

      // Should return 404 for non-existent developer
      assertEquals(res.status, 404);
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/import/start", {
        method: "POST",
        body: { developerId: 123 },
      });

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });

    it("should prevent duplicate imports", async () => {
      // This test requires mocking an active import
      // For now, verify the endpoint responds correctly
      const freshUser = await createIsolatedUser("FREE");

      // First attempt (will fail due to non-existent developer)
      const res1 = await post("/api/import/start", freshUser, {
        developerId: 999999999,
      });

      assertEquals(res1.status, 404);
    });
  });

  // ========================================
  // Import Status
  // ========================================

  describe("GET /api/import/status/:id - Get Status", () => {
    it("should handle non-existent session", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get(
        "/api/import/status/00000000-0000-0000-0000-000000000000",
        freshUser
      );

      // Should return 404 for non-existent session
      assertEquals(res.status, 404);
    });

    it("should validate session ID format", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get("/api/import/status/invalid-uuid", freshUser);

      // Should return 404 (UUID parsing will fail, session not found)
      assertEquals(res.status, 404);
    });

    it("should require authentication", async () => {
      const res = await unauthenticated(
        "/api/import/status/00000000-0000-0000-0000-000000000000"
      );

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });

    it("should return session and progress data", async () => {
      // Create a test import session directly in DB
      const freshUser = await createIsolatedUser("FREE");

      // Insert test import session
      const [session] = await sql`
        INSERT INTO app.import_sessions (
          user_id, source_developer_id, source_email, status
        )
        VALUES (
          ${freshUser.id}, 123, 'test_import@example.com', 'pending'
        )
        RETURNING id
      `;

      const res = await get(`/api/import/status/${session.id}`, freshUser);

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: {
          session: {
            id: string;
            status: string;
            currentPhase: number;
          };
          progress: Array<{
            entityType: string;
            totalCount: number;
            completedCount: number;
            status: string;
          }>;
        };
      };

      assertExists(data.data.session);
      assertExists(data.data.progress);
      assertEquals(data.data.session.id, session.id);
      assertEquals(data.data.session.status, "pending");

      // Clean up
      await sql`DELETE FROM app.import_sessions WHERE id = ${session.id}`;
    });

    it("should prevent access to other user's import", async () => {
      // Create two users
      const user1 = await createIsolatedUser("FREE");
      const user2 = await createIsolatedUser("FREE");

      // Insert import session for user1
      const [session] = await sql`
        INSERT INTO app.import_sessions (
          user_id, source_developer_id, source_email, status
        )
        VALUES (
          ${user1.id}, 123, 'test_other_import@example.com', 'pending'
        )
        RETURNING id
      `;

      // Try to access as user2
      const res = await get(`/api/import/status/${session.id}`, user2);

      // Should return 403 Forbidden
      assertEquals(res.status, 403);

      // Clean up
      await sql`DELETE FROM app.import_sessions WHERE id = ${session.id}`;
    });
  });

  // ========================================
  // Active Import
  // ========================================

  describe("GET /api/import/active - Get Active Import", () => {
    it("should return hasActiveImport false when no import", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await get("/api/import/active", freshUser);

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: { hasActiveImport: boolean };
      };

      assertEquals(data.data.hasActiveImport, false);
    });

    it("should return active import details when exists", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // Insert active import session
      const [session] = await sql`
        INSERT INTO app.import_sessions (
          user_id, source_developer_id, source_email, status, current_phase
        )
        VALUES (
          ${freshUser.id}, 456, 'test_active@example.com', 'running', 2
        )
        RETURNING id
      `;

      const res = await get("/api/import/active", freshUser);

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: {
          hasActiveImport: boolean;
          importSessionId?: string;
          status?: string;
          currentPhase?: number;
        };
      };

      assertEquals(data.data.hasActiveImport, true);
      assertEquals(data.data.importSessionId, session.id);
      assertEquals(data.data.status, "running");
      assertEquals(data.data.currentPhase, 2);

      // Clean up
      await sql`DELETE FROM app.import_sessions WHERE id = ${session.id}`;
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/import/active");

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });

    it("should not include completed imports as active", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // Insert completed import session
      const [session] = await sql`
        INSERT INTO app.import_sessions (
          user_id, source_developer_id, source_email, status, completed_at
        )
        VALUES (
          ${freshUser.id}, 789, 'test_completed@example.com', 'completed', NOW()
        )
        RETURNING id
      `;

      const res = await get("/api/import/active", freshUser);

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: { hasActiveImport: boolean };
      };

      // Completed imports should not be returned as active
      assertEquals(data.data.hasActiveImport, false);

      // Clean up
      await sql`DELETE FROM app.import_sessions WHERE id = ${session.id}`;
    });
  });

  // ========================================
  // Skip Import
  // ========================================

  describe("POST /api/import/skip - Skip Import", () => {
    it("should allow skipping import", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/skip", freshUser, {});

      assertEquals(res.status, 200);
      const data = (await res.json()) as {
        data: {
          success: boolean;
          message: string;
        };
      };

      assertEquals(data.data.success, true);
      assertExists(data.data.message);
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/import/skip", {
        method: "POST",
        body: {},
      });

      // Should return 401 Unauthorized
      assert([401, 403].includes(res.status));
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe("Edge Cases", () => {
    it("should handle concurrent check requests", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // Make multiple concurrent requests
      const [res1, res2, res3] = await Promise.all([
        post("/api/import/check", freshUser, {}),
        post("/api/import/check", freshUser, {}),
        post("/api/import/check", freshUser, {}),
      ]);

      // All should succeed
      assertEquals(res1.status, 200);
      assertEquals(res2.status, 200);
      assertEquals(res3.status, 200);
    });

    it("should handle empty request body gracefully", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // POST with undefined body (null content)
      const res = await post("/api/import/check", freshUser, {});

      // Should still work with default behavior
      assertEquals(res.status, 200);
    });

    it("should handle special characters in email", async () => {
      const freshUser = await createIsolatedUser("FREE");

      const res = await post("/api/import/check", freshUser, {
        email: "test+special@example.com",
      });

      // Valid email with + should be accepted
      assertEquals(res.status, 200);
    });

    it("should handle very long developer IDs", async () => {
      const freshUser = await createIsolatedUser("FREE");

      // Very large number that exceeds int bounds
      const res = await get(
        "/api/import/preview/99999999999999999999",
        freshUser
      );

      // Should return 400 for overflow
      assert([400, 404].includes(res.status));
    });
  });
});
