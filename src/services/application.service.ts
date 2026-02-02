/**
 * Application Service
 *
 * Business logic for application operations.
 * Uses Kysely for type-safe database queries.
 */

import { db } from "../db/client.ts";
import { sql } from "kysely";
import * as Sentry from "@sentry/deno";
import {
  generateVanitySlug,
  ensureUniqueSlug,
} from "../../scripts/migrate-data/utils/slug-generator.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import { DEFAULT_MODEL_ID } from "../config/models.ts";
import type { Application, ApplicationVersionHistory } from "../db/schema.ts";
import {
  type EmbeddingConfig,
  getDefaultEmbeddingConfig,
  areEmbeddingsCompatible,
} from "./embedding-provider.service.ts";
import {
  brandSyncService,
  type SyncAppBrandingParams,
} from "./brand-sync.service.ts";

// ========================================
// Types
// ========================================

export interface CreateApplicationParams {
  name: string;
  description?: string;
  systemPrompt?: string;
  workspaceId: string;
  creatorId: string;
  organizationId: string;
  modelId?: string;
  isPublic?: boolean;
}

export interface UpdateApplicationParams {
  name?: string;
  description?: string | null;
  systemPrompt?: string | null;
  pictureUrl?: string | null;
  modelId?: string;
  isPublic?: boolean;
  brandStyles?: {
    inputTextHint?: string;
    disclaimerText?: string;
    primaryColor?: string;
    botMessageColor?: string;
    userMessageColor?: string;
    logoUrl?: string;
  } | null;
  welcomeMessages?: string[] | null;
  suggestedMessages?: string[] | null;
  settings?: {
    temperature?: number;
    maxTokens?: number;
    streamResponses?: boolean;
    requireAuth?: boolean;
    showSources?: boolean;
  } | null;
  customActions?: Array<{
    id: string;
    name: string;
    description: string;
    endpoint: string;
    method: string;
  }> | null;
  embeddingConfig?: {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  } | null;
  capabilities?: {
    voiceAgent?: {
      enabled?: boolean;
      provider?: string;
      voice?: {
        voiceId?: string;
        language?: string;
        pitch?: number;
        speed?: number;
      };
      stt?: {
        provider?: string;
        model?: string;
        language?: string;
      };
      telephony?: {
        enabled?: boolean;
        provider?: string;
        phoneNumber?: string;
      };
      interruption?: {
        enabled?: boolean;
        threshold?: number;
      };
      systemPrompt?: string;
      maxDuration?: number;
      greeting?: string;
    };
  } | null;
}

export interface ListApplicationsParams {
  userId: string;
  workspaceId?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchApplicationsParams {
  userId: string;
  query: string;
  limit?: number;
}

export interface SearchApplicationResult {
  id: string;
  name: string;
  description: string | null;
  appNameId: string;
  logoUrl: string | null;
  workspaceName: string | null;
}

export interface DuplicateApplicationParams {
  name?: string;
  workspaceId?: string;
}

export interface VersionHistoryWithUser extends ApplicationVersionHistory {
  userName?: string | null;
  userEmail?: string | null;
}

// ========================================
// Service
// ========================================

export const applicationService = {
  /**
   * List applications the user has access to
   */
  async list(params: ListApplicationsParams): Promise<Application[]> {
    const {
      userId,
      workspaceId,
      includeDeleted = false,
      limit = 50,
      offset = 0,
    } = params;

    // If workspaceId specified, verify membership and filter
    if (workspaceId) {
      const isMember = await this.isWorkspaceMember(workspaceId, userId);
      if (!isMember) {
        throw new ForbiddenError("You don't have access to this workspace");
      }

      let query = db
        .selectFrom("app.applications")
        .selectAll()
        .where("workspaceId", "=", workspaceId);

      if (!includeDeleted) {
        query = query.where("isDeleted", "=", false);
      }

      return await query
        .orderBy("updatedAt", "desc")
        .limit(limit)
        .offset(offset)
        .execute();
    }

    // Otherwise, list all apps from user's workspaces
    let query = db
      .selectFrom("app.applications as a")
      .innerJoin(
        "app.workspace_members as wm",
        "a.workspaceId",
        "wm.workspaceId"
      )
      .selectAll("a")
      .where("wm.userId", "=", userId);

    if (!includeDeleted) {
      query = query.where("a.isDeleted", "=", false);
    }

    return await query
      .orderBy("a.updatedAt", "desc")
      .limit(limit)
      .offset(offset)
      .execute();
  },

  /**
   * Search applications by name/description across all user's workspaces
   */
  async search(
    params: SearchApplicationsParams
  ): Promise<SearchApplicationResult[]> {
    const { userId, query, limit = 10 } = params;

    // Search pattern for ILIKE
    const searchPattern = `%${query}%`;

    const results = await db
      .selectFrom("app.applications as a")
      .innerJoin(
        "app.workspace_members as wm",
        "a.workspaceId",
        "wm.workspaceId"
      )
      .leftJoin("app.workspaces as w", "a.workspaceId", "w.id")
      .select([
        "a.id",
        "a.name",
        "a.description",
        "a.appNameId",
        "a.brandStyles",
        "w.name as workspaceName",
      ])
      .where("wm.userId", "=", userId)
      .where("a.isDeleted", "=", false)
      .where((eb) =>
        eb.or([
          eb("a.name", "ilike", searchPattern),
          eb("a.description", "ilike", searchPattern),
        ])
      )
      .orderBy("a.updatedAt", "desc")
      .limit(limit)
      .execute();

    // Extract logoUrl from brandStyles JSON
    return results.map((r) => {
      const brandStyles = r.brandStyles as { logoUrl?: string } | null;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        appNameId: r.appNameId,
        logoUrl: brandStyles?.logoUrl ?? null,
        workspaceName: r.workspaceName,
      };
    });
  },

  /**
   * Get application by ID (with access check)
   */
  async get(applicationId: string, userId: string): Promise<Application> {
    // Validate UUID format first to avoid PostgresError
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(applicationId)) {
      throw new NotFoundError("Application", applicationId);
    }

    const app = await db
      .selectFrom("app.applications")
      .selectAll()
      .where("id", "=", applicationId)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    if (!app) {
      throw new NotFoundError("Application", applicationId);
    }

    // Check workspace membership
    const isMember = await this.isWorkspaceMember(app.workspaceId!, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this application");
    }

    return app;
  },

  /**
   * Create a new application
   */
  async create(params: CreateApplicationParams): Promise<Application> {
    // Verify workspace membership
    const isMember = await this.isWorkspaceMember(
      params.workspaceId,
      params.creatorId
    );
    if (!isMember) {
      throw new ForbiddenError("You don't have access to this workspace");
    }

    // Generate unique app_name_id (slug)
    const baseSlug = generateVanitySlug(params.name);
    const slug = await ensureUniqueSlug(baseSlug, async (s) => {
      const existing = await db
        .selectFrom("app.applications")
        .select("id")
        .where("appNameId", "=", s)
        .executeTakeFirst();
      return !!existing;
    });

    const app = await db
      .insertInto("app.applications")
      .values({
        name: params.name,
        appNameId: slug,
        description: params.description ?? null,
        systemPrompt: params.systemPrompt ?? null,
        workspaceId: params.workspaceId,
        developerId: params.creatorId,
        organizationId: params.organizationId,
        model: params.modelId ?? DEFAULT_MODEL_ID,
        isPublic: params.isPublic ?? false,
        isDeleted: false,
        isActive: true,
        temperature: 0.7,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Sync branding to R2 for instant consumer chat loading
    // Fire-and-forget: don't fail the create if R2 sync fails
    brandSyncService
      .syncAppBranding({
        slug: app.appNameId,
        name: app.name,
        description: app.description ?? undefined,
        brandStyles: null, // New apps don't have brand styles yet
      })
      .catch((err) => {
        console.error("[ApplicationService] Brand sync failed on create:", err);
        Sentry.captureException(err, {
          tags: { source: "application-service", feature: "brand-sync-create" },
          extra: { appId: app.id, appNameId: app.appNameId },
        });
      });

    return app;
  },

  /**
   * Update application
   */
  async update(
    applicationId: string,
    userId: string,
    params: UpdateApplicationParams
  ): Promise<{
    app: Application;
    versionHistory: ApplicationVersionHistory | null;
  }> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission (must be workspace owner or admin)
    const role = await this.getWorkspaceMemberRole(app.workspaceId!, userId);
    if (!role || !["OWNER", "owner", "admin", "ADMIN"].includes(role)) {
      throw new ForbiddenError(
        "Only workspace owners and admins can update applications"
      );
    }

    // Build update data - use Record for dynamic updates
    const updateData: Record<string, unknown> = {};

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined)
      updateData.description = params.description;
    if (params.systemPrompt !== undefined)
      updateData.systemPrompt = params.systemPrompt;
    if (params.modelId !== undefined) updateData.model = params.modelId;
    if (params.isPublic !== undefined) updateData.isPublic = params.isPublic;
    // JSONB columns: pass objects directly, Kysely handles serialization
    if (params.brandStyles !== undefined) {
      updateData.brandStyles = params.brandStyles || null;
    }
    if (params.welcomeMessages !== undefined) {
      updateData.welcomeMessages = params.welcomeMessages || null;
    }
    if (params.suggestedMessages !== undefined) {
      updateData.suggestedMessages = params.suggestedMessages || null;
    }
    if (params.settings !== undefined) {
      updateData.settings = params.settings || null;
    }
    if (params.customActions !== undefined) {
      updateData.customActions = params.customActions || null;
    }
    if (params.capabilities !== undefined) {
      updateData.capabilities = params.capabilities || null;
    }

    if (Object.keys(updateData).length === 0) {
      return { app, versionHistory: null };
    }

    updateData.updatedAt = new Date();

    const updatedApp = await db
      .updateTable("app.applications")
      .set(updateData)
      .where("id", "=", applicationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Compute actual changes for version history
    const changedFields: Record<string, unknown> = {};

    if (params.name !== undefined && params.name !== app.name) {
      changedFields.name = params.name;
    }
    if (
      params.description !== undefined &&
      params.description !== app.description
    ) {
      changedFields.description = params.description;
    }
    if (
      params.systemPrompt !== undefined &&
      params.systemPrompt !== app.systemPrompt
    ) {
      changedFields.systemPrompt = params.systemPrompt;
    }
    if (params.modelId !== undefined && params.modelId !== app.model) {
      changedFields.modelId = params.modelId;
    }
    if (params.brandStyles !== undefined) {
      changedFields.brandStyles = params.brandStyles;
    }
    if (params.welcomeMessages !== undefined) {
      changedFields.welcomeMessages = params.welcomeMessages;
    }
    if (params.suggestedMessages !== undefined) {
      changedFields.suggestedMessages = params.suggestedMessages;
    }
    if (params.settings !== undefined) {
      changedFields.settings = params.settings;
    }
    if (params.customActions !== undefined) {
      changedFields.customActions = params.customActions;
    }
    if (params.capabilities !== undefined) {
      changedFields.capabilities = params.capabilities;
    }

    // Only create version history if there are actual changes
    let versionHistory: ApplicationVersionHistory | null = null;
    if (Object.keys(changedFields).length > 0) {
      versionHistory = await this.insertVersionHistory(
        applicationId,
        userId,
        changedFields
      );
    }

    // Sync branding to R2 for instant consumer chat loading
    // Fire-and-forget: don't fail the update if R2 sync fails
    if (params.brandStyles !== undefined || params.name !== undefined) {
      brandSyncService
        .syncAppBranding({
          slug: updatedApp.appNameId,
          name: updatedApp.name,
          description: updatedApp.description ?? undefined,
          brandStyles:
            updatedApp.brandStyles as SyncAppBrandingParams["brandStyles"],
        })
        .catch((err) => {
          console.error("[ApplicationService] Brand sync failed:", err);
          Sentry.captureException(err, {
            tags: {
              source: "application-service",
              feature: "brand-sync-update",
            },
            extra: { appId: updatedApp.id, appNameId: updatedApp.appNameId },
          });
        });
    }

    return { app: updatedApp, versionHistory };
  },

  /**
   * Soft delete application
   */
  async delete(applicationId: string, userId: string): Promise<void> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission (must be workspace owner or admin)
    const role = await this.getWorkspaceMemberRole(app.workspaceId!, userId);
    if (!role || !["OWNER", "owner", "admin", "ADMIN"].includes(role)) {
      throw new ForbiddenError(
        "Only workspace owners and admins can delete applications"
      );
    }

    await db
      .updateTable("app.applications")
      .set({ isDeleted: true, updatedAt: new Date() })
      .where("id", "=", applicationId)
      .execute();

    // Delete branding from R2 (fire-and-forget)
    brandSyncService.deleteBranding(app.appNameId).catch((err) => {
      console.error("[ApplicationService] Brand delete failed:", err);
      Sentry.captureException(err, {
        tags: { source: "application-service", feature: "brand-delete" },
        extra: { appId: app.id, appNameId: app.appNameId },
      });
    });
  },

  /**
   * Duplicate an application
   */
  async duplicate(
    applicationId: string,
    userId: string,
    params: DuplicateApplicationParams = {}
  ): Promise<Application> {
    // Get source application
    const sourceApp = await this.get(applicationId, userId);

    // Determine target workspace
    const targetWorkspaceId = params.workspaceId || sourceApp.workspaceId!;

    // Verify access to target workspace
    const isMember = await this.isWorkspaceMember(targetWorkspaceId, userId);
    if (!isMember) {
      throw new ForbiddenError("You don't have access to the target workspace");
    }

    // Generate name for duplicate
    const newName = params.name || `${sourceApp.name} (Copy)`;

    // Generate unique slug
    const baseSlug = generateVanitySlug(newName);
    const slug = await ensureUniqueSlug(baseSlug, async (s) => {
      const existing = await db
        .selectFrom("app.applications")
        .select("id")
        .where("appNameId", "=", s)
        .executeTakeFirst();
      return !!existing;
    });

    const app = await db
      .insertInto("app.applications")
      .values({
        name: newName,
        appNameId: slug,
        description: sourceApp.description,
        systemPrompt: sourceApp.systemPrompt,
        workspaceId: targetWorkspaceId,
        developerId: userId,
        organizationId: sourceApp.organizationId,
        model: sourceApp.model || DEFAULT_MODEL_ID,
        isPublic: false,
        isDeleted: false,
        isActive: true,
        temperature: sourceApp.temperature,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return app;
  },

  /**
   * Move application to a different workspace
   */
  async move(
    applicationId: string,
    userId: string,
    targetWorkspaceId: string
  ): Promise<Application> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission on source workspace (must be owner or admin)
    const sourceRole = await this.getWorkspaceMemberRole(
      app.workspaceId!,
      userId
    );
    if (
      !sourceRole ||
      !["OWNER", "owner", "admin", "ADMIN"].includes(sourceRole)
    ) {
      throw new ForbiddenError(
        "Only workspace owners and admins can move applications out"
      );
    }

    // Check permission on target workspace (must be member at minimum)
    const targetMember = await this.isWorkspaceMember(
      targetWorkspaceId,
      userId
    );
    if (!targetMember) {
      throw new ForbiddenError("You don't have access to the target workspace");
    }

    const movedApp = await db
      .updateTable("app.applications")
      .set({ workspaceId: targetWorkspaceId, updatedAt: new Date() })
      .where("id", "=", applicationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return movedApp;
  },

  // ========================================
  // Helper methods
  // ========================================

  async isWorkspaceMember(
    workspaceId: string,
    userId: string
  ): Promise<boolean> {
    const result = await db
      .selectFrom("app.workspace_members")
      .select("id")
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .executeTakeFirst();
    return !!result;
  },

  async getWorkspaceMemberRole(
    workspaceId: string,
    userId: string
  ): Promise<string | null> {
    const result = await db
      .selectFrom("app.workspace_members")
      .select("role")
      .where("workspaceId", "=", workspaceId)
      .where("userId", "=", userId)
      .executeTakeFirst();
    return result?.role ?? null;
  },

  // ========================================
  // Embedding Configuration
  // ========================================

  async getEmbeddingConfig(
    applicationId: string,
    userId: string
  ): Promise<EmbeddingConfig> {
    await this.get(applicationId, userId); // Verify access

    const result = await db
      .selectFrom("app.applications")
      .select("settings")
      .where("id", "=", applicationId)
      .executeTakeFirst();

    // Extract embedding config from settings if it exists
    const settings = result?.settings as Record<string, unknown> | null;
    if (settings?.embeddingConfig) {
      return settings.embeddingConfig as EmbeddingConfig;
    }

    return getDefaultEmbeddingConfig();
  },

  async updateEmbeddingConfig(
    applicationId: string,
    userId: string,
    newConfig: EmbeddingConfig
  ): Promise<{
    config: EmbeddingConfig;
    requiresReprocessing: boolean;
    knowledgeSourceCount: number;
  }> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission (must be workspace owner or admin)
    const role = await this.getWorkspaceMemberRole(app.workspaceId!, userId);
    if (!role || !["OWNER", "owner", "admin", "ADMIN"].includes(role)) {
      throw new ForbiddenError(
        "Only workspace owners and admins can update embedding configuration"
      );
    }

    // Get current config to check compatibility
    const currentConfig = await this.getEmbeddingConfig(applicationId, userId);

    // Check if reprocessing is required
    const requiresReprocessing = !areEmbeddingsCompatible(
      currentConfig,
      newConfig
    );

    // Get count of knowledge sources that would need reprocessing
    const countResult = await db
      .selectFrom("rag.knowledge_sources")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("applicationId", "=", applicationId)
      .where("status", "=", "completed")
      .executeTakeFirst();

    const knowledgeSourceCount = countResult?.count || 0;

    // Update the settings with the new embedding config
    const currentSettings = (app.settings as Record<string, unknown>) || {};
    const updatedSettings = { ...currentSettings, embeddingConfig: newConfig };

    await db
      .updateTable("app.applications")
      .set({
        settings: JSON.stringify(updatedSettings),
        updatedAt: new Date(),
      })
      .where("id", "=", applicationId)
      .execute();

    return {
      config: newConfig,
      requiresReprocessing,
      knowledgeSourceCount,
    };
  },

  async reprocessAllKnowledgeSources(
    applicationId: string,
    userId: string
  ): Promise<{ count: number }> {
    // Verify access
    await this.get(applicationId, userId);

    const result = await db
      .updateTable("rag.knowledge_sources")
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where("applicationId", "=", applicationId)
      .where("status", "in", ["completed", "failed"])
      .returning(["id"])
      .execute();

    // TODO: Trigger Temporal workflow for bulk reprocessing

    return { count: result.length };
  },

  // ========================================
  // Version History
  // ========================================

  async insertVersionHistory(
    applicationId: string,
    userId: string,
    changedData: Record<string, unknown>,
    options?: { tag?: string }
  ): Promise<ApplicationVersionHistory> {
    const result = await db
      .insertInto("app.application_version_history")
      .values({
        applicationId,
        userId,
        data: JSON.stringify(changedData),
        tag: options?.tag ?? null,
        isLaunched: false,
        launchedAt: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return result;
  },

  async listVersionHistory(
    applicationId: string,
    userId: string,
    options?: {
      limit?: number;
      launchedOnly?: boolean;
      since?: Date;
      authorId?: string;
    }
  ): Promise<VersionHistoryWithUser[]> {
    const limit = options?.limit ?? 50;
    const launchedOnly = options?.launchedOnly ?? false;

    // Verify access
    await this.get(applicationId, userId);

    let query = db
      .selectFrom("app.application_version_history as vh")
      .leftJoin("app.users as u", "vh.userId", "u.id")
      .select([
        "vh.id",
        "vh.applicationId",
        "vh.userId",
        "vh.version",
        "vh.data",
        "vh.tag",
        "vh.isLaunched",
        "vh.launchedAt",
        "vh.createdAt",
        "u.name as userName",
        "u.email as userEmail",
      ])
      .where("vh.applicationId", "=", applicationId);

    if (launchedOnly) {
      query = query.where("vh.isLaunched", "=", true);
    }

    if (options?.since) {
      query = query.where("vh.createdAt", ">=", options.since);
    }

    if (options?.authorId) {
      query = query.where("vh.userId", "=", options.authorId);
    }

    const results = await query
      .orderBy("vh.createdAt", "desc")
      .limit(limit)
      .execute();

    return results;
  },

  async restoreVersion(
    applicationId: string,
    userId: string,
    versionId: string
  ): Promise<{
    app: Application;
    versionHistory: ApplicationVersionHistory | null;
  }> {
    // Verify access
    await this.get(applicationId, userId);

    // Get the version to restore
    const version = await db
      .selectFrom("app.application_version_history")
      .selectAll()
      .where("id", "=", versionId)
      .where("applicationId", "=", applicationId)
      .executeTakeFirst();

    if (!version) {
      throw new NotFoundError("Version", versionId);
    }

    const dataToRestore = version.data as Record<string, unknown>;

    // Apply the restored data as an update
    return this.update(
      applicationId,
      userId,
      dataToRestore as UpdateApplicationParams
    );
  },

  // ========================================
  // Launch / Release Management
  // ========================================

  async launchVersion(
    applicationId: string,
    userId: string,
    options?: { tag?: string }
  ): Promise<{
    app: Application;
    versionHistory: ApplicationVersionHistory;
    alreadyPublished?: boolean;
  }> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission (must be workspace owner or admin)
    const role = await this.getWorkspaceMemberRole(app.workspaceId!, userId);
    if (!role || !["OWNER", "owner", "admin", "ADMIN"].includes(role)) {
      throw new ForbiddenError(
        "Only workspace owners and admins can launch applications"
      );
    }

    // Create a full snapshot of the current application state
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

    // Check if there's a currently launched version with the same data
    if (app.launchedVersionId) {
      const currentLaunched = await db
        .selectFrom("app.application_version_history")
        .selectAll()
        .where("id", "=", app.launchedVersionId)
        .executeTakeFirst();

      if (currentLaunched) {
        const launchedData =
          typeof currentLaunched.data === "string"
            ? JSON.parse(currentLaunched.data)
            : currentLaunched.data;

        // Compare snapshots - if identical, don't create a new version
        if (JSON.stringify(snapshot) === JSON.stringify(launchedData)) {
          return {
            app,
            versionHistory: currentLaunched,
            alreadyPublished: true,
          };
        }
      }
    }

    const now = new Date();

    // Insert the version history entry marked as launched
    const versionHistory = await db
      .insertInto("app.application_version_history")
      .values({
        applicationId,
        userId,
        data: JSON.stringify(snapshot),
        tag: options?.tag ?? null,
        isLaunched: true,
        launchedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update the application with the launched version
    await db
      .updateTable("app.applications")
      .set({
        launchedVersionId: versionHistory.id,
        lastLaunchedAt: now,
        updatedAt: now,
      })
      .where("id", "=", applicationId)
      .execute();

    return { app, versionHistory };
  },

  async getLaunchedVersion(
    applicationId: string,
    userId: string
  ): Promise<VersionHistoryWithUser | null> {
    // Verify access
    await this.get(applicationId, userId);

    const result = await db
      .selectFrom("app.applications as a")
      .innerJoin(
        "app.application_version_history as vh",
        "a.launchedVersionId",
        "vh.id"
      )
      .leftJoin("app.users as u", "vh.userId", "u.id")
      .select([
        "vh.id",
        "vh.applicationId",
        "vh.userId",
        "vh.version",
        "vh.data",
        "vh.tag",
        "vh.isLaunched",
        "vh.launchedAt",
        "vh.createdAt",
        "u.name as userName",
        "u.email as userEmail",
      ])
      .where("a.id", "=", applicationId)
      .executeTakeFirst();

    return result ?? null;
  },

  async listLaunchedVersions(
    applicationId: string,
    userId: string,
    limit = 20
  ): Promise<VersionHistoryWithUser[]> {
    return this.listVersionHistory(applicationId, userId, {
      limit,
      launchedOnly: true,
    });
  },

  async rollbackToVersion(
    applicationId: string,
    userId: string,
    versionId: string
  ): Promise<{ app: Application; versionHistory: ApplicationVersionHistory }> {
    // Get application and verify access
    const app = await this.get(applicationId, userId);

    // Check permission
    const role = await this.getWorkspaceMemberRole(app.workspaceId!, userId);
    if (!role || !["OWNER", "owner", "admin", "ADMIN"].includes(role)) {
      throw new ForbiddenError(
        "Only workspace owners and admins can rollback applications"
      );
    }

    // Get the version to rollback to
    const versionToRollback = await db
      .selectFrom("app.application_version_history")
      .selectAll()
      .where("id", "=", versionId)
      .where("applicationId", "=", applicationId)
      .where("isLaunched", "=", true)
      .executeTakeFirst();

    if (!versionToRollback) {
      throw new NotFoundError("Launched Version", versionId);
    }

    // Apply the version's data to the application
    const { app: updatedApp } = await this.update(
      applicationId,
      userId,
      versionToRollback.data as UpdateApplicationParams
    );

    // Create a new launched version entry for the rollback
    const now = new Date();
    const rollbackVersion = await db
      .insertInto("app.application_version_history")
      .values({
        applicationId,
        userId,
        data: JSON.stringify(versionToRollback.data),
        tag: `Rollback to ${versionToRollback.tag || versionToRollback.version}`,
        isLaunched: true,
        launchedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Update the application with the new launched version
    await db
      .updateTable("app.applications")
      .set({
        launchedVersionId: rollbackVersion.id,
        lastLaunchedAt: now,
        updatedAt: now,
      })
      .where("id", "=", applicationId)
      .execute();

    return { app: updatedApp, versionHistory: rollbackVersion };
  },
};
