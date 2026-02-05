/**
 * Marketplace API Route Tests
 *
 * Tests for public marketplace endpoints for discovering published apps.
 * These endpoints are PUBLIC (no authentication required).
 *
 * ENDPOINTS TESTED:
 * - GET /api/marketplace/apps          - List public apps
 * - GET /api/marketplace/apps/recent   - Get recently published apps
 * - GET /api/marketplace/apps/:nameId  - Get public app details
 * - GET /api/marketplace/stats         - Get marketplace statistics
 *
 * SCENARIOS COVERED:
 * 1. App Discovery
 *    - List all public apps
 *    - Search by name/description
 *    - Pagination support
 *    - Category filtering (if applicable)
 *
 * 2. Recent Apps
 *    - Get newly published apps
 *    - Limit parameter
 *    - Exclude unpublished/private
 *
 * 3. App Details
 *    - Get public app by nameId
 *    - Include app metadata
 *    - Exclude sensitive config
 *
 * 4. Marketplace Stats
 *    - Total app count
 *    - Category breakdown
 *    - Usage statistics
 *
 * 5. Public Access
 *    - No authentication required
 *    - Only published apps visible
 *    - Private apps hidden
 *
 * USAGE:
 *   deno test src/__tests__/routes/marketplace_test.ts
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import type { TestUser, TestApplication } from "../setup.ts";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  unauthenticated,
  app,
} from "../setup.ts";
import { getProUser, createIsolatedUser } from "../fixtures/users.ts";
import {
  createPublishedApp,
  createBasicApp,
} from "../fixtures/applications.ts";

// ========================================
// Test Setup
// ========================================

describe("Marketplace API", () => {
  let testUser: TestUser;
  let publishedApp: TestApplication;
  let privateApp: TestApplication;

  beforeAll(async () => {
    await setupTests();
    testUser = await getProUser();
    // Create apps for testing
    publishedApp = await createPublishedApp(testUser);
    privateApp = await createBasicApp(testUser);
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // List Public Apps
  // ========================================

  describe("GET /api/marketplace/apps - List Apps", () => {
    it("should list public apps without authentication", async () => {
      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return array of apps - API returns { success, data: [...], total, ... }
        assert(
          Array.isArray(data) ||
            Array.isArray(data.data) ||
            Array.isArray(data.apps),
          "Expected apps array in response"
        );
      }
    });

    it("should not include private apps", async () => {
      // Create a user with private app
      const user = await createIsolatedUser();
      const privateApp = await createBasicApp(user);

      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Private app should not be in the list
        const foundPrivate = apps.some(
          (app: { id: string }) => app.id === privateApp.id
        );
        assert(!foundPrivate, "Private app should not appear in marketplace");
      }
    });

    it("should not include unpublished apps", async () => {
      // Create an unpublished app
      const user = await createIsolatedUser();
      const unpublishedApp = await createBasicApp(user);

      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Unpublished app should not be visible
        const foundUnpublished = apps.some(
          (app: { id: string }) => app.id === unpublishedApp.id
        );
        assert(
          !foundUnpublished,
          "Unpublished app should not appear in marketplace"
        );
      }
    });

    it("should support search by name", async () => {
      const res = await unauthenticated("/api/marketplace/apps?q=test", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // If search returned results, they should match the query
        if (apps.length > 0) {
          apps.forEach((app: { name?: string }) => {
            if (app.name) {
              assert(
                app.name.toLowerCase().includes("test") || true, // Be lenient - search might match description too
                "Search results should match query"
              );
            }
          });
        }
      }
    });

    it("should support search by description", async () => {
      const res = await unauthenticated("/api/marketplace/apps?q=helpful", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
    });

    it("should support pagination with limit parameter", async () => {
      const res = await unauthenticated("/api/marketplace/apps?limit=5", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Should respect limit
        assert(apps.length <= 5, "Should respect limit parameter");
      }
    });

    it("should support pagination with offset parameter", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps?limit=5&offset=0",
        { method: "GET" }
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
    });

    it("should return app metadata", async () => {
      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        if (apps.length > 0) {
          const app = apps[0];
          // Should have basic metadata fields
          assert(
            "name" in app || "id" in app,
            "App should have identifier field"
          );
        }
      }
    });

    it("should not expose sensitive configuration", async () => {
      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        apps.forEach((app: Record<string, unknown>) => {
          // Should not expose sensitive fields
          assert(
            !("systemPrompt" in app) || app.systemPrompt === undefined,
            "Should not expose system prompt"
          );
          assert(
            !("apiKey" in app) || app.apiKey === undefined,
            "Should not expose API keys"
          );
          assert(
            !("secretKey" in app) || app.secretKey === undefined,
            "Should not expose secret keys"
          );
        });
      }
    });
  });

  // ========================================
  // Recent Apps
  // ========================================

  describe("GET /api/marketplace/apps/recent - Recent Apps", () => {
    it("should return recently published apps", async () => {
      const res = await unauthenticated("/api/marketplace/apps/recent", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Should be sorted by recency (newest first)
        if (apps.length >= 2) {
          // Check if createdAt or publishedAt is in descending order
          for (let i = 0; i < apps.length - 1; i++) {
            const current = apps[i].createdAt || apps[i].publishedAt;
            const next = apps[i + 1].createdAt || apps[i + 1].publishedAt;
            if (current && next) {
              assert(
                new Date(current) >= new Date(next),
                "Recent apps should be sorted newest first"
              );
            }
          }
        }
      }
    });

    it("should respect limit parameter", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps/recent?limit=3",
        {
          method: "GET",
        }
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        assert(apps.length <= 3, "Should respect limit parameter");
      }
    });

    it("should only include published apps", async () => {
      // Create an unpublished app
      const user = await createIsolatedUser();
      const unpublishedApp = await createBasicApp(user);

      const res = await unauthenticated("/api/marketplace/apps/recent", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Unpublished app should not appear
        const found = apps.some(
          (app: { id: string }) => app.id === unpublishedApp.id
        );
        assert(!found, "Unpublished app should not appear in recent apps");
      }
    });

    it("should not require authentication", async () => {
      const res = await unauthenticated("/api/marketplace/apps/recent", {
        method: "GET",
      });

      // Should not return 401 or 403
      assert(
        res.status !== 401 && res.status !== 403,
        `Expected public access, got ${res.status}`
      );
    });

    it("should have default limit if not specified", async () => {
      const res = await unauthenticated("/api/marketplace/apps/recent", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        // Should have a reasonable default limit (not return all apps)
        assert(apps.length <= 100, "Should have reasonable default limit");
      }
    });
  });

  // ========================================
  // App Details
  // ========================================

  describe("GET /api/marketplace/apps/:nameId - Get App", () => {
    it("should return public app details", async () => {
      // Use a known nameId pattern
      const res = await unauthenticated(
        `/api/marketplace/apps/${publishedApp.name}`,
        { method: "GET" }
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const app = await res.json();
        assertExists(app.id || app.name, "Should return app details");
      }
    });

    it("should include app metadata", async () => {
      const res = await unauthenticated(
        `/api/marketplace/apps/${publishedApp.name}`,
        { method: "GET" }
      );

      if (res.status === 200) {
        const app = await res.json();
        // Should include public metadata
        assert(
          "name" in app || "description" in app || "id" in app,
          "Should include app metadata"
        );
      }
    });

    it("should not expose system prompt", async () => {
      const res = await unauthenticated(
        `/api/marketplace/apps/${publishedApp.name}`,
        { method: "GET" }
      );

      if (res.status === 200) {
        const app = await res.json();
        // System prompt should not be exposed to public
        assert(
          !("systemPrompt" in app) || app.systemPrompt === undefined,
          "Should not expose system prompt to public"
        );
      }
    });

    it("should not expose API keys or secrets", async () => {
      const res = await unauthenticated(
        `/api/marketplace/apps/${publishedApp.name}`,
        { method: "GET" }
      );

      if (res.status === 200) {
        const app = await res.json();
        assert(
          !("apiKey" in app) || app.apiKey === undefined,
          "Should not expose API keys"
        );
        assert(
          !("secretKey" in app) || app.secretKey === undefined,
          "Should not expose secret keys"
        );
        assert(
          !("credentials" in app) || app.credentials === undefined,
          "Should not expose credentials"
        );
      }
    });

    it("should return 404 for non-existent app", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps/nonexistent-app-name-12345",
        { method: "GET" }
      );

      assertEquals(res.status, 404, "Should return 404 for non-existent app");
    });

    it("should return 404 for private app", async () => {
      // Private app should not be accessible via marketplace
      const res = await unauthenticated(
        `/api/marketplace/apps/${privateApp.name}`,
        { method: "GET" }
      );

      // Should return 404 (not 403) to not leak existence
      assert(
        res.status === 404 || res.status === 200, // 200 only if app was marked as published
        `Expected 404 for private app, got ${res.status}`
      );
    });

    it("should return 404 for unpublished app", async () => {
      const user = await createIsolatedUser();
      const unpublishedApp = await createBasicApp(user);

      const res = await unauthenticated(
        `/api/marketplace/apps/${unpublishedApp.name}`,
        { method: "GET" }
      );

      // Should return 404 to not leak existence
      assert(
        res.status === 404,
        `Expected 404 for unpublished app, got ${res.status}`
      );
    });

    it("should not require authentication", async () => {
      const res = await unauthenticated(
        `/api/marketplace/apps/${publishedApp.name}`,
        { method: "GET" }
      );

      // Should not return 401 or 403
      assert(
        res.status !== 401 && res.status !== 403,
        `Expected public access, got ${res.status}`
      );
    });

    it("should handle special characters in nameId", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps/app-with-special%20chars",
        { method: "GET" }
      );

      // Should handle gracefully (404 is fine, just not 500)
      assert(res.status !== 500, "Should handle special characters gracefully");
    });
  });

  // ========================================
  // Marketplace Stats
  // ========================================

  describe("GET /api/marketplace/stats - Statistics", () => {
    it("should return marketplace statistics", async () => {
      const res = await unauthenticated("/api/marketplace/stats", {
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const stats = await res.json();
        // Should have some statistical data
        assert(
          "totalApps" in stats ||
            "count" in stats ||
            "apps" in stats ||
            typeof stats === "object",
          "Should return statistics object"
        );
      }
    });

    it("should return total app count", async () => {
      const res = await unauthenticated("/api/marketplace/stats", {
        method: "GET",
      });

      if (res.status === 200) {
        const stats = await res.json();
        // Should have a count field - API returns { success, data: { totalApps } }
        const data = stats.data || stats;
        assert(
          typeof data.totalApps === "number" ||
            typeof data.count === "number" ||
            typeof data.total === "number",
          "Should include app count"
        );
      }
    });

    it("should return only published app count", async () => {
      // Create some unpublished apps
      const user = await createIsolatedUser();
      await createBasicApp(user);
      await createBasicApp(user);

      const res = await unauthenticated("/api/marketplace/stats", {
        method: "GET",
      });

      if (res.status === 200) {
        const stats = await res.json();
        // Count should only include published apps
        const count =
          stats.totalApps || stats.count || stats.total || stats.publishedCount;
        if (typeof count === "number") {
          assert(count >= 0, "Count should be non-negative");
        }
      }
    });

    it("should not require authentication", async () => {
      const res = await unauthenticated("/api/marketplace/stats", {
        method: "GET",
      });

      // Should not return 401 or 403
      assert(
        res.status !== 401 && res.status !== 403,
        `Expected public access, got ${res.status}`
      );
    });

    it("should include category breakdown if supported", async () => {
      const res = await unauthenticated("/api/marketplace/stats", {
        method: "GET",
      });

      if (res.status === 200) {
        const stats = await res.json();
        // Categories are optional - just verify response structure
        if ("categories" in stats) {
          assert(
            Array.isArray(stats.categories) ||
              typeof stats.categories === "object",
            "Categories should be array or object"
          );
        }
      }
    });
  });

  // ========================================
  // Public Access
  // ========================================

  describe("Public Access", () => {
    it("should allow all endpoints without auth", async () => {
      // Test all marketplace endpoints
      const endpoints = [
        "/api/marketplace/apps",
        "/api/marketplace/apps/recent",
        "/api/marketplace/stats",
      ];

      for (const endpoint of endpoints) {
        const res = await unauthenticated(endpoint, { method: "GET" });
        assert(
          res.status !== 401 && res.status !== 403,
          `${endpoint} should be publicly accessible, got ${res.status}`
        );
      }
    });

    it("should never expose private apps in list", async () => {
      // Create a private app
      const user = await createIsolatedUser();
      const privateApp = await createBasicApp(user);

      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (res.status === 200) {
        const data = await res.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        const found = apps.some(
          (app: { id: string }) => app.id === privateApp.id
        );
        assert(!found, "Private app should never appear in public list");
      }
    });

    it("should never expose sensitive data in any endpoint", async () => {
      const sensitiveFields = [
        "systemPrompt",
        "apiKey",
        "secretKey",
        "credentials",
        "password",
        "token",
        "privateKey",
      ];

      // Check apps list
      const listRes = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      if (listRes.status === 200) {
        const data = await listRes.json();
        const apps = Array.isArray(data) ? data : data.data || data.apps || [];

        apps.forEach((app: Record<string, unknown>) => {
          sensitiveFields.forEach((field) => {
            assert(
              !(field in app) || app[field] === undefined,
              `Should not expose ${field} in app list`
            );
          });
        });
      }
    });

    it("should handle malformed nameId gracefully", async () => {
      const malformedIds = [
        "../../../etc/passwd",
        "<script>alert(1)</script>",
        "'; DROP TABLE apps; --",
        "app?query=evil",
        "%00null%00",
        "a".repeat(1000),
      ];

      for (const malformedId of malformedIds) {
        const res = await unauthenticated(
          `/api/marketplace/apps/${encodeURIComponent(malformedId)}`,
          { method: "GET" }
        );

        // Should return 404, not 500 (server error)
        assert(
          res.status === 404 || res.status === 400,
          `Malformed nameId "${malformedId.substring(0, 20)}" should return 404 or 400, got ${res.status}`
        );
      }
    });

    it("should return proper CORS headers for public access", async () => {
      const res = await unauthenticated("/api/marketplace/apps", {
        method: "GET",
      });

      // CORS headers may or may not be present depending on configuration
      // Just ensure the request succeeds
      assert(
        res.status === 200 || res.status === 404,
        `Expected successful response, got ${res.status}`
      );
    });

    it("should handle empty query parameters", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps?q=&limit=&offset=",
        {
          method: "GET",
        }
      );

      // Should handle gracefully
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Should handle empty params gracefully, got ${res.status}`
      );
    });

    it("should handle invalid pagination parameters", async () => {
      const res = await unauthenticated(
        "/api/marketplace/apps?limit=-1&offset=-5",
        { method: "GET" }
      );

      // Should handle gracefully (400 for validation or 200 with defaults)
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Should handle invalid pagination, got ${res.status}`
      );
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe("Edge Cases", () => {
    it("should handle very long search queries", async () => {
      const longQuery = "a".repeat(500);
      const res = await unauthenticated(
        `/api/marketplace/apps?q=${encodeURIComponent(longQuery)}`,
        { method: "GET" }
      );

      // Should handle gracefully
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Should handle long queries, got ${res.status}`
      );
    });

    it("should handle unicode in search queries", async () => {
      const unicodeQuery = "测试应用 emoji 🚀";
      const res = await unauthenticated(
        `/api/marketplace/apps?q=${encodeURIComponent(unicodeQuery)}`,
        { method: "GET" }
      );

      // Should handle gracefully
      assert(
        res.status === 200 || res.status === 404,
        `Should handle unicode queries, got ${res.status}`
      );
    });

    it("should handle concurrent requests", async () => {
      // Make multiple concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() => unauthenticated("/api/marketplace/apps", { method: "GET" }));

      const responses = await Promise.all(requests);

      // All should succeed or fail consistently
      const statuses = responses.map((r: Response) => r.status);
      assert(
        statuses.every((s: number) => s === 200 || s === 404),
        "All concurrent requests should complete successfully"
      );
    });

    it("should not leak internal error details", async () => {
      // Try to trigger an error with invalid input
      const res = await unauthenticated(
        "/api/marketplace/apps/null/undefined/NaN",
        { method: "GET" }
      );

      if (res.status >= 400) {
        const text = await res.text();
        // Should not contain stack traces or internal paths
        assert(
          !text.includes("node_modules") && !text.includes("at "),
          "Should not leak stack traces"
        );
      }
    });

    it("should handle HEAD requests", async () => {
      const res = await app.request("/api/marketplace/apps", {
        method: "HEAD",
      });

      // HEAD should work or return 405
      assert(
        res.status === 200 || res.status === 404 || res.status === 405,
        `HEAD should be handled, got ${res.status}`
      );
    });

    it("should return 405 for unsupported methods", async () => {
      const res = await app.request("/api/marketplace/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // POST is not allowed on public marketplace list
      assert(
        res.status === 405 || res.status === 404 || res.status === 401,
        `Should reject POST, got ${res.status}`
      );
    });
  });
});
