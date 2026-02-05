/**
 * Custom Action Service Unit Tests
 *
 * Tests for user-defined tool CRUD operations and validation.
 */

// Set up database URL before importing anything that uses the database
if (!Deno.env.get("DENO_DATABASE_URL") && !Deno.env.get("PG_DATABASE_URL")) {
  Deno.env.set("DENO_DATABASE_URL", Deno.env.get("TEST_DATABASE_URL") || Deno.env.get("DATABASE_URL") || "postgresql://postgres:postgres@localhost:5436/chipp_deno");
}

import { assertEquals, assertRejects, assertExists } from "@std/assert";
import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "jsr:@std/testing/bdd";
import { customActionService } from "./custom-action.service.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import {
  setupTestDb,
  teardownTestDb,
  cleanupTestDb,
  createTestOrganization,
  createTestUser,
  createTestWorkspace,
  createTestApplication,
  type TestOrganization,
  type TestUser,
  type TestWorkspace,
  type TestApplication,
} from "../../test/setup.ts";

describe("Custom Action Service", () => {
  let org: TestOrganization;
  let user: TestUser;
  let workspace: TestWorkspace;
  let application: TestApplication;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();

    org = await createTestOrganization();
    user = await createTestUser({ organization_id: org.id });
    workspace = await createTestWorkspace({
      organization_id: org.id,
      creator_id: user.id,
    });
    application = await createTestApplication({
      workspace_id: workspace.id,
      creator_id: user.id,
    });
  });

  describe("create", () => {
    it("creates tool with valid data", async () => {
      const tool = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Get Weather",
        description: "Get weather for a location",
        url: "https://api.weather.com/v1/forecast",
        method: "GET",
        queryParams: [
          {
            key: "location",
            value: "",
            valueSource: "AI",
            type: "string",
            isRequired: true,
            description: "City name",
          },
        ],
      });

      assertExists(tool.id);
      assertEquals(tool.name, "Get Weather");
      assertEquals(tool.description, "Get weather for a location");
      assertEquals(tool.url, "https://api.weather.com/v1/forecast");
      assertEquals(tool.method, "GET");
      assertExists(tool.slug);
    });

    it("generates slug from name if not provided", async () => {
      const tool = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "My Custom Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "POST",
      });

      assertExists(tool.slug);
      assertEquals(tool.slug.includes("my_custom_tool"), true);
    });

    it("rejects duplicate slug in same application", async () => {
      await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        slug: "test-tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await assertRejects(
        () =>
          customActionService.create({
            applicationId: application.id,
            userId: user.id,
            name: "Another Tool",
            slug: "test-tool", // Duplicate slug
            description: "Test",
            url: "https://api.example.com/test",
            method: "GET",
          }),
        Error,
        "already exists"
      );
    });

    it("rejects invalid URL", async () => {
      await assertRejects(
        () =>
          customActionService.create({
            applicationId: application.id,
            userId: user.id,
            name: "Test Tool",
            description: "Test",
            url: "not-a-valid-url",
            method: "GET",
          }),
        Error,
        "Invalid URL"
      );
    });

    it("rejects HTTP URLs in production", async () => {
      const originalEnv = Deno.env.get("ENVIRONMENT");
      Deno.env.set("ENVIRONMENT", "production");

      await assertRejects(
        () =>
          customActionService.create({
            applicationId: application.id,
            userId: user.id,
            name: "Test Tool",
            description: "Test",
            url: "http://api.example.com/test",
            method: "GET",
          }),
        Error,
        "Invalid URL"
      );

      if (originalEnv) {
        Deno.env.set("ENVIRONMENT", originalEnv);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    });

    it("rejects creation if user doesn't have access", async () => {
      const otherUser = await createTestUser({ organization_id: org.id });

      await assertRejects(
        () =>
          customActionService.create({
            applicationId: application.id,
            userId: otherUser.id,
            name: "Test Tool",
            description: "Test",
            url: "https://api.example.com/test",
            method: "GET",
          }),
        ForbiddenError
      );
    });
  });

  describe("get", () => {
    it("returns tool for application member", async () => {
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      const tool = await customActionService.get(created.id, user.id);

      assertEquals(tool.id, created.id);
      assertEquals(tool.name, "Test Tool");
    });

    it("throws NotFoundError for non-existent tool", async () => {
      await assertRejects(
        () => customActionService.get("non-existent-id", user.id),
        NotFoundError,
        "Tool"
      );
    });

    it("throws ForbiddenError for non-member", async () => {
      const otherUser = await createTestUser({ organization_id: org.id });
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await assertRejects(
        () => customActionService.get(created.id, otherUser.id),
        ForbiddenError
      );
    });
  });

  describe("list", () => {
    it("returns all tools for application", async () => {
      await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Tool 1",
        description: "Test",
        url: "https://api.example.com/test1",
        method: "GET",
      });
      await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Tool 2",
        description: "Test",
        url: "https://api.example.com/test2",
        method: "POST",
      });

      const tools = await customActionService.list(application.id, user.id);

      assertEquals(tools.length, 2);
      assertEquals(tools[0].name, "Tool 2"); // Most recent first
      assertEquals(tools[1].name, "Tool 1");
    });

    it("returns empty array when no tools exist", async () => {
      const tools = await customActionService.list(application.id, user.id);

      assertEquals(tools.length, 0);
      assertEquals(Array.isArray(tools), true);
    });

    it("rejects list if user doesn't have access", async () => {
      const otherUser = await createTestUser({ organization_id: org.id });

      await assertRejects(
        () => customActionService.list(application.id, otherUser.id),
        ForbiddenError
      );
    });
  });

  describe("update", () => {
    it("updates tool name", async () => {
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Original Name",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      const updated = await customActionService.update(created.id, user.id, {
        name: "Updated Name",
      });

      assertEquals(updated.name, "Updated Name");
      assertEquals(updated.id, created.id);
    });

    it("updates multiple fields", async () => {
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Original",
        url: "https://api.example.com/test",
        method: "GET",
      });

      const updated = await customActionService.update(created.id, user.id, {
        name: "Updated Tool",
        description: "Updated description",
        method: "POST",
        headers: [{ key: "Authorization", value: "Bearer token" }],
      });

      assertEquals(updated.name, "Updated Tool");
      assertEquals(updated.description, "Updated description");
      assertEquals(updated.method, "POST");
    });

    it("validates URL on update", async () => {
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await assertRejects(
        () =>
          customActionService.update(created.id, user.id, {
            url: "invalid-url",
          }),
        Error,
        "Invalid URL"
      );
    });

    it("rejects update from non-member", async () => {
      const otherUser = await createTestUser({ organization_id: org.id });
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await assertRejects(
        () =>
          customActionService.update(created.id, otherUser.id, {
            name: "Hacked",
          }),
        ForbiddenError
      );
    });
  });

  describe("delete", () => {
    it("deletes tool", async () => {
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await customActionService.delete(created.id, user.id);

      await assertRejects(
        () => customActionService.get(created.id, user.id),
        NotFoundError
      );
    });

    it("rejects delete from non-member", async () => {
      const otherUser = await createTestUser({ organization_id: org.id });
      const created = await customActionService.create({
        applicationId: application.id,
        userId: user.id,
        name: "Test Tool",
        description: "Test",
        url: "https://api.example.com/test",
        method: "GET",
      });

      await assertRejects(
        () => customActionService.delete(created.id, otherUser.id),
        ForbiddenError
      );
    });
  });
});

