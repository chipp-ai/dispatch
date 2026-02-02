/**
 * Organization Routes Integration Tests
 *
 * Tests for organization CRUD operations and member management.
 * Uses Hono's app.request() for testing without HTTP overhead.
 *
 * Note: These tests require a running database or mocked services.
 * For unit tests of services, see services/*_test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext, User } from "../../middleware/auth.ts";
import { updateOrganizationSchema } from "../../validators/organization.ts";

// ========================================
// Mock Service for Unit Testing Routes
// ========================================

interface MockOrganization {
  id: number;
  name: string;
  pictureUrl: string | null;
  subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";
  usageBasedBillingEnabled: boolean;
  creditsExhausted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MockMember {
  id: number;
  developerId: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  joinedAt: string;
}

interface MockDeveloper {
  id: string;
  activeWorkspaceId: string | null;
}

interface MockWorkspace {
  id: string;
  organizationId: number;
}

interface MockOrgMembership {
  organizationId: number;
  developerId: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
}

const mockOrganizations = new Map<number, MockOrganization>();
const mockMembers = new Map<number, MockMember[]>();
const mockDevelopers = new Map<string, MockDeveloper>();
const mockWorkspaces = new Map<string, MockWorkspace>();
const mockOrgMemberships = new Map<string, MockOrgMembership>();

const mockOrganizationService = {
  getForUser: async (userId: string): Promise<MockOrganization> => {
    // Look up developer and their active workspace
    const developer = mockDevelopers.get(userId);
    if (!developer || !developer.activeWorkspaceId) {
      throw new Error("Developer not found");
    }

    const workspace = mockWorkspaces.get(developer.activeWorkspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const organization = mockOrganizations.get(workspace.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    return organization;
  },

  get: async (organizationId: number): Promise<MockOrganization> => {
    const organization = mockOrganizations.get(organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }
    return organization;
  },

  update: async (
    userId: string,
    params: { name?: string; pictureUrl?: string | null }
  ): Promise<MockOrganization> => {
    // Get the organization for this user
    const org = await mockOrganizationService.getForUser(userId);

    // Check if user is admin
    const membershipKey = `${org.id}-${userId}`;
    const membership = mockOrgMemberships.get(membershipKey);

    if (!membership) {
      throw new Error("You are not a member of this organization");
    }

    if (membership.role !== "ADMIN") {
      throw new Error("Only admins can update organization details");
    }

    // Update organization
    const updated: MockOrganization = {
      ...org,
      ...params,
      updatedAt: new Date().toISOString(),
    };
    mockOrganizations.set(org.id, updated);

    return updated;
  },

  listMembers: async (userId: string): Promise<MockMember[]> => {
    // Get the organization for this user
    const org = await mockOrganizationService.getForUser(userId);

    // Verify user is a member
    const isMember = await mockOrganizationService.isMember(org.id, userId);
    if (!isMember) {
      throw new Error("You are not a member of this organization");
    }

    return mockMembers.get(org.id) || [];
  },

  isMember: async (
    organizationId: number,
    userId: string
  ): Promise<boolean> => {
    const membershipKey = `${organizationId}-${userId}`;
    return mockOrgMemberships.has(membershipKey);
  },

  getMemberRole: async (
    organizationId: number,
    userId: string
  ): Promise<"ADMIN" | "EDITOR" | "VIEWER" | null> => {
    const membershipKey = `${organizationId}-${userId}`;
    const membership = mockOrgMemberships.get(membershipKey);
    return membership ? membership.role : null;
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

  // Organization routes (copied from index.ts with mock service)
  app.get("/organization", async (c) => {
    const user = c.get("user");
    try {
      const organization = await mockOrganizationService.getForUser(user.id);
      return c.json({ data: organization });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 404);
    }
  });

  app.patch(
    "/organization",
    zValidator("json", updateOrganizationSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");
      try {
        const organization = await mockOrganizationService.update(
          user.id,
          body
        );
        return c.json({ data: organization });
      } catch (error) {
        const message = (error as Error).message;
        if (
          message.includes("not a member") ||
          message.includes("Only admins")
        ) {
          return c.json({ error: message }, 403);
        }
        return c.json({ error: message }, 404);
      }
    }
  );

  app.get("/organization/members", async (c) => {
    const user = c.get("user");
    try {
      const members = await mockOrganizationService.listMembers(user.id);
      return c.json({ data: members });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("not a member")) {
        return c.json({ error: message }, 403);
      }
      return c.json({ error: message }, 404);
    }
  });

  return app;
}

// Clean up between tests
function resetMocks() {
  mockOrganizations.clear();
  mockMembers.clear();
  mockDevelopers.clear();
  mockWorkspaces.clear();
  mockOrgMemberships.clear();
}

// Helper to set up a basic organization structure
function setupOrganization(
  userId: string = "test-user-123",
  role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN"
) {
  const orgId = 1;
  const workspaceId = "ws-123";

  // Create organization
  const org: MockOrganization = {
    id: orgId,
    name: "Test Organization",
    pictureUrl: null,
    subscriptionTier: "FREE",
    usageBasedBillingEnabled: false,
    creditsExhausted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockOrganizations.set(orgId, org);

  // Create workspace
  mockWorkspaces.set(workspaceId, {
    id: workspaceId,
    organizationId: orgId,
  });

  // Create developer
  mockDevelopers.set(userId, {
    id: userId,
    activeWorkspaceId: workspaceId,
  });

  // Create membership
  const membershipKey = `${orgId}-${userId}`;
  mockOrgMemberships.set(membershipKey, {
    organizationId: orgId,
    developerId: userId,
    role,
  });

  // Add to members list
  const member: MockMember = {
    id: 1,
    developerId: userId,
    email: "test@example.com",
    name: "Test User",
    role,
    joinedAt: new Date().toISOString(),
  };
  mockMembers.set(orgId, [member]);

  return { orgId, workspaceId };
}

// ========================================
// GET /organization Tests
// ========================================

Deno.test(
  "GET /organization - returns organization for authenticated user",
  async () => {
    resetMocks();
    setupOrganization();
    const app = createTestApp();

    const res = await app.request("/organization");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertExists(data.data);
    assertEquals(data.data.id, 1);
    assertEquals(data.data.name, "Test Organization");
    assertEquals(data.data.subscriptionTier, "FREE");
    assertEquals(data.data.usageBasedBillingEnabled, false);
    assertEquals(data.data.creditsExhausted, false);
    assertExists(data.data.createdAt);
    assertExists(data.data.updatedAt);
  }
);

Deno.test(
  "GET /organization - returns 404 when developer not found",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/organization");

    assertEquals(res.status, 404);
    const data = await res.json();
    assertEquals(data.error, "Developer not found");
  }
);

Deno.test(
  "GET /organization - returns 404 when workspace not found",
  async () => {
    resetMocks();
    const app = createTestApp();

    // Create developer without workspace
    mockDevelopers.set("test-user-123", {
      id: "test-user-123",
      activeWorkspaceId: "non-existent",
    });

    const res = await app.request("/organization");

    assertEquals(res.status, 404);
    const data = await res.json();
    assertEquals(data.error, "Workspace not found");
  }
);

Deno.test("GET /organization - returns all organization fields", async () => {
  resetMocks();
  setupOrganization();
  const app = createTestApp();

  // Update org with more fields
  const org = mockOrganizations.get(1)!;
  org.pictureUrl = "https://example.com/picture.jpg";
  org.subscriptionTier = "PRO";
  org.usageBasedBillingEnabled = true;
  org.creditsExhausted = true;
  mockOrganizations.set(1, org);

  const res = await app.request("/organization");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.pictureUrl, "https://example.com/picture.jpg");
  assertEquals(data.data.subscriptionTier, "PRO");
  assertEquals(data.data.usageBasedBillingEnabled, true);
  assertEquals(data.data.creditsExhausted, true);
});

// ========================================
// PATCH /organization Tests
// ========================================

Deno.test(
  "PATCH /organization - updates organization name as admin",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Organization Name",
      }),
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.name, "Updated Organization Name");
    assertExists(data.data.updatedAt);
  }
);

Deno.test("PATCH /organization - updates pictureUrl as admin", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pictureUrl: "https://example.com/new-picture.jpg",
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.pictureUrl, "https://example.com/new-picture.jpg");
});

Deno.test(
  "PATCH /organization - updates multiple fields as admin",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Name",
        pictureUrl: "https://example.com/picture.jpg",
      }),
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.name, "New Name");
    assertEquals(data.data.pictureUrl, "https://example.com/picture.jpg");
  }
);

Deno.test("PATCH /organization - can set pictureUrl to null", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  // First set a pictureUrl
  const org = mockOrganizations.get(1)!;
  org.pictureUrl = "https://example.com/picture.jpg";
  mockOrganizations.set(1, org);

  // Then set it to null
  const res = await app.request("/organization", {
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

Deno.test(
  "PATCH /organization - returns 403 when user is not admin",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "EDITOR");
    const app = createTestApp();

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Should Not Update",
      }),
    });

    assertEquals(res.status, 403);
    const data = await res.json();
    assertEquals(data.error, "Only admins can update organization details");
  }
);

Deno.test("PATCH /organization - returns 403 when user is viewer", async () => {
  resetMocks();
  setupOrganization("test-user-123", "VIEWER");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Should Not Update",
    }),
  });

  assertEquals(res.status, 403);
  const data = await res.json();
  assertEquals(data.error, "Only admins can update organization details");
});

Deno.test(
  "PATCH /organization - returns 403 when user is not a member",
  async () => {
    resetMocks();
    // Set up org for a different user (the admin)
    const { orgId, workspaceId } = setupOrganization("other-user", "ADMIN");

    // Set up test-user-123 as a developer with the same workspace but NO membership
    mockDevelopers.set("test-user-123", {
      id: "test-user-123",
      activeWorkspaceId: workspaceId,
    });
    // Don't add any membership for test-user-123

    const app = createTestApp();

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Should Not Update",
      }),
    });

    assertEquals(res.status, 403);
    const data = await res.json();
    assertEquals(data.error, "You are not a member of this organization");
  }
);

Deno.test("PATCH /organization - validates name length minimum", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "",
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test("PATCH /organization - validates name length maximum", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "a".repeat(101), // 101 characters, max is 100
    }),
  });

  assertEquals(res.status, 400);
});

Deno.test(
  "PATCH /organization - validates pictureUrl is valid URL",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pictureUrl: "not-a-url",
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test("PATCH /organization - accepts valid HTTPS URL", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pictureUrl: "https://example.com/image.png",
    }),
  });

  assertEquals(res.status, 200);
});

Deno.test("PATCH /organization - accepts valid HTTP URL", async () => {
  resetMocks();
  setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  const res = await app.request("/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pictureUrl: "http://example.com/image.png",
    }),
  });

  assertEquals(res.status, 200);
});

Deno.test(
  "PATCH /organization - empty body returns current organization",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const originalOrg = mockOrganizations.get(1)!;

    const res = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.name, originalOrg.name);
  }
);

// ========================================
// GET /organization/members Tests
// ========================================

Deno.test(
  "GET /organization/members - returns members list for admin",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const res = await app.request("/organization/members");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
    assertEquals(data.data.length, 1);
    assertEquals(data.data[0].email, "test@example.com");
    assertEquals(data.data[0].role, "ADMIN");
    assertExists(data.data[0].id);
    assertExists(data.data[0].developerId);
    assertExists(data.data[0].joinedAt);
  }
);

Deno.test(
  "GET /organization/members - returns members list for editor",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "EDITOR");
    const app = createTestApp();

    const res = await app.request("/organization/members");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
  }
);

Deno.test(
  "GET /organization/members - returns members list for viewer",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "VIEWER");
    const app = createTestApp();

    const res = await app.request("/organization/members");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
  }
);

Deno.test("GET /organization/members - returns multiple members", async () => {
  resetMocks();
  const { orgId } = setupOrganization("test-user-123", "ADMIN");
  const app = createTestApp();

  // Add more members
  const members = mockMembers.get(orgId)!;
  members.push(
    {
      id: 2,
      developerId: "user-2",
      email: "user2@example.com",
      name: "User Two",
      role: "EDITOR",
      joinedAt: new Date().toISOString(),
    },
    {
      id: 3,
      developerId: "user-3",
      email: "user3@example.com",
      name: null,
      role: "VIEWER",
      joinedAt: new Date().toISOString(),
    }
  );
  mockMembers.set(orgId, members);

  const res = await app.request("/organization/members");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.length, 3);
  assertEquals(data.data[0].role, "ADMIN");
  assertEquals(data.data[1].role, "EDITOR");
  assertEquals(data.data[2].role, "VIEWER");
  assertEquals(data.data[2].name, null);
});

Deno.test(
  "GET /organization/members - returns 403 when user is not a member",
  async () => {
    resetMocks();
    // Set up org for a different user (the admin)
    const { workspaceId } = setupOrganization("other-user", "ADMIN");

    // Set up test-user-123 as a developer with the same workspace but NO membership
    mockDevelopers.set("test-user-123", {
      id: "test-user-123",
      activeWorkspaceId: workspaceId,
    });
    // Don't add any membership for test-user-123

    const app = createTestApp();

    const res = await app.request("/organization/members");

    assertEquals(res.status, 403);
    const data = await res.json();
    assertEquals(data.error, "You are not a member of this organization");
  }
);

Deno.test(
  "GET /organization/members - returns empty array when no members",
  async () => {
    resetMocks();
    const { orgId } = setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    // Clear members list
    mockMembers.set(orgId, []);

    const res = await app.request("/organization/members");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(Array.isArray(data.data), true);
    assertEquals(data.data.length, 0);
  }
);

Deno.test(
  "GET /organization/members - includes all member fields",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    const res = await app.request("/organization/members");

    assertEquals(res.status, 200);
    const data = await res.json();
    const member = data.data[0];
    assertExists(member.id);
    assertExists(member.developerId);
    assertExists(member.email);
    assertExists(member.role);
    assertExists(member.joinedAt);
    // name can be null
    assertEquals(typeof member.name === "string" || member.name === null, true);
  }
);

// ========================================
// Integration Tests
// ========================================

Deno.test(
  "Integration - can read org, update it, and read updated version",
  async () => {
    resetMocks();
    setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    // Read original
    const res1 = await app.request("/organization");
    assertEquals(res1.status, 200);
    const data1 = await res1.json();
    assertEquals(data1.data.name, "Test Organization");

    // Update
    const res2 = await app.request("/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        pictureUrl: "https://example.com/pic.jpg",
      }),
    });
    assertEquals(res2.status, 200);

    // Read updated
    const res3 = await app.request("/organization");
    assertEquals(res3.status, 200);
    const data3 = await res3.json();
    assertEquals(data3.data.name, "Updated Name");
    assertEquals(data3.data.pictureUrl, "https://example.com/pic.jpg");
  }
);

Deno.test(
  "Integration - members list reflects organization structure",
  async () => {
    resetMocks();
    const { orgId } = setupOrganization("test-user-123", "ADMIN");
    const app = createTestApp();

    // Add members with different roles
    const members = mockMembers.get(orgId)!;
    members.push(
      {
        id: 2,
        developerId: "editor-user",
        email: "editor@example.com",
        name: "Editor User",
        role: "EDITOR",
        joinedAt: new Date().toISOString(),
      },
      {
        id: 3,
        developerId: "viewer-user",
        email: "viewer@example.com",
        name: "Viewer User",
        role: "VIEWER",
        joinedAt: new Date().toISOString(),
      }
    );
    mockMembers.set(orgId, members);

    // Get organization
    const res1 = await app.request("/organization");
    assertEquals(res1.status, 200);
    const org = await res1.json();

    // Get members
    const res2 = await app.request("/organization/members");
    assertEquals(res2.status, 200);
    const membersData = await res2.json();

    // All members should be for the same organization
    assertEquals(membersData.data.length, 3);
    assertEquals(
      membersData.data.filter((m: MockMember) => m.role === "ADMIN").length,
      1
    );
    assertEquals(
      membersData.data.filter((m: MockMember) => m.role === "EDITOR").length,
      1
    );
    assertEquals(
      membersData.data.filter((m: MockMember) => m.role === "VIEWER").length,
      1
    );
  }
);
