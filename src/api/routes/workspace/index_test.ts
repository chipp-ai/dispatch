/**
 * Workspace Routes Integration Tests
 *
 * Tests for workspace CRUD operations.
 * Uses Hono's app.request() for testing without HTTP overhead.
 *
 * Note: These tests require a running database or mocked services.
 * For unit tests of services, see services/*_test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext, User } from "../../middleware/auth.ts";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addMemberSchema,
} from "../../validators/workspace.ts";

// ========================================
// Mock Service for Unit Testing Routes
// ========================================

const mockWorkspaces = new Map<string, unknown>();
const mockMembers = new Map<string, unknown[]>();

const mockWorkspaceService = {
  listForUser: async (userId: string) => {
    return Array.from(mockWorkspaces.values()).filter(
      (w: unknown) =>
        (w as { organizationId: string }).organizationId === userId
    );
  },

  get: async (workspaceId: string, _userId: string) => {
    const workspace = mockWorkspaces.get(workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    return workspace;
  },

  create: async (params: {
    name: string;
    description?: string;
    organizationId?: string;
    creatorId: string;
  }) => {
    const workspace = {
      id: `ws-${Date.now()}`,
      name: params.name,
      description: params.description || null,
      slug: `${params.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      organizationId: params.organizationId || "org-test",
      creatorId: params.creatorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    };
    mockWorkspaces.set(workspace.id, workspace);
    mockMembers.set(workspace.id, [
      { userId: params.creatorId, role: "owner" },
    ]);
    return workspace;
  },

  update: async (
    workspaceId: string,
    _userId: string,
    params: { name?: string; description?: string }
  ) => {
    const workspace = mockWorkspaces.get(workspaceId) as Record<
      string,
      unknown
    >;
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    const updated = {
      ...workspace,
      ...params,
      updatedAt: new Date().toISOString(),
    };
    mockWorkspaces.set(workspaceId, updated);
    return updated;
  },

  delete: async (workspaceId: string, _userId: string) => {
    const workspace = mockWorkspaces.get(workspaceId) as Record<
      string,
      unknown
    >;
    if (!workspace) {
      throw new Error("Workspace not found");
    }
    workspace.isDeleted = true;
    mockWorkspaces.set(workspaceId, workspace);
  },

  listMembers: async (workspaceId: string, _userId: string) => {
    return mockMembers.get(workspaceId) || [];
  },

  addMember: async (
    workspaceId: string,
    _userId: string,
    params: { email: string; role: string }
  ) => {
    const members = mockMembers.get(workspaceId) || [];
    const member = {
      id: `mem-${Date.now()}`,
      userId: `user-${Date.now()}`,
      email: params.email,
      role: params.role,
      joinedAt: new Date().toISOString(),
    };
    members.push(member);
    mockMembers.set(workspaceId, members);
    return member;
  },

  removeMember: async (
    workspaceId: string,
    _userId: string,
    memberId: string
  ) => {
    const members = mockMembers.get(workspaceId) || [];
    const filtered = members.filter(
      (m: unknown) => (m as { id: string }).id !== memberId
    );
    mockMembers.set(workspaceId, filtered);
  },

  listApplications: async (_workspaceId: string, _userId: string) => {
    return [];
  },
};

// ========================================
// Test App with Mock Service
// ========================================

function createTestApp() {
  const app = new Hono<AuthContext>();

  // Mock auth middleware that sets a test user
  app.use("*", async (c, next) => {
    const user: User = {
      id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
      organizationId: "org-123",
      activeWorkspaceId: null,
      role: "owner",
    };
    c.set("user", user);
    await next();
  });

  // Workspace routes (copied from index.ts with mock service)
  app.get("/workspaces", async (c) => {
    const user = c.get("user");
    const workspaces = await mockWorkspaceService.listForUser(user.id);
    return c.json({ data: workspaces });
  });

  app.post(
    "/workspaces",
    zValidator("json", createWorkspaceSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      const workspace = await mockWorkspaceService.create({
        name: body.name,
        description: body.description,
        organizationId: body.organizationId,
        creatorId: user.id,
      });
      return c.json({ data: workspace }, 201);
    }
  );

  app.get("/workspaces/:id", async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    try {
      const workspace = await mockWorkspaceService.get(id, user.id);
      return c.json({ data: workspace });
    } catch {
      return c.json({ error: "Workspace not found" }, 404);
    }
  });

  app.patch(
    "/workspaces/:id",
    zValidator("json", updateWorkspaceSchema),
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.param();
      const body = c.req.valid("json");
      try {
        const workspace = await mockWorkspaceService.update(id, user.id, body);
        return c.json({ data: workspace });
      } catch {
        return c.json({ error: "Workspace not found" }, 404);
      }
    }
  );

  app.delete("/workspaces/:id", async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    try {
      await mockWorkspaceService.delete(id, user.id);
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Workspace not found" }, 404);
    }
  });

  app.get("/workspaces/:id/members", async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const members = await mockWorkspaceService.listMembers(id, user.id);
    return c.json({ data: members });
  });

  app.post(
    "/workspaces/:id/members",
    zValidator("json", addMemberSchema),
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.param();
      const body = c.req.valid("json");
      const member = await mockWorkspaceService.addMember(id, user.id, {
        email: body.email,
        role: body.role,
      });
      return c.json({ data: member }, 201);
    }
  );

  return app;
}

// Clean up between tests
function resetMocks() {
  mockWorkspaces.clear();
  mockMembers.clear();
}

// ========================================
// GET /workspaces Tests
// ========================================

Deno.test(
  "GET /workspaces - returns empty array when no workspaces",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/workspaces");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
  }
);

// ========================================
// POST /workspaces Tests
// ========================================

Deno.test("POST /workspaces - creates workspace with valid data", async () => {
  resetMocks();
  const app = createTestApp();

  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "My New Workspace",
      description: "A test workspace",
    }),
  });

  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.data.name, "My New Workspace");
  assertEquals(data.data.description, "A test workspace");
  assertExists(data.data.id);
  assertExists(data.data.slug);
});

Deno.test(
  "POST /workspaces - creates workspace without description",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Minimal Workspace",
      }),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.name, "Minimal Workspace");
    assertEquals(data.data.description, null);
  }
);

Deno.test("POST /workspaces - validates required fields", async () => {
  resetMocks();
  const app = createTestApp();

  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /workspaces - validates name length", async () => {
  resetMocks();
  const app = createTestApp();

  const res = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "", // Empty name should fail
    }),
  });

  assertEquals(res.status, 400);
});

// ========================================
// GET /workspaces/:id Tests
// ========================================

Deno.test("GET /workspaces/:id - returns workspace by ID", async () => {
  resetMocks();
  const app = createTestApp();

  // First create a workspace
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Workspace" }),
  });
  const created = await createRes.json();

  // Then fetch it
  const res = await app.request(`/workspaces/${created.data.id}`);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.id, created.data.id);
  assertEquals(data.data.name, "Test Workspace");
});

Deno.test(
  "GET /workspaces/:id - returns 404 for non-existent workspace",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/workspaces/non-existent-id");

    assertEquals(res.status, 404);
  }
);

// ========================================
// PATCH /workspaces/:id Tests
// ========================================

Deno.test("PATCH /workspaces/:id - updates workspace name", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Original Name" }),
  });
  const created = await createRes.json();

  // Update it
  const res = await app.request(`/workspaces/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Updated Name" }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.name, "Updated Name");
});

Deno.test("PATCH /workspaces/:id - updates only specified fields", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace with description
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Original Name",
      description: "Original Description",
    }),
  });
  const created = await createRes.json();

  // Update only name
  const res = await app.request(`/workspaces/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New Name" }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.name, "New Name");
  assertEquals(data.data.description, "Original Description");
});

// ========================================
// DELETE /workspaces/:id Tests
// ========================================

Deno.test("DELETE /workspaces/:id - deletes workspace", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "To Delete" }),
  });
  const created = await createRes.json();

  // Delete it
  const res = await app.request(`/workspaces/${created.data.id}`, {
    method: "DELETE",
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

// ========================================
// Members Tests
// ========================================

Deno.test("GET /workspaces/:id/members - returns members list", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace (automatically adds creator as owner)
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Team Workspace" }),
  });
  const created = await createRes.json();

  const res = await app.request(`/workspaces/${created.data.id}/members`);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(Array.isArray(data.data), true);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].role, "owner");
});

Deno.test("POST /workspaces/:id/members - adds new member", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Team Workspace" }),
  });
  const created = await createRes.json();

  // Add member
  const res = await app.request(`/workspaces/${created.data.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "newmember@example.com",
      role: "member",
    }),
  });

  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.data.email, "newmember@example.com");
  assertEquals(data.data.role, "member");
});

Deno.test("POST /workspaces/:id/members - validates role", async () => {
  resetMocks();
  const app = createTestApp();

  // Create workspace
  const createRes = await app.request("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Team Workspace" }),
  });
  const created = await createRes.json();

  // Try to add member with invalid role
  const res = await app.request(`/workspaces/${created.data.id}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      role: "superadmin", // Invalid role
    }),
  });

  assertEquals(res.status, 400);
});
