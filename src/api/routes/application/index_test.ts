/**
 * Application Routes Integration Tests
 *
 * Tests for application CRUD operations.
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
  createApplicationSchema,
  updateApplicationSchema,
  duplicateApplicationSchema,
  moveApplicationSchema,
  listApplicationsQuerySchema,
} from "../../validators/application.ts";

// ========================================
// Mock Service Factory for Isolated Tests
// ========================================

function createMockService() {
  // Each test gets its own isolated Map
  const mockApplications = new Map<string, unknown>();
  let idCounter = 0;

  return {
    list: async (params: {
      userId: string;
      workspaceId?: string;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }) => {
      let apps = Array.from(mockApplications.values());

      if (params.workspaceId) {
        apps = apps.filter(
          (a: unknown) =>
            (a as { workspaceId: string }).workspaceId === params.workspaceId
        );
      }

      if (!params.includeDeleted) {
        apps = apps.filter(
          (a: unknown) => !(a as { isDeleted: boolean }).isDeleted
        );
      }

      const offset = params.offset || 0;
      const limit = params.limit || 50;

      return apps.slice(offset, offset + limit);
    },

    create: async (params: {
      name: string;
      description?: string;
      systemPrompt?: string;
      workspaceId: string;
      creatorId: string;
      modelId?: string;
      isPublic?: boolean;
    }) => {
      idCounter++;
      const application = {
        id: `app-${idCounter}`,
        name: params.name,
        description: params.description || null,
        systemPrompt: params.systemPrompt || null,
        workspaceId: params.workspaceId,
        creatorId: params.creatorId,
        modelId: params.modelId || "gpt-4o",
        isPublic: params.isPublic || false,
        pictureUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      };
      mockApplications.set(application.id, application);
      return application;
    },

    get: async (id: string, _userId: string) => {
      const application = mockApplications.get(id);
      if (!application) {
        throw new Error("Application not found");
      }
      if ((application as { isDeleted: boolean }).isDeleted) {
        throw new Error("Application not found");
      }
      return application;
    },

    update: async (
      id: string,
      _userId: string,
      params: {
        name?: string;
        description?: string;
        systemPrompt?: string;
        pictureUrl?: string | null;
        modelId?: string;
        isPublic?: boolean;
      }
    ) => {
      const application = mockApplications.get(id) as Record<string, unknown>;
      if (!application) {
        throw new Error("Application not found");
      }
      if (application.isDeleted) {
        throw new Error("Application not found");
      }
      const updated = {
        ...application,
        ...params,
        updatedAt: new Date().toISOString(),
      };
      mockApplications.set(id, updated);
      return updated;
    },

    delete: async (id: string, _userId: string) => {
      const application = mockApplications.get(id) as Record<string, unknown>;
      if (!application) {
        throw new Error("Application not found");
      }
      if (application.isDeleted) {
        throw new Error("Application not found");
      }
      application.isDeleted = true;
      application.deletedAt = new Date().toISOString();
      mockApplications.set(id, application);
    },

    duplicate: async (
      id: string,
      userId: string,
      params: { name?: string; workspaceId?: string }
    ) => {
      const original = mockApplications.get(id) as Record<string, unknown>;
      if (!original) {
        throw new Error("Application not found");
      }
      if (original.isDeleted) {
        throw new Error("Application not found");
      }

      idCounter++;
      const duplicated = {
        id: `app-${idCounter}-copy`,
        name: params.name || `${original.name} (Copy)`,
        description: original.description,
        systemPrompt: original.systemPrompt,
        workspaceId: params.workspaceId || original.workspaceId,
        creatorId: userId,
        modelId: original.modelId,
        isPublic: false,
        pictureUrl: original.pictureUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      };
      mockApplications.set(duplicated.id, duplicated);
      return duplicated;
    },

    move: async (id: string, _userId: string, workspaceId: string) => {
      const application = mockApplications.get(id) as Record<string, unknown>;
      if (!application) {
        throw new Error("Application not found");
      }
      if (application.isDeleted) {
        throw new Error("Application not found");
      }
      application.workspaceId = workspaceId;
      application.updatedAt = new Date().toISOString();
      mockApplications.set(id, application);
      return application;
    },
  };
}

// ========================================
// Test App with Mock Service
// ========================================

function createTestApp() {
  const app = new Hono<AuthContext>();
  const mockService = createMockService();

  // Mock auth middleware that sets a test user
  app.use("*", async (c, next) => {
    const user: User = {
      id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
      organizationId: "org-123",
      activeWorkspaceId: "ws-123",
      role: "owner",
    };
    c.set("user", user);
    await next();
  });

  // Application routes (copied from index.ts with mock service)
  app.get(
    "/applications",
    zValidator("query", listApplicationsQuerySchema),
    async (c) => {
      const user = c.get("user");
      const query = c.req.valid("query");

      const applications = await mockService.list({
        userId: user.id,
        workspaceId: query.workspaceId,
        includeDeleted: query.includeDeleted,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json({ data: applications });
    }
  );

  app.post(
    "/applications",
    zValidator("json", createApplicationSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");

      const application = await mockService.create({
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        workspaceId: body.workspaceId,
        creatorId: user.id,
        modelId: body.modelId,
        isPublic: body.isPublic,
      });

      return c.json({ data: application }, 201);
    }
  );

  app.get("/applications/:id", async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();

    try {
      const application = await mockService.get(id, user.id);
      return c.json({ data: application });
    } catch {
      return c.json({ error: "Application not found" }, 404);
    }
  });

  app.patch(
    "/applications/:id",
    zValidator("json", updateApplicationSchema),
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.param();
      const body = c.req.valid("json");

      try {
        const application = await mockService.update(id, user.id, body);
        return c.json({ data: application });
      } catch {
        return c.json({ error: "Application not found" }, 404);
      }
    }
  );

  app.delete("/applications/:id", async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();

    try {
      await mockService.delete(id, user.id);
      return c.json({ success: true });
    } catch {
      return c.json({ error: "Application not found" }, 404);
    }
  });

  app.post(
    "/applications/:id/duplicate",
    zValidator("json", duplicateApplicationSchema),
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.param();
      const body = c.req.valid("json");

      try {
        const application = await mockService.duplicate(id, user.id, {
          name: body.name,
          workspaceId: body.workspaceId,
        });

        return c.json({ data: application }, 201);
      } catch {
        return c.json({ error: "Application not found" }, 404);
      }
    }
  );

  app.post(
    "/applications/:id/move",
    zValidator("json", moveApplicationSchema),
    async (c) => {
      const user = c.get("user");
      const { id } = c.req.param();
      const body = c.req.valid("json");

      try {
        const application = await mockService.move(
          id,
          user.id,
          body.workspaceId
        );
        return c.json({ data: application });
      } catch {
        return c.json({ error: "Application not found" }, 404);
      }
    }
  );

  return app;
}

// Test workspace UUIDs
const WS_1 = "11111111-1111-1111-1111-111111111111";
const WS_2 = "22222222-2222-2222-2222-222222222222";
const WS_123 = "12345678-1234-1234-1234-123456789012";

// ========================================
// GET /applications Tests
// ========================================

Deno.test(
  "GET /applications - returns empty array when no applications",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
    assertEquals(data.data.length, 0);
  }
);

Deno.test("GET /applications - filters by workspaceId", async () => {
  const app = createTestApp();

  // Create apps in different workspaces
  await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App 1",
      workspaceId: WS_1,
    }),
  });

  await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App 2",
      workspaceId: WS_2,
    }),
  });

  const res = await app.request(`/applications?workspaceId=${WS_1}`);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, "App 1");
});

Deno.test("GET /applications - excludes deleted by default", async () => {
  const app = createTestApp();

  // Create app
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App to Delete",
      workspaceId: WS_1,
    }),
  });
  const created = await createRes.json();

  // Delete it
  await app.request(`/applications/${created.data.id}`, {
    method: "DELETE",
  });

  // List without includeDeleted
  const res = await app.request("/applications");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 0);
});

Deno.test("GET /applications - includes deleted when requested", async () => {
  const app = createTestApp();

  // Create app
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App to Delete",
      workspaceId: WS_1,
    }),
  });
  const created = await createRes.json();

  // Delete it
  await app.request(`/applications/${created.data.id}`, {
    method: "DELETE",
  });

  // List with includeDeleted
  const res = await app.request("/applications?includeDeleted=true");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 1);
});

Deno.test("GET /applications - respects limit parameter", async () => {
  const app = createTestApp();

  // Create 5 apps
  for (let i = 1; i <= 5; i++) {
    await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `App ${i}`,
        workspaceId: WS_1,
      }),
    });
  }

  const res = await app.request("/applications?limit=3");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 3);
});

Deno.test("GET /applications - respects offset parameter", async () => {
  const app = createTestApp();

  // Create 3 apps
  for (let i = 1; i <= 3; i++) {
    await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `App ${i}`,
        workspaceId: WS_1,
      }),
    });
  }

  const res = await app.request("/applications?offset=2");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 1);
});

// ========================================
// POST /applications Tests
// ========================================

Deno.test(
  "POST /applications - creates application with valid data",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My New App",
        description: "A test application",
        systemPrompt: "You are a helpful assistant",
        workspaceId: WS_123,
        modelId: "gpt-4o",
        isPublic: true,
      }),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.name, "My New App");
    assertEquals(data.data.description, "A test application");
    assertEquals(data.data.systemPrompt, "You are a helpful assistant");
    assertEquals(data.data.workspaceId, WS_123);
    assertEquals(data.data.modelId, "gpt-4o");
    assertEquals(data.data.isPublic, true);
    assertExists(data.data.id);
  }
);

Deno.test(
  "POST /applications - creates application with minimal data",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Minimal App",
        workspaceId: WS_123,
      }),
    });

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.name, "Minimal App");
    assertEquals(data.data.description, null);
    assertEquals(data.data.systemPrompt, null);
    assertEquals(data.data.modelId, "claude-sonnet-4-5"); // Default
    assertEquals(data.data.isPublic, false); // Default
  }
);

Deno.test("POST /applications - validates required fields", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /applications - validates name length (empty)", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "",
      workspaceId: "ws-123",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /applications - validates name length (too long)", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "a".repeat(101), // Max is 100
      workspaceId: "ws-123",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /applications - validates description length", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App",
      description: "a".repeat(2001), // Max is 2000
      workspaceId: "ws-123",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /applications - validates systemPrompt length", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App",
      systemPrompt: "a".repeat(10001), // Max is 10000
      workspaceId: "ws-123",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("POST /applications - validates workspaceId format", async () => {
  const app = createTestApp();

  const res = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App",
      workspaceId: "not-a-uuid",
    }),
  });

  assertEquals(res.status, 400);
});

// ========================================
// GET /applications/:id Tests
// ========================================

Deno.test("GET /applications/:id - returns application by ID", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test App",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Fetch it
  const res = await app.request(`/applications/${created.data.id}`);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.id, created.data.id);
  assertEquals(data.data.name, "Test App");
});

Deno.test(
  "GET /applications/:id - returns 404 for non-existent application",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications/non-existent-id");

    assertEquals(res.status, 404);
  }
);

Deno.test(
  "GET /applications/:id - returns 404 for deleted application",
  async () => {
    const app = createTestApp();

    // Create and delete application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "To Delete",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    await app.request(`/applications/${created.data.id}`, {
      method: "DELETE",
    });

    // Try to fetch deleted app
    const res = await app.request(`/applications/${created.data.id}`);

    assertEquals(res.status, 404);
  }
);

// ========================================
// PATCH /applications/:id Tests
// ========================================

Deno.test("PATCH /applications/:id - updates application name", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Original Name",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Update it
  const res = await app.request(`/applications/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Updated Name",
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.name, "Updated Name");
});

Deno.test("PATCH /applications/:id - updates multiple fields", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Original Name",
      description: "Original Description",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Update multiple fields
  const res = await app.request(`/applications/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "New Name",
      description: "New Description",
      systemPrompt: "New prompt",
      isPublic: true,
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.name, "New Name");
  assertEquals(data.data.description, "New Description");
  assertEquals(data.data.systemPrompt, "New prompt");
  assertEquals(data.data.isPublic, true);
});

Deno.test(
  "PATCH /applications/:id - updates only specified fields",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Original Name",
        description: "Original Description",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Update only name
    const res = await app.request(`/applications/${created.data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Name",
      }),
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.name, "New Name");
    assertEquals(data.data.description, "Original Description");
  }
);

Deno.test("PATCH /applications/:id - can set pictureUrl to null", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Update pictureUrl to null
  const res = await app.request(`/applications/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pictureUrl: null,
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.pictureUrl, null);
});

Deno.test("PATCH /applications/:id - validates pictureUrl format", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "App",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Try invalid URL
  const res = await app.request(`/applications/${created.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pictureUrl: "not-a-url",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test(
  "PATCH /applications/:id - returns 404 for non-existent application",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications/non-existent-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Name",
      }),
    });

    assertEquals(res.status, 404);
  }
);

// ========================================
// DELETE /applications/:id Tests
// ========================================

Deno.test("DELETE /applications/:id - deletes application", async () => {
  const app = createTestApp();

  // Create application
  const createRes = await app.request("/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "To Delete",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    }),
  });
  const created = await createRes.json();

  // Delete it
  const res = await app.request(`/applications/${created.data.id}`, {
    method: "DELETE",
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.success, true);
});

Deno.test(
  "DELETE /applications/:id - returns 404 for non-existent application",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications/non-existent-id", {
      method: "DELETE",
    });

    assertEquals(res.status, 404);
  }
);

Deno.test(
  "DELETE /applications/:id - returns 404 for already deleted application",
  async () => {
    const app = createTestApp();

    // Create and delete application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "To Delete",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    await app.request(`/applications/${created.data.id}`, {
      method: "DELETE",
    });

    // Try to delete again
    const res = await app.request(`/applications/${created.data.id}`, {
      method: "DELETE",
    });

    assertEquals(res.status, 404);
  }
);

// ========================================
// POST /applications/:id/duplicate Tests
// ========================================

Deno.test(
  "POST /applications/:id/duplicate - duplicates with default name",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Original App",
        description: "Original description",
        systemPrompt: "Original prompt",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Duplicate it
    const res = await app.request(
      `/applications/${created.data.id}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.name, "Original App (Copy)");
    assertEquals(data.data.description, created.data.description);
    assertEquals(data.data.systemPrompt, created.data.systemPrompt);
    assertEquals(data.data.workspaceId, created.data.workspaceId);
    assertEquals(data.data.isPublic, false); // Always false for duplicates
    assertExists(data.data.id);
    assertEquals(data.data.id !== created.data.id, true);
  }
);

Deno.test(
  "POST /applications/:id/duplicate - duplicates with custom name",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Original App",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Duplicate with custom name
    const res = await app.request(
      `/applications/${created.data.id}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Custom Duplicate Name",
        }),
      }
    );

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.name, "Custom Duplicate Name");
  }
);

Deno.test(
  "POST /applications/:id/duplicate - duplicates to different workspace",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Original App",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Duplicate to different workspace
    const res = await app.request(
      `/applications/${created.data.id}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "660e8400-e29b-41d4-a716-446655440000",
        }),
      }
    );

    assertEquals(res.status, 201);
    const data = await res.json();
    assertEquals(data.data.workspaceId, "660e8400-e29b-41d4-a716-446655440000");
  }
);

Deno.test(
  "POST /applications/:id/duplicate - validates workspaceId format",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Original App",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Try to duplicate with invalid workspaceId
    const res = await app.request(
      `/applications/${created.data.id}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "not-a-uuid",
        }),
      }
    );

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /applications/:id/duplicate - returns 404 for non-existent application",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications/non-existent-id/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 404);
  }
);

// ========================================
// POST /applications/:id/move Tests
// ========================================

Deno.test(
  "POST /applications/:id/move - moves application to different workspace",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "App to Move",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Move it
    const res = await app.request(`/applications/${created.data.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "660e8400-e29b-41d4-a716-446655440000",
      }),
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.workspaceId, "660e8400-e29b-41d4-a716-446655440000");
    assertEquals(data.data.id, created.data.id); // Same ID
    assertEquals(data.data.name, created.data.name); // Same name
  }
);

Deno.test(
  "POST /applications/:id/move - validates workspaceId is required",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "App",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Try to move without workspaceId
    const res = await app.request(`/applications/${created.data.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /applications/:id/move - validates workspaceId format",
  async () => {
    const app = createTestApp();

    // Create application
    const createRes = await app.request("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "App",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    const created = await createRes.json();

    // Try to move with invalid workspaceId
    const res = await app.request(`/applications/${created.data.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "not-a-uuid",
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /applications/:id/move - returns 404 for non-existent application",
  async () => {
    const app = createTestApp();

    const res = await app.request("/applications/non-existent-id/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "660e8400-e29b-41d4-a716-446655440000",
      }),
    });

    assertEquals(res.status, 404);
  }
);
