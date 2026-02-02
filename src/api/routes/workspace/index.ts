/**
 * Workspace Routes
 *
 * CRUD operations for workspaces.
 * Demonstrates the complete route pattern with validation, services, and error handling.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { workspaceService } from "../../../services/workspace.service.ts";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addMemberSchema,
  updateMemberRoleSchema,
  updateHQAccessModeSchema,
  updateWorkspaceSettingsSchema,
} from "../../validators/workspace.ts";

export const workspaceRoutes = new Hono<AuthContext>();

/**
 * GET /workspaces
 * List all workspaces the user has access to
 */
workspaceRoutes.get("/", async (c) => {
  const user = c.get("user");
  const workspaces = await workspaceService.listForUser(user.id);
  return c.json({ data: workspaces });
});

/**
 * POST /workspaces
 * Create a new workspace
 */
workspaceRoutes.post(
  "/",
  zValidator("json", createWorkspaceSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const workspace = await workspaceService.create({
      name: body.name,
      organizationId: body.organizationId,
      creatorId: user.id,
    });

    return c.json({ data: workspace }, 201);
  }
);

/**
 * GET /workspaces/:id
 * Get workspace by ID
 */
workspaceRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const workspace = await workspaceService.get(id, user.id);
  return c.json({ data: workspace });
});

/**
 * PATCH /workspaces/:id
 * Update workspace
 */
workspaceRoutes.patch(
  "/:id",
  zValidator("json", updateWorkspaceSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const workspace = await workspaceService.update(id, user.id, body);
    return c.json({ data: workspace });
  }
);

/**
 * DELETE /workspaces/:id
 * Delete workspace (soft delete)
 */
workspaceRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await workspaceService.delete(id, user.id);
  return c.json({ success: true });
});

/**
 * POST /workspaces/:id/switch
 * Switch active workspace for the user
 */
workspaceRoutes.post("/:id/switch", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await workspaceService.switchWorkspace(id, user.id);
  return c.json({ success: true });
});

// ========================================
// Member management
// ========================================

/**
 * GET /workspaces/:id/members
 * List workspace members
 */
workspaceRoutes.get("/:id/members", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const members = await workspaceService.listMembers(id, user.id);
  return c.json({ data: members });
});

/**
 * POST /workspaces/:id/members
 * Add member to workspace
 *
 * Security: The "owner" role cannot be assigned via this endpoint.
 * Use the /transfer endpoint to transfer workspace ownership.
 */
workspaceRoutes.post(
  "/:id/members",
  zValidator("json", addMemberSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Map request roles to service roles
    // "admin" -> EDITOR (can edit workspace content)
    // "member" -> VIEWER (can view workspace content)
    const roleMap: Record<"admin" | "member", "EDITOR" | "VIEWER"> = {
      admin: "EDITOR",
      member: "VIEWER",
    };

    const mappedRole = roleMap[body.role as "admin" | "member"];
    if (!mappedRole) {
      return c.json({ error: "Invalid role" }, 400);
    }

    const member = await workspaceService.addMember(id, user.id, {
      email: body.email,
      role: mappedRole,
    });

    return c.json({ data: member }, 201);
  }
);

/**
 * PATCH /workspaces/:id/members/:memberId
 * Update member role
 */
workspaceRoutes.patch(
  "/:id/members/:memberId",
  zValidator("json", updateMemberRoleSchema),
  async (c) => {
    const user = c.get("user");
    const { id, memberId } = c.req.param();
    const body = c.req.valid("json");

    const member = await workspaceService.updateMemberRole(
      id,
      user.id,
      memberId,
      body.role
    );

    return c.json({ data: member });
  }
);

/**
 * DELETE /workspaces/:id/members/:memberId
 * Remove member from workspace
 */
workspaceRoutes.delete("/:id/members/:memberId", async (c) => {
  const user = c.get("user");
  const { id, memberId } = c.req.param();

  await workspaceService.removeMember(id, user.id, memberId);
  return c.json({ success: true });
});

/**
 * POST /workspaces/:id/leave
 * Leave a workspace (remove self as member)
 */
workspaceRoutes.post("/:id/leave", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await workspaceService.leaveWorkspace(id, user.id);
  return c.json({ success: true });
});

/**
 * POST /workspaces/:id/transfer
 * Transfer workspace ownership to another member
 */
workspaceRoutes.post("/:id/transfer", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();
  const body = await c.req.json<{ newOwnerUserId: string }>();

  if (!body.newOwnerUserId) {
    return c.json({ error: "newOwnerUserId is required" }, 400);
  }

  await workspaceService.transferOwnership(id, user.id, body.newOwnerUserId);
  return c.json({ success: true });
});

// ========================================
// Applications in workspace
// ========================================

/**
 * GET /workspaces/:id/applications
 * List applications in workspace
 */
workspaceRoutes.get("/:id/applications", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const applications = await workspaceService.listApplications(id, user.id);
  return c.json({ data: applications });
});

// ========================================
// HQ (Public Workspace Page) management
// ========================================

/**
 * GET /workspaces/:id/hq
 * Get workspace HQ settings
 */
workspaceRoutes.get("/:id/hq", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const result = await workspaceService.getHQ(id, user.id);
  return c.json({ data: result });
});

/**
 * PUT /workspaces/:id/hq
 * Update workspace HQ settings (supports FormData for file uploads)
 */
workspaceRoutes.put("/:id/hq", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const contentType = c.req.header("content-type") || "";

  let params: {
    name?: string;
    slug?: string;
    description?: string;
    pictureUrl?: string;
    bannerUrl?: string;
    videoUrl?: string;
    ctaText?: string;
    ctaUrl?: string;
    featuredApplicationIds?: string[];
  };

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    params = {
      name: formData.get("name") as string | undefined,
      slug: formData.get("slug") as string | undefined,
      description: formData.get("description") as string | undefined,
      pictureUrl: formData.get("pictureUrl") as string | undefined,
      bannerUrl: formData.get("bannerUrl") as string | undefined,
      videoUrl: formData.get("videoUrl") as string | undefined,
      ctaText: formData.get("ctaText") as string | undefined,
      ctaUrl: formData.get("ctaUrl") as string | undefined,
    };

    // Handle featured app IDs array
    const featuredIds = formData.get("featuredApplicationIds");
    if (featuredIds && typeof featuredIds === "string") {
      try {
        params.featuredApplicationIds = JSON.parse(featuredIds);
      } catch {
        // Invalid JSON, ignore
      }
    }

    // TODO: Handle file uploads (picture, banner) when file storage is implemented
    // For now, we expect pre-uploaded URLs
  } else {
    params = await c.req.json();
  }

  const result = await workspaceService.updateHQ(id, user.id, params);
  return c.json({ data: result });
});

/**
 * PUT /workspaces/:id/hq/access-mode
 * Update workspace HQ access mode
 */
workspaceRoutes.put(
  "/:id/hq/access-mode",
  zValidator("json", updateHQAccessModeSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    await workspaceService.updateHQAccessMode(id, user.id, body.accessMode);
    return c.json({ success: true });
  }
);

/**
 * PUT /workspaces/:id/settings
 * Update workspace settings
 */
workspaceRoutes.put(
  "/:id/settings",
  zValidator("json", updateWorkspaceSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    await workspaceService.updateWorkspaceSettings(id, user.id, body);
    return c.json({ success: true });
  }
);

// ========================================
// Sources management
// ========================================

/**
 * GET /workspaces/:id/sources
 * List all knowledge sources in workspace
 */
workspaceRoutes.get("/:id/sources", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const sources = await workspaceService.listSources(id, user.id);
  return c.json({ data: sources });
});

/**
 * DELETE /workspaces/:id/sources/:sourceId
 * Delete a knowledge source
 */
workspaceRoutes.delete("/:id/sources/:sourceId", async (c) => {
  const user = c.get("user");
  const { id, sourceId } = c.req.param();

  await workspaceService.deleteSource(id, user.id, sourceId);
  return c.json({ success: true });
});

/**
 * POST /workspaces/:id/sources/:sourceId/refresh
 * Refresh a knowledge source
 */
workspaceRoutes.post("/:id/sources/:sourceId/refresh", async (c) => {
  const user = c.get("user");
  const { id, sourceId } = c.req.param();

  await workspaceService.refreshSource(id, user.id, sourceId);
  return c.json({ success: true });
});
