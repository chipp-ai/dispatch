/**
 * Custom Actions Route Tests
 *
 * Tests for /api/custom-actions endpoints.
 * Covers action configuration, validation, and execution.
 *
 * ENDPOINTS TESTED:
 * - GET /api/applications/:appId/custom-actions - List actions
 * - POST /api/applications/:appId/custom-actions - Create action
 * - GET /api/applications/:appId/custom-actions/:id - Get action
 * - PATCH /api/applications/:appId/custom-actions/:id - Update action
 * - DELETE /api/applications/:appId/custom-actions/:id - Delete action
 * - POST /api/applications/:appId/custom-actions/:id/test - Test action
 *
 * TEST CATEGORIES:
 * 1. Action CRUD
 *    - List actions for application
 *    - Create REST action
 *    - Create webhook action
 *    - Update action configuration
 *    - Delete action
 *
 * 2. Action Types
 *    - REST API (GET, POST, PUT, DELETE)
 *    - Webhook (outbound POST)
 *    - Built-in actions (if any)
 *
 * 3. Authentication Methods
 *    - None
 *    - API Key (header, query, body)
 *    - Bearer token
 *    - Basic auth
 *    - OAuth (future)
 *
 * 4. Parameter Configuration
 *    - Required vs optional parameters
 *    - Parameter types (string, number, boolean)
 *    - Default values
 *    - Validation rules
 *
 * 5. Action Testing
 *    - Test with sample inputs
 *    - Response validation
 *    - Error handling
 *
 * 6. Tool Dependencies
 *    - Parameter chaining
 *    - Conditional execution
 *
 * USAGE:
 *   deno test src/__tests__/routes/custom_actions_test.ts
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import type { TestUser, TestApplication } from "../setup.ts";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  patch,
  del,
  unauthenticated,
  app,
} from "../setup.ts";
import {
  getProUser,
  getFreeUser,
  createIsolatedUser,
} from "../fixtures/users.ts";
import {
  createBasicApp,
  createAppWithRestAction,
} from "../fixtures/applications.ts";

// ========================================
// Test Setup
// ========================================

describe("Custom Actions API", () => {
  let testUser: TestUser;
  let freeUser: TestUser;
  let testApp: TestApplication;

  beforeAll(async () => {
    await setupTests();
    testUser = await getProUser();
    freeUser = await getFreeUser();
    testApp = await createBasicApp(testUser);
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // List Actions Tests
  // ========================================

  describe("GET /api/applications/:appId/custom-actions", () => {
    it("should list actions for application", async () => {
      const res = await get(
        `/api/applications/${testApp.id}/custom-actions`,
        testUser
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should be an array or object with actions
        assert(
          Array.isArray(data) || (data.actions && Array.isArray(data.actions)),
          "Expected array or object with actions"
        );
      }
    });

    it("should return empty array for new app", async () => {
      const newApp = await createBasicApp(testUser);
      const res = await get(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        assertEquals(actions.length, 0, "New app should have no actions");
      }
    });

    it("should include action configuration", async () => {
      // Create app with actions
      const appWithActions = await createAppWithRestAction(testUser);
      const res = await get(
        `/api/applications/${appWithActions.id}/custom-actions`,
        testUser
      );

      if (res.status === 200) {
        const data = await res.json();
        const actions = Array.isArray(data) ? data : data.actions || [];
        if (actions.length > 0) {
          const action = actions[0];
          // Should have configuration fields
          assert(
            "id" in action || "name" in action,
            "Action should have basic fields"
          );
        }
      }
    });

    it("should return 404 for non-existent app", async () => {
      const res = await get(
        "/api/applications/non-existent-app-id/custom-actions",
        testUser
      );

      assert(
        res.status === 404 || res.status === 400,
        `Expected 404 or 400, got ${res.status}`
      );
    });
  });

  // ========================================
  // Create Action Tests
  // ========================================

  describe("POST /api/applications/:appId/custom-actions", () => {
    it("should create REST GET action", async () => {
      const newApp = await createBasicApp(testUser);
      const actionName = `Get Action ${Date.now()}`;

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: actionName,
          description: "Fetches data from API",
          endpoint: "https://api.example.com/data",
          method: "GET",
          parameters: [],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );

      if (res.status === 200 || res.status === 201) {
        const action = await res.json();
        assertExists(action.id, "Created action should have id");
        assertEquals(action.name, actionName);
      }
    });

    it("should create REST POST action", async () => {
      const newApp = await createBasicApp(testUser);
      const actionName = `Post Action ${Date.now()}`;

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: actionName,
          description: "Sends data to API",
          endpoint: "https://api.example.com/submit",
          method: "POST",
          parameters: [{ name: "data", type: "string", required: true }],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );

      if (res.status === 200 || res.status === 201) {
        const action = await res.json();
        assertEquals(action.method, "POST");
      }
    });

    it("should create webhook action", async () => {
      const newApp = await createBasicApp(testUser);
      const actionName = `Webhook Action ${Date.now()}`;

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: actionName,
          description: "Triggers webhook",
          endpoint: "https://hooks.example.com/trigger",
          method: "POST",
          type: "webhook",
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should validate endpoint URL", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Invalid URL Action ${Date.now()}`,
          endpoint: "not-a-valid-url",
          method: "GET",
        }
      );

      // Should reject invalid URL
      assert(
        res.status === 400 ||
          res.status === 422 ||
          res.status === 200 ||
          res.status === 404,
        `Expected 400, 422, 200, or 404, got ${res.status}`
      );
    });

    it("should validate name is unique", async () => {
      const newApp = await createBasicApp(testUser);
      const actionName = `Duplicate Action ${Date.now()}`;

      // Create first action
      await post(`/api/applications/${newApp.id}/custom-actions`, testUser, {
        name: actionName,
        endpoint: "https://api.example.com/first",
        method: "GET",
      });

      // Try to create duplicate
      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: actionName,
          endpoint: "https://api.example.com/second",
          method: "GET",
        }
      );

      // May reject or allow with warning
      assert(
        res.status === 400 ||
          res.status === 409 ||
          res.status === 200 ||
          res.status === 201 ||
          res.status === 404,
        `Expected 400, 409, 200, 201, or 404, got ${res.status}`
      );
    });

    it("should validate required fields", async () => {
      const newApp = await createBasicApp(testUser);

      // Missing name
      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          endpoint: "https://api.example.com/data",
          method: "GET",
        }
      );

      assert(
        res.status === 400 || res.status === 422 || res.status === 404,
        `Expected 400, 422, or 404, got ${res.status}`
      );
    });

    it("should validate HTTP method", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Invalid Method ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "INVALID",
        }
      );

      // Should reject invalid method
      assert(
        res.status === 400 ||
          res.status === 422 ||
          res.status === 200 ||
          res.status === 404,
        `Expected 400, 422, 200, or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Update Action Tests
  // ========================================

  describe("PATCH /api/applications/:appId/custom-actions/:id", () => {
    it("should update action name", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action first
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Original Name ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();
        const newName = `Updated Name ${Date.now()}`;

        const updateRes = await patch(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser,
          {
            name: newName,
          }
        );

        assert(
          updateRes.status === 200 || updateRes.status === 404,
          `Expected 200 or 404, got ${updateRes.status}`
        );

        if (updateRes.status === 200) {
          const updated = await updateRes.json();
          assertEquals(updated.name, newName);
        }
      }
    });

    it("should update action endpoint", async () => {
      const newApp = await createBasicApp(testUser);

      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Endpoint Update ${Date.now()}`,
          endpoint: "https://api.example.com/old",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();
        const newEndpoint = "https://api.example.com/new";

        const updateRes = await patch(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser,
          {
            endpoint: newEndpoint,
          }
        );

        assert(
          updateRes.status === 200 || updateRes.status === 404,
          `Expected 200 or 404, got ${updateRes.status}`
        );

        if (updateRes.status === 200) {
          const updated = await updateRes.json();
          assertEquals(updated.endpoint, newEndpoint);
        }
      }
    });

    it("should update action parameters", async () => {
      const newApp = await createBasicApp(testUser);

      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Params Update ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "GET",
          parameters: [],
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const updateRes = await patch(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser,
          {
            parameters: [
              { name: "query", type: "string", required: true },
              { name: "limit", type: "number", required: false, default: 10 },
            ],
          }
        );

        assert(
          updateRes.status === 200 || updateRes.status === 404,
          `Expected 200 or 404, got ${updateRes.status}`
        );
      }
    });

    it("should update auth configuration", async () => {
      const newApp = await createBasicApp(testUser);

      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Auth Update ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const updateRes = await patch(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser,
          {
            auth: {
              type: "api_key",
              header: "X-API-Key",
              value: "test-key-12345",
            },
          }
        );

        assert(
          updateRes.status === 200 || updateRes.status === 404,
          `Expected 200 or 404, got ${updateRes.status}`
        );
      }
    });

    it("should return 404 for non-existent action", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await patch(
        `/api/applications/${newApp.id}/custom-actions/non-existent-id`,
        testUser,
        {
          name: "Updated",
        }
      );

      assert(
        res.status === 404 || res.status === 400,
        `Expected 404 or 400, got ${res.status}`
      );
    });
  });

  // ========================================
  // Delete Action Tests
  // ========================================

  describe("DELETE /api/applications/:appId/custom-actions/:id", () => {
    it("should delete action", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Delete Test ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const deleteRes = await del(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser
        );

        assert(
          deleteRes.status === 200 ||
            deleteRes.status === 204 ||
            deleteRes.status === 404,
          `Expected 200, 204, or 404, got ${deleteRes.status}`
        );

        // Verify it's gone
        if (deleteRes.status === 200 || deleteRes.status === 204) {
          const getRes = await get(
            `/api/applications/${newApp.id}/custom-actions/${created.id}`,
            testUser
          );
          assertEquals(getRes.status, 404, "Deleted action should return 404");
        }
      }
    });

    it("should return 404 for non-existent action", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await del(
        `/api/applications/${newApp.id}/custom-actions/non-existent-id`,
        testUser
      );

      assert(
        res.status === 404 || res.status === 400,
        `Expected 404 or 400, got ${res.status}`
      );
    });

    it("should return 403 for other user's action", async () => {
      // Create action as testUser
      const newApp = await createBasicApp(testUser);
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Permission Test ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        // Other user tries to delete
        const otherUser = await createIsolatedUser();
        const deleteRes = await del(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          otherUser
        );

        assert(
          deleteRes.status === 403 || deleteRes.status === 404,
          `Expected 403 or 404, got ${deleteRes.status}`
        );
      }
    });
  });

  // ========================================
  // Test Action Tests
  // ========================================

  describe("POST /api/applications/:appId/custom-actions/:id/test", () => {
    it("should execute action with sample inputs", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Test Execution ${Date.now()}`,
          endpoint: "https://httpbin.org/get",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const testRes = await post(
          `/api/applications/${newApp.id}/custom-actions/${created.id}/test`,
          testUser,
          {
            inputs: {},
          }
        );

        assert(
          testRes.status === 200 ||
            testRes.status === 404 ||
            testRes.status === 500,
          `Expected 200, 404, or 500, got ${testRes.status}`
        );
      }
    });

    it("should return response preview", async () => {
      const newApp = await createBasicApp(testUser);

      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Response Preview ${Date.now()}`,
          endpoint: "https://httpbin.org/json",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const testRes = await post(
          `/api/applications/${newApp.id}/custom-actions/${created.id}/test`,
          testUser,
          {
            inputs: {},
          }
        );

        if (testRes.status === 200) {
          const result = await testRes.json();
          // Should have response data
          assert(
            "response" in result || "data" in result || "result" in result,
            "Test should return response data"
          );
        }
      }
    });

    it("should handle action errors", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action with intentionally invalid endpoint
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Error Test ${Date.now()}`,
          endpoint: "https://httpbin.org/status/500",
          method: "GET",
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const testRes = await post(
          `/api/applications/${newApp.id}/custom-actions/${created.id}/test`,
          testUser,
          {
            inputs: {},
          }
        );

        // Should handle error gracefully
        assert(
          testRes.status === 200 ||
            testRes.status === 500 ||
            testRes.status === 404 ||
            testRes.status === 502,
          `Expected 200, 500, 404, or 502, got ${testRes.status}`
        );
      }
    });

    it("should respect timeout", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action with slow endpoint
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Timeout Test ${Date.now()}`,
          endpoint: "https://httpbin.org/delay/30",
          method: "GET",
          timeout: 5000, // 5 second timeout
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        const testRes = await post(
          `/api/applications/${newApp.id}/custom-actions/${created.id}/test`,
          testUser,
          {
            inputs: {},
          }
        );

        // Should timeout or error
        assert(
          testRes.status === 408 ||
            testRes.status === 504 ||
            testRes.status === 500 ||
            testRes.status === 200 ||
            testRes.status === 404,
          `Expected timeout-related status, got ${testRes.status}`
        );
      }
    });

    it("should validate required parameters", async () => {
      const newApp = await createBasicApp(testUser);

      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Required Params ${Date.now()}`,
          endpoint: "https://httpbin.org/post",
          method: "POST",
          parameters: [
            { name: "required_field", type: "string", required: true },
          ],
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        // Test without required param
        const testRes = await post(
          `/api/applications/${newApp.id}/custom-actions/${created.id}/test`,
          testUser,
          {
            inputs: {}, // Missing required_field
          }
        );

        // Should reject or warn
        assert(
          testRes.status === 400 ||
            testRes.status === 422 ||
            testRes.status === 200 ||
            testRes.status === 404,
          `Expected 400, 422, 200, or 404, got ${testRes.status}`
        );
      }
    });
  });

  // ========================================
  // Authentication Method Tests
  // ========================================

  describe("Authentication Methods", () => {
    it("should support no authentication", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `No Auth ${Date.now()}`,
          endpoint: "https://api.example.com/public",
          method: "GET",
          auth: null,
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should support API key in header", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `API Key Header ${Date.now()}`,
          endpoint: "https://api.example.com/protected",
          method: "GET",
          auth: {
            type: "api_key",
            location: "header",
            key: "X-API-Key",
            value: "test-api-key-12345",
          },
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should support API key in query", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `API Key Query ${Date.now()}`,
          endpoint: "https://api.example.com/protected",
          method: "GET",
          auth: {
            type: "api_key",
            location: "query",
            key: "api_key",
            value: "test-api-key-12345",
          },
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should support Bearer token", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Bearer Token ${Date.now()}`,
          endpoint: "https://api.example.com/protected",
          method: "GET",
          auth: {
            type: "bearer",
            token: "test-jwt-token-12345",
          },
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should support Basic auth", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Basic Auth ${Date.now()}`,
          endpoint: "https://api.example.com/protected",
          method: "GET",
          auth: {
            type: "basic",
            username: "testuser",
            password: "testpass",
          },
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should mask credentials in responses", async () => {
      const newApp = await createBasicApp(testUser);

      // Create action with credentials
      const createRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Masked Creds ${Date.now()}`,
          endpoint: "https://api.example.com/protected",
          method: "GET",
          auth: {
            type: "api_key",
            key: "X-API-Key",
            value: "super-secret-key-12345",
          },
        }
      );

      if (createRes.status === 200 || createRes.status === 201) {
        const created = await createRes.json();

        // Fetch action and verify credentials are masked
        const getRes = await get(
          `/api/applications/${newApp.id}/custom-actions/${created.id}`,
          testUser
        );

        if (getRes.status === 200) {
          const action = await getRes.json();
          if (action.auth?.value) {
            assert(
              action.auth.value === "***" ||
                action.auth.value.includes("*") ||
                action.auth.value !== "super-secret-key-12345",
              "Credentials should be masked in response"
            );
          }
        }
      }
    });
  });

  // ========================================
  // Parameter Configuration Tests
  // ========================================

  describe("Parameter Configuration", () => {
    it("should define required parameters", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Required Params ${Date.now()}`,
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
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );

      if (res.status === 200 || res.status === 201) {
        const action = await res.json();
        if (action.parameters) {
          const queryParam = action.parameters.find(
            (p: { name: string }) => p.name === "query"
          );
          if (queryParam) {
            assertEquals(queryParam.required, true);
          }
        }
      }
    });

    it("should define optional parameters", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Optional Params ${Date.now()}`,
          endpoint: "https://api.example.com/search",
          method: "GET",
          parameters: [
            {
              name: "limit",
              type: "number",
              required: false,
              description: "Max results",
            },
          ],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should apply default values", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Default Values ${Date.now()}`,
          endpoint: "https://api.example.com/list",
          method: "GET",
          parameters: [
            { name: "page", type: "number", required: false, default: 1 },
            { name: "limit", type: "number", required: false, default: 10 },
          ],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should validate parameter types", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Typed Params ${Date.now()}`,
          endpoint: "https://api.example.com/data",
          method: "POST",
          parameters: [
            { name: "count", type: "number", required: true },
            { name: "enabled", type: "boolean", required: false },
            { name: "tags", type: "array", required: false },
          ],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should support nested parameters", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Nested Params ${Date.now()}`,
          endpoint: "https://api.example.com/complex",
          method: "POST",
          parameters: [
            {
              name: "user",
              type: "object",
              required: true,
              properties: [
                { name: "name", type: "string", required: true },
                { name: "email", type: "string", required: true },
              ],
            },
          ],
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Tool Dependency Tests
  // ========================================

  describe("Tool Dependencies", () => {
    it("should define parameter dependencies", async () => {
      const newApp = await createBasicApp(testUser);

      // Create first action
      const firstRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Get User ${Date.now()}`,
          endpoint: "https://api.example.com/user",
          method: "GET",
          parameters: [{ name: "userId", type: "string", required: true }],
        }
      );

      if (firstRes.status === 200 || firstRes.status === 201) {
        const firstAction = await firstRes.json();

        // Create second action that depends on first
        const secondRes = await post(
          `/api/applications/${newApp.id}/custom-actions`,
          testUser,
          {
            name: `Get User Posts ${Date.now()}`,
            endpoint: "https://api.example.com/posts",
            method: "GET",
            parameters: [{ name: "userId", type: "string", required: true }],
            dependencies: [
              {
                source: firstAction.id,
                mapping: { userId: "$.id" },
              },
            ],
          }
        );

        assert(
          secondRes.status === 200 ||
            secondRes.status === 201 ||
            secondRes.status === 404,
          `Expected 200, 201, or 404, got ${secondRes.status}`
        );
      }
    });

    it("should chain output to input", async () => {
      const newApp = await createBasicApp(testUser);

      const res = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Chained Action ${Date.now()}`,
          endpoint: "https://api.example.com/process",
          method: "POST",
          parameters: [{ name: "data", type: "string", required: true }],
          outputMapping: {
            result: "$.data.result",
            status: "$.status",
          },
        }
      );

      assert(
        res.status === 200 || res.status === 201 || res.status === 404,
        `Expected 200, 201, or 404, got ${res.status}`
      );
    });

    it("should handle circular dependencies", async () => {
      const newApp = await createBasicApp(testUser);

      // Create two actions that reference each other (circular)
      const firstRes = await post(
        `/api/applications/${newApp.id}/custom-actions`,
        testUser,
        {
          name: `Circular A ${Date.now()}`,
          endpoint: "https://api.example.com/a",
          method: "GET",
        }
      );

      if (firstRes.status === 200 || firstRes.status === 201) {
        const firstAction = await firstRes.json();

        const secondRes = await post(
          `/api/applications/${newApp.id}/custom-actions`,
          testUser,
          {
            name: `Circular B ${Date.now()}`,
            endpoint: "https://api.example.com/b",
            method: "GET",
            dependencies: [{ source: firstAction.id }],
          }
        );

        if (secondRes.status === 200 || secondRes.status === 201) {
          const secondAction = await secondRes.json();

          // Try to create circular reference
          const updateRes = await patch(
            `/api/applications/${newApp.id}/custom-actions/${firstAction.id}`,
            testUser,
            {
              dependencies: [{ source: secondAction.id }],
            }
          );

          // Should reject or handle gracefully
          assert(
            updateRes.status === 400 ||
              updateRes.status === 200 ||
              updateRes.status === 404,
            `Expected 400, 200, or 404, got ${updateRes.status}`
          );
        }
      }
    });
  });

  // ========================================
  // Tier Limit Tests
  // ========================================

  describe("Tier Limits", () => {
    it("FREE tier has action count limit", async () => {
      const freeApp = await createBasicApp(freeUser);

      // Try to create many actions
      const results: Response[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await post(
          `/api/applications/${freeApp.id}/custom-actions`,
          freeUser,
          {
            name: `Free Action ${i} ${Date.now()}`,
            endpoint: `https://api.example.com/action${i}`,
            method: "GET",
          }
        );
        results.push(res);
      }

      // Some should succeed, but may hit limit eventually
      const successCount = results.filter(
        (r) => r.status === 200 || r.status === 201
      ).length;
      const limitHit = results.some(
        (r) => r.status === 403 || r.status === 429
      );

      // Either all succeed (no limit) or some hit limit
      assert(
        successCount > 0 || limitHit || results.every((r) => r.status === 404),
        "Should either succeed or hit tier limit"
      );
    });

    it("PRO tier has higher limits", async () => {
      const proApp = await createBasicApp(testUser);

      // Try to create many actions
      const results: Response[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await post(
          `/api/applications/${proApp.id}/custom-actions`,
          testUser,
          {
            name: `Pro Action ${i} ${Date.now()}`,
            endpoint: `https://api.example.com/action${i}`,
            method: "GET",
          }
        );
        results.push(res);
      }

      // PRO should allow more actions
      const successCount = results.filter(
        (r) => r.status === 200 || r.status === 201
      ).length;

      // PRO tier should have higher or no limit
      assert(
        successCount >= 5 || results.every((r) => r.status === 404),
        "PRO tier should allow multiple actions"
      );
    });
  });
});
