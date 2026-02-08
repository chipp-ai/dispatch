/**
 * Workspace Service
 *
 * Business logic for workspace operations.
 */

import { db } from "../db/client.ts";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../utils/errors.ts";
import type { WorkspaceMemberRole, HQAccessMode } from "../db/schema.ts";
import { notificationService } from "./notifications/notification.service.ts";

// ========================================
// Types
// ========================================

export interface Workspace {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  appCount?: number;
}

export interface CreateWorkspaceParams {
  name: string;
  organizationId?: string;
  creatorId: string;
}

export interface UpdateWorkspaceParams {
  name?: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  role: WorkspaceMemberRole;
  joinedAt: Date;
  latestActivity: Date | null;
}

export interface WorkspaceHQ {
  id: string;
  workspaceId: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  pictureUrl: string | null;
  bannerUrl: string | null;
  videoUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  accessMode: HQAccessMode;
  isVerified: boolean;
  isHqPublic: boolean;
  allowDuplicateApps: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateHQParams {
  title?: string;
  slug?: string;
  description?: string;
  videoUrl?: string;
  pictureUrl?: string;
  bannerUrl?: string;
}

// ========================================
// Helpers
// ========================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

// ========================================
// Service
// ========================================

export const workspaceService = {
  /**
   * List all workspaces the user has access to
   */
  async listForUser(userId: string): Promise<Workspace[]> {
    const result = await db
      .selectFrom("app.workspaces as w")
      .innerJoin("app.workspace_members as wm", "w.id", "wm.workspaceId")
      .select([
        "w.id",
        "w.name",
        "w.organizationId",
        "w.createdAt",
        "w.updatedAt",
      ])
      .where("wm.userId", "=", userId)
      .orderBy("w.updatedAt", "desc")
      .execute();

    return result.map((w) => ({
      id: w.id,
      name: w.name,
      organizationId: w.organizationId,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  },

  /**
   * Get workspace by ID (with access check)
   */
  async get(workspaceId: string, userId: string): Promise<Workspace> {
    // Validate UUID format first to avoid PostgresError
    if (!isValidUuid(workspaceId)) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // First check if workspace exists
    const result = await db
      .selectFrom("app.workspaces")
      .select(["id", "name", "organizationId", "createdAt", "updatedAt"])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    if (!result) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // Then check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    // Get app count
    const appCountResult = await db
      .selectFrom("app.applications")
      .select(db.fn.count<number>("id").as("count"))
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    return {
      id: result.id,
      name: result.name,
      organizationId: result.organizationId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      appCount: Number(appCountResult?.count ?? 0),
    };
  },

  /**
   * Create a new workspace
   */
  async create(params: CreateWorkspaceParams): Promise<Workspace> {
    // If no org specified, get user's default org
    let organizationId: string = params.organizationId ?? "";
    if (!params.organizationId) {
      const user = await db
        .selectFrom("app.users")
        .select(["organizationId"])
        .where("id", "=", params.creatorId)
        .executeTakeFirst();

      if (!user) {
        throw new NotFoundError("User", params.creatorId);
      }
      organizationId = user.organizationId;
    }

    // Check for duplicate name in organization
    const existingWorkspace = await db
      .selectFrom("app.workspaces")
      .select(["id"])
      .where("organizationId", "=", organizationId)
      .where("name", "=", params.name)
      .executeTakeFirst();

    if (existingWorkspace) {
      throw new ValidationError(
        `A workspace with name "${params.name}" already exists in this organization`
      );
    }

    // Create workspace
    const result = await db
      .insertInto("app.workspaces")
      .values({
        name: params.name,
        organizationId: organizationId,
      })
      .returning(["id", "name", "organizationId", "createdAt", "updatedAt"])
      .executeTakeFirstOrThrow();

    // Add creator as owner
    await db
      .insertInto("app.workspace_members")
      .values({
        workspaceId: result.id,
        userId: params.creatorId,
        role: "OWNER",
        joinedViaPublicInvite: false,
      })
      .execute();

    return {
      id: result.id,
      name: result.name,
      organizationId: result.organizationId,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  },

  /**
   * Update workspace
   */
  async update(
    workspaceId: string,
    userId: string,
    params: UpdateWorkspaceParams
  ): Promise<Workspace> {
    // Validate UUID format first to avoid PostgresError
    if (!isValidUuid(workspaceId)) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // Check permission (must be owner or editor)
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError("Only owners and editors can update workspaces");
    }

    if (!params.name) {
      return this.get(workspaceId, userId);
    }

    await db
      .updateTable("app.workspaces")
      .set({
        name: params.name,
        updatedAt: new Date(),
      })
      .where("id", "=", workspaceId)
      .execute();

    return this.get(workspaceId, userId);
  },

  /**
   * Delete workspace
   */
  async delete(workspaceId: string, userId: string): Promise<void> {
    // Validate UUID format first to avoid PostgresError
    if (!isValidUuid(workspaceId)) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // First check if workspace exists
    const workspace = await db
      .selectFrom("app.workspaces")
      .select(["id"])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // Check permission (must be owner)
    const role = await this.getMemberRole(workspaceId, userId);
    if (role !== "OWNER") {
      throw new ForbiddenError("Only owners can delete workspaces");
    }

    // Get workspace's organization to check for last workspace
    const workspaceDetails = await db
      .selectFrom("app.workspaces")
      .select(["organizationId"])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    if (workspaceDetails) {
      // Count workspaces in the organization
      const workspaceCount = await db
        .selectFrom("app.workspaces")
        .select(db.fn.count<number>("id").as("count"))
        .where("organizationId", "=", workspaceDetails.organizationId)
        .executeTakeFirst();

      if (Number(workspaceCount?.count ?? 0) <= 1) {
        throw new ValidationError(
          "Cannot delete the last workspace in an organization"
        );
      }
    }

    // Hard delete since there's no isDeleted column
    await db
      .deleteFrom("app.workspaces")
      .where("id", "=", workspaceId)
      .execute();
  },

  /**
   * List workspace members
   */
  async listMembers(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMember[]> {
    // Check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    const result = await db
      .selectFrom("app.workspace_members as wm")
      .innerJoin("app.users as u", "wm.userId", "u.id")
      .select([
        "wm.id",
        "wm.userId",
        "u.email",
        "u.name",
        "u.picture",
        "wm.role",
        "wm.joinedAt",
        "wm.latestActivity",
      ])
      .where("wm.workspaceId", "=", workspaceId)
      .orderBy("wm.joinedAt")
      .execute();

    return result.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.email,
      name: m.name,
      pictureUrl: m.picture,
      role: m.role,
      joinedAt: m.joinedAt,
      latestActivity: m.latestActivity,
    }));
  },

  /**
   * Add member to workspace
   */
  async addMember(
    workspaceId: string,
    userId: string,
    params: { email: string; role: WorkspaceMemberRole }
  ): Promise<WorkspaceMember> {
    // Check permission (must be owner or editor)
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError("Only owners and editors can add members");
    }

    // Find user by email
    const targetUser = await db
      .selectFrom("app.users")
      .select(["id", "email", "name", "picture"])
      .where("email", "=", params.email)
      .executeTakeFirst();

    if (!targetUser) {
      throw new NotFoundError("User with email", params.email);
    }

    // Check if already a member
    const existing = await db
      .selectFrom("app.workspace_members")
      .select(["id"])
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();

    if (existing) {
      throw new ForbiddenError("User is already a member of this workspace");
    }

    // Add member
    const result = await db
      .insertInto("app.workspace_members")
      .values({
        workspaceId: workspaceId,
        userId: targetUser.id,
        role: params.role,
        joinedViaPublicInvite: false,
      })
      .returning(["id", "userId", "role", "joinedAt", "latestActivity"])
      .executeTakeFirstOrThrow();

    const member: WorkspaceMember = {
      id: result.id,
      userId: result.userId,
      email: targetUser.email,
      name: targetUser.name,
      pictureUrl: targetUser.picture,
      role: result.role,
      joinedAt: result.joinedAt,
      latestActivity: result.latestActivity,
    };

    // Fire-and-forget workspace_member_joined notification
    try {
      const ws = await db
        .selectFrom("app.workspaces")
        .select(["name", "organizationId"])
        .where("id", "=", workspaceId)
        .executeTakeFirst();

      if (ws) {
        notificationService.send({
          type: "workspace_member_joined",
          organizationId: ws.organizationId,
          data: {
            memberEmail: targetUser.email,
            memberName: targetUser.name,
            workspaceName: ws.name || "Workspace",
            role: params.role,
          },
        }).catch(() => {});
      }
    } catch { /* fire-and-forget */ }

    return member;
  },

  /**
   * Remove member from workspace
   */
  async removeMember(
    workspaceId: string,
    userId: string,
    memberId: string
  ): Promise<void> {
    // Get the member being removed
    const member = await db
      .selectFrom("app.workspace_members")
      .select(["userId", "role"])
      .where("id", "=", memberId)
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (!member) {
      throw new NotFoundError("Member", memberId);
    }

    // Check permission
    const userRole = await this.getMemberRole(workspaceId, userId);
    const isSelf = member.userId === userId;
    const isOwner = userRole === "OWNER";
    const isEditor = userRole === "EDITOR";
    const targetIsOwner = member.role === "OWNER";

    // Can remove if: self, owner, or editor removing non-owner
    if (!isSelf && !isOwner && !(isEditor && !targetIsOwner)) {
      throw new ForbiddenError(
        "You don't have permission to remove this member"
      );
    }

    // Prevent removing the last owner
    if (targetIsOwner) {
      const ownerCount = await db
        .selectFrom("app.workspace_members")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("workspaceId", "=", workspaceId)
        .where("role", "=", "OWNER")
        .executeTakeFirst();

      if (Number(ownerCount?.count ?? 0) <= 1) {
        throw new ForbiddenError("Cannot remove the last owner");
      }
    }

    await db
      .deleteFrom("app.workspace_members")
      .where("id", "=", memberId)
      .execute();
  },

  /**
   * Update member role
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    memberId: string,
    newRole: "EDITOR" | "VIEWER"
  ): Promise<WorkspaceMember> {
    // Check permission (must be owner)
    const userRole = await this.getMemberRole(workspaceId, userId);
    if (userRole !== "OWNER") {
      throw new ForbiddenError("Only owners can change member roles");
    }

    // Get the member being updated
    const member = await db
      .selectFrom("app.workspace_members as wm")
      .innerJoin("app.users as u", "wm.userId", "u.id")
      .select([
        "wm.id",
        "wm.userId",
        "wm.role",
        "u.email",
        "u.name",
        "u.picture",
        "wm.joinedAt",
        "wm.latestActivity",
      ])
      .where("wm.id", "=", memberId)
      .where("wm.workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (!member) {
      throw new NotFoundError("Member", memberId);
    }

    // Cannot change an owner's role (must use transfer ownership)
    if (member.role === "OWNER") {
      throw new ForbiddenError(
        "Cannot change owner role. Use transfer ownership instead."
      );
    }

    // Update the role
    await db
      .updateTable("app.workspace_members")
      .set({ role: newRole, updatedAt: new Date() })
      .where("id", "=", memberId)
      .execute();

    return {
      id: member.id,
      userId: member.userId,
      email: member.email,
      name: member.name,
      pictureUrl: member.picture,
      role: newRole,
      joinedAt: member.joinedAt,
      latestActivity: member.latestActivity,
    };
  },

  /**
   * Leave workspace (remove self)
   */
  async leaveWorkspace(workspaceId: string, userId: string): Promise<void> {
    // Check if user is a member
    const membership = await db
      .selectFrom("app.workspace_members")
      .select(["id", "role"])
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (!membership) {
      throw new ForbiddenError("You are not a member of this workspace");
    }

    // If user is owner, check if they're the last owner
    if (membership.role === "OWNER") {
      const ownerCount = await db
        .selectFrom("app.workspace_members")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("workspaceId", "=", workspaceId)
        .where("role", "=", "OWNER")
        .executeTakeFirst();

      if (Number(ownerCount?.count ?? 0) <= 1) {
        throw new ForbiddenError(
          "Cannot leave workspace as the last owner. Transfer ownership first."
        );
      }
    }

    await db
      .deleteFrom("app.workspace_members")
      .where("id", "=", membership.id)
      .execute();
  },

  /**
   * Transfer workspace ownership to another member
   */
  async transferOwnership(
    workspaceId: string,
    userId: string,
    newOwnerUserId: string
  ): Promise<void> {
    // Check if current user is owner
    const currentRole = await this.getMemberRole(workspaceId, userId);
    if (currentRole !== "OWNER") {
      throw new ForbiddenError("Only owners can transfer ownership");
    }

    // Check if target user is a member
    const targetMember = await db
      .selectFrom("app.workspace_members")
      .select(["id", "role"])
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", newOwnerUserId)
      .executeTakeFirst();

    if (!targetMember) {
      throw new NotFoundError("Member", newOwnerUserId);
    }

    // Promote new owner
    await db
      .updateTable("app.workspace_members")
      .set({ role: "OWNER", updatedAt: new Date() })
      .where("id", "=", targetMember.id)
      .execute();

    // Demote current user to editor (not removed)
    await db
      .updateTable("app.workspace_members")
      .set({ role: "EDITOR", updatedAt: new Date() })
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .execute();
  },

  /**
   * List applications in workspace
   */
  async listApplications(workspaceId: string, userId: string) {
    // Check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    const result = await db
      .selectFrom("app.applications")
      .selectAll()
      .where("workspaceId", "=", workspaceId)
      .where("isDeleted", "=", false)
      .orderBy("updatedAt", "desc")
      .execute();

    return result;
  },

  // ========================================
  // Sources methods
  // ========================================

  /**
   * List all knowledge sources across all apps in a workspace
   */
  async listSources(
    workspaceId: string,
    userId: string
  ): Promise<
    {
      id: string;
      name: string;
      type: string;
      status: string;
      chunkCount: number;
      applicationId: string;
      applicationName: string;
      createdAt: Date;
      updatedAt: Date;
    }[]
  > {
    // Check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    const result = await db
      .selectFrom("rag.knowledge_sources as ks")
      .innerJoin("app.applications as a", "ks.applicationId", "a.id")
      .select([
        "ks.id",
        "ks.name",
        "ks.type",
        "ks.status",
        "ks.chunkCount",
        "a.id as applicationId",
        "a.name as applicationName",
        "ks.createdAt",
        "ks.updatedAt",
      ])
      .where("a.workspaceId", "=", workspaceId)
      .where("a.isDeleted", "=", false)
      .orderBy("ks.createdAt", "desc")
      .execute();

    return result.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      chunkCount: s.chunkCount,
      applicationId: s.applicationId,
      applicationName: s.applicationName,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },

  /**
   * Delete a source from workspace (verifies workspace membership)
   */
  async deleteSource(
    workspaceId: string,
    userId: string,
    sourceId: string
  ): Promise<void> {
    // Check access
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError("Only owners and editors can delete sources");
    }

    // Verify source belongs to an app in this workspace
    const source = await db
      .selectFrom("rag.knowledge_sources as ks")
      .innerJoin("app.applications as a", "ks.applicationId", "a.id")
      .select(["ks.id"])
      .where("ks.id", "=", sourceId)
      .where("a.workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (!source) {
      throw new NotFoundError("Source", sourceId);
    }

    // Delete chunks first
    await db
      .deleteFrom("rag.text_chunks")
      .where("knowledgeSourceId", "=", sourceId)
      .execute();

    // Delete the source
    await db
      .deleteFrom("rag.knowledge_sources")
      .where("id", "=", sourceId)
      .execute();
  },

  /**
   * Refresh a source (trigger reprocessing)
   */
  async refreshSource(
    workspaceId: string,
    userId: string,
    sourceId: string
  ): Promise<void> {
    // Check access
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError("Only owners and editors can refresh sources");
    }

    // Verify source belongs to an app in this workspace
    const source = await db
      .selectFrom("rag.knowledge_sources as ks")
      .innerJoin("app.applications as a", "ks.applicationId", "a.id")
      .select(["ks.id"])
      .where("ks.id", "=", sourceId)
      .where("a.workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (!source) {
      throw new NotFoundError("Source", sourceId);
    }

    // Update status to pending (will trigger processing workflow)
    await db
      .updateTable("rag.knowledge_sources")
      .set({
        status: "pending",
        updatedAt: new Date(),
      })
      .where("id", "=", sourceId)
      .execute();

    // TODO: Trigger Temporal workflow for processing
  },

  // ========================================
  // HQ methods
  // ========================================

  /**
   * Get HQ data for a workspace
   */
  async getHQ(
    workspaceId: string,
    userId: string
  ): Promise<{ hq: WorkspaceHQ | null; enableDuplication: boolean }> {
    // Check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    const result = await db
      .selectFrom("app.workspace_hq")
      .selectAll()
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (!result) {
      return { hq: null, enableDuplication: false };
    }

    return {
      hq: {
        id: result.id,
        workspaceId: result.workspaceId,
        name: result.name,
        slug: result.slug,
        description: result.description,
        pictureUrl: result.pictureUrl,
        bannerUrl: result.bannerUrl,
        videoUrl: result.videoUrl,
        ctaText: result.ctaText,
        ctaUrl: result.ctaUrl,
        accessMode: result.accessMode,
        isVerified: result.isVerified,
        isHqPublic: result.isHqPublic,
        allowDuplicateApps: result.allowDuplicateApps,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
      enableDuplication: result.allowDuplicateApps,
    };
  },

  /**
   * Update HQ details for a workspace
   */
  async updateHQ(
    workspaceId: string,
    userId: string,
    params: UpdateHQParams
  ): Promise<{ hq: WorkspaceHQ }> {
    // Check permission (must be owner or editor)
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError(
        "Only owners and editors can update HQ settings"
      );
    }

    // Check if HQ exists
    const existing = await db
      .selectFrom("app.workspace_hq")
      .select(["id"])
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (params.title) updateData.name = params.title;
    if (params.slug) updateData.slug = params.slug;
    if (params.description) updateData.description = params.description;
    if (params.videoUrl) updateData.videoUrl = params.videoUrl;
    if (params.pictureUrl) updateData.pictureUrl = params.pictureUrl;
    if (params.bannerUrl) updateData.bannerUrl = params.bannerUrl;

    let result;
    if (existing) {
      // Update existing HQ
      result = await db
        .updateTable("app.workspace_hq")
        .set(updateData)
        .where("workspaceId", "=", workspaceId)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      // Create new HQ with required defaults
      result = await db
        .insertInto("app.workspace_hq")
        .values({
          workspaceId: workspaceId,
          accessMode: "private",
          isVerified: false,
          isHqPublic: false,
          allowDuplicateApps: false,
          ...updateData,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    return {
      hq: {
        id: result.id,
        workspaceId: result.workspaceId,
        name: result.name,
        slug: result.slug,
        description: result.description,
        pictureUrl: result.pictureUrl,
        bannerUrl: result.bannerUrl,
        videoUrl: result.videoUrl,
        ctaText: result.ctaText,
        ctaUrl: result.ctaUrl,
        accessMode: result.accessMode,
        isVerified: result.isVerified,
        isHqPublic: result.isHqPublic,
        allowDuplicateApps: result.allowDuplicateApps,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
    };
  },

  /**
   * Update HQ access mode
   */
  async updateHQAccessMode(
    workspaceId: string,
    userId: string,
    accessMode: HQAccessMode
  ): Promise<void> {
    // Check permission (must be owner or editor)
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError(
        "Only owners and editors can update access mode"
      );
    }

    // Check if HQ exists
    const existing = await db
      .selectFrom("app.workspace_hq")
      .select(["id"])
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable("app.workspace_hq")
        .set({
          accessMode: accessMode,
          updatedAt: new Date(),
        })
        .where("workspaceId", "=", workspaceId)
        .execute();
    } else {
      // Create HQ with access mode and required defaults
      await db
        .insertInto("app.workspace_hq")
        .values({
          workspaceId: workspaceId,
          accessMode: accessMode,
          isVerified: false,
          isHqPublic: false,
          allowDuplicateApps: false,
        })
        .execute();
    }
  },

  /**
   * Update workspace settings (enableDuplication)
   */
  async updateWorkspaceSettings(
    workspaceId: string,
    userId: string,
    settings: { enableDuplication?: boolean }
  ): Promise<void> {
    // Check permission (must be owner or editor)
    const role = await this.getMemberRole(workspaceId, userId);
    if (!role || !["OWNER", "EDITOR"].includes(role)) {
      throw new ForbiddenError("Only owners and editors can update settings");
    }

    if (settings.enableDuplication === undefined) return;

    // Check if HQ exists
    const existing = await db
      .selectFrom("app.workspace_hq")
      .select(["id"])
      .where("workspaceId", "=", workspaceId)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable("app.workspace_hq")
        .set({
          allowDuplicateApps: settings.enableDuplication,
          updatedAt: new Date(),
        })
        .where("workspaceId", "=", workspaceId)
        .execute();
    } else {
      // Create HQ with duplication setting and required defaults
      await db
        .insertInto("app.workspace_hq")
        .values({
          workspaceId: workspaceId,
          accessMode: "private",
          isVerified: false,
          isHqPublic: false,
          allowDuplicateApps: settings.enableDuplication ?? false,
        })
        .execute();
    }
  },

  /**
   * Get public HQ data by slug (no authentication required)
   */
  async getPublicHQ(slug: string): Promise<{
    hq: WorkspaceHQ;
    featuredApps: {
      id: string;
      name: string;
      description: string | null;
      pictureUrl: string | null;
      appNameId: string;
    }[];
  } | null> {
    // Fetch HQ by slug
    const result = await db
      .selectFrom("app.workspace_hq")
      .selectAll()
      .where("slug", "=", slug)
      .where("isHqPublic", "=", true)
      .executeTakeFirst();

    if (!result) {
      return null;
    }

    // Parse featured application IDs
    let featuredAppIds: string[] = [];
    if (result.featuredApplicationIds) {
      try {
        featuredAppIds =
          typeof result.featuredApplicationIds === "string"
            ? JSON.parse(result.featuredApplicationIds)
            : result.featuredApplicationIds;
      } catch {
        featuredAppIds = [];
      }
    }

    // Fetch featured applications
    let featuredApps: {
      id: string;
      name: string;
      description: string | null;
      pictureUrl: string | null;
      appNameId: string;
    }[] = [];

    if (featuredAppIds.length > 0) {
      const apps = await db
        .selectFrom("app.applications")
        .select(["id", "name", "description", "pictureUrl", "appNameId"])
        .where("id", "in", featuredAppIds)
        .where("isDeleted", "=", false)
        .execute();

      // Sort apps by the order in featuredAppIds
      const appMap = new Map(apps.map((app) => [app.id, app]));
      featuredApps = featuredAppIds
        .map((id) => appMap.get(id))
        .filter(
          (
            app
          ): app is {
            id: string;
            name: string;
            description: string | null;
            pictureUrl: string | null;
            appNameId: string;
          } => !!app
        );
    }

    return {
      hq: {
        id: result.id,
        workspaceId: result.workspaceId,
        name: result.name,
        slug: result.slug,
        description: result.description,
        pictureUrl: result.pictureUrl,
        bannerUrl: result.bannerUrl,
        videoUrl: result.videoUrl,
        ctaText: result.ctaText,
        ctaUrl: result.ctaUrl,
        accessMode: result.accessMode,
        isVerified: result.isVerified,
        isHqPublic: result.isHqPublic,
        allowDuplicateApps: result.allowDuplicateApps,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
      featuredApps,
    };
  },

  /**
   * Switch user's active workspace
   */
  async switchWorkspace(workspaceId: string, userId: string): Promise<void> {
    // Validate UUID format first to avoid PostgresError
    if (!isValidUuid(workspaceId)) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // First check if workspace exists
    const workspace = await db
      .selectFrom("app.workspaces")
      .select(["id"])
      .where("id", "=", workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new NotFoundError("Workspace", workspaceId);
    }

    // Then check access
    const isMember = await this.isMember(workspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    // Update user's active workspace
    await db
      .updateTable("app.users")
      .set({
        activeWorkspaceId: workspaceId,
        updatedAt: new Date(),
      })
      .where("id", "=", userId)
      .execute();
  },

  // ========================================
  // Helper methods
  // ========================================

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await db
      .selectFrom("app.workspace_members")
      .select(["id"])
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    return !!result;
  },

  async getMemberRole(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRole | null> {
    const result = await db
      .selectFrom("app.workspace_members")
      .select(["role"])
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    return result?.role ?? null;
  },
};
