/**
 * Knowledge Sources Route Tests
 *
 * Tests for /api/knowledge-sources endpoints.
 * Covers source management, uploads, processing, and embeddings.
 *
 * ENDPOINTS TESTED:
 * - GET /api/knowledge-sources - List sources (with query params)
 * - POST /api/knowledge-sources - Create source
 * - GET /api/knowledge-sources/:id - Get source
 * - PATCH /api/knowledge-sources/:id - Update source
 * - DELETE /api/knowledge-sources/:id - Delete source
 * - POST /api/knowledge-sources/:id/reprocess - Reprocess
 *
 * TEST CATEGORIES:
 * 1. Source CRUD
 *    - List sources for application
 *    - Create text source
 *    - Create URL source
 *    - Get single source
 *    - Update source
 *    - Delete source
 *
 * 2. Source Types
 *    - TEXT: Plain text content
 *    - URL: Web page scraping
 *    - FILE: Document uploads
 *
 * 3. Processing Status
 *    - PENDING: Awaiting processing
 *    - PROCESSING: Currently being processed
 *    - COMPLETED: Successfully processed
 *    - FAILED: Processing failed
 *
 * 4. Filtering & Pagination
 *    - Filter by status
 *    - Filter by type
 *    - Pagination with limit/offset
 *
 * USAGE:
 *   deno test src/__tests__/routes/knowledge_sources_test.ts
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
  get,
  post,
  patch,
  del,
} from "../setup.ts";
import {
  getProUser,
  getFreeUser,
  createIsolatedUser,
} from "../fixtures/users.ts";
import { createBasicApp } from "../fixtures/applications.ts";
import {
  createTextSource,
  createTextSourceWithChunks,
  createUrlSource,
  createFailedUrlSource,
  createDocumentSource,
  createProcessingDocumentSource,
  createPendingSource,
  createEmptySource,
  cleanupAppSources,
  updateSourceStatus,
} from "../fixtures/knowledge_sources.ts";
import type { TestUser, TestApplication } from "../setup.ts";
import type { TestKnowledgeSource } from "../fixtures/knowledge_sources.ts";

// ========================================
// Test Helpers
// ========================================

/**
 * Create a knowledge source directly via API.
 */
async function createSourceViaApi(
  user: TestUser,
  applicationId: string,
  body: {
    type: string;
    name: string;
    url?: string;
    filePath?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Response> {
  return app.request("/api/knowledge-sources", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      applicationId,
      ...body,
    }),
  });
}

/**
 * List knowledge sources via API.
 */
async function listSourcesViaApi(
  user: TestUser,
  applicationId: string,
  query: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Response> {
  const params = new URLSearchParams({ applicationId });
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.limit) params.set("limit", query.limit.toString());
  if (query.offset) params.set("offset", query.offset.toString());

  return app.request(`/api/knowledge-sources?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  });
}

/**
 * Get a single source via API.
 */
async function getSourceViaApi(
  user: TestUser,
  sourceId: string
): Promise<Response> {
  return app.request(`/api/knowledge-sources/${sourceId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  });
}

/**
 * Update a source via API.
 */
async function updateSourceViaApi(
  user: TestUser,
  sourceId: string,
  body: { name?: string; metadata?: Record<string, unknown> }
): Promise<Response> {
  return app.request(`/api/knowledge-sources/${sourceId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Delete a source via API.
 */
async function deleteSourceViaApi(
  user: TestUser,
  sourceId: string
): Promise<Response> {
  return app.request(`/api/knowledge-sources/${sourceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  });
}

/**
 * Reprocess a source via API.
 */
async function reprocessSourceViaApi(
  user: TestUser,
  sourceId: string
): Promise<Response> {
  return app.request(`/api/knowledge-sources/${sourceId}/reprocess`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  });
}

// ========================================
// Test Setup
// ========================================

describe("Knowledge Sources API", () => {
  let testUser: TestUser;
  let testApp: TestApplication;

  beforeAll(async () => {
    await setupTests();
    testUser = await getProUser();
    testApp = await createBasicApp(testUser);
  });

  afterAll(async () => {
    await cleanupAppSources(testApp.id);
    await cleanupTestData();
    await teardownTests();
  });

  afterEach(async () => {
    // Clean up sources created during tests
    await cleanupAppSources(testApp.id);
  });

  // ========================================
  // List Sources Tests
  // ========================================

  describe("GET /api/knowledge-sources", () => {
    it("should list sources for application", async () => {
      // Create some test sources
      await createTextSource(testApp.id, "Source 1", "Content 1");
      await createUrlSource(testApp.id, "URL Source 1", "https://example1.com");

      const res = await listSourcesViaApi(testUser, testApp.id);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.data);
      assert(Array.isArray(data.data));
      assertEquals(data.data.length, 2);
    });

    it("should return empty array for app with no sources", async () => {
      // Create a fresh app with no sources
      const freshApp = await createBasicApp(testUser);

      const res = await listSourcesViaApi(testUser, freshApp.id);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.data);
      assertEquals(data.data.length, 0);

      // Cleanup
      await cleanupAppSources(freshApp.id);
    });

    it("should include source status in response", async () => {
      await createTextSource(testApp.id, "Status Test Source", "Test content");

      const res = await listSourcesViaApi(testUser, testApp.id);
      const data = await res.json();

      assertExists(data.data[0].status);
      assertEquals(data.data[0].status, "completed");
    });

    it("should include chunk count in response", async () => {
      await createTextSourceWithChunks(
        testApp.id,
        "Chunk Source",
        "Chunk 1\n\nChunk 2\n\nChunk 3"
      );

      const res = await listSourcesViaApi(testUser, testApp.id);
      const data = await res.json();

      assertExists(data.data[0].chunk_count);
      assertEquals(data.data[0].chunk_count, 3);
    });

    it("should filter by status", async () => {
      await createTextSource(
        testApp.id,
        "Completed Source",
        "Completed content"
      ); // completed
      await createPendingSource(testApp.id, "Pending Source"); // pending
      await createFailedUrlSource(
        testApp.id,
        "Failed Source",
        "https://failed.example.com"
      ); // failed

      const res = await listSourcesViaApi(testUser, testApp.id, {
        status: "completed",
      });
      const data = await res.json();

      assertEquals(data.data.length, 1);
      assertEquals(data.data[0].status, "completed");
    });

    it("should filter by type", async () => {
      await createTextSource(testApp.id, "Text Type Source", "Text content"); // text
      await createUrlSource(
        testApp.id,
        "URL Type Source",
        "https://url.example.com"
      ); // url
      await createDocumentSource(testApp.id, "Doc Type Source"); // file

      const res = await listSourcesViaApi(testUser, testApp.id, {
        type: "url",
      });
      const data = await res.json();

      assertEquals(data.data.length, 1);
      assertEquals(data.data[0].type, "url");
    });

    it("should support pagination with limit", async () => {
      // Create 5 sources
      for (let i = 0; i < 5; i++) {
        await createTextSource(testApp.id, `Source ${i}`, `Content ${i}`);
      }

      const res = await listSourcesViaApi(testUser, testApp.id, { limit: 2 });
      const data = await res.json();

      assertEquals(data.data.length, 2);
    });

    it("should support pagination with offset", async () => {
      // Create 5 sources
      for (let i = 0; i < 5; i++) {
        await createTextSource(testApp.id, `Source ${i}`, `Content ${i}`);
      }

      const res1 = await listSourcesViaApi(testUser, testApp.id, {
        limit: 2,
        offset: 0,
      });
      const res2 = await listSourcesViaApi(testUser, testApp.id, {
        limit: 2,
        offset: 2,
      });

      const data1 = await res1.json();
      const data2 = await res2.json();

      assertEquals(data1.data.length, 2);
      assertEquals(data2.data.length, 2);
      // Ensure different sources returned
      assert(data1.data[0].id !== data2.data[0].id);
    });

    it("should require valid application ID", async () => {
      const res = await listSourcesViaApi(testUser, "invalid-uuid");
      assertEquals(res.status, 400);
    });

    it("should return 401 without authentication", async () => {
      const res = await app.request(
        `/api/knowledge-sources?applicationId=${testApp.id}`,
        {
          method: "GET",
        }
      );
      assertEquals(res.status, 401);
    });

    it("should return 403 for other user's app", async () => {
      const otherUser = await createIsolatedUser();
      const res = await listSourcesViaApi(otherUser, testApp.id);
      // Should return 403 or 404 (not found since user can't see app)
      assert(res.status === 403 || res.status === 404);
    });
  });

  // ========================================
  // Create Source Tests
  // ========================================

  describe("POST /api/knowledge-sources", () => {
    it("should create text source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "My Text Source",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertExists(data.data);
      assertExists(data.data.id);
      assertEquals(data.data.type, "text");
      assertEquals(data.data.name, "My Text Source");
      assertEquals(data.data.status, "pending");
    });

    it("should create URL source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "url",
        name: "https://docs.example.com",
        url: "https://docs.example.com",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "url");
      assertExists(data.data.url);
    });

    it("should create file source with file path", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "file",
        name: "document.pdf",
        filePath: "/uploads/documents/document.pdf",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "file");
      assertExists(data.data.file_path);
    });

    it("should create source with metadata", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "Source with Metadata",
        metadata: { author: "Test", version: 1 },
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertExists(data.data.metadata);
      assertEquals(data.data.metadata.author, "Test");
    });

    it("should validate name is required", async () => {
      const res = await app.request("/api/knowledge-sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: testApp.id,
          type: "text",
          // name is missing
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should validate type is required", async () => {
      const res = await app.request("/api/knowledge-sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: testApp.id,
          name: "Test Source",
          // type is missing
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should validate type is valid enum", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "invalid_type" as any,
        name: "Test Source",
      });
      assertEquals(res.status, 400);
    });

    it("should validate application ID format", async () => {
      const res = await app.request("/api/knowledge-sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testUser.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId: "not-a-uuid",
          type: "text",
          name: "Test Source",
        }),
      });
      assertEquals(res.status, 400);
    });

    it("should return 401 without authentication", async () => {
      const res = await app.request("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: testApp.id,
          type: "text",
          name: "Test Source",
        }),
      });
      assertEquals(res.status, 401);
    });

    it("should return 403/404 for other user's app", async () => {
      const otherUser = await createIsolatedUser();
      const res = await createSourceViaApi(otherUser, testApp.id, {
        type: "text",
        name: "Test Source",
      });
      assert(res.status === 403 || res.status === 404);
    });

    it("should initialize status as pending", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "Pending Source",
      });
      const data = await res.json();
      assertEquals(data.data.status, "pending");
    });

    it("should initialize chunk_count as 0", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "New Source",
      });
      const data = await res.json();
      assertEquals(data.data.chunk_count, 0);
    });
  });

  // ========================================
  // Get Single Source Tests
  // ========================================

  describe("GET /api/knowledge-sources/:id", () => {
    it("should return source details", async () => {
      const source = await createTextSource(
        testApp.id,
        "Details Source",
        "Test content"
      );

      const res = await getSourceViaApi(testUser, source.id);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.data);
      assertEquals(data.data.id, source.id);
      assertEquals(data.data.type, "text");
    });

    it("should include all source fields", async () => {
      const source = await createTextSource(
        testApp.id,
        "Fields Source",
        "Test content"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();

      assertExists(data.data.id);
      assertExists(data.data.application_id);
      assertExists(data.data.type);
      assertExists(data.data.name);
      assertExists(data.data.status);
      assertExists(data.data.created_at);
      assertExists(data.data.updated_at);
    });

    it("should include error message for failed sources", async () => {
      const source = await createFailedUrlSource(
        testApp.id,
        "Failed Source",
        "https://failed.example.com"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();

      assertEquals(data.data.status, "failed");
      assertExists(data.data.error_message);
    });

    it("should return 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await getSourceViaApi(testUser, fakeId);
      assertEquals(res.status, 404);
    });

    it("should return 401 without authentication", async () => {
      const source = await createTextSource(
        testApp.id,
        "Auth Source",
        "Test content"
      );
      const res = await app.request(`/api/knowledge-sources/${source.id}`, {
        method: "GET",
      });
      assertEquals(res.status, 401);
    });

    it("should return 403/404 for other user's source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Other User Source",
        "Test content"
      );
      const otherUser = await createIsolatedUser();

      const res = await getSourceViaApi(otherUser, source.id);
      assert(res.status === 403 || res.status === 404);
    });
  });

  // ========================================
  // Update Source Tests
  // ========================================

  describe("PATCH /api/knowledge-sources/:id", () => {
    it("should update source name", async () => {
      const source = await createTextSource(
        testApp.id,
        "Update Name Source",
        "Test content"
      );

      const res = await updateSourceViaApi(testUser, source.id, {
        name: "Updated Source Name",
      });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.name, "Updated Source Name");
    });

    it("should update source metadata", async () => {
      const source = await createTextSource(
        testApp.id,
        "Update Metadata Source",
        "Test content"
      );

      const res = await updateSourceViaApi(testUser, source.id, {
        metadata: { custom: "value", priority: 1 },
      });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.data.metadata);
      assertEquals(data.data.metadata.custom, "value");
    });

    it("should update both name and metadata", async () => {
      const source = await createTextSource(
        testApp.id,
        "Update Both Source",
        "Test content"
      );

      const res = await updateSourceViaApi(testUser, source.id, {
        name: "New Name",
        metadata: { updated: true },
      });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.name, "New Name");
      assertEquals(data.data.metadata.updated, true);
    });

    it("should return existing source when no updates provided", async () => {
      const source = await createTextSource(
        testApp.id,
        "No Update Source",
        "Test content"
      );

      const res = await updateSourceViaApi(testUser, source.id, {});
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.data.id, source.id);
    });

    it("should validate name is not empty", async () => {
      const source = await createTextSource(
        testApp.id,
        "Validate Name Source",
        "Test content"
      );

      const res = await updateSourceViaApi(testUser, source.id, {
        name: "",
      });
      assertEquals(res.status, 400);
    });

    it("should return 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await updateSourceViaApi(testUser, fakeId, {
        name: "New Name",
      });
      assertEquals(res.status, 404);
    });

    it("should return 401 without authentication", async () => {
      const source = await createTextSource(
        testApp.id,
        "Patch Auth Source",
        "Test content"
      );
      const res = await app.request(`/api/knowledge-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });
      assertEquals(res.status, 401);
    });

    it("should return 403/404 for other user's source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Patch Other User Source",
        "Test content"
      );
      const otherUser = await createIsolatedUser();

      const res = await updateSourceViaApi(otherUser, source.id, {
        name: "Hacked Name",
      });
      assert(res.status === 403 || res.status === 404);
    });
  });

  // ========================================
  // Delete Source Tests
  // ========================================

  describe("DELETE /api/knowledge-sources/:id", () => {
    it("should delete source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Delete Source",
        "Test content"
      );

      const res = await deleteSourceViaApi(testUser, source.id);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.success, true);

      // Verify source is deleted
      const getRes = await getSourceViaApi(testUser, source.id);
      assertEquals(getRes.status, 404);
    });

    it("should delete associated chunks", async () => {
      const source = await createTextSourceWithChunks(
        testApp.id,
        "Delete Chunks Source",
        "Chunk 1\n\nChunk 2"
      );

      // Verify chunks exist
      const [before] = await sql`
        SELECT COUNT(*) as count FROM rag.text_chunks
        WHERE knowledge_source_id = ${source.id}::uuid
      `;
      assertEquals(Number(before.count), 2);

      // Delete source
      await deleteSourceViaApi(testUser, source.id);

      // Verify chunks are deleted
      const [after] = await sql`
        SELECT COUNT(*) as count FROM rag.text_chunks
        WHERE knowledge_source_id = ${source.id}::uuid
      `;
      assertEquals(Number(after.count), 0);
    });

    it("should return 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await deleteSourceViaApi(testUser, fakeId);
      assertEquals(res.status, 404);
    });

    it("should return 401 without authentication", async () => {
      const source = await createTextSource(
        testApp.id,
        "Delete Auth Source",
        "Test content"
      );
      const res = await app.request(`/api/knowledge-sources/${source.id}`, {
        method: "DELETE",
      });
      assertEquals(res.status, 401);
    });

    it("should return 403/404 for other user's source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Delete Other User Source",
        "Test content"
      );
      const otherUser = await createIsolatedUser();

      const res = await deleteSourceViaApi(otherUser, source.id);
      assert(res.status === 403 || res.status === 404);
    });
  });

  // ========================================
  // Reprocess Source Tests
  // ========================================

  describe("POST /api/knowledge-sources/:id/reprocess", () => {
    it("should reprocess source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Reprocess Source",
        "Test content"
      );
      // Set to completed first
      await updateSourceStatus(source.id, "completed");

      const res = await reprocessSourceViaApi(testUser, source.id);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.success, true);
    });

    it("should reset status to pending", async () => {
      const source = await createTextSource(
        testApp.id,
        "Reset Status Source",
        "Test content"
      );
      await updateSourceStatus(source.id, "completed");

      await reprocessSourceViaApi(testUser, source.id);

      // Check status was reset
      const getRes = await getSourceViaApi(testUser, source.id);
      const data = await getRes.json();
      assertEquals(data.data.status, "pending");
    });

    it("should clear error message on failed sources", async () => {
      const source = await createFailedUrlSource(
        testApp.id,
        "Clear Error Source",
        "https://failed.example.com"
      );

      await reprocessSourceViaApi(testUser, source.id);

      const getRes = await getSourceViaApi(testUser, source.id);
      const data = await getRes.json();
      assertEquals(data.data.status, "pending");
      assertEquals(data.data.error_message, null);
    });

    it("should return 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const res = await reprocessSourceViaApi(testUser, fakeId);
      assertEquals(res.status, 404);
    });

    it("should return 401 without authentication", async () => {
      const source = await createTextSource(
        testApp.id,
        "Reprocess Auth Source",
        "Test content"
      );
      const res = await app.request(
        `/api/knowledge-sources/${source.id}/reprocess`,
        {
          method: "POST",
        }
      );
      assertEquals(res.status, 401);
    });

    it("should return 403/404 for other user's source", async () => {
      const source = await createTextSource(
        testApp.id,
        "Reprocess Other User Source",
        "Test content"
      );
      const otherUser = await createIsolatedUser();

      const res = await reprocessSourceViaApi(otherUser, source.id);
      assert(res.status === 403 || res.status === 404);
    });
  });

  // ========================================
  // Processing Status Tests
  // ========================================

  describe("Processing Status", () => {
    it("should return pending status for new sources", async () => {
      const source = await createPendingSource(
        testApp.id,
        "Pending Status Source"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();
      assertEquals(data.data.status, "pending");
    });

    it("should return processing status for in-progress sources", async () => {
      const source = await createProcessingDocumentSource(
        testApp.id,
        "Processing Status Source"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();
      assertEquals(data.data.status, "processing");
    });

    it("should return completed status for ready sources", async () => {
      const source = await createTextSource(
        testApp.id,
        "Completed Status Source",
        "Test content"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();
      assertEquals(data.data.status, "completed");
    });

    it("should return failed status for failed sources", async () => {
      const source = await createFailedUrlSource(
        testApp.id,
        "Failed Status Source",
        "https://failed.example.com"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();
      assertEquals(data.data.status, "failed");
    });

    it("should store error details on failure", async () => {
      const source = await createFailedUrlSource(
        testApp.id,
        "Error Details Source",
        "https://bad.example.com"
      );

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();
      assertExists(data.data.error_message);
      assert(data.data.error_message.length > 0);
    });
  });

  // ========================================
  // Source Type Tests
  // ========================================

  describe("Source Types", () => {
    it("should create text type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "Text Source",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "text");
    });

    it("should create url type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "url",
        name: "URL Source",
        url: "https://example.com",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "url");
    });

    it("should create file type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "file",
        name: "file-source.pdf",
        filePath: "/uploads/file.pdf",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "file");
    });

    it("should create sitemap type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "sitemap",
        name: "Sitemap Source",
        url: "https://example.com/sitemap.xml",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "sitemap");
    });

    it("should create youtube type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "youtube",
        name: "YouTube Source",
        url: "https://youtube.com/watch?v=abc123",
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "youtube");
    });

    it("should create qa type source", async () => {
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "qa",
        name: "Q&A Source",
        metadata: {
          question: "What is this?",
          answer: "This is a test.",
        },
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.type, "qa");
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe("Edge Cases", () => {
    it("should handle very long source names", async () => {
      const longName = "A".repeat(255);
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: longName,
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.name.length, 255);
    });

    it("should reject source names over 255 characters", async () => {
      const tooLongName = "A".repeat(256);
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: tooLongName,
      });
      assertEquals(res.status, 400);
    });

    it("should handle empty sources (no chunks)", async () => {
      const source = await createEmptySource(testApp.id, "Empty Source");

      const res = await getSourceViaApi(testUser, source.id);
      const data = await res.json();

      assertEquals(data.data.chunk_count, 0);
      assertEquals(data.data.status, "completed");
    });

    it("should handle sources with large metadata", async () => {
      const largeMetadata = {
        data: Array.from({ length: 100 }, (_, i) => ({
          key: `key_${i}`,
          value: `value_${i}`.repeat(10),
        })),
      };

      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: "Large Metadata Source",
        metadata: largeMetadata,
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertExists(data.data.metadata);
    });

    it("should handle special characters in source name", async () => {
      const specialName = "Test <source> & 'quotes' \"double\"";
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: specialName,
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.name, specialName);
    });

    it("should handle unicode in source name", async () => {
      const unicodeName = "Test 测试 Тест 🚀";
      const res = await createSourceViaApi(testUser, testApp.id, {
        type: "text",
        name: unicodeName,
      });
      assertEquals(res.status, 201);

      const data = await res.json();
      assertEquals(data.data.name, unicodeName);
    });
  });
});
