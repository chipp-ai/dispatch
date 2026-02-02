/**
 * RAG Service Unit Tests
 *
 * Tests for retrieval-augmented generation, vector search, and context building.
 */

// Set up database URL before importing anything that uses the database
if (!Deno.env.get("DENO_DATABASE_URL") && !Deno.env.get("PG_DATABASE_URL")) {
  Deno.env.set(
    "DENO_DATABASE_URL",
    Deno.env.get("TEST_DATABASE_URL") ||
      "postgres://postgres:test@localhost:5432/chipp_test"
  );
}

import { assertEquals } from "@std/assert";
import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
} from "jsr:@std/testing/bdd";
import { getRelevantChunks, hasKnowledgeSources } from "./rag.service.ts";
import {
  setupTestDb,
  teardownTestDb,
  cleanupTestDb,
  getTestDb,
  createTestOrganization,
  createTestUser,
  createTestWorkspace,
  createTestApplication,
  type TestApplication,
} from "../../test/setup.ts";

describe("RAG Service", () => {
  let application: TestApplication;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();

    const org = await createTestOrganization();
    const user = await createTestUser({ organization_id: org.id });
    const workspace = await createTestWorkspace({
      organization_id: org.id,
      creator_id: user.id,
    });
    application = await createTestApplication({
      workspace_id: workspace.id,
      creator_id: user.id,
    });
  });

  describe("getRelevantChunks", () => {
    it("returns empty array when no chunks exist", async () => {
      const chunks = await getRelevantChunks(application.id, "test query");

      assertEquals(chunks.length, 0);
      assertEquals(Array.isArray(chunks), true);
    });

    it("returns empty array for non-existent application", async () => {
      const chunks = await getRelevantChunks("non-existent-id", "test query");

      assertEquals(chunks.length, 0);
    });

    // Note: Full vector search tests would require:
    // 1. Setting up pgvector extension
    // 2. Creating test embeddings
    // 3. Inserting test chunks with embeddings
    // This is better suited for integration tests with a real database
  });

  describe("hasKnowledgeSources", () => {
    it("returns false when no chunks exist", async () => {
      const result = await hasKnowledgeSources(application.id);

      assertEquals(result, false);
    });

    it("returns false for non-existent application", async () => {
      const result = await hasKnowledgeSources("non-existent-id");

      assertEquals(result, false);
    });
  });
});
