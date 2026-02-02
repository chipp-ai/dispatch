/**
 * Publishing Flow Tests
 *
 * Tests for application versioning, launching, and rollback functionality.
 * Uses mock data stores for isolated testing.
 */

import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";

// ========================================
// Mock Data Types
// ========================================

interface MockApplication {
  id: string;
  name: string;
  appNameId: string;
  description: string | null;
  systemPrompt: string | null;
  model: string;
  brandStyles: Record<string, unknown> | null;
  welcomeMessages: string[] | null;
  suggestedMessages: string[] | null;
  settings: Record<string, unknown> | null;
  customActions: Array<Record<string, unknown>> | null;
  capabilities: Record<string, unknown> | null;
  isActive: boolean;
  isDeleted: boolean;
  workspaceId: string;
  developerId: string;
  launchedVersionId: string | null;
  lastLaunchedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

interface MockVersionHistory {
  id: string;
  applicationId: string;
  userId: string;
  version: number;
  data: Record<string, unknown>;
  tag: string | null;
  isLaunched: boolean;
  launchedAt: Date | null;
  createdAt: Date;
}

interface MockUser {
  id: string;
  email: string;
  name: string;
}

interface MockWorkspaceMember {
  userId: string;
  workspaceId: string;
  role: string;
}

// ========================================
// Mock Data Store
// ========================================

function createMockPublishingStore() {
  const applications = new Map<string, MockApplication>();
  const versionHistory = new Map<string, MockVersionHistory>();
  const users = new Map<string, MockUser>();
  const workspaceMembers = new Map<string, MockWorkspaceMember>();
  let versionCounter = 0;
  let idCounter = 0;

  return {
    applications,
    versionHistory,
    users,
    workspaceMembers,

    createUser(data: Partial<MockUser> & { email: string }): MockUser {
      idCounter++;
      const id = `user-${idCounter}`;
      const user: MockUser = {
        id,
        email: data.email,
        name: data.name || data.email.split("@")[0],
      };
      users.set(id, user);
      return user;
    },

    addWorkspaceMember(
      userId: string,
      workspaceId: string,
      role: string
    ): MockWorkspaceMember {
      const member: MockWorkspaceMember = { userId, workspaceId, role };
      workspaceMembers.set(`${userId}-${workspaceId}`, member);
      return member;
    },

    getWorkspaceMemberRole(userId: string, workspaceId: string): string | null {
      const member = workspaceMembers.get(`${userId}-${workspaceId}`);
      return member?.role ?? null;
    },

    createApplication(
      data: Partial<MockApplication> & {
        name: string;
        workspaceId: string;
        developerId: string;
      }
    ): MockApplication {
      idCounter++;
      const id = `app-${idCounter}-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date();

      const app: MockApplication = {
        id,
        name: data.name,
        appNameId:
          data.appNameId ||
          `${data.name.toLowerCase().replace(/\s+/g, "-")}-${id.slice(-8)}`,
        description: data.description ?? null,
        systemPrompt: data.systemPrompt ?? null,
        model: data.model || "gpt-4o",
        brandStyles: data.brandStyles ?? null,
        welcomeMessages: data.welcomeMessages ?? null,
        suggestedMessages: data.suggestedMessages ?? null,
        settings: data.settings ?? null,
        customActions: data.customActions ?? null,
        capabilities: data.capabilities ?? null,
        isActive: data.isActive ?? true,
        isDeleted: data.isDeleted ?? false,
        workspaceId: data.workspaceId,
        developerId: data.developerId,
        launchedVersionId: data.launchedVersionId ?? null,
        lastLaunchedAt: data.lastLaunchedAt ?? null,
        updatedAt: data.updatedAt || now,
        createdAt: data.createdAt || now,
      };

      applications.set(id, app);
      return app;
    },

    updateApplication(
      id: string,
      updates: Partial<MockApplication>
    ): MockApplication {
      const app = applications.get(id);
      if (!app) throw new Error(`Application ${id} not found`);

      const updatedApp = {
        ...app,
        ...updates,
        updatedAt: new Date(),
      };
      applications.set(id, updatedApp);
      return updatedApp;
    },

    getApplication(id: string): MockApplication | null {
      return applications.get(id) ?? null;
    },

    // ========================================
    // Version History Operations
    // ========================================

    createVersionHistory(
      applicationId: string,
      userId: string,
      data: Record<string, unknown>,
      options?: { tag?: string; isLaunched?: boolean }
    ): MockVersionHistory {
      idCounter++;
      versionCounter++;
      const id = `version-${idCounter}`;
      const now = new Date();

      const version: MockVersionHistory = {
        id,
        applicationId,
        userId,
        version: versionCounter,
        data,
        tag: options?.tag ?? null,
        isLaunched: options?.isLaunched ?? false,
        launchedAt: options?.isLaunched ? now : null,
        createdAt: now,
      };

      versionHistory.set(id, version);
      return version;
    },

    getVersionHistory(id: string): MockVersionHistory | null {
      return versionHistory.get(id) ?? null;
    },

    listVersionHistory(
      applicationId: string,
      options?: { launchedOnly?: boolean; limit?: number }
    ): MockVersionHistory[] {
      const versions = Array.from(versionHistory.values())
        .filter((v) => v.applicationId === applicationId)
        .filter((v) => !options?.launchedOnly || v.isLaunched)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, options?.limit ?? 50);

      return versions;
    },

    // ========================================
    // Publishing Operations (mimic applicationService)
    // ========================================

    launchVersion(
      applicationId: string,
      userId: string,
      options?: { tag?: string }
    ): { app: MockApplication; versionHistory: MockVersionHistory } {
      const app = this.getApplication(applicationId);
      if (!app) throw new Error(`Application ${applicationId} not found`);

      // Check permission
      const role = this.getWorkspaceMemberRole(userId, app.workspaceId);
      if (!role || !["OWNER", "ADMIN", "owner", "admin"].includes(role)) {
        throw new Error(
          "Only workspace owners and admins can launch applications"
        );
      }

      // Create snapshot of current application state
      const snapshot: Record<string, unknown> = {
        name: app.name,
        description: app.description,
        systemPrompt: app.systemPrompt,
        model: app.model,
        brandStyles: app.brandStyles,
        welcomeMessages: app.welcomeMessages,
        suggestedMessages: app.suggestedMessages,
        settings: app.settings,
        customActions: app.customActions,
        capabilities: app.capabilities,
      };

      // Create version history entry
      const version = this.createVersionHistory(
        applicationId,
        userId,
        snapshot,
        {
          tag: options?.tag,
          isLaunched: true,
        }
      );

      // Update application with launched version
      const updatedApp = this.updateApplication(applicationId, {
        launchedVersionId: version.id,
        lastLaunchedAt: new Date(),
      });

      return { app: updatedApp, versionHistory: version };
    },

    getLaunchedVersion(applicationId: string): MockVersionHistory | null {
      const app = this.getApplication(applicationId);
      if (!app || !app.launchedVersionId) return null;

      return this.getVersionHistory(app.launchedVersionId);
    },

    rollbackToVersion(
      applicationId: string,
      userId: string,
      versionId: string
    ): { app: MockApplication; versionHistory: MockVersionHistory } {
      const app = this.getApplication(applicationId);
      if (!app) throw new Error(`Application ${applicationId} not found`);

      // Check permission
      const role = this.getWorkspaceMemberRole(userId, app.workspaceId);
      if (!role || !["OWNER", "ADMIN", "owner", "admin"].includes(role)) {
        throw new Error(
          "Only workspace owners and admins can rollback applications"
        );
      }

      // Get the version to rollback to
      const versionToRollback = this.getVersionHistory(versionId);
      if (
        !versionToRollback ||
        !versionToRollback.isLaunched ||
        versionToRollback.applicationId !== applicationId
      ) {
        throw new Error(`Launched version ${versionId} not found`);
      }

      // Apply the version's data to the application
      const data = versionToRollback.data;
      let updatedApp = this.updateApplication(applicationId, {
        name: data.name as string,
        description: data.description as string | null,
        systemPrompt: data.systemPrompt as string | null,
        model: data.model as string,
        brandStyles: data.brandStyles as Record<string, unknown> | null,
        welcomeMessages: data.welcomeMessages as string[] | null,
        suggestedMessages: data.suggestedMessages as string[] | null,
        settings: data.settings as Record<string, unknown> | null,
        customActions: data.customActions as Array<
          Record<string, unknown>
        > | null,
        capabilities: data.capabilities as Record<string, unknown> | null,
      });

      // Create a new launched version entry for the rollback
      const rollbackVersion = this.createVersionHistory(
        applicationId,
        userId,
        versionToRollback.data,
        {
          tag: `Rollback to ${versionToRollback.tag || `v${versionToRollback.version}`}`,
          isLaunched: true,
        }
      );

      // Update application with new launched version
      updatedApp = this.updateApplication(applicationId, {
        launchedVersionId: rollbackVersion.id,
        lastLaunchedAt: new Date(),
      });

      return { app: updatedApp, versionHistory: rollbackVersion };
    },

    restoreVersion(
      applicationId: string,
      userId: string,
      versionId: string
    ): MockApplication {
      const app = this.getApplication(applicationId);
      if (!app) throw new Error(`Application ${applicationId} not found`);

      const version = this.getVersionHistory(versionId);
      if (!version || version.applicationId !== applicationId) {
        throw new Error(`Version ${versionId} not found`);
      }

      // Apply the version's data to the application (as draft, not launching)
      const data = version.data;
      return this.updateApplication(applicationId, {
        name: data.name as string,
        description: data.description as string | null,
        systemPrompt: data.systemPrompt as string | null,
        model: data.model as string,
        brandStyles: data.brandStyles as Record<string, unknown> | null,
        welcomeMessages: data.welcomeMessages as string[] | null,
        suggestedMessages: data.suggestedMessages as string[] | null,
        settings: data.settings as Record<string, unknown> | null,
        customActions: data.customActions as Array<
          Record<string, unknown>
        > | null,
        capabilities: data.capabilities as Record<string, unknown> | null,
      });
    },
  };
}

// ========================================
// Launch Version Tests
// ========================================

describe("Launch Version (launchVersion)", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com", name: "Owner" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Test App",
      workspaceId,
      developerId: testUser.id,
      description: "Test description",
      systemPrompt: "You are a helpful assistant",
      model: "gpt-4o",
      brandStyles: { primaryColor: "#000000" },
    });
  });

  describe("Creating Launched Versions", () => {
    it("creates a version history entry marked as launched", () => {
      const { versionHistory } = store.launchVersion(testApp.id, testUser.id);

      assertEquals(versionHistory.isLaunched, true);
      assertExists(versionHistory.launchedAt);
      assertEquals(versionHistory.applicationId, testApp.id);
      assertEquals(versionHistory.userId, testUser.id);
    });

    it("creates full snapshot of application state", () => {
      const { versionHistory } = store.launchVersion(testApp.id, testUser.id);

      assertEquals(versionHistory.data.name, "Test App");
      assertEquals(versionHistory.data.description, "Test description");
      assertEquals(
        versionHistory.data.systemPrompt,
        "You are a helpful assistant"
      );
      assertEquals(versionHistory.data.model, "gpt-4o");
      assertEquals(
        (versionHistory.data.brandStyles as Record<string, unknown>)
          .primaryColor,
        "#000000"
      );
    });

    it("updates application with launchedVersionId", () => {
      const { app, versionHistory } = store.launchVersion(
        testApp.id,
        testUser.id
      );

      assertEquals(app.launchedVersionId, versionHistory.id);
      assertExists(app.lastLaunchedAt);
    });

    it("supports custom version tags", () => {
      const { versionHistory } = store.launchVersion(testApp.id, testUser.id, {
        tag: "v1.0.0 - Initial Release",
      });

      assertEquals(versionHistory.tag, "v1.0.0 - Initial Release");
    });

    it("creates separate versions for each launch", async () => {
      const launch1 = store.launchVersion(testApp.id, testUser.id, {
        tag: "v1",
      });

      // Simulate time passing and app update
      await new Promise((r) => setTimeout(r, 10));
      store.updateApplication(testApp.id, {
        description: "Updated description",
      });

      const launch2 = store.launchVersion(testApp.id, testUser.id, {
        tag: "v2",
      });

      assertNotEquals(launch1.versionHistory.id, launch2.versionHistory.id);
      assertEquals(launch1.versionHistory.data.description, "Test description");
      assertEquals(
        launch2.versionHistory.data.description,
        "Updated description"
      );
    });
  });

  describe("Permission Checks", () => {
    it("allows workspace owners to launch", () => {
      const { versionHistory } = store.launchVersion(testApp.id, testUser.id);
      assertExists(versionHistory);
    });

    it("allows workspace admins to launch", () => {
      const adminUser = store.createUser({ email: "admin@example.com" });
      store.addWorkspaceMember(adminUser.id, workspaceId, "ADMIN");

      const { versionHistory } = store.launchVersion(testApp.id, adminUser.id);
      assertExists(versionHistory);
    });

    it("rejects non-admin workspace members", () => {
      const memberUser = store.createUser({ email: "member@example.com" });
      store.addWorkspaceMember(memberUser.id, workspaceId, "MEMBER");

      let error: Error | null = null;
      try {
        store.launchVersion(testApp.id, memberUser.id);
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(
        error.message,
        "Only workspace owners and admins can launch applications"
      );
    });
  });
});

// ========================================
// Get Launched Version Tests
// ========================================

describe("Get Launched Version (getLaunchedVersion)", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Test App",
      workspaceId,
      developerId: testUser.id,
    });
  });

  it("returns null when no version has been launched", () => {
    const launched = store.getLaunchedVersion(testApp.id);
    assertEquals(launched, null);
  });

  it("returns the currently launched version", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    const launched = store.getLaunchedVersion(testApp.id);

    assertExists(launched);
    assertEquals(launched.tag, "v1");
    assertEquals(launched.isLaunched, true);
  });

  it("returns the most recent launch after multiple launches", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v3" });

    const launched = store.getLaunchedVersion(testApp.id);

    assertExists(launched);
    assertEquals(launched.tag, "v3");
  });

  it("returns correct version after rollback", () => {
    const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });
    store.rollbackToVersion(testApp.id, testUser.id, v1.versionHistory.id);

    const launched = store.getLaunchedVersion(testApp.id);

    assertExists(launched);
    // After rollback, a new version is created with rollback tag
    assertEquals(launched.tag, "Rollback to v1");
  });
});

// ========================================
// List Launched Versions Tests
// ========================================

describe("List Launched Versions", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Test App",
      workspaceId,
      developerId: testUser.id,
    });
  });

  it("returns empty array when no versions launched", () => {
    const versions = store.listVersionHistory(testApp.id, {
      launchedOnly: true,
    });
    assertEquals(versions.length, 0);
  });

  it("returns all launched versions in descending order", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v3" });

    const versions = store.listVersionHistory(testApp.id, {
      launchedOnly: true,
    });

    assertEquals(versions.length, 3);
    assertEquals(versions[0].tag, "v3"); // Most recent first
    assertEquals(versions[1].tag, "v2");
    assertEquals(versions[2].tag, "v1");
  });

  it("excludes non-launched versions from launched-only list", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Create a non-launched version (simulating an intermediate change)
    store.createVersionHistory(testApp.id, testUser.id, {
      name: "Draft change",
    });

    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

    const launchedVersions = store.listVersionHistory(testApp.id, {
      launchedOnly: true,
    });
    const allVersions = store.listVersionHistory(testApp.id, {
      launchedOnly: false,
    });

    assertEquals(launchedVersions.length, 2);
    assertEquals(allVersions.length, 3);
  });

  it("respects limit parameter", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v3" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v4" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v5" });

    const versions = store.listVersionHistory(testApp.id, {
      launchedOnly: true,
      limit: 3,
    });

    assertEquals(versions.length, 3);
    assertEquals(versions[0].tag, "v5");
    assertEquals(versions[2].tag, "v3");
  });
});

// ========================================
// Rollback Tests
// ========================================

describe("Rollback to Version (rollbackToVersion)", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Original Name",
      description: "Original Description",
      systemPrompt: "Original Prompt",
      workspaceId,
      developerId: testUser.id,
    });
  });

  it("restores application state from previous launched version", () => {
    // Launch v1
    const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Update app
    store.updateApplication(testApp.id, {
      name: "Updated Name",
      description: "Updated Description",
    });

    // Launch v2
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

    // Rollback to v1
    const { app } = store.rollbackToVersion(
      testApp.id,
      testUser.id,
      v1.versionHistory.id
    );

    assertEquals(app.name, "Original Name");
    assertEquals(app.description, "Original Description");
  });

  it("creates new version entry for rollback", () => {
    const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

    const { versionHistory: rollbackVersion } = store.rollbackToVersion(
      testApp.id,
      testUser.id,
      v1.versionHistory.id
    );

    assertEquals(rollbackVersion.isLaunched, true);
    assertEquals(rollbackVersion.tag, "Rollback to v1");
    assertNotEquals(rollbackVersion.id, v1.versionHistory.id);
  });

  it("updates launchedVersionId to rollback version", () => {
    const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

    const { app, versionHistory } = store.rollbackToVersion(
      testApp.id,
      testUser.id,
      v1.versionHistory.id
    );

    assertEquals(app.launchedVersionId, versionHistory.id);
  });

  it("rejects rollback to non-launched version", () => {
    // Create a non-launched version
    const nonLaunchedVersion = store.createVersionHistory(
      testApp.id,
      testUser.id,
      { name: "Draft" }
    );

    let error: Error | null = null;
    try {
      store.rollbackToVersion(testApp.id, testUser.id, nonLaunchedVersion.id);
    } catch (e) {
      error = e as Error;
    }

    assertExists(error);
    assertEquals(
      error.message,
      `Launched version ${nonLaunchedVersion.id} not found`
    );
  });

  it("rejects rollback to version from different application", () => {
    const otherApp = store.createApplication({
      name: "Other App",
      workspaceId,
      developerId: testUser.id,
    });
    const otherVersion = store.launchVersion(otherApp.id, testUser.id, {
      tag: "v1",
    });

    let error: Error | null = null;
    try {
      store.rollbackToVersion(
        testApp.id,
        testUser.id,
        otherVersion.versionHistory.id
      );
    } catch (e) {
      error = e as Error;
    }

    assertExists(error);
  });

  describe("Permission Checks", () => {
    it("allows workspace owners to rollback", () => {
      const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
      store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

      const { app } = store.rollbackToVersion(
        testApp.id,
        testUser.id,
        v1.versionHistory.id
      );

      assertExists(app);
    });

    it("rejects non-admin users", () => {
      const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });
      store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

      const memberUser = store.createUser({ email: "member@example.com" });
      store.addWorkspaceMember(memberUser.id, workspaceId, "MEMBER");

      let error: Error | null = null;
      try {
        store.rollbackToVersion(
          testApp.id,
          memberUser.id,
          v1.versionHistory.id
        );
      } catch (e) {
        error = e as Error;
      }

      assertExists(error);
      assertEquals(
        error.message,
        "Only workspace owners and admins can rollback applications"
      );
    });
  });
});

// ========================================
// Restore Version Tests (Non-Launching)
// ========================================

describe("Restore Version (restoreVersion)", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Original Name",
      description: "Original Description",
      workspaceId,
      developerId: testUser.id,
    });
  });

  it("restores application to previous state without launching", () => {
    const v1 = store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Update app (draft changes)
    store.updateApplication(testApp.id, {
      name: "New Name",
      description: "New Description",
    });

    // Restore to v1 (just the data, not launching)
    const restoredApp = store.restoreVersion(
      testApp.id,
      testUser.id,
      v1.versionHistory.id
    );

    // Data is restored
    assertEquals(restoredApp.name, "Original Name");
    assertEquals(restoredApp.description, "Original Description");

    // But launchedVersionId is unchanged
    assertEquals(restoredApp.launchedVersionId, v1.versionHistory.id);
  });

  it("can restore from non-launched versions", () => {
    // Create a non-launched version (intermediate change)
    const intermediateVersion = store.createVersionHistory(
      testApp.id,
      testUser.id,
      {
        name: "Intermediate Name",
        description: "Intermediate Description",
        systemPrompt: null,
        model: "gpt-4o",
        brandStyles: null,
        welcomeMessages: null,
        suggestedMessages: null,
        settings: null,
        customActions: null,
        capabilities: null,
      }
    );

    // Update app further
    store.updateApplication(testApp.id, { name: "Final Name" });

    // Restore to intermediate version
    const restoredApp = store.restoreVersion(
      testApp.id,
      testUser.id,
      intermediateVersion.id
    );

    assertEquals(restoredApp.name, "Intermediate Name");
    assertEquals(restoredApp.description, "Intermediate Description");
  });
});

// ========================================
// Draft vs Published State Tests
// ========================================

describe("Draft vs Published State", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Published App",
      description: "Published description",
      systemPrompt: "Published prompt",
      workspaceId,
      developerId: testUser.id,
    });
  });

  it("launched version captures state at launch time", () => {
    // Launch initial version
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Update app (draft changes)
    store.updateApplication(testApp.id, {
      name: "Draft Name",
      description: "Draft description",
      systemPrompt: "Draft prompt",
    });

    // Get launched version - should have original state
    const launched = store.getLaunchedVersion(testApp.id);

    // Get current app - should have draft state
    const currentApp = store.getApplication(testApp.id);

    // Launched version preserved original state
    assertExists(launched);
    assertEquals(launched.data.name, "Published App");
    assertEquals(launched.data.description, "Published description");
    assertEquals(launched.data.systemPrompt, "Published prompt");

    // Current app has draft changes
    assertExists(currentApp);
    assertEquals(currentApp.name, "Draft Name");
    assertEquals(currentApp.description, "Draft description");
    assertEquals(currentApp.systemPrompt, "Draft prompt");
  });

  it("multiple draft changes dont affect launched version", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Make many draft changes
    store.updateApplication(testApp.id, { name: "Draft 1" });
    store.updateApplication(testApp.id, { name: "Draft 2" });
    store.updateApplication(testApp.id, { name: "Draft 3" });

    // Launched version unchanged
    const launched = store.getLaunchedVersion(testApp.id);
    assertExists(launched);
    assertEquals(launched.data.name, "Published App");

    // Current app has latest draft
    const currentApp = store.getApplication(testApp.id);
    assertExists(currentApp);
    assertEquals(currentApp.name, "Draft 3");
  });

  it("new launch publishes draft changes", () => {
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Make draft changes
    store.updateApplication(testApp.id, { name: "Updated Published" });

    // Launch new version
    store.launchVersion(testApp.id, testUser.id, { tag: "v2" });

    // New launched version has updated state
    const launched = store.getLaunchedVersion(testApp.id);
    assertExists(launched);
    assertEquals(launched.data.name, "Updated Published");
    assertEquals(launched.tag, "v2");
  });
});

// ========================================
// Consumer Perspective Tests (Critical Bug)
// ========================================

describe("Consumer Perspective (resolveApp behavior)", () => {
  let store: ReturnType<typeof createMockPublishingStore>;
  let testUser: MockUser;
  let testApp: MockApplication;
  const workspaceId = "workspace-1";

  beforeEach(() => {
    store = createMockPublishingStore();
    testUser = store.createUser({ email: "owner@example.com" });
    store.addWorkspaceMember(testUser.id, workspaceId, "OWNER");
    testApp = store.createApplication({
      name: "Consumer App",
      description: "Published description",
      systemPrompt: "Published prompt",
      brandStyles: { primaryColor: "#ffffff" },
      workspaceId,
      developerId: testUser.id,
    });
  });

  /**
   * This test documents the CURRENT BEHAVIOR (bug):
   * Consumers see the draft state because resolveApp() loads from ApplicationTable directly.
   *
   * In a correct implementation, consumers should see the launched version's data.
   */
  it("CURRENT BEHAVIOR (BUG): consumers see draft changes immediately", () => {
    // Launch v1
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Builder makes draft changes
    store.updateApplication(testApp.id, {
      name: "Draft Name (not published)",
      brandStyles: { primaryColor: "#000000" },
    });

    // Current resolveApp behavior: loads from ApplicationTable (draft)
    // This is what consumers currently see:
    const currentAppState = store.getApplication(testApp.id);

    assertExists(currentAppState);
    // BUG: Consumer sees draft, not published
    assertEquals(currentAppState.name, "Draft Name (not published)");
    assertEquals(
      (currentAppState.brandStyles as Record<string, unknown>).primaryColor,
      "#000000"
    );
  });

  /**
   * This test documents the EXPECTED BEHAVIOR:
   * Consumers should see the launched version's state.
   */
  it("EXPECTED BEHAVIOR: consumers should see launched version", () => {
    // Launch v1
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Builder makes draft changes
    store.updateApplication(testApp.id, {
      name: "Draft Name (not published)",
      brandStyles: { primaryColor: "#000000" },
    });

    // What consumers SHOULD see: launched version data
    const launched = store.getLaunchedVersion(testApp.id);

    assertExists(launched);
    // EXPECTED: Consumer sees published state
    assertEquals(launched.data.name, "Consumer App");
    assertEquals(
      (launched.data.brandStyles as Record<string, unknown>).primaryColor,
      "#ffffff"
    );
  });

  /**
   * Helper function that mimics what resolveApp SHOULD do for consumers
   */
  function resolveAppForConsumer(
    applicationId: string
  ): Record<string, unknown> | null {
    const app = store.getApplication(applicationId);
    if (!app || app.isDeleted || !app.isActive) return null;

    // If no launched version, return draft (first-time publish scenario)
    if (!app.launchedVersionId) {
      return {
        id: app.id,
        name: app.name,
        description: app.description,
        systemPrompt: app.systemPrompt,
        brandStyles: app.brandStyles,
        // ... other fields
      };
    }

    // Get launched version data
    const launched = store.getLaunchedVersion(applicationId);
    if (!launched) return null;

    // Return merged: static fields from app + config fields from launched version
    return {
      id: app.id,
      appNameId: app.appNameId,
      isActive: app.isActive,
      // Config fields from launched version:
      name: launched.data.name,
      description: launched.data.description,
      systemPrompt: launched.data.systemPrompt,
      brandStyles: launched.data.brandStyles,
      welcomeMessages: launched.data.welcomeMessages,
      suggestedMessages: launched.data.suggestedMessages,
      settings: launched.data.settings,
      customActions: launched.data.customActions,
      capabilities: launched.data.capabilities,
    };
  }

  it("FIXED BEHAVIOR: resolveAppForConsumer returns launched version data", () => {
    // Launch v1
    store.launchVersion(testApp.id, testUser.id, { tag: "v1" });

    // Builder makes draft changes
    store.updateApplication(testApp.id, {
      name: "Draft Name (not published)",
      brandStyles: { primaryColor: "#000000" },
    });

    // Using the fixed resolver
    const consumerApp = resolveAppForConsumer(testApp.id);

    assertExists(consumerApp);
    // Consumer sees published state
    assertEquals(consumerApp.name, "Consumer App");
    assertEquals(
      (consumerApp.brandStyles as Record<string, unknown>).primaryColor,
      "#ffffff"
    );
  });

  it("FIXED BEHAVIOR: falls back to draft when no launched version exists", () => {
    // No launch yet - brand new app
    const consumerApp = resolveAppForConsumer(testApp.id);

    assertExists(consumerApp);
    // Shows draft since nothing launched yet
    assertEquals(consumerApp.name, "Consumer App");
  });
});
