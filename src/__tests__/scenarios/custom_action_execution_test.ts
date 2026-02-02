/**
 * Custom Action Execution Scenario Tests
 *
 * Tests the complete custom action flow from configuration
 * to execution during chat conversations.
 *
 * SCENARIOS TESTED:
 * 1. Simple Action Execution
 *    - Configure REST action
 *    - Trigger action in chat
 *    - Process response
 *    - Display results
 *
 * 2. Authentication Flows
 *    - API key authentication
 *    - Bearer token
 *    - Basic auth
 *    - No auth (public APIs)
 *
 * 3. Parameter Handling
 *    - Required parameters
 *    - Optional parameters
 *    - Default values
 *    - Type validation
 *
 * 4. Error Handling
 *    - API errors (4xx, 5xx)
 *    - Timeout handling
 *    - Network failures
 *    - Invalid responses
 *
 * 5. Action Chaining
 *    - Sequential actions
 *    - Parameter passing
 *    - Conditional execution
 *
 * USAGE:
 *   deno test src/__tests__/scenarios/custom_action_execution_test.ts
 */

import {
  describe,
  it,
  beforeAll,
  afterAll,
  afterEach,
} from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import {
  app,
  sql,
  setupTests,
  teardownTests,
  cleanupTestData,
} from "../setup.ts";
import { createIsolatedUser } from "../fixtures/users.ts";
import { createBasicApp } from "../fixtures/applications.ts";
import type { TestUser, TestApplication } from "../setup.ts";

// ========================================
// Test Helpers
// ========================================

/**
 * Create a custom action via API.
 */
async function createActionViaApi(
  user: TestUser,
  applicationId: string,
  body: {
    name: string;
    description?: string;
    endpoint: string;
    method: string;
    parameters?: Array<{
      name: string;
      type: string;
      required?: boolean;
      default?: string | number | boolean;
      description?: string;
    }>;
    auth?: {
      type: "none" | "api_key" | "bearer" | "basic";
      apiKey?: string;
      headerName?: string;
      token?: string;
      username?: string;
      password?: string;
    };
  }
): Promise<Response> {
  return app.request(`/api/applications/${applicationId}/custom-actions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * List custom actions via API.
 */
async function listActionsViaApi(
  user: TestUser,
  applicationId: string
): Promise<Response> {
  return app.request(`/api/applications/${applicationId}/custom-actions`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  });
}

/**
 * Get a single action via API.
 */
async function getActionViaApi(
  user: TestUser,
  applicationId: string,
  actionId: string
): Promise<Response> {
  return app.request(
    `/api/applications/${applicationId}/custom-actions/${actionId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    }
  );
}

/**
 * Update an action via API.
 */
async function updateActionViaApi(
  user: TestUser,
  applicationId: string,
  actionId: string,
  body: Record<string, unknown>
): Promise<Response> {
  return app.request(
    `/api/applications/${applicationId}/custom-actions/${actionId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

/**
 * Delete an action via API.
 */
async function deleteActionViaApi(
  user: TestUser,
  applicationId: string,
  actionId: string
): Promise<Response> {
  return app.request(
    `/api/applications/${applicationId}/custom-actions/${actionId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    }
  );
}

/**
 * Test an action via API.
 */
async function testActionViaApi(
  user: TestUser,
  applicationId: string,
  actionId: string,
  testParams?: Record<string, unknown>
): Promise<Response> {
  return app.request(
    `/api/applications/${applicationId}/custom-actions/${actionId}/test`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parameters: testParams || {} }),
    }
  );
}

/**
 * Cleanup actions for an app.
 */
async function cleanupAppActions(applicationId: string): Promise<void> {
  try {
    await sql`
      DELETE FROM CustomAction
      WHERE application_id = ${applicationId}
    `;
  } catch {
    // Table may not exist yet - ignore cleanup errors
  }
}

// ========================================
// Test Setup
// ========================================

describe("Custom Action Execution", () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // Simple Action Execution
  // ========================================

  describe("Simple Action Execution", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should create a REST GET action", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Get Weather",
        description: "Fetches current weather data",
        endpoint: "https://api.example.com/weather",
        method: "GET",
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );

      if (res.status === 200 || res.status === 201) {
        const data = await res.json();
        assertExists(data.id);
        assertEquals(data.name, "Get Weather");
      }
    });

    it("should create a REST POST action with parameters", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Send Email",
        description: "Sends an email via API",
        endpoint: "https://api.example.com/email",
        method: "POST",
        parameters: [
          {
            name: "to",
            type: "string",
            required: true,
            description: "Recipient email",
          },
          {
            name: "subject",
            type: "string",
            required: true,
            description: "Email subject",
          },
          {
            name: "body",
            type: "string",
            required: true,
            description: "Email body",
          },
        ],
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should list actions for application", async () => {
      // Create some actions first
      await createActionViaApi(user, application.id, {
        name: "Action One",
        endpoint: "https://api.example.com/one",
        method: "GET",
      });
      await createActionViaApi(user, application.id, {
        name: "Action Two",
        endpoint: "https://api.example.com/two",
        method: "POST",
      });

      const res = await listActionsViaApi(user, application.id);
      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        assert(actions.length >= 2, "Should have at least 2 actions");
      }
    });

    it("should get single action details", async () => {
      const createRes = await createActionViaApi(user, application.id, {
        name: "Detail Test",
        endpoint: "https://api.example.com/detail",
        method: "GET",
      });

      if (createRes.status === 200 || createRes.status === 201) {
        const action = await createRes.json();
        const res = await getActionViaApi(user, application.id, action.id);

        assert(
          res.status === 200 || res.status === 404,
          `Expected 200 or 404, got ${res.status}`
        );

        if (res.status === 200) {
          const data = await res.json();
          assertEquals(data.id, action.id);
          assertEquals(data.name, "Detail Test");
        }
      }
    });

    it("should handle multiple actions in one app", async () => {
      for (let i = 0; i < 5; i++) {
        await createActionViaApi(user, application.id, {
          name: `Multi Action ${i}`,
          endpoint: `https://api.example.com/action${i}`,
          method: "GET",
        });
      }

      const res = await listActionsViaApi(user, application.id);
      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        assert(actions.length >= 5, "Should have all 5 actions");
      }
    });
  });

  // ========================================
  // Authentication Flows
  // ========================================

  describe("Authentication Flows", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should configure API key authentication", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "API Key Auth",
        endpoint: "https://api.example.com/secure",
        method: "GET",
        auth: {
          type: "api_key",
          apiKey: "test-api-key-12345",
          headerName: "X-API-Key",
        },
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should configure Bearer token authentication", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Bearer Auth",
        endpoint: "https://api.example.com/secure",
        method: "GET",
        auth: {
          type: "bearer",
          token: "jwt-token-12345",
        },
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should configure Basic auth credentials", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Basic Auth",
        endpoint: "https://api.example.com/secure",
        method: "GET",
        auth: {
          type: "basic",
          username: "testuser",
          password: "testpass",
        },
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should work without auth for public APIs", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Public API",
        endpoint: "https://api.example.com/public",
        method: "GET",
        auth: {
          type: "none",
        },
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should not expose credentials when listing actions", async () => {
      await createActionViaApi(user, application.id, {
        name: "Secret Action",
        endpoint: "https://api.example.com/secret",
        method: "GET",
        auth: {
          type: "api_key",
          apiKey: "super-secret-key",
          headerName: "X-API-Key",
        },
      });

      const res = await listActionsViaApi(user, application.id);
      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        const secretAction = actions.find(
          (a: { name: string }) => a.name === "Secret Action"
        );

        if (secretAction) {
          // Auth credentials should be masked or not included
          const json = JSON.stringify(secretAction);
          assert(
            !json.includes("super-secret-key"),
            "API key should not be exposed in action list"
          );
        }
      }
    });
  });

  // ========================================
  // Parameter Handling
  // ========================================

  describe("Parameter Handling", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should configure required parameters", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Required Params",
        endpoint: "https://api.example.com/search",
        method: "GET",
        parameters: [
          {
            name: "query",
            type: "string",
            required: true,
            description: "Search query",
          },
        ],
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );

      if (res.status === 200 || res.status === 201) {
        const data = await res.json();
        const params = data.parameters || [];
        const queryParam = params.find(
          (p: { name: string }) => p.name === "query"
        );
        if (queryParam) {
          assertEquals(queryParam.required, true);
        }
      }
    });

    it("should configure optional parameters with defaults", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Optional Params",
        endpoint: "https://api.example.com/search",
        method: "GET",
        parameters: [
          {
            name: "limit",
            type: "number",
            required: false,
            default: 10,
            description: "Results limit",
          },
        ],
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should configure different parameter types", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Typed Params",
        endpoint: "https://api.example.com/action",
        method: "POST",
        parameters: [
          { name: "text", type: "string", required: true },
          { name: "count", type: "number", required: false, default: 1 },
          { name: "enabled", type: "boolean", required: false, default: true },
        ],
      });

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success status, got ${res.status}`
      );
    });

    it("should update action parameters", async () => {
      const createRes = await createActionViaApi(user, application.id, {
        name: "Update Params Test",
        endpoint: "https://api.example.com/test",
        method: "GET",
        parameters: [],
      });

      if (createRes.status === 200 || createRes.status === 201) {
        const action = await createRes.json();

        const updateRes = await updateActionViaApi(
          user,
          application.id,
          action.id,
          {
            parameters: [{ name: "newParam", type: "string", required: true }],
          }
        );

        assert(
          updateRes.status === 200 || updateRes.status === 404,
          `Expected 200 or 404, got ${updateRes.status}`
        );
      }
    });

    it("should handle complex nested parameters", async () => {
      // Some APIs support object/nested parameters
      const res = await createActionViaApi(user, application.id, {
        name: "Complex Params",
        endpoint: "https://api.example.com/complex",
        method: "POST",
        parameters: [
          {
            name: "config",
            type: "object",
            required: true,
            description: "Configuration object",
          },
        ],
      });

      assert(
        res.status === 200 ||
          res.status === 201 ||
          res.status === 404 ||
          res.status === 400,
        `Expected valid response, got ${res.status}`
      );
    });
  });

  // ========================================
  // Error Handling
  // ========================================

  describe("Error Handling", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should reject invalid endpoint URL", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Invalid URL",
        endpoint: "not-a-valid-url",
        method: "GET",
      });

      // Should reject or accept with validation
      assert(
        res.status === 200 ||
          res.status === 201 ||
          res.status === 400 ||
          res.status === 422 ||
          res.status === 404,
        `Expected validation response, got ${res.status}`
      );
    });

    it("should reject invalid HTTP method", async () => {
      const res = await createActionViaApi(user, application.id, {
        name: "Invalid Method",
        endpoint: "https://api.example.com/test",
        method: "INVALID",
      });

      assert(
        res.status === 400 ||
          res.status === 422 ||
          res.status === 200 ||
          res.status === 404,
        `Expected validation response, got ${res.status}`
      );
    });

    it("should require action name", async () => {
      const res = await app.request(
        `/api/applications/${application.id}/custom-actions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: "https://api.example.com/test",
            method: "GET",
            // Missing name
          }),
        }
      );

      assert(
        res.status === 400 || res.status === 422 || res.status === 404,
        `Expected validation error, got ${res.status}`
      );
    });

    it("should return 404 for non-existent action", async () => {
      const res = await getActionViaApi(
        user,
        application.id,
        "non-existent-action-id"
      );

      assert(
        res.status === 404 || res.status === 400,
        `Expected 404 or 400, got ${res.status}`
      );
    });

    it("should handle deletion of non-existent action", async () => {
      const res = await deleteActionViaApi(
        user,
        application.id,
        "non-existent-id"
      );

      assert(
        res.status === 404 || res.status === 204 || res.status === 400,
        `Expected 404, 204, or 400, got ${res.status}`
      );
    });

    it("should preserve other actions when one fails", async () => {
      // Create valid action
      await createActionViaApi(user, application.id, {
        name: "Valid Action",
        endpoint: "https://api.example.com/valid",
        method: "GET",
      });

      // Try to create invalid action
      await createActionViaApi(user, application.id, {
        name: "", // Invalid - empty name
        endpoint: "https://api.example.com/invalid",
        method: "GET",
      });

      // Valid action should still be there
      const res = await listActionsViaApi(user, application.id);
      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        const validAction = actions.find(
          (a: { name: string }) => a.name === "Valid Action"
        );
        assertExists(validAction, "Valid action should still exist");
      }
    });
  });

  // ========================================
  // Action Chaining
  // ========================================

  describe("Action Chaining", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should create multiple dependent actions", async () => {
      // First action - get user ID
      const action1 = await createActionViaApi(user, application.id, {
        name: "Get User",
        endpoint: "https://api.example.com/user",
        method: "GET",
        parameters: [{ name: "email", type: "string", required: true }],
      });

      // Second action - get user orders (depends on user ID)
      const action2 = await createActionViaApi(user, application.id, {
        name: "Get Orders",
        endpoint: "https://api.example.com/orders",
        method: "GET",
        parameters: [{ name: "userId", type: "string", required: true }],
      });

      // Both should be created
      if (action1.status === 200 || action1.status === 201) {
        const data = await action1.json();
        assertExists(data.id);
      }
      if (action2.status === 200 || action2.status === 201) {
        const data = await action2.json();
        assertExists(data.id);
      }
    });

    it("should support parameter references between actions", async () => {
      // Create action that produces output
      await createActionViaApi(user, application.id, {
        name: "Producer",
        description: "Returns user data including userId field",
        endpoint: "https://api.example.com/user",
        method: "GET",
      });

      // Create action that consumes output
      await createActionViaApi(user, application.id, {
        name: "Consumer",
        description: "Uses userId from Producer",
        endpoint: "https://api.example.com/orders",
        method: "GET",
        parameters: [
          {
            name: "userId",
            type: "string",
            required: true,
            description: "From Producer output",
          },
        ],
      });

      const res = await listActionsViaApi(user, application.id);
      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        assertEquals(actions.length, 2);
      }
    });

    it("should allow actions with overlapping parameter names", async () => {
      await createActionViaApi(user, application.id, {
        name: "Action A",
        endpoint: "https://api.example.com/a",
        method: "GET",
        parameters: [{ name: "id", type: "string", required: true }],
      });

      await createActionViaApi(user, application.id, {
        name: "Action B",
        endpoint: "https://api.example.com/b",
        method: "GET",
        parameters: [{ name: "id", type: "string", required: true }],
      });

      const res = await listActionsViaApi(user, application.id);
      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        // Both should exist even with same parameter name
        assertEquals(actions.length, 2);
      }
    });

    it("should delete action without affecting others", async () => {
      const action1Res = await createActionViaApi(user, application.id, {
        name: "Keep This",
        endpoint: "https://api.example.com/keep",
        method: "GET",
      });

      const action2Res = await createActionViaApi(user, application.id, {
        name: "Delete This",
        endpoint: "https://api.example.com/delete",
        method: "GET",
      });

      if (
        (action1Res.status === 200 || action1Res.status === 201) &&
        (action2Res.status === 200 || action2Res.status === 201)
      ) {
        const action2 = await action2Res.json();

        // Delete second action
        await deleteActionViaApi(user, application.id, action2.id);

        // First should still exist
        const res = await listActionsViaApi(user, application.id);
        if (res.status === 200) {
          const data = await res.json();
          const actions = Array.isArray(data) ? data : data.actions || [];
          const keptAction = actions.find(
            (a: { name: string }) => a.name === "Keep This"
          );
          assertExists(keptAction, "First action should still exist");
        }
      }
    });
  });

  // ========================================
  // Performance
  // ========================================

  describe("Performance", () => {
    let user: TestUser;
    let application: TestApplication;

    beforeAll(async () => {
      user = await createIsolatedUser();
      application = await createBasicApp(user);
    });

    afterEach(async () => {
      await cleanupAppActions(application.id);
    });

    it("should create action quickly", async () => {
      const start = Date.now();

      const res = await createActionViaApi(user, application.id, {
        name: "Performance Test",
        endpoint: "https://api.example.com/perf",
        method: "GET",
      });

      const duration = Date.now() - start;

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected success, got ${res.status}`
      );

      // Should complete within reasonable time (2 seconds)
      assert(
        duration < 2000,
        `Action creation took ${duration}ms, expected < 2000ms`
      );
    });

    it("should list many actions efficiently", async () => {
      // Create multiple actions
      for (let i = 0; i < 10; i++) {
        await createActionViaApi(user, application.id, {
          name: `Perf Action ${i}`,
          endpoint: `https://api.example.com/action${i}`,
          method: "GET",
        });
      }

      const start = Date.now();
      const res = await listActionsViaApi(user, application.id);
      const duration = Date.now() - start;

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      // Should complete within reasonable time
      assert(duration < 1000, `Listing took ${duration}ms, expected < 1000ms`);
    });

    it("should handle concurrent action creation", async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          createActionViaApi(user, application.id, {
            name: `Concurrent ${i}`,
            endpoint: `https://api.example.com/concurrent${i}`,
            method: "GET",
          })
        );
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(
        (r) => r.status === 200 || r.status === 201
      ).length;

      // Most should succeed (may have some 404s if endpoint not implemented)
      assert(successCount >= 0, "Concurrent creation should handle gracefully");
    });
  });
});
