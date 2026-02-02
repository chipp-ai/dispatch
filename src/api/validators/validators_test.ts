/**
 * Comprehensive tests for all Zod validators
 */

import { assertEquals } from "@std/assert";
import {
  addMemberSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
} from "./workspace.ts";
import {
  createApplicationSchema,
  duplicateApplicationSchema,
  listApplicationsQuerySchema,
  moveApplicationSchema,
  updateApplicationSchema,
} from "./application.ts";
import { createPortalSessionSchema, usageQuerySchema } from "./billing.ts";
import {
  chatSessionSourceSchema,
  createSessionSchema,
  listSessionsQuerySchema,
  senderTypeSchema,
  streamChatSchema,
} from "./chat.ts";
import { updateOrganizationSchema } from "./organization.ts";

// ============================================================================
// WORKSPACE VALIDATORS
// ============================================================================

Deno.test("createWorkspaceSchema - accepts valid input with all fields", () => {
  const result = createWorkspaceSchema.safeParse({
    name: "Test Workspace",
    description: "A test workspace",
    organizationId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.name, "Test Workspace");
    assertEquals(result.data.description, "A test workspace");
  }
});

Deno.test(
  "createWorkspaceSchema - accepts valid input with required fields only",
  () => {
    const result = createWorkspaceSchema.safeParse({
      name: "Test",
    });
    assertEquals(result.success, true);
  }
);

Deno.test("createWorkspaceSchema - rejects empty name", () => {
  const result = createWorkspaceSchema.safeParse({ name: "" });
  assertEquals(result.success, false);
});

Deno.test("createWorkspaceSchema - rejects missing name", () => {
  const result = createWorkspaceSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test(
  "createWorkspaceSchema - rejects name exceeding 100 characters",
  () => {
    const result = createWorkspaceSchema.safeParse({
      name: "a".repeat(101),
    });
    assertEquals(result.success, false);
  }
);

Deno.test(
  "createWorkspaceSchema - accepts name with exactly 100 characters",
  () => {
    const result = createWorkspaceSchema.safeParse({
      name: "a".repeat(100),
    });
    assertEquals(result.success, true);
  }
);

Deno.test(
  "createWorkspaceSchema - rejects description exceeding 500 characters",
  () => {
    const result = createWorkspaceSchema.safeParse({
      name: "Test",
      description: "a".repeat(501),
    });
    assertEquals(result.success, false);
  }
);

Deno.test("createWorkspaceSchema - rejects invalid organizationId UUID", () => {
  const result = createWorkspaceSchema.safeParse({
    name: "Test",
    organizationId: "not-a-uuid",
  });
  assertEquals(result.success, false);
});

Deno.test("updateWorkspaceSchema - accepts valid name update", () => {
  const result = updateWorkspaceSchema.safeParse({
    name: "Updated Name",
  });
  assertEquals(result.success, true);
});

Deno.test("updateWorkspaceSchema - accepts valid description update", () => {
  const result = updateWorkspaceSchema.safeParse({
    description: "Updated description",
  });
  assertEquals(result.success, true);
});

Deno.test("updateWorkspaceSchema - accepts valid pictureUrl update", () => {
  const result = updateWorkspaceSchema.safeParse({
    pictureUrl: "https://example.com/image.png",
  });
  assertEquals(result.success, true);
});

Deno.test("updateWorkspaceSchema - rejects invalid pictureUrl", () => {
  const result = updateWorkspaceSchema.safeParse({
    pictureUrl: "not-a-url",
  });
  assertEquals(result.success, false);
});

Deno.test(
  "updateWorkspaceSchema - accepts empty object (all fields optional)",
  () => {
    const result = updateWorkspaceSchema.safeParse({});
    assertEquals(result.success, true);
  }
);

Deno.test("updateWorkspaceSchema - rejects empty name", () => {
  const result = updateWorkspaceSchema.safeParse({
    name: "",
  });
  assertEquals(result.success, false);
});

Deno.test("addMemberSchema - accepts valid email with default role", () => {
  const result = addMemberSchema.safeParse({
    email: "test@example.com",
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.role, "member");
  }
});

Deno.test("addMemberSchema - rejects owner role for security", () => {
  // Owner role cannot be assigned via addMember - must use transfer endpoint
  const result = addMemberSchema.safeParse({
    email: "test@example.com",
    role: "owner",
  });
  assertEquals(result.success, false);
});

Deno.test("addMemberSchema - accepts valid email with admin role", () => {
  const result = addMemberSchema.safeParse({
    email: "test@example.com",
    role: "admin",
  });
  assertEquals(result.success, true);
});

Deno.test("addMemberSchema - rejects invalid email", () => {
  const result = addMemberSchema.safeParse({
    email: "not-an-email",
  });
  assertEquals(result.success, false);
});

Deno.test("addMemberSchema - rejects invalid role", () => {
  const result = addMemberSchema.safeParse({
    email: "test@example.com",
    role: "superuser",
  });
  assertEquals(result.success, false);
});

// ============================================================================
// APPLICATION VALIDATORS
// ============================================================================

Deno.test(
  "createApplicationSchema - accepts valid input with all fields",
  () => {
    const result = createApplicationSchema.safeParse({
      name: "Test App",
      description: "A test application",
      systemPrompt: "You are a helpful assistant",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
      modelId: "gpt-4o-mini",
      isPublic: true,
    });
    assertEquals(result.success, true);
  }
);

Deno.test(
  "createApplicationSchema - accepts valid input with required fields only",
  () => {
    const result = createApplicationSchema.safeParse({
      name: "Test App",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.modelId, "gpt-4o");
      assertEquals(result.data.isPublic, false);
    }
  }
);

Deno.test("createApplicationSchema - rejects empty name", () => {
  const result = createApplicationSchema.safeParse({
    name: "",
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, false);
});

Deno.test("createApplicationSchema - rejects missing name", () => {
  const result = createApplicationSchema.safeParse({
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, false);
});

Deno.test(
  "createApplicationSchema - rejects name exceeding 100 characters",
  () => {
    const result = createApplicationSchema.safeParse({
      name: "a".repeat(101),
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assertEquals(result.success, false);
  }
);

Deno.test(
  "createApplicationSchema - rejects description exceeding 2000 characters",
  () => {
    const result = createApplicationSchema.safeParse({
      name: "Test App",
      description: "a".repeat(2001),
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assertEquals(result.success, false);
  }
);

Deno.test(
  "createApplicationSchema - rejects systemPrompt exceeding 10000 characters",
  () => {
    const result = createApplicationSchema.safeParse({
      name: "Test App",
      systemPrompt: "a".repeat(10001),
      workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assertEquals(result.success, false);
  }
);

Deno.test("createApplicationSchema - rejects invalid workspaceId UUID", () => {
  const result = createApplicationSchema.safeParse({
    name: "Test App",
    workspaceId: "not-a-uuid",
  });
  assertEquals(result.success, false);
});

Deno.test("createApplicationSchema - rejects missing workspaceId", () => {
  const result = createApplicationSchema.safeParse({
    name: "Test App",
  });
  assertEquals(result.success, false);
});

Deno.test("updateApplicationSchema - accepts valid name update", () => {
  const result = updateApplicationSchema.safeParse({
    name: "Updated Name",
  });
  assertEquals(result.success, true);
});

Deno.test("updateApplicationSchema - accepts pictureUrl as null", () => {
  const result = updateApplicationSchema.safeParse({
    pictureUrl: null,
  });
  assertEquals(result.success, true);
});

Deno.test("updateApplicationSchema - accepts valid pictureUrl", () => {
  const result = updateApplicationSchema.safeParse({
    pictureUrl: "https://example.com/image.png",
  });
  assertEquals(result.success, true);
});

Deno.test("updateApplicationSchema - rejects invalid pictureUrl", () => {
  const result = updateApplicationSchema.safeParse({
    pictureUrl: "not-a-url",
  });
  assertEquals(result.success, false);
});

Deno.test(
  "updateApplicationSchema - accepts empty object (all fields optional)",
  () => {
    const result = updateApplicationSchema.safeParse({});
    assertEquals(result.success, true);
  }
);

Deno.test("updateApplicationSchema - rejects empty name", () => {
  const result = updateApplicationSchema.safeParse({
    name: "",
  });
  assertEquals(result.success, false);
});

Deno.test("duplicateApplicationSchema - accepts valid name", () => {
  const result = duplicateApplicationSchema.safeParse({
    name: "Duplicated App",
  });
  assertEquals(result.success, true);
});

Deno.test("duplicateApplicationSchema - accepts valid workspaceId", () => {
  const result = duplicateApplicationSchema.safeParse({
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, true);
});

Deno.test(
  "duplicateApplicationSchema - accepts empty object (all fields optional)",
  () => {
    const result = duplicateApplicationSchema.safeParse({});
    assertEquals(result.success, true);
  }
);

Deno.test(
  "duplicateApplicationSchema - rejects invalid workspaceId UUID",
  () => {
    const result = duplicateApplicationSchema.safeParse({
      workspaceId: "not-a-uuid",
    });
    assertEquals(result.success, false);
  }
);

Deno.test("moveApplicationSchema - accepts valid workspaceId", () => {
  const result = moveApplicationSchema.safeParse({
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, true);
});

Deno.test("moveApplicationSchema - rejects invalid workspaceId UUID", () => {
  const result = moveApplicationSchema.safeParse({
    workspaceId: "not-a-uuid",
  });
  assertEquals(result.success, false);
});

Deno.test("moveApplicationSchema - rejects missing workspaceId", () => {
  const result = moveApplicationSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("listApplicationsQuerySchema - accepts valid workspaceId", () => {
  const result = listApplicationsQuerySchema.safeParse({
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, true);
});

Deno.test(
  "listApplicationsQuerySchema - transforms includeDeleted string to boolean (true)",
  () => {
    const result = listApplicationsQuerySchema.safeParse({
      includeDeleted: "true",
    });
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.includeDeleted, true);
    }
  }
);

Deno.test(
  "listApplicationsQuerySchema - transforms includeDeleted string to boolean (false)",
  () => {
    const result = listApplicationsQuerySchema.safeParse({
      includeDeleted: "false",
    });
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.includeDeleted, false);
    }
  }
);

Deno.test(
  "listApplicationsQuerySchema - transforms limit string to number",
  () => {
    const result = listApplicationsQuerySchema.safeParse({
      limit: "10",
    });
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.limit, 10);
    }
  }
);

Deno.test("listApplicationsQuerySchema - rejects limit below 1", () => {
  const result = listApplicationsQuerySchema.safeParse({
    limit: "0",
  });
  assertEquals(result.success, false);
});

Deno.test("listApplicationsQuerySchema - rejects limit above 100", () => {
  const result = listApplicationsQuerySchema.safeParse({
    limit: "101",
  });
  assertEquals(result.success, false);
});

Deno.test("listApplicationsQuerySchema - accepts limit exactly 1", () => {
  const result = listApplicationsQuerySchema.safeParse({
    limit: "1",
  });
  assertEquals(result.success, true);
});

Deno.test("listApplicationsQuerySchema - accepts limit exactly 100", () => {
  const result = listApplicationsQuerySchema.safeParse({
    limit: "100",
  });
  assertEquals(result.success, true);
});

Deno.test(
  "listApplicationsQuerySchema - transforms offset string to number",
  () => {
    const result = listApplicationsQuerySchema.safeParse({
      offset: "20",
    });
    assertEquals(result.success, true);
    if (result.success) {
      assertEquals(result.data.offset, 20);
    }
  }
);

Deno.test("listApplicationsQuerySchema - rejects negative offset", () => {
  const result = listApplicationsQuerySchema.safeParse({
    offset: "-1",
  });
  assertEquals(result.success, false);
});

Deno.test("listApplicationsQuerySchema - accepts offset of 0", () => {
  const result = listApplicationsQuerySchema.safeParse({
    offset: "0",
  });
  assertEquals(result.success, true);
});

Deno.test(
  "listApplicationsQuerySchema - accepts empty object (all fields optional)",
  () => {
    const result = listApplicationsQuerySchema.safeParse({});
    assertEquals(result.success, true);
  }
);

// ============================================================================
// BILLING VALIDATORS
// ============================================================================

Deno.test("createPortalSessionSchema - accepts valid returnUrl", () => {
  const result = createPortalSessionSchema.safeParse({
    returnUrl: "https://example.com/billing",
  });
  assertEquals(result.success, true);
});

Deno.test("createPortalSessionSchema - rejects invalid returnUrl", () => {
  const result = createPortalSessionSchema.safeParse({
    returnUrl: "not-a-url",
  });
  assertEquals(result.success, false);
});

Deno.test("createPortalSessionSchema - rejects missing returnUrl", () => {
  const result = createPortalSessionSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("usageQuerySchema - accepts valid startDate", () => {
  const result = usageQuerySchema.safeParse({
    startDate: "2024-01-01T00:00:00Z",
  });
  assertEquals(result.success, true);
});

Deno.test("usageQuerySchema - accepts valid endDate", () => {
  const result = usageQuerySchema.safeParse({
    endDate: "2024-12-31T23:59:59Z",
  });
  assertEquals(result.success, true);
});

Deno.test("usageQuerySchema - accepts valid groupBy day", () => {
  const result = usageQuerySchema.safeParse({
    groupBy: "day",
  });
  assertEquals(result.success, true);
});

Deno.test("usageQuerySchema - accepts valid groupBy week", () => {
  const result = usageQuerySchema.safeParse({
    groupBy: "week",
  });
  assertEquals(result.success, true);
});

Deno.test("usageQuerySchema - accepts valid groupBy month", () => {
  const result = usageQuerySchema.safeParse({
    groupBy: "month",
  });
  assertEquals(result.success, true);
});

Deno.test("usageQuerySchema - uses default groupBy of day", () => {
  const result = usageQuerySchema.safeParse({});
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.groupBy, "day");
  }
});

Deno.test("usageQuerySchema - rejects invalid groupBy", () => {
  const result = usageQuerySchema.safeParse({
    groupBy: "year",
  });
  assertEquals(result.success, false);
});

Deno.test("usageQuerySchema - rejects invalid datetime format", () => {
  const result = usageQuerySchema.safeParse({
    startDate: "2024-01-01",
  });
  assertEquals(result.success, false);
});

Deno.test("usageQuerySchema - accepts all valid fields together", () => {
  const result = usageQuerySchema.safeParse({
    startDate: "2024-01-01T00:00:00Z",
    endDate: "2024-12-31T23:59:59Z",
    groupBy: "month",
  });
  assertEquals(result.success, true);
});

// ============================================================================
// CHAT VALIDATORS
// ============================================================================

Deno.test("chatSessionSourceSchema - accepts APP", () => {
  const result = chatSessionSourceSchema.safeParse("APP");
  assertEquals(result.success, true);
});

Deno.test("chatSessionSourceSchema - accepts API", () => {
  const result = chatSessionSourceSchema.safeParse("API");
  assertEquals(result.success, true);
});

Deno.test("chatSessionSourceSchema - accepts WHATSAPP", () => {
  const result = chatSessionSourceSchema.safeParse("WHATSAPP");
  assertEquals(result.success, true);
});

Deno.test("chatSessionSourceSchema - accepts SLACK", () => {
  const result = chatSessionSourceSchema.safeParse("SLACK");
  assertEquals(result.success, true);
});

Deno.test("chatSessionSourceSchema - accepts EMAIL", () => {
  const result = chatSessionSourceSchema.safeParse("EMAIL");
  assertEquals(result.success, true);
});

Deno.test("chatSessionSourceSchema - rejects invalid source", () => {
  const result = chatSessionSourceSchema.safeParse("DISCORD");
  assertEquals(result.success, false);
});

Deno.test("senderTypeSchema - accepts USER", () => {
  const result = senderTypeSchema.safeParse("USER");
  assertEquals(result.success, true);
});

Deno.test("senderTypeSchema - accepts BOT", () => {
  const result = senderTypeSchema.safeParse("BOT");
  assertEquals(result.success, true);
});

Deno.test("senderTypeSchema - rejects invalid sender type", () => {
  const result = senderTypeSchema.safeParse("ADMIN");
  assertEquals(result.success, false);
});

Deno.test("createSessionSchema - accepts title and source", () => {
  const result = createSessionSchema.safeParse({
    title: "Test Session",
    source: "API",
  });
  assertEquals(result.success, true);
});

Deno.test("createSessionSchema - uses default source of APP", () => {
  const result = createSessionSchema.safeParse({
    title: "Test Session",
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.source, "APP");
  }
});

Deno.test(
  "createSessionSchema - accepts empty object (all fields optional)",
  () => {
    const result = createSessionSchema.safeParse({});
    assertEquals(result.success, true);
  }
);

Deno.test(
  "createSessionSchema - rejects title exceeding 255 characters",
  () => {
    const result = createSessionSchema.safeParse({
      title: "a".repeat(256),
    });
    assertEquals(result.success, false);
  }
);

Deno.test(
  "createSessionSchema - accepts title with exactly 255 characters",
  () => {
    const result = createSessionSchema.safeParse({
      title: "a".repeat(255),
    });
    assertEquals(result.success, true);
  }
);

Deno.test("listSessionsQuerySchema - accepts valid source", () => {
  const result = listSessionsQuerySchema.safeParse({
    source: "WHATSAPP",
  });
  assertEquals(result.success, true);
});

Deno.test("listSessionsQuerySchema - accepts valid limit", () => {
  const result = listSessionsQuerySchema.safeParse({
    limit: 25,
  });
  assertEquals(result.success, true);
});

Deno.test("listSessionsQuerySchema - coerces string limit to number", () => {
  const result = listSessionsQuerySchema.safeParse({
    limit: "25",
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.limit, 25);
  }
});

Deno.test("listSessionsQuerySchema - uses default limit of 50", () => {
  const result = listSessionsQuerySchema.safeParse({});
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.limit, 50);
  }
});

Deno.test("listSessionsQuerySchema - rejects limit below 1", () => {
  const result = listSessionsQuerySchema.safeParse({
    limit: 0,
  });
  assertEquals(result.success, false);
});

Deno.test("listSessionsQuerySchema - rejects limit above 100", () => {
  const result = listSessionsQuerySchema.safeParse({
    limit: 101,
  });
  assertEquals(result.success, false);
});

Deno.test("listSessionsQuerySchema - accepts valid cursor UUID", () => {
  const result = listSessionsQuerySchema.safeParse({
    cursor: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, true);
});

Deno.test("listSessionsQuerySchema - rejects invalid cursor UUID", () => {
  const result = listSessionsQuerySchema.safeParse({
    cursor: "not-a-uuid",
  });
  assertEquals(result.success, false);
});

Deno.test("streamChatSchema - accepts message with sessionId", () => {
  const result = streamChatSchema.safeParse({
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    message: "Hello, world!",
  });
  assertEquals(result.success, true);
});

Deno.test("streamChatSchema - accepts message without sessionId", () => {
  const result = streamChatSchema.safeParse({
    message: "Hello, world!",
  });
  assertEquals(result.success, true);
});

Deno.test("streamChatSchema - rejects empty message", () => {
  const result = streamChatSchema.safeParse({
    message: "",
  });
  assertEquals(result.success, false);
});

Deno.test("streamChatSchema - rejects missing message", () => {
  const result = streamChatSchema.safeParse({
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
  });
  assertEquals(result.success, false);
});

Deno.test("streamChatSchema - rejects invalid sessionId UUID", () => {
  const result = streamChatSchema.safeParse({
    sessionId: "not-a-uuid",
    message: "Hello, world!",
  });
  assertEquals(result.success, false);
});

// ============================================================================
// ORGANIZATION VALIDATORS
// ============================================================================

Deno.test("updateOrganizationSchema - accepts valid name", () => {
  const result = updateOrganizationSchema.safeParse({
    name: "Updated Organization",
  });
  assertEquals(result.success, true);
});

Deno.test("updateOrganizationSchema - accepts valid pictureUrl", () => {
  const result = updateOrganizationSchema.safeParse({
    pictureUrl: "https://example.com/logo.png",
  });
  assertEquals(result.success, true);
});

Deno.test("updateOrganizationSchema - accepts pictureUrl as null", () => {
  const result = updateOrganizationSchema.safeParse({
    pictureUrl: null,
  });
  assertEquals(result.success, true);
});

Deno.test("updateOrganizationSchema - rejects invalid pictureUrl", () => {
  const result = updateOrganizationSchema.safeParse({
    pictureUrl: "not-a-url",
  });
  assertEquals(result.success, false);
});

Deno.test(
  "updateOrganizationSchema - accepts empty object (all fields optional)",
  () => {
    const result = updateOrganizationSchema.safeParse({});
    assertEquals(result.success, true);
  }
);

Deno.test("updateOrganizationSchema - rejects empty name", () => {
  const result = updateOrganizationSchema.safeParse({
    name: "",
  });
  assertEquals(result.success, false);
});

Deno.test(
  "updateOrganizationSchema - rejects name exceeding 100 characters",
  () => {
    const result = updateOrganizationSchema.safeParse({
      name: "a".repeat(101),
    });
    assertEquals(result.success, false);
  }
);

Deno.test(
  "updateOrganizationSchema - accepts name with exactly 100 characters",
  () => {
    const result = updateOrganizationSchema.safeParse({
      name: "a".repeat(100),
    });
    assertEquals(result.success, true);
  }
);
