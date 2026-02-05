/**
 * Application Service Unit Tests
 *
 * Tests for application CRUD operations, access control, and business logic.
 */

// Set up database URL before importing anything that uses the database
if (!Deno.env.get("DENO_DATABASE_URL") && !Deno.env.get("PG_DATABASE_URL")) {
  Deno.env.set(
    "DENO_DATABASE_URL",
    Deno.env.get("TEST_DATABASE_URL") ||
      Deno.env.get("DATABASE_URL") ||
      "postgresql://postgres:postgres@localhost:5436/chipp_deno"
  );
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
import { applicationService } from "./application.service.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import {
  setupTestDb,
  teardownTestDb,
  cleanupTestDb,
  getTestDb,
  createTestOrganization,
  createTestUser,
  createTestWorkspace,
  type TestOrganization,
  type TestUser,
  type TestWorkspace,
} from "../../test/setup.ts";

describe("Application Service", () => {
  let org: TestOrganization;
  let user: TestUser;
  let otherUser: TestUser;
  let workspace: TestWorkspace;
  let otherWorkspace: TestWorkspace;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await cleanupTestDb();

    // Create test data
    org = await createTestOrganization();
    user = await createTestUser({ organization_id: org.id });
    otherUser = await createTestUser({ organization_id: org.id });
    workspace = await createTestWorkspace({
      organization_id: org.id,
      creator_id: user.id,
    });
    otherWorkspace = await createTestWorkspace({
      organization_id: org.id,
      creator_id: otherUser.id,
    });
  });

  afterEach(async () => {
    // Cleanup handled by beforeEach
  });

  describe("create", () => {
    it("creates application with valid data", async () => {
      const app = await applicationService.create({
        name: "Test App",
        description: "A test application",
        workspaceId: workspace.id,
        creatorId: user.id,
        modelId: "gpt-4o",
      });

      assertExists(app.id);
      assertEquals(app.name, "Test App");
      assertEquals(app.description, "A test application");
      assertEquals(app.workspaceId, workspace.id);
      assertEquals(app.developerId, user.id);
      assertEquals(app.model, "gpt-4o");
      assertEquals(app.isDeleted, false);
    });

    it("generates unique slug from name", async () => {
      const app = await applicationService.create({
        name: "My Awesome App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      assertExists(app.appNameId);
      assertEquals(typeof app.appNameId, "string");
      assertEquals(app.appNameId.length > 0, true);
    });

    it("rejects creation if user not workspace member", async () => {
      await assertRejects(
        () =>
          applicationService.create({
            name: "Test App",
            workspaceId: otherWorkspace.id,
            creatorId: user.id,
          }),
        ForbiddenError,
        "You don't have access to this workspace"
      );
    });

    it("uses default model if not specified", async () => {
      const app = await applicationService.create({
        name: "Test App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      assertEquals(app.model, "claude-sonnet-4-5"); // Default from config/models.ts
    });
  });

  describe("get", () => {
    it("returns application for workspace member", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      const app = await applicationService.get(created.id, user.id);

      assertEquals(app.id, created.id);
      assertEquals(app.name, "Test App");
    });

    it("throws NotFoundError for non-existent application", async () => {
      await assertRejects(
        () => applicationService.get("non-existent-id", user.id),
        NotFoundError,
        "Application"
      );
    });

    it("throws ForbiddenError for non-member", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: otherWorkspace.id,
        creatorId: otherUser.id,
      });

      await assertRejects(
        () => applicationService.get(created.id, user.id),
        ForbiddenError,
        "You don't have access to this application"
      );
    });

    it("excludes deleted applications", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      // Delete the application
      await applicationService.delete(created.id, user.id);

      await assertRejects(
        () => applicationService.get(created.id, user.id),
        NotFoundError
      );
    });
  });

  describe("list", () => {
    it("returns applications user has access to", async () => {
      await applicationService.create({
        name: "App 1",
        workspaceId: workspace.id,
        creatorId: user.id,
      });
      await applicationService.create({
        name: "App 2",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      const apps = await applicationService.list({
        userId: user.id,
      });

      assertEquals(apps.length, 2);
      assertEquals(apps[0].name, "App 2"); // Most recent first
      assertEquals(apps[1].name, "App 1");
    });

    it("filters by workspace when specified", async () => {
      await applicationService.create({
        name: "Workspace 1 App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });
      await applicationService.create({
        name: "Workspace 2 App",
        workspaceId: otherWorkspace.id,
        creatorId: otherUser.id,
      });

      const apps = await applicationService.list({
        userId: user.id,
        workspaceId: workspace.id,
      });

      assertEquals(apps.length, 1);
      assertEquals(apps[0].name, "Workspace 1 App");
    });

    it("excludes deleted applications by default", async () => {
      const app1 = await applicationService.create({
        name: "Active App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });
      const app2 = await applicationService.create({
        name: "Deleted App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      await applicationService.delete(app2.id, user.id);

      const apps = await applicationService.list({
        userId: user.id,
      });

      assertEquals(apps.length, 1);
      assertEquals(apps[0].id, app1.id);
    });

    it("includes deleted applications when requested", async () => {
      const app1 = await applicationService.create({
        name: "Active App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });
      const app2 = await applicationService.create({
        name: "Deleted App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      await applicationService.delete(app2.id, user.id);

      const apps = await applicationService.list({
        userId: user.id,
        includeDeleted: true,
      });

      assertEquals(apps.length, 2);
    });

    it("respects limit and offset", async () => {
      // Create 5 applications
      for (let i = 1; i <= 5; i++) {
        await applicationService.create({
          name: `App ${i}`,
          workspaceId: workspace.id,
          creatorId: user.id,
        });
      }

      const page1 = await applicationService.list({
        userId: user.id,
        limit: 2,
        offset: 0,
      });

      assertEquals(page1.length, 2);

      const page2 = await applicationService.list({
        userId: user.id,
        limit: 2,
        offset: 2,
      });

      assertEquals(page2.length, 2);
      assertEquals(page1[0].id !== page2[0].id, true);
    });
  });

  describe("update", () => {
    it("updates application name", async () => {
      const created = await applicationService.create({
        name: "Original Name",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      const updated = await applicationService.update(created.id, user.id, {
        name: "Updated Name",
      });

      assertEquals(updated.app.name, "Updated Name");
      assertEquals(updated.app.id, created.id);
    });

    it("updates multiple fields", async () => {
      const created = await applicationService.create({
        name: "Original",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      const updated = await applicationService.update(created.id, user.id, {
        name: "Updated",
        description: "New description",
        systemPrompt: "New system prompt",
        modelId: "gpt-4-turbo",
      });

      assertEquals(updated.app.name, "Updated");
      assertEquals(updated.app.description, "New description");
      assertEquals(updated.app.systemPrompt, "New system prompt");
      assertEquals(updated.app.model, "gpt-4-turbo");
    });

    it("rejects update from non-member", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: otherWorkspace.id,
        creatorId: otherUser.id,
      });

      await assertRejects(
        () =>
          applicationService.update(created.id, user.id, {
            name: "Hacked Name",
          }),
        ForbiddenError
      );
    });

    // Note: picture_url column doesn't exist in schema yet
    // it("allows setting pictureUrl to null", async () => {
    //   const created = await applicationService.create({
    //     name: "Test App",
    //     workspaceId: workspace.id,
    //     creatorId: user.id,
    //   });

    //   const updated = await applicationService.update(created.id, user.id, {
    //     pictureUrl: null,
    //   });

    //   assertEquals(updated.picture_url, null);
    // });
  });

  describe("delete", () => {
    it("soft deletes application", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      await applicationService.delete(created.id, user.id);

      // Should not be found in normal queries
      await assertRejects(
        () => applicationService.get(created.id, user.id),
        NotFoundError
      );

      // But should exist in database (soft delete)
      const sql = getTestDb();
      const result = await sql`
        SELECT is_deleted FROM app.applications WHERE id = ${created.id}
      `;
      assertEquals(result[0].is_deleted, true);
    });

    it("rejects delete from non-member", async () => {
      const created = await applicationService.create({
        name: "Test App",
        workspaceId: otherWorkspace.id,
        creatorId: otherUser.id,
      });

      await assertRejects(
        () => applicationService.delete(created.id, user.id),
        ForbiddenError
      );
    });
  });

  describe("duplicate", () => {
    it("creates duplicate with new name", async () => {
      const original = await applicationService.create({
        name: "Original App",
        description: "Original description",
        systemPrompt: "Original prompt",
        workspaceId: workspace.id,
        creatorId: user.id,
        modelId: "gpt-4o",
      });

      const duplicate = await applicationService.duplicate(
        original.id,
        user.id,
        {
          name: "Duplicated App",
        }
      );

      assertExists(duplicate.id);
      assertEquals(duplicate.id !== original.id, true);
      assertEquals(duplicate.name, "Duplicated App");
      assertEquals(duplicate.description, "Original description");
      assertEquals(duplicate.systemPrompt, "Original prompt");
      assertEquals(duplicate.model, "gpt-4o");
    });

    it("uses default name if not specified", async () => {
      const original = await applicationService.create({
        name: "Original App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      const duplicate = await applicationService.duplicate(
        original.id,
        user.id
      );

      assertExists(duplicate.name);
      assertEquals(duplicate.name.includes("Copy"), true);
    });

    it("can duplicate to different workspace", async () => {
      const original = await applicationService.create({
        name: "Original App",
        workspaceId: workspace.id,
        creatorId: user.id,
      });

      // Add user to other workspace
      const sql = getTestDb();
      await sql`
        INSERT INTO app.workspace_members (workspace_id, user_id, role)
        VALUES (${otherWorkspace.id}, ${user.id}, 'EDITOR')
      `;

      const duplicate = await applicationService.duplicate(
        original.id,
        user.id,
        {
          workspaceId: otherWorkspace.id,
        }
      );

      assertEquals(duplicate.workspaceId, otherWorkspace.id);
      assertEquals(duplicate.workspaceId !== original.workspaceId, true);
    });

    it("rejects duplicate from non-member", async () => {
      const original = await applicationService.create({
        name: "Original App",
        workspaceId: otherWorkspace.id,
        creatorId: otherUser.id,
      });

      await assertRejects(
        () => applicationService.duplicate(original.id, user.id),
        ForbiddenError
      );
    });
  });
});
