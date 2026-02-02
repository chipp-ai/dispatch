/**
 * Action Collections API Route Tests
 *
 * Tests for action collection management including CRUD operations
 * and action template management.
 *
 * ENDPOINTS TESTED:
 * - GET    /api/action-collections                     - List collections
 * - POST   /api/action-collections                     - Create collection
 * - GET    /api/action-collections/:id                 - Get collection
 * - PATCH  /api/action-collections/:id                 - Update collection
 * - DELETE /api/action-collections/:id                 - Delete collection
 * - GET    /api/action-collections/:id/actions         - Get actions
 * - POST   /api/action-collections/:id/actions         - Add action
 * - DELETE /api/action-collections/:id/actions/:id     - Remove action
 *
 * USAGE:
 *   deno test src/__tests__/routes/action_collections_test.ts
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
} from "../setup.ts";
import { getProUser, createIsolatedUser } from "../fixtures/users.ts";
import { createBasicApp } from "../fixtures/applications.ts";

// ========================================
// Test Setup
// ========================================

describe("Action Collections API", () => {
  let testUser: TestUser;
  let testApp: TestApplication;

  beforeAll(async () => {
    await setupTests();
    testUser = await getProUser();
    testApp = await createBasicApp(testUser);
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // List Collections
  // ========================================

  describe("GET /api/action-collections - List Collections", () => {
    it("should list user's collections", async () => {
      const res = await get("/api/action-collections", testUser);

      assertEquals(res.status, 200, `Expected 200, got ${res.status}`);

      const body = await res.json();
      assertExists(body.data, "Response should have data field");
      assertExists(body.data.collections, "Data should have collections array");
      assert(
        Array.isArray(body.data.collections),
        "Collections should be an array"
      );
    });

    it("should filter by scope=PUBLIC", async () => {
      const res = await get("/api/action-collections?scope=PUBLIC", testUser);

      assertEquals(res.status, 200);

      const body = await res.json();
      // All returned should be public
      for (const collection of body.data.collections) {
        assertEquals(
          collection.isPublic,
          true,
          "Filtered collections should be public"
        );
      }
    });

    it("should filter by scope=PRIVATE", async () => {
      const res = await get("/api/action-collections?scope=PRIVATE", testUser);

      assertEquals(res.status, 200);

      const body = await res.json();
      // All returned should be private
      for (const collection of body.data.collections) {
        assertEquals(
          collection.isPublic,
          false,
          "Filtered collections should be private"
        );
      }
    });

    it("should not include others' private collections", async () => {
      // Create a private collection for testUser
      const createRes = await post("/api/action-collections", testUser, {
        name: `Private Collection ${Date.now()}`,
        isPublic: false,
      });

      assertEquals(createRes.status, 201, "Should create collection");
      const { data: created } = await createRes.json();

      // Other user should not see it
      const otherUser = await createIsolatedUser();
      const listRes = await get("/api/action-collections", otherUser);

      assertEquals(listRes.status, 200);
      const { data } = await listRes.json();
      const found = data.collections.find(
        (c: { id: string }) => c.id === created.id
      );
      assert(!found, "Private collection should not be visible to other users");
    });

    it("should return collection metadata", async () => {
      // Create a collection first
      await post("/api/action-collections", testUser, {
        name: `Metadata Test ${Date.now()}`,
        description: "Test description",
      });

      const res = await get("/api/action-collections", testUser);
      assertEquals(res.status, 200);

      const { data } = await res.json();
      if (data.collections.length > 0) {
        const collection = data.collections[0];
        assertExists(collection.id, "Collection should have id");
        assertExists(collection.name, "Collection should have name");
        assertExists(
          collection.developerId,
          "Collection should have developerId"
        );
      }
    });
  });

  // ========================================
  // Create Collection
  // ========================================

  describe("POST /api/action-collections - Create Collection", () => {
    it("should create new collection", async () => {
      const collectionName = `Test Collection ${Date.now()}`;
      const res = await post("/api/action-collections", testUser, {
        name: collectionName,
        description: "A test collection",
      });

      assertEquals(res.status, 201, `Expected 201, got ${res.status}`);

      const { data: collection } = await res.json();
      assertExists(collection.id, "Created collection should have id");
      assertEquals(collection.name, collectionName);
      assertEquals(collection.isPublic, false, "Default should be private");
    });

    it("should create public collection", async () => {
      const res = await post("/api/action-collections", testUser, {
        name: `Public Collection ${Date.now()}`,
        isPublic: true,
      });

      assertEquals(res.status, 201);

      const { data: collection } = await res.json();
      assertEquals(collection.isPublic, true, "Should be public");
    });

    it("should validate name required", async () => {
      const res = await post("/api/action-collections", testUser, {
        description: "Missing name",
      });

      assertEquals(res.status, 400, "Should reject missing name");
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/action-collections", {
        method: "POST",
        body: { name: "Unauthorized Collection" },
      });

      assert(
        res.status === 401 || res.status === 403,
        `Expected 401 or 403, got ${res.status}`
      );
    });
  });

  // ========================================
  // Get Collection
  // ========================================

  describe("GET /api/action-collections/:id - Get Collection", () => {
    it("should return collection details", async () => {
      // First create a collection
      const createRes = await post("/api/action-collections", testUser, {
        name: `Get Test Collection ${Date.now()}`,
        description: "For get test",
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Then get it
      const getRes = await get(
        `/api/action-collections/${created.id}`,
        testUser
      );
      assertEquals(getRes.status, 200);

      const { data: collection } = await getRes.json();
      assertEquals(collection.id, created.id);
      assertEquals(collection.name, created.name);
    });

    it("should enforce access control", async () => {
      // Create private collection
      const createRes = await post("/api/action-collections", testUser, {
        name: `Private Get Test ${Date.now()}`,
        isPublic: false,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Other user should not access
      const otherUser = await createIsolatedUser();
      const getRes = await get(
        `/api/action-collections/${created.id}`,
        otherUser
      );

      assertEquals(
        getRes.status,
        403,
        "Should deny access to private collection"
      );
    });

    it("should allow access to public collection", async () => {
      // Create public collection
      const createRes = await post("/api/action-collections", testUser, {
        name: `Public Get Test ${Date.now()}`,
        isPublic: true,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Other user should access
      const otherUser = await createIsolatedUser();
      const getRes = await get(
        `/api/action-collections/${created.id}`,
        otherUser
      );

      assertEquals(
        getRes.status,
        200,
        "Should allow access to public collection"
      );
    });

    it("should return 404 for non-existent", async () => {
      const res = await get(
        "/api/action-collections/00000000-0000-0000-0000-000000000000",
        testUser
      );
      assertEquals(res.status, 404);
    });
  });

  // ========================================
  // Update Collection
  // ========================================

  describe("PATCH /api/action-collections/:id - Update Collection", () => {
    it("should update name", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Original Name ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const newName = `Updated Name ${Date.now()}`;
      const updateRes = await patch(
        `/api/action-collections/${created.id}`,
        testUser,
        {
          name: newName,
        }
      );

      assertEquals(updateRes.status, 200);
      const { data: updated } = await updateRes.json();
      assertEquals(updated.name, newName);
    });

    it("should update description", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Desc Update Test ${Date.now()}`,
        description: "Original description",
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const newDesc = "Updated description";
      const updateRes = await patch(
        `/api/action-collections/${created.id}`,
        testUser,
        {
          description: newDesc,
        }
      );

      assertEquals(updateRes.status, 200);
      const { data: updated } = await updateRes.json();
      assertEquals(updated.description, newDesc);
    });

    it("should update isPublic", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Public Update Test ${Date.now()}`,
        isPublic: false,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const updateRes = await patch(
        `/api/action-collections/${created.id}`,
        testUser,
        {
          isPublic: true,
        }
      );

      assertEquals(updateRes.status, 200);
      const { data: updated } = await updateRes.json();
      assertEquals(updated.isPublic, true);
    });

    it("should require owner permission", async () => {
      // Create collection as testUser
      const createRes = await post("/api/action-collections", testUser, {
        name: `Owner Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Other user should not be able to update
      const otherUser = await createIsolatedUser();
      const updateRes = await patch(
        `/api/action-collections/${created.id}`,
        otherUser,
        {
          name: "Hacked Name",
        }
      );

      assertEquals(updateRes.status, 403, "Should deny update to non-owner");
    });
  });

  // ========================================
  // Delete Collection
  // ========================================

  describe("DELETE /api/action-collections/:id - Delete Collection", () => {
    it("should delete collection", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Delete Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const deleteRes = await del(
        `/api/action-collections/${created.id}`,
        testUser
      );
      assertEquals(deleteRes.status, 200);

      // Verify it's gone
      const getRes = await get(
        `/api/action-collections/${created.id}`,
        testUser
      );
      assertEquals(getRes.status, 404, "Deleted collection should return 404");
    });

    it("should require owner permission", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Owner Delete Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Other user should not be able to delete
      const otherUser = await createIsolatedUser();
      const deleteRes = await del(
        `/api/action-collections/${created.id}`,
        otherUser
      );

      assertEquals(deleteRes.status, 403, "Should deny delete to non-owner");
    });

    it("should return 404 for non-existent", async () => {
      const res = await del(
        "/api/action-collections/00000000-0000-0000-0000-000000000000",
        testUser
      );
      assertEquals(res.status, 404);
    });
  });

  // ========================================
  // Action Templates
  // ========================================

  describe("Action Templates", () => {
    it("should list actions in collection", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Actions List Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const actionsRes = await get(
        `/api/action-collections/${created.id}/actions`,
        testUser
      );
      assertEquals(actionsRes.status, 200);

      const { data: actions } = await actionsRes.json();
      assert(Array.isArray(actions), "Actions should be an array");
    });

    it("should add action to collection", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Add Action Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const addRes = await post(
        `/api/action-collections/${created.id}/actions`,
        testUser,
        {
          actionData: {
            name: "Test Action",
            description: "A test action",
            method: "GET",
            urlTemplate: "https://api.example.com/test",
          },
        }
      );

      assertEquals(addRes.status, 201);
      const { data: action } = await addRes.json();
      assertExists(action.id, "Action should have id");
      assertEquals(action.name, "Test Action");
    });

    it("should require owner to add action", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Owner Add Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      const otherUser = await createIsolatedUser();
      const addRes = await post(
        `/api/action-collections/${created.id}/actions`,
        otherUser,
        {
          actionData: {
            name: "Unauthorized Action",
            method: "GET",
            urlTemplate: "https://api.example.com/test",
          },
        }
      );

      assertEquals(
        addRes.status,
        403,
        "Should deny adding action to non-owner"
      );
    });

    it("should remove action from collection", async () => {
      const createRes = await post("/api/action-collections", testUser, {
        name: `Remove Action Test ${Date.now()}`,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Add an action
      const addRes = await post(
        `/api/action-collections/${created.id}/actions`,
        testUser,
        {
          actionData: {
            name: "Action to Remove",
            method: "GET",
            urlTemplate: "https://api.example.com/test",
          },
        }
      );

      assertEquals(addRes.status, 201);
      const { data: action } = await addRes.json();

      // Remove it
      const removeRes = await del(
        `/api/action-collections/${created.id}/actions/${action.id}`,
        testUser
      );
      assertEquals(removeRes.status, 200);

      // Verify it's gone
      const actionsRes = await get(
        `/api/action-collections/${created.id}/actions`,
        testUser
      );
      const { data: actions } = await actionsRes.json();
      const found = actions.find((a: { id: string }) => a.id === action.id);
      assert(!found, "Removed action should not be in list");
    });
  });

  // ========================================
  // Security
  // ========================================

  describe("Security", () => {
    it("should enforce collection access for actions", async () => {
      // Create private collection
      const createRes = await post("/api/action-collections", testUser, {
        name: `Security Test ${Date.now()}`,
        isPublic: false,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Other user should not access actions
      const otherUser = await createIsolatedUser();
      const actionsRes = await get(
        `/api/action-collections/${created.id}/actions`,
        otherUser
      );

      assertEquals(
        actionsRes.status,
        403,
        "Should deny access to private collection actions"
      );
    });

    it("should allow public collection action access", async () => {
      // Create public collection
      const createRes = await post("/api/action-collections", testUser, {
        name: `Public Security Test ${Date.now()}`,
        isPublic: true,
      });

      assertEquals(createRes.status, 201);
      const { data: created } = await createRes.json();

      // Add an action
      await post(`/api/action-collections/${created.id}/actions`, testUser, {
        actionData: {
          name: "Public Action",
          method: "GET",
          urlTemplate: "https://api.example.com/test",
        },
      });

      // Other user should access actions
      const otherUser = await createIsolatedUser();
      const actionsRes = await get(
        `/api/action-collections/${created.id}/actions`,
        otherUser
      );

      assertEquals(
        actionsRes.status,
        200,
        "Should allow access to public collection actions"
      );
    });
  });
});
