/**
 * Tool Execution Service Unit Tests
 *
 * Tests for custom tool execution, variable resolution, and dependency chaining.
 */

// Set up database URL before importing anything that uses the database
if (!Deno.env.get("DENO_DATABASE_URL") && !Deno.env.get("PG_DATABASE_URL")) {
  Deno.env.set("DENO_DATABASE_URL", Deno.env.get("TEST_DATABASE_URL") || Deno.env.get("DATABASE_URL") || "postgresql://postgres:postgres@localhost:5436/chipp_deno");
}

import { assertEquals, assertRejects, assertExists } from "@std/assert";
import { describe, it, beforeAll, afterAll, beforeEach } from "jsr:@std/testing/bdd";
import { executeTool, clearExecutionContext } from "./tool-execution.service.ts";
import {
  setupTestDb,
  teardownTestDb,
  cleanupTestDb,
  createTestOrganization,
  createTestUser,
  createTestWorkspace,
  createTestApplication,
  type TestApplication,
  type TestUser,
} from "../../test/setup.ts";
import { customActionService } from "./custom-action.service.ts";
import { getTestDb } from "../../test/setup.ts";

describe("Tool Execution Service", () => {
  let application: TestApplication;
  let user: TestUser;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();
    // Clear any execution contexts from previous tests
    clearExecutionContext("test-session");

    const org = await createTestOrganization();
    user = await createTestUser({ organization_id: org.id });
    const workspace = await createTestWorkspace({
      organization_id: org.id,
      creator_id: user.id,
    });
    application = await createTestApplication({
      workspace_id: workspace.id,
      creator_id: user.id,
    });
  });

  describe("executeTool", () => {
    it("executes GET request with query parameters", async () => {
      // Skip this test as it requires external HTTP requests
      // Better suited for integration tests with mocked HTTP
    }, { ignore: true });

    it("resolves variables in query parameters", async () => {
      // Create application variable
      const sql = getTestDb();
      await sql`
        INSERT INTO app.application_variables (
          application_id, name, label, type, value, is_encrypted
        )
        VALUES (
          ${application.id}::uuid,
          'API_KEY',
          'API Key',
          'secret',
          'test-api-key-123',
          false
        )
      `;

      const tool = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Variable Tool",
        description: "Test",
        url: "https://httpbin.org/get",
        method: "GET",
        queryParams: [
          {
            key: "api_key",
            value: "{{var.API_KEY}}",
            valueSource: "STATIC",
          },
        ],
      });

      const result = await executeTool(
        tool.id,
        {
          sessionId: "test-session",
          userId: user.id,
          applicationId: application.id,
        },
        {}
      );

      assertEquals(result.success, true);
    });

    it("rejects invalid URLs", async () => {
      // Set environment to production to ensure private IPs are rejected
      const originalEnv = Deno.env.get("ENVIRONMENT");
      Deno.env.set("ENVIRONMENT", "production");

      // The URL validation happens during tool creation, so we expect it to fail there
      await assertRejects(
        () =>
          customActionService.create({
            applicationId: application.id,
            userId: user.id,
            name: "Invalid URL Tool",
            description: "Test",
            url: "http://192.168.1.1/internal", // Private IP
            method: "GET",
          }),
        Error,
        "Invalid URL"
      );

      // Restore environment
      if (originalEnv) {
        Deno.env.set("ENVIRONMENT", originalEnv);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    });

    it("handles HTTP errors gracefully", async () => {
      // Skip this test as it requires external HTTP requests
      // Better suited for integration tests with mocked HTTP
    }, { ignore: true });

    it("times out after 30 seconds", async () => {
      // This test would require a slow endpoint
      // Skipping for now as it's slow
    }, { ignore: true });
  });
});

