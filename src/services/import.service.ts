/**
 * Import Service
 *
 * Handles importing user data from chipp-admin (app.chipp.ai) to chipp-deno.
 * Allows new users to migrate their existing applications, knowledge sources,
 * custom actions, chat history, and consumers.
 */

import { db } from "../db/client.ts";
import type { ImportStatus, ImportProgressStatus } from "../db/schema.ts";
import * as Sentry from "@sentry/deno";
import { DEFAULT_MODEL_ID } from "../config/models.ts";

// ========================================
// Types
// ========================================

interface MySQLConnection {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  end: () => Promise<void>;
}

interface SourceConnections {
  mysqlMain: MySQLConnection;
  mysqlChat: MySQLConnection;
  connected: boolean;
}

export interface ImportPreview {
  developerId: number;
  email: string;
  name: string | null;
  organizationsCount: number;
  workspacesCount: number;
  appsCount: number;
  knowledgeSourcesCount: number;
  customActionsCount: number;
  chatSessionsCount: number;
  messagesCount: number;
  consumersCount: number;
  organizations: Array<{
    id: number;
    name: string;
    workspaceCount: number;
    appCount: number;
  }>;
  apps: Array<{
    id: number;
    name: string;
    chatCount: number;
    knowledgeSourceCount: number;
    customActionCount: number;
  }>;
  estimatedTimeMinutes: number;
}

export interface ImportSessionData {
  id: string;
  userId: string;
  sourceDeveloperId: number;
  sourceEmail: string;
  status: ImportStatus;
  currentPhase: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ImportProgressData {
  entityType: string;
  totalCount: number;
  completedCount: number;
  status: ImportProgressStatus;
  errorMessage: string | null;
}

export interface ExistingUserCheck {
  hasExistingData: boolean;
  developerId?: number;
  email?: string;
  name?: string;
  appsCount?: number;
}

// ========================================
// Source Database Connection
// ========================================

let sourceConnections: SourceConnections | null = null;

async function getSourceConnections(): Promise<SourceConnections> {
  if (sourceConnections?.connected) {
    return sourceConnections;
  }

  const mysqlMainUrl = Deno.env.get("CHIPP_ADMIN_DATABASE_URL");
  const mysqlChatUrl = Deno.env.get("CHIPP_ADMIN_CHAT_DATABASE_URL");

  if (!mysqlMainUrl) {
    throw new Error("CHIPP_ADMIN_DATABASE_URL not configured");
  }
  if (!mysqlChatUrl) {
    throw new Error("CHIPP_ADMIN_CHAT_DATABASE_URL not configured");
  }

  const mysqlMain = await createMySQLConnection(mysqlMainUrl);
  const mysqlChat = await createMySQLConnection(mysqlChatUrl);

  sourceConnections = {
    mysqlMain,
    mysqlChat,
    connected: true,
  };

  return sourceConnections;
}

async function createMySQLConnection(
  connectionUrl: string
): Promise<MySQLConnection> {
  const url = new URL(connectionUrl);
  const config = {
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  };

  const mysql = await import("npm:mysql2@3.6.0/promise");

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  return {
    query: async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    end: async () => {
      await pool.end();
    },
  };
}

// ========================================
// Import Service Class
// ========================================

class ImportService {
  /**
   * Check if an email has existing data in chipp-admin
   */
  async checkExistingUser(email: string): Promise<ExistingUserCheck> {
    try {
      const conns = await getSourceConnections();

      // Look up developer by email
      const developers = await conns.mysqlMain.query<{
        id: number;
        email: string;
        name: string | null;
      }>("SELECT id, email, name FROM Developer WHERE email = ? LIMIT 1", [
        email,
      ]);

      if (developers.length === 0) {
        return { hasExistingData: false };
      }

      const developer = developers[0];

      // Count apps
      const appCounts = await conns.mysqlMain.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM Application WHERE developerId = ? AND isDeleted = 0",
        [developer.id]
      );

      const appsCount = appCounts[0]?.count ?? 0;

      if (appsCount === 0) {
        return { hasExistingData: false };
      }

      return {
        hasExistingData: true,
        developerId: developer.id,
        email: developer.email,
        name: developer.name ?? undefined,
        appsCount,
      };
    } catch (error) {
      console.error("[import] Error checking existing user:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "check-existing-user" },
        extra: { email },
      });
      // If we can't connect, treat as no existing data
      return { hasExistingData: false };
    }
  }

  /**
   * Get detailed preview of what will be imported
   * Returns null if developer not found or source DB not configured
   */
  async getImportPreview(developerId: number): Promise<ImportPreview | null> {
    let conns: SourceConnections;
    try {
      conns = await getSourceConnections();
    } catch (error) {
      console.error("[import] Source DB not configured:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "source-db-connection" },
        extra: { developerId },
      });
      return null;
    }

    // Get developer info
    const developers = await conns.mysqlMain.query<{
      id: number;
      email: string;
      name: string | null;
    }>("SELECT id, email, name FROM Developer WHERE id = ? LIMIT 1", [
      developerId,
    ]);

    if (developers.length === 0) {
      return null;
    }

    const developer = developers[0];

    // Get organizations where the developer is a member or creator
    const organizations = await conns.mysqlMain.query<{
      id: number;
      name: string;
    }>(
      `SELECT DISTINCT o.id, o.name FROM Organization o
       LEFT JOIN OrganizationMember om ON o.id = om.organizationId
       WHERE (o.creatorId = ? OR om.developerId = ?) AND o.isDeleted = 0
       ORDER BY o.id`,
      [developerId, developerId]
    );

    const orgIds = organizations.map((o) => o.id);

    // Get workspaces in those organizations or where the developer is a member
    let workspaces: Array<{
      id: number;
      name: string;
      organizationId: number | null;
    }> = [];
    if (orgIds.length > 0) {
      workspaces = await conns.mysqlMain.query<{
        id: number;
        name: string;
        organizationId: number | null;
      }>(
        `SELECT DISTINCT w.id, w.name, w.organizationId FROM Workspace w
         LEFT JOIN WorkspaceMember wm ON w.id = wm.workspaceId
         WHERE (w.organizationId IN (${orgIds.join(",")}) OR wm.developerId = ?)
         AND w.isDeleted = 0
         ORDER BY w.id`,
        [developerId]
      );
    } else {
      // No organizations, but developer might have direct workspace memberships
      workspaces = await conns.mysqlMain.query<{
        id: number;
        name: string;
        organizationId: number | null;
      }>(
        `SELECT DISTINCT w.id, w.name, w.organizationId FROM Workspace w
         JOIN WorkspaceMember wm ON w.id = wm.workspaceId
         WHERE wm.developerId = ? AND w.isDeleted = 0
         ORDER BY w.id`,
        [developerId]
      );
    }

    // Get apps with counts
    const apps = await conns.mysqlMain.query<{
      id: number;
      name: string;
      workspaceId: number | null;
    }>(
      "SELECT id, name, workspaceId FROM Application WHERE developerId = ? AND isDeleted = 0 ORDER BY createdAt DESC",
      [developerId]
    );

    // Get app IDs for further queries
    const appIds = apps.map((a) => a.id);

    // Build organization details
    const orgDetails: ImportPreview["organizations"] = [];
    for (const org of organizations) {
      const orgWorkspaceCount = workspaces.filter(
        (w) => w.organizationId === org.id
      ).length;
      const orgAppCount = apps.filter((a) => {
        // Apps belong to org if they're in a workspace that's in the org
        const appWorkspace = workspaces.find((w) => w.id === a.workspaceId);
        return appWorkspace?.organizationId === org.id;
      }).length;
      orgDetails.push({
        id: org.id,
        name: org.name,
        workspaceCount: orgWorkspaceCount,
        appCount: orgAppCount,
      });
    }

    if (appIds.length === 0) {
      return {
        developerId: developer.id,
        email: developer.email,
        name: developer.name,
        organizationsCount: organizations.length,
        workspacesCount: workspaces.length,
        appsCount: 0,
        knowledgeSourcesCount: 0,
        customActionsCount: 0,
        chatSessionsCount: 0,
        messagesCount: 0,
        consumersCount: 0,
        organizations: orgDetails,
        apps: [],
        estimatedTimeMinutes: 0,
      };
    }

    // Get knowledge sources count from ApplicationAssistantFile (production table)
    let knowledgeSourcesCount = 0;
    try {
      const ksCounts = await conns.mysqlMain.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM ApplicationAssistantFile WHERE applicationId IN (${appIds.join(",")})`,
        []
      );
      knowledgeSourcesCount = ksCounts[0]?.count ?? 0;
    } catch {
      // Table may not exist in some environments
    }

    // Get custom actions count from UserDefinedTool (production table)
    let customActionsCount = 0;
    try {
      const actionCounts = await conns.mysqlMain.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM UserDefinedTool WHERE applicationId IN (${appIds.join(",")})`,
        []
      );
      customActionsCount = actionCounts[0]?.count ?? 0;
    } catch {
      // Table may not exist in some environments
    }

    // Get chat sessions count from chat DB (handle missing table gracefully)
    let chatSessionsCount = 0;
    try {
      const sessionCounts = await conns.mysqlChat.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM ChatSession WHERE applicationId IN (${appIds.join(",")})`,
        []
      );
      chatSessionsCount = sessionCounts[0]?.count ?? 0;
    } catch {
      // Table may not exist in dev environments
    }

    // Get messages count from Message table (production uses chatSessionId)
    let messagesCount = 0;
    try {
      const messageCounts = await conns.mysqlChat.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM Message m
         JOIN ChatSession cs ON m.chatSessionId = cs.id
         WHERE cs.applicationId IN (${appIds.join(",")})`,
        []
      );
      messagesCount = messageCounts[0]?.count ?? 0;
    } catch {
      // Table may not exist in some environments
    }

    // Get consumers count (handle missing table gracefully)
    let consumersCount = 0;
    try {
      const consumerCounts = await conns.mysqlMain.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM Consumer WHERE applicationId IN (${appIds.join(",")})`,
        []
      );
      consumersCount = consumerCounts[0]?.count ?? 0;
    } catch {
      // Table may not exist in dev environments
    }

    // Get per-app details
    const appDetails: ImportPreview["apps"] = [];
    for (const app of apps) {
      // Chat count for this app
      let chatCount = 0;
      try {
        const appChatCount = await conns.mysqlChat.query<{ count: number }>(
          "SELECT COUNT(*) as count FROM ChatSession WHERE applicationId = ?",
          [app.id]
        );
        chatCount = appChatCount[0]?.count ?? 0;
      } catch {
        // Table may not exist
      }

      // Knowledge source count from ApplicationAssistantFile (production table)
      let knowledgeSourceCount = 0;
      try {
        const appKsCount = await conns.mysqlMain.query<{ count: number }>(
          "SELECT COUNT(*) as count FROM ApplicationAssistantFile WHERE applicationId = ?",
          [app.id]
        );
        knowledgeSourceCount = appKsCount[0]?.count ?? 0;
      } catch {
        // Table may not exist in dev
      }

      // Custom action count from UserDefinedTool (production table)
      let customActionCount = 0;
      try {
        const appActionCount = await conns.mysqlMain.query<{ count: number }>(
          "SELECT COUNT(*) as count FROM UserDefinedTool WHERE applicationId = ?",
          [app.id]
        );
        customActionCount = appActionCount[0]?.count ?? 0;
      } catch {
        // Table may not exist in dev
      }

      appDetails.push({
        id: app.id,
        name: app.name,
        chatCount,
        knowledgeSourceCount,
        customActionCount,
      });
    }

    // Estimate import time based on record counts
    const estimatedTimeMinutes = this.estimateImportTime({
      apps: apps.length,
      knowledgeSources: knowledgeSourcesCount,
      customActions: customActionsCount,
      chatSessions: chatSessionsCount,
      messages: messagesCount,
      consumers: consumersCount,
    });

    return {
      developerId: developer.id,
      email: developer.email,
      name: developer.name,
      organizationsCount: organizations.length,
      workspacesCount: workspaces.length,
      appsCount: apps.length,
      knowledgeSourcesCount,
      customActionsCount,
      chatSessionsCount,
      messagesCount,
      consumersCount,
      organizations: orgDetails,
      apps: appDetails,
      estimatedTimeMinutes,
    };
  }

  /**
   * Start an import session
   * @param appIds - Optional array of app IDs to import. If not provided, imports all apps.
   */
  async startImport(
    userId: string,
    sourceDeveloperId: number,
    sourceEmail: string,
    appIds?: number[]
  ): Promise<string> {
    // Check if there's already an active import
    const existingSession = await db
      .selectFrom("app.import_sessions")
      .select(["id", "status"])
      .where("userId", "=", userId)
      .where("status", "in", ["pending", "running"])
      .executeTakeFirst();

    if (existingSession) {
      throw new Error("An import is already in progress");
    }

    // Create import session
    const result = await db
      .insertInto("app.import_sessions")
      .values({
        userId,
        sourceDeveloperId,
        sourceEmail,
        status: "pending",
        currentPhase: 0,
      })
      .returning("id")
      .executeTakeFirst();

    if (!result) {
      throw new Error("Failed to create import session");
    }

    const importSessionId = result.id;

    // Initialize progress tracking for each entity type
    const entityTypes = [
      "organization",
      "workspace",
      "application",
      "knowledge_source",
      "text_chunk",
      "custom_action",
      "consumer",
      "chat_session",
      "message",
    ];

    for (const entityType of entityTypes) {
      await db
        .insertInto("app.import_progress")
        .values({
          importSessionId,
          entityType,
          totalCount: 0,
          completedCount: 0,
          status: "pending",
        })
        .execute();
    }

    // Start the import in the background
    this.executeImport(importSessionId, appIds).catch((error) => {
      console.error("[import] Import failed:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "execute-import" },
        extra: { importSessionId, userId, sourceDeveloperId, appIds },
      });
    });

    return importSessionId;
  }

  /**
   * Get current import status
   * Returns null if session not found or invalid session ID format
   */
  async getImportStatus(importSessionId: string): Promise<{
    session: ImportSessionData;
    progress: ImportProgressData[];
  } | null> {
    try {
      const session = await db
        .selectFrom("app.import_sessions")
        .select([
          "id",
          "userId",
          "sourceDeveloperId",
          "sourceEmail",
          "status",
          "currentPhase",
          "errorMessage",
          "startedAt",
          "completedAt",
        ])
        .where("id", "=", importSessionId)
        .executeTakeFirst();

      if (!session) {
        return null;
      }

      const progress = await db
        .selectFrom("app.import_progress")
        .select([
          "entityType",
          "totalCount",
          "completedCount",
          "status",
          "errorMessage",
        ])
        .where("importSessionId", "=", importSessionId)
        .execute();

      return {
        session: session as ImportSessionData,
        progress: progress as ImportProgressData[],
      };
    } catch (error) {
      // Invalid UUID format or other DB error - treat as not found
      console.error("[import] Error getting import status:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "get-import-status" },
        extra: { importSessionId },
      });
      return null;
    }
  }

  /**
   * Get import session for a user
   */
  async getActiveImportForUser(
    userId: string
  ): Promise<ImportSessionData | null> {
    try {
      const session = await db
        .selectFrom("app.import_sessions")
        .select([
          "id",
          "userId",
          "sourceDeveloperId",
          "sourceEmail",
          "status",
          "currentPhase",
          "errorMessage",
          "startedAt",
          "completedAt",
        ])
        .where("userId", "=", userId)
        .where("status", "in", ["pending", "running"])
        .executeTakeFirst();

      return session as ImportSessionData | null;
    } catch (error) {
      console.error("[import] Error getting active import:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "get-active-import" },
        extra: { userId },
      });
      return null;
    }
  }

  /**
   * Check if user should see the import prompt.
   * Returns false if:
   * - User has any completed/failed import sessions
   * - User has any apps in chipp-deno
   */
  async shouldShowImportPrompt(userId: string): Promise<boolean> {
    try {
      // Check if user has any import sessions (completed, failed, or skipped)
      const existingSession = await db
        .selectFrom("app.import_sessions")
        .select("id")
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (existingSession) {
        return false;
      }

      // Check if user has any apps (they're already using the platform)
      const existingApp = await db
        .selectFrom("app.applications")
        .select("id")
        .where("developerId", "=", userId)
        .where("isDeleted", "=", false)
        .executeTakeFirst();

      if (existingApp) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("[import] Error checking if should show prompt:", error);
      Sentry.captureException(error, {
        tags: {
          source: "import-service",
          feature: "should-show-import-prompt",
        },
        extra: { userId },
      });
      // On error, don't show prompt to avoid blocking users
      return false;
    }
  }

  /**
   * Determine where to route a new user:
   * - "dashboard" - user has apps in chipp-deno (returning user)
   * - "import" - user has legacy data in chipp-admin but no apps here
   * - "onboarding-v2" - completely new user with no legacy data
   */
  async getRoutingDecision(
    userId: string,
    email: string
  ): Promise<{
    route: "dashboard" | "import" | "onboarding-v2";
    hasApps: boolean;
    hasLegacyData: boolean;
  }> {
    try {
      // Check if user has any apps in chipp-deno (returning user)
      const existingApp = await db
        .selectFrom("app.applications")
        .select("id")
        .where("developerId", "=", userId)
        .where("isDeleted", "=", false)
        .executeTakeFirst();

      if (existingApp) {
        return { route: "dashboard", hasApps: true, hasLegacyData: false };
      }

      // Check if user has completed/skipped import before
      const existingSession = await db
        .selectFrom("app.import_sessions")
        .select("id")
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (existingSession) {
        // User already went through import flow (completed or skipped)
        return { route: "dashboard", hasApps: false, hasLegacyData: false };
      }

      // Check if user has legacy data in chipp-admin
      const legacyCheck = await this.checkExistingUser(email);

      if (legacyCheck.hasExistingData) {
        return { route: "import", hasApps: false, hasLegacyData: true };
      }

      // Completely new user - show onboarding v2
      return { route: "onboarding-v2", hasApps: false, hasLegacyData: false };
    } catch (error) {
      console.error("[import] Error getting routing decision:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "routing-decision" },
        extra: { userId, email },
      });
      // On error, default to onboarding-v2 for new users
      return { route: "onboarding-v2", hasApps: false, hasLegacyData: false };
    }
  }

  /**
   * Mark that user has skipped the import prompt.
   * Creates an import session with status 'completed' and a special marker.
   */
  async markImportSkipped(userId: string): Promise<void> {
    try {
      // Create a completed session to mark as skipped
      // Using status 'completed' since 'skipped' isn't in the enum
      await db
        .insertInto("app.import_sessions")
        .values({
          userId,
          sourceDeveloperId: 0, // No source developer
          sourceEmail: "skipped",
          status: "completed",
          currentPhase: 0,
        })
        .execute();
    } catch (error) {
      console.error("[import] Error marking import skipped:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "mark-import-skipped" },
        extra: { userId },
      });
      // Don't throw - this shouldn't block the user
    }
  }

  // ========================================
  // Private Methods
  // ========================================

  private estimateImportTime(counts: {
    apps: number;
    knowledgeSources: number;
    customActions: number;
    chatSessions: number;
    messages: number;
    consumers: number;
  }): number {
    // Rough estimates: records per second
    const RATES = {
      apps: 50,
      knowledgeSources: 30,
      customActions: 100,
      chatSessions: 150,
      messages: 500,
      consumers: 200,
    };

    let totalSeconds = 0;
    totalSeconds += counts.apps / RATES.apps;
    totalSeconds += counts.knowledgeSources / RATES.knowledgeSources;
    totalSeconds += counts.customActions / RATES.customActions;
    totalSeconds += counts.chatSessions / RATES.chatSessions;
    totalSeconds += counts.messages / RATES.messages;
    totalSeconds += counts.consumers / RATES.consumers;

    // Add overhead for setup, ID mapping, etc.
    totalSeconds += 30;

    return Math.max(1, Math.ceil(totalSeconds / 60));
  }

  /**
   * Execute the actual import (runs in background)
   * @param appIds - Optional array of app IDs to import. If not provided, imports all apps.
   */
  private async executeImport(
    importSessionId: string,
    appIds?: number[]
  ): Promise<void> {
    try {
      // Update status to running
      await db
        .updateTable("app.import_sessions")
        .set({
          status: "running",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", importSessionId)
        .execute();

      const session = await db
        .selectFrom("app.import_sessions")
        .select(["userId", "sourceDeveloperId"])
        .where("id", "=", importSessionId)
        .executeTakeFirst();

      if (!session) {
        throw new Error("Import session not found");
      }

      const conns = await getSourceConnections();

      // Get the user from chipp-deno
      const user = await db
        .selectFrom("app.users")
        .select(["id", "organizationId", "activeWorkspaceId"])
        .where("id", "=", session.userId)
        .executeTakeFirst();

      if (!user) {
        throw new Error("User not found");
      }

      // Execute phases - now imports orgs/workspaces FIRST
      // Phase 1: Import Organizations
      await this.importPhase1Organizations(
        importSessionId,
        conns,
        session.sourceDeveloperId,
        user.id
      );

      // Phase 2: Import Workspaces
      await this.importPhase2Workspaces(
        importSessionId,
        conns,
        session.sourceDeveloperId,
        user.id
      );

      // Phase 3: Import Applications (uses mapped org/workspace IDs)
      // Pass appIds to filter which apps to import
      await this.importPhase3Applications(
        importSessionId,
        conns,
        session.sourceDeveloperId,
        user.id,
        appIds
      );

      // Phase 4-8: Import related data (filters based on imported apps)
      await this.importPhase4KnowledgeSources(importSessionId, conns);
      await this.importPhase5CustomActions(importSessionId, conns);
      await this.importPhase6Consumers(importSessionId, conns);
      await this.importPhase7ChatSessions(importSessionId, conns);
      await this.importPhase8Messages(importSessionId, conns);

      // Mark complete
      await db
        .updateTable("app.import_sessions")
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", importSessionId)
        .execute();
    } catch (error) {
      console.error("[import] Import failed:", error);
      Sentry.captureException(error, {
        tags: { source: "import-service", feature: "execute-import-main" },
        extra: { importSessionId, appIds },
      });

      await db
        .updateTable("app.import_sessions")
        .set({
          status: "failed",
          errorMessage: String(error),
          updatedAt: new Date(),
        })
        .where("id", "=", importSessionId)
        .execute();
    }
  }

  /**
   * Phase 1: Import Organizations
   * Creates organizations in v2 based on the user's v1 org memberships/ownership
   */
  private async importPhase1Organizations(
    importSessionId: string,
    conns: SourceConnections,
    sourceDeveloperId: number,
    userId: string
  ): Promise<void> {
    await this.updatePhase(importSessionId, 1);
    await this.updateProgressStatus(importSessionId, "organization", "running");

    // Get organizations where the developer is a member or creator
    const orgs = await conns.mysqlMain.query<{
      id: number;
      name: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      subscriptionTier: string;
      usageBasedBillingEnabled: boolean;
    }>(
      `SELECT DISTINCT o.id, o.name, o.stripeCustomerId, o.stripeSubscriptionId,
              o.subscriptionTier, o.usageBasedBillingEnabled
       FROM Organization o
       LEFT JOIN OrganizationMember om ON o.id = om.organizationId
       WHERE (o.creatorId = ? OR om.developerId = ?) AND o.isDeleted = 0
       ORDER BY o.id`,
      [sourceDeveloperId, sourceDeveloperId]
    );

    await this.updateProgressTotal(
      importSessionId,
      "organization",
      orgs.length
    );

    let completed = 0;
    for (const org of orgs) {
      // Generate a unique slug from org name
      const baseSlug = this.generateSlug(org.name);
      const slug = await this.ensureUniqueOrgSlug(baseSlug);

      // Insert organization into v2
      const result = await db
        .insertInto("app.organizations")
        .values({
          name: org.name,
          slug,
          subscriptionTier: org.subscriptionTier as
            | "FREE"
            | "PRO"
            | "TEAM"
            | "BUSINESS"
            | "ENTERPRISE",
          stripeCustomerId: org.stripeCustomerId,
          stripeSubscriptionId: org.stripeSubscriptionId,
          usageBasedBillingEnabled: org.usageBasedBillingEnabled,
          creditsBalance: 0,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        // Store ID mapping
        await this.storeIdMapping(
          importSessionId,
          "organization",
          String(org.id),
          result.id
        );
      }

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "organization",
        completed
      );
    }

    await this.updateProgressStatus(
      importSessionId,
      "organization",
      "completed"
    );
  }

  /**
   * Phase 2: Import Workspaces
   * Creates workspaces in v2 and maps them to imported organizations
   */
  private async importPhase2Workspaces(
    importSessionId: string,
    conns: SourceConnections,
    sourceDeveloperId: number,
    userId: string
  ): Promise<void> {
    await this.updatePhase(importSessionId, 2);
    await this.updateProgressStatus(importSessionId, "workspace", "running");

    // Get organization ID mappings
    const orgMappings = await this.getIdMappings(
      importSessionId,
      "organization"
    );

    // Get workspaces where the developer is a member or that belong to imported orgs
    const orgIds = Array.from(orgMappings.keys()).map(Number);
    let workspaces: Array<{
      id: number;
      name: string;
      organizationId: number | null;
    }> = [];

    if (orgIds.length > 0) {
      workspaces = await conns.mysqlMain.query<{
        id: number;
        name: string;
        organizationId: number | null;
      }>(
        `SELECT DISTINCT w.id, w.name, w.organizationId
         FROM Workspace w
         LEFT JOIN WorkspaceMember wm ON w.id = wm.workspaceId
         WHERE (w.organizationId IN (${orgIds.join(",")}) OR wm.developerId = ?)
         AND w.isDeleted = 0
         ORDER BY w.id`,
        [sourceDeveloperId]
      );
    } else {
      // No organizations imported, but get direct workspace memberships
      workspaces = await conns.mysqlMain.query<{
        id: number;
        name: string;
        organizationId: number | null;
      }>(
        `SELECT DISTINCT w.id, w.name, w.organizationId
         FROM Workspace w
         JOIN WorkspaceMember wm ON w.id = wm.workspaceId
         WHERE wm.developerId = ? AND w.isDeleted = 0
         ORDER BY w.id`,
        [sourceDeveloperId]
      );
    }

    await this.updateProgressTotal(
      importSessionId,
      "workspace",
      workspaces.length
    );

    // If no workspaces found, we might need to create a default one
    if (workspaces.length === 0 && orgMappings.size > 0) {
      // Create a default workspace in the first imported org
      const firstOrgMapping = Array.from(orgMappings.entries())[0];
      const newOrgId = firstOrgMapping[1];

      const result = await db
        .insertInto("app.workspaces")
        .values({
          name: "Default Workspace",
          organizationId: newOrgId,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        // Add user as workspace owner
        await db
          .insertInto("app.workspace_members")
          .values({
            workspaceId: result.id,
            userId,
            role: "OWNER",
            joinedViaPublicInvite: false,
          })
          .execute();

        // Store mapping with a fake old ID (0 = default)
        await this.storeIdMapping(importSessionId, "workspace", "0", result.id);
      }

      await this.updateProgressTotal(importSessionId, "workspace", 1);
      await this.updateProgressCompleted(importSessionId, "workspace", 1);
      await this.updateProgressStatus(
        importSessionId,
        "workspace",
        "completed"
      );
      return;
    }

    let completed = 0;
    for (const workspace of workspaces) {
      // Find the mapped organization ID
      let newOrgId: string | null = null;
      if (workspace.organizationId) {
        newOrgId = orgMappings.get(String(workspace.organizationId)) ?? null;
      }

      // If workspace has no org or org wasn't mapped, use the first available org
      if (!newOrgId && orgMappings.size > 0) {
        newOrgId = Array.from(orgMappings.values())[0];
      }

      // Skip if no organization available (v2 requires organizationId)
      if (!newOrgId) {
        console.warn(
          `[import] Skipping workspace ${workspace.id} - no organization available`
        );
        completed++;
        await this.updateProgressCompleted(
          importSessionId,
          "workspace",
          completed
        );
        continue;
      }

      // Insert workspace into v2
      const result = await db
        .insertInto("app.workspaces")
        .values({
          name: workspace.name,
          organizationId: newOrgId,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        // Store ID mapping
        await this.storeIdMapping(
          importSessionId,
          "workspace",
          String(workspace.id),
          result.id
        );

        // Add user as workspace owner (they'll get membership from the import)
        await db
          .insertInto("app.workspace_members")
          .values({
            workspaceId: result.id,
            userId,
            role: "OWNER",
            joinedViaPublicInvite: false,
          })
          .execute();
      }

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "workspace",
        completed
      );
    }

    await this.updateProgressStatus(importSessionId, "workspace", "completed");
  }

  /**
   * Phase 3: Import Applications
   * Uses the mapped organization and workspace IDs from previous phases
   * @param appIds - Optional array of app IDs to import. If not provided, imports all apps.
   */
  private async importPhase3Applications(
    importSessionId: string,
    conns: SourceConnections,
    sourceDeveloperId: number,
    userId: string,
    appIds?: number[]
  ): Promise<void> {
    await this.updatePhase(importSessionId, 3);
    await this.updateProgressStatus(importSessionId, "application", "running");

    // Get org and workspace mappings
    const orgMappings = await this.getIdMappings(
      importSessionId,
      "organization"
    );
    const workspaceMappings = await this.getIdMappings(
      importSessionId,
      "workspace"
    );

    // Get a default workspace and org if available
    const defaultWorkspaceId =
      workspaceMappings.size > 0
        ? Array.from(workspaceMappings.values())[0]
        : null;
    const defaultOrgId =
      orgMappings.size > 0 ? Array.from(orgMappings.values())[0] : null;

    // Build query with optional app ID filter
    // Note: V1 (chipp-admin) Application table has different columns than V2
    // V1 columns: id, developerId, name, description, brandStyles, workspaceId, createdAt, updatedAt, isDeleted
    // systemPrompt is on ApplicationCredentials, joined via applicationCredentialsId
    // V1 does NOT have: model, temperature, capabilities, welcomeMessages, etc.
    let query = `SELECT a.id, a.name, a.description, ac.systemPrompt, a.brandStyles, a.workspaceId, a.createdAt, a.updatedAt
       FROM Application a
       LEFT JOIN ApplicationCredentials ac ON a.applicationCredentialsId = ac.id
       WHERE a.developerId = ? AND a.isDeleted = 0`;
    const params: unknown[] = [sourceDeveloperId];

    // Filter to specific apps if appIds provided
    if (appIds && appIds.length > 0) {
      query += ` AND a.id IN (${appIds.map(() => "?").join(",")})`;
      params.push(...appIds);
    }

    query += ` ORDER BY a.id`;

    // Get apps from source
    const apps = await conns.mysqlMain.query<{
      id: number;
      name: string;
      description: string | null;
      systemPrompt: string | null;
      brandStyles: string | null;
      workspaceId: number | null;
      createdAt: Date;
      updatedAt: Date;
    }>(query, params);

    await this.updateProgressTotal(importSessionId, "application", apps.length);

    let completed = 0;
    for (const app of apps) {
      // Generate a unique slug from app name (V1 doesn't have appNameId)
      const baseSlug = this.generateSlug(app.name);
      const slug = await this.ensureUniqueSlug(baseSlug);

      // Handle JSON fields - MySQL JSON type returns objects directly
      const brandStyles =
        typeof app.brandStyles === "string"
          ? JSON.parse(app.brandStyles)
          : app.brandStyles;

      // Map the workspace ID from v1 to v2, or use default
      let mappedWorkspaceId: string | null = null;
      if (app.workspaceId) {
        mappedWorkspaceId =
          workspaceMappings.get(String(app.workspaceId)) ?? defaultWorkspaceId;
      } else {
        mappedWorkspaceId = defaultWorkspaceId;
      }

      // Map the organization ID - derive from workspace's org
      let mappedOrgId: string | null = defaultOrgId;
      if (mappedWorkspaceId) {
        // Get the org from the workspace
        const workspace = await db
          .selectFrom("app.workspaces")
          .select("organizationId")
          .where("id", "=", mappedWorkspaceId)
          .executeTakeFirst();
        if (workspace) {
          mappedOrgId = workspace.organizationId;
        }
      }

      // Insert into target
      // V1 doesn't have: model, temperature, capabilities, welcomeMessages, etc.
      // These will use defaults in V2
      const result = await db
        .insertInto("app.applications")
        .values({
          name: app.name,
          appNameId: slug,
          description: app.description,
          systemPrompt: app.systemPrompt,
          model: DEFAULT_MODEL_ID,
          temperature: 0.7,
          brandStyles,
          capabilities: null,
          welcomeMessages: null,
          suggestedMessages: null,
          leadFormConfig: null,
          settings: null,
          isActive: true,
          isPublic: true,
          isDeleted: false,
          developerId: userId,
          organizationId: mappedOrgId,
          workspaceId: mappedWorkspaceId,
          createdAt: app.createdAt,
          updatedAt: app.updatedAt,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        // Store ID mapping
        await this.storeIdMapping(
          importSessionId,
          "application",
          String(app.id),
          result.id
        );
      }

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "application",
        completed
      );
    }

    await this.updateProgressStatus(
      importSessionId,
      "application",
      "completed"
    );
  }

  /**
   * Phase 4: Import Knowledge Sources
   */
  private async importPhase4KnowledgeSources(
    importSessionId: string,
    conns: SourceConnections
  ): Promise<void> {
    await this.updatePhase(importSessionId, 4);
    await this.updateProgressStatus(
      importSessionId,
      "knowledge_source",
      "running"
    );

    // Get app ID mappings
    const appMappings = await this.getIdMappings(
      importSessionId,
      "application"
    );

    if (appMappings.size === 0) {
      await this.updateProgressStatus(
        importSessionId,
        "knowledge_source",
        "skipped"
      );
      return;
    }

    const oldAppIds = Array.from(appMappings.keys());

    // Get knowledge sources from ApplicationAssistantFile (production table name)
    const sources = await conns.mysqlMain.query<{
      id: string;
      applicationId: number;
      name: string;
      knowledgeSourceType: string;
      status: string;
      url: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, applicationId, name, knowledgeSourceType, status, url, createdAt, updatedAt
       FROM ApplicationAssistantFile
       WHERE applicationId IN (${oldAppIds.join(",")})
       ORDER BY createdAt`,
      []
    );

    await this.updateProgressTotal(
      importSessionId,
      "knowledge_source",
      sources.length
    );

    let completed = 0;
    for (const source of sources) {
      const newAppId = appMappings.get(String(source.applicationId));
      if (!newAppId) continue;

      // Map V1 knowledge source type to V2 enum values (lowercase)
      // V1 stores types in various cases (FILE, File, file, etc.)
      const typeMap: Record<string, string> = {
        file: "file",
        FILE: "file",
        File: "file",
        url: "url",
        URL: "url",
        Url: "url",
        google_drive: "google_drive",
        GOOGLE_DRIVE: "google_drive",
        GoogleDrive: "google_drive",
        notion: "notion",
        NOTION: "notion",
        Notion: "notion",
        text: "text",
        TEXT: "text",
        Text: "text",
        qa: "qa",
        QA: "qa",
        sitemap: "sitemap",
        SITEMAP: "sitemap",
        Sitemap: "sitemap",
        youtube: "youtube",
        YOUTUBE: "youtube",
        YouTube: "youtube",
        confluence: "confluence",
        CONFLUENCE: "confluence",
        Confluence: "confluence",
      };
      // Default to lowercase version of the type if not in map
      const sourceType =
        typeMap[source.knowledgeSourceType] ||
        source.knowledgeSourceType.toLowerCase();

      // Build metadata from url if present
      const metadata = source.url ? { url: source.url } : {};

      const result = await db
        .insertInto("rag.knowledge_sources")
        .values({
          applicationId: newAppId,
          name: source.name,
          type: sourceType,
          metadata,
          status: "completed", // Mark as completed since we'll import chunks
          chunkCount: 0, // Will need re-indexing, chunks not migrated
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        await this.storeIdMapping(
          importSessionId,
          "knowledge_source",
          source.id, // Already a string (UUID)
          result.id
        );
      }

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "knowledge_source",
        completed
      );
    }

    await this.updateProgressStatus(
      importSessionId,
      "knowledge_source",
      "completed"
    );

    // Note: Text chunks would require connecting to the embeddings PG database
    // For now, we skip text chunks - knowledge sources will need to be re-indexed
    await this.updateProgressStatus(importSessionId, "text_chunk", "skipped");
  }

  /**
   * Phase 5: Import Custom Actions
   */
  private async importPhase5CustomActions(
    importSessionId: string,
    conns: SourceConnections
  ): Promise<void> {
    await this.updatePhase(importSessionId, 5);
    await this.updateProgressStatus(
      importSessionId,
      "custom_action",
      "running"
    );

    const appMappings = await this.getIdMappings(
      importSessionId,
      "application"
    );

    if (appMappings.size === 0) {
      await this.updateProgressStatus(
        importSessionId,
        "custom_action",
        "skipped"
      );
      return;
    }

    const oldAppIds = Array.from(appMappings.keys());

    // Query UserDefinedTool table (production uses this, not CustomAction)
    const actions = await conns.mysqlMain.query<{
      id: number;
      applicationId: number;
      name: string;
      slug: string | null;
      description: string;
      url: string;
      method: string;
      headers: string | null;
      pathParams: string | null;
      queryParams: string | null;
      bodyParams: string | null;
      variables: string | null;
      presentTenseVerb: string | null;
      pastTenseVerb: string | null;
      isClientSideTool: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, applicationId, name, slug, description, url, method,
              headers, pathParams, queryParams, bodyParams, variables,
              presentTenseVerb, pastTenseVerb, isClientSideTool, createdAt, updatedAt
       FROM UserDefinedTool
       WHERE applicationId IN (${oldAppIds.join(",")})
       ORDER BY id`,
      []
    );

    await this.updateProgressTotal(
      importSessionId,
      "custom_action",
      actions.length
    );

    // Safely parse JSON, handling empty strings and already-parsed objects
    const safeParseJson = <T>(
      val: string | null | unknown,
      defaultVal: T
    ): T => {
      if (val === null || val === undefined || val === "") return defaultVal;
      if (typeof val !== "string") return val as T; // Already parsed
      try {
        return JSON.parse(val) as T;
      } catch {
        return defaultVal;
      }
    };

    let completed = 0;
    for (const action of actions) {
      const newAppId = appMappings.get(String(action.applicationId));
      if (!newAppId) continue;

      await db
        .insertInto("app.user_defined_tools")
        .values({
          applicationId: newAppId,
          name: action.name,
          slug: action.slug,
          description: action.description,
          url: action.url,
          method: action.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
          headers: safeParseJson<unknown[]>(action.headers, []),
          pathParams: safeParseJson<unknown[]>(action.pathParams, []),
          queryParams: safeParseJson<unknown[]>(action.queryParams, []),
          bodyParams: safeParseJson<unknown[]>(action.bodyParams, []),
          variables: safeParseJson<Record<string, unknown> | null>(
            action.variables,
            null
          ),
          presentTenseVerb: action.presentTenseVerb,
          pastTenseVerb: action.pastTenseVerb,
          isClientSide: action.isClientSideTool,
          createdAt: action.createdAt,
          updatedAt: action.updatedAt,
        })
        .execute();

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "custom_action",
        completed
      );
    }

    await this.updateProgressStatus(
      importSessionId,
      "custom_action",
      "completed"
    );
  }

  /**
   * Phase 6: Import Consumers
   */
  private async importPhase6Consumers(
    importSessionId: string,
    conns: SourceConnections
  ): Promise<void> {
    await this.updatePhase(importSessionId, 6);
    await this.updateProgressStatus(importSessionId, "consumer", "running");

    const appMappings = await this.getIdMappings(
      importSessionId,
      "application"
    );

    if (appMappings.size === 0) {
      await this.updateProgressStatus(importSessionId, "consumer", "skipped");
      return;
    }

    const oldAppIds = Array.from(appMappings.keys());

    const consumers = await conns.mysqlMain.query<{
      id: number;
      applicationId: number;
      email: string;
      name: string | null;
      credits: number;
      subscriptionActive: boolean;
      stripeCustomerId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, applicationId, email, name, credits, subscriptionActive,
              stripeCustomerId, createdAt, updatedAt
       FROM Consumer
       WHERE applicationId IN (${oldAppIds.join(",")})
       ORDER BY id`,
      []
    );

    await this.updateProgressTotal(
      importSessionId,
      "consumer",
      consumers.length
    );

    let completed = 0;
    for (const consumer of consumers) {
      const newAppId = appMappings.get(String(consumer.applicationId));
      if (!newAppId) continue;

      const result = await db
        .insertInto("app.consumers")
        .values({
          applicationId: newAppId,
          identifier: consumer.email,
          email: consumer.email,
          name: consumer.name,
          credits: consumer.credits,
          subscriptionActive: consumer.subscriptionActive,
          stripeCustomerId: consumer.stripeCustomerId,
          emailVerified: false,
          mode: "LIVE",
          isDeleted: false,
          createdAt: consumer.createdAt,
          updatedAt: consumer.updatedAt,
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        await this.storeIdMapping(
          importSessionId,
          "consumer",
          String(consumer.id),
          result.id
        );
      }

      completed++;
      await this.updateProgressCompleted(
        importSessionId,
        "consumer",
        completed
      );
    }

    await this.updateProgressStatus(importSessionId, "consumer", "completed");
  }

  /**
   * Phase 7: Import Chat Sessions
   */
  private async importPhase7ChatSessions(
    importSessionId: string,
    conns: SourceConnections
  ): Promise<void> {
    await this.updatePhase(importSessionId, 7);
    await this.updateProgressStatus(importSessionId, "chat_session", "running");

    const appMappings = await this.getIdMappings(
      importSessionId,
      "application"
    );
    const consumerMappings = await this.getIdMappings(
      importSessionId,
      "consumer"
    );

    if (appMappings.size === 0) {
      await this.updateProgressStatus(
        importSessionId,
        "chat_session",
        "skipped"
      );
      return;
    }

    const oldAppIds = Array.from(appMappings.keys());

    // Production ChatSession uses authorUserId (not consumerId), createdAt (not startedAt)
    const sessions = await conns.mysqlChat.query<{
      id: string;
      applicationId: number;
      authorUserId: number;
      title: string;
      source: string;
      isShared: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(
      `SELECT id, applicationId, authorUserId, title, source, isShared, createdAt, updatedAt
       FROM ChatSession
       WHERE applicationId IN (${oldAppIds.join(",")})
         AND deletedAt IS NULL
       ORDER BY createdAt DESC
       LIMIT 10000`,
      []
    );

    await this.updateProgressTotal(
      importSessionId,
      "chat_session",
      sessions.length
    );

    let completed = 0;
    for (const session of sessions) {
      const newAppId = appMappings.get(String(session.applicationId));
      if (!newAppId) continue;

      // authorUserId in v1 maps to the developer's consumer-like ID
      // For now, we don't migrate consumer associations - sessions will be unlinked
      const result = await db
        .insertInto("chat.sessions")
        .values({
          applicationId: newAppId,
          consumerId: null, // Consumer association not migrated from v1
          title: session.title || "Imported Chat",
          source: session.source,
          mode: "ai", // Default mode, v1 doesn't have this field
          isBookmarked: false, // Default, v1 uses isShared not isBookmarked
          startedAt: session.createdAt,
          endedAt: null, // v1 doesn't track this
        })
        .returning("id")
        .executeTakeFirst();

      if (result) {
        await this.storeIdMapping(
          importSessionId,
          "chat_session",
          session.id,
          result.id
        );
      }

      completed++;
      if (completed % 100 === 0) {
        await this.updateProgressCompleted(
          importSessionId,
          "chat_session",
          completed
        );
      }
    }

    await this.updateProgressCompleted(
      importSessionId,
      "chat_session",
      completed
    );
    await this.updateProgressStatus(
      importSessionId,
      "chat_session",
      "completed"
    );
  }

  /**
   * Phase 8: Import Messages
   */
  private async importPhase8Messages(
    importSessionId: string,
    conns: SourceConnections
  ): Promise<void> {
    await this.updatePhase(importSessionId, 8);
    await this.updateProgressStatus(importSessionId, "message", "running");

    const sessionMappings = await this.getIdMappings(
      importSessionId,
      "chat_session"
    );

    if (sessionMappings.size === 0) {
      await this.updateProgressStatus(importSessionId, "message", "skipped");
      return;
    }

    const oldSessionIds = Array.from(sessionMappings.keys());

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let totalProcessed = 0;

    // Get total count first - production table is Message, not ChatMessage
    // Column is chatSessionId, not sessionId
    const countResult = await conns.mysqlChat.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM Message WHERE chatSessionId IN ('${oldSessionIds.join("','")}')`,
      []
    );
    const totalMessages = countResult[0]?.count ?? 0;

    await this.updateProgressTotal(importSessionId, "message", totalMessages);

    let offset = 0;
    while (true) {
      // Production uses Message table with senderType enum (USER/BOT), not role
      const messages = await conns.mysqlChat.query<{
        id: string;
        chatSessionId: string;
        senderType: "USER" | "BOT";
        content: string;
        modelUsed: string | null;
        metadata: string | null;
        createdAt: Date;
      }>(
        `SELECT id, chatSessionId, senderType, content, modelUsed, metadata, createdAt
         FROM Message
         WHERE chatSessionId IN ('${oldSessionIds.join("','")}')
         ORDER BY createdAt
         LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
        []
      );

      if (messages.length === 0) break;

      for (const msg of messages) {
        const newSessionId = sessionMappings.get(msg.chatSessionId);
        if (!newSessionId) continue;

        // Map senderType to role
        const role = msg.senderType === "USER" ? "user" : "assistant";

        await db
          .insertInto("chat.messages")
          .values({
            sessionId: newSessionId,
            role: role as "user" | "assistant" | "system" | "tool",
            content: msg.content,
            toolCalls: null, // Not stored in v1 Message table
            toolResults: null, // Not stored in v1 Message table
            model: msg.modelUsed,
            tokenCount: null, // Not stored in v1 Message table
            latencyMs: null, // Not stored in v1 Message table
            createdAt: msg.createdAt,
          })
          .execute();

        totalProcessed++;
      }

      await this.updateProgressCompleted(
        importSessionId,
        "message",
        totalProcessed
      );

      offset += BATCH_SIZE;
    }

    await this.updateProgressStatus(importSessionId, "message", "completed");
  }

  // ========================================
  // Helper Methods
  // ========================================

  private async updatePhase(
    importSessionId: string,
    phase: number
  ): Promise<void> {
    await db
      .updateTable("app.import_sessions")
      .set({ currentPhase: phase, updatedAt: new Date() })
      .where("id", "=", importSessionId)
      .execute();
  }

  private async updateProgressStatus(
    importSessionId: string,
    entityType: string,
    status: ImportProgressStatus
  ): Promise<void> {
    const now = new Date();
    const updates: Record<string, unknown> = { status };

    if (status === "running") {
      updates.startedAt = now;
    } else if (status === "completed" || status === "failed") {
      updates.completedAt = now;
    }

    await db
      .updateTable("app.import_progress")
      .set(updates)
      .where("importSessionId", "=", importSessionId)
      .where("entityType", "=", entityType)
      .execute();
  }

  private async updateProgressTotal(
    importSessionId: string,
    entityType: string,
    total: number
  ): Promise<void> {
    await db
      .updateTable("app.import_progress")
      .set({ totalCount: total })
      .where("importSessionId", "=", importSessionId)
      .where("entityType", "=", entityType)
      .execute();
  }

  private async updateProgressCompleted(
    importSessionId: string,
    entityType: string,
    completed: number
  ): Promise<void> {
    await db
      .updateTable("app.import_progress")
      .set({ completedCount: completed })
      .where("importSessionId", "=", importSessionId)
      .where("entityType", "=", entityType)
      .execute();
  }

  /**
   * Clear all existing V2 data before import (overwrite mode)
   * Deletes in reverse dependency order to respect foreign keys
   */
  private async clearExistingData(): Promise<void> {
    console.log("[import] Clearing existing V2 data before import...");

    // Delete in reverse dependency order
    await db.deleteFrom("chat.messages").execute();
    await db.deleteFrom("chat.sessions").execute();
    await db.deleteFrom("app.consumers").execute();
    await db.deleteFrom("app.user_defined_tools").execute();
    await db.deleteFrom("rag.knowledge_sources").execute();
    await db.deleteFrom("app.applications").execute();

    // Clear previous import mappings for clean state
    await db.deleteFrom("app.import_id_mappings").execute();

    console.log("[import] Cleared existing data");
  }

  private async storeIdMapping(
    importSessionId: string,
    entityType: string,
    oldId: string,
    newId: string
  ): Promise<void> {
    await db
      .insertInto("app.import_id_mappings")
      .values({
        importSessionId,
        entityType,
        oldId,
        newId,
      })
      .execute();
  }

  private async getIdMappings(
    importSessionId: string,
    entityType: string
  ): Promise<Map<string, string>> {
    const mappings = await db
      .selectFrom("app.import_id_mappings")
      .select(["oldId", "newId"])
      .where("importSessionId", "=", importSessionId)
      .where("entityType", "=", entityType)
      .execute();

    return new Map(mappings.map((m) => [m.oldId, m.newId]));
  }

  /**
   * Generate a URL-safe slug from a name
   */
  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    const randomSuffix = Math.random().toString(36).slice(2, 6);
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Ensure organization slug is unique
   */
  private async ensureUniqueOrgSlug(baseSlug: string): Promise<string> {
    let candidate = baseSlug;
    let attempts = 0;

    while (attempts < 10) {
      const existing = await db
        .selectFrom("app.organizations")
        .select("id")
        .where("slug", "=", candidate)
        .executeTakeFirst();

      if (!existing) {
        return candidate;
      }

      // Add random suffix
      const suffix = Math.random().toString(36).slice(2, 6);
      candidate = `${baseSlug.slice(0, 40)}-${suffix}`;
      attempts++;
    }

    throw new Error(`Could not generate unique org slug for: ${baseSlug}`);
  }

  /**
   * Ensure application slug is unique
   */
  private async ensureUniqueSlug(slug: string): Promise<string> {
    let candidate = slug;
    let attempts = 0;

    while (attempts < 10) {
      const existing = await db
        .selectFrom("app.applications")
        .select("id")
        .where("appNameId", "=", candidate)
        .executeTakeFirst();

      if (!existing) {
        return candidate;
      }

      // Add random suffix
      const suffix = Math.random().toString(36).slice(2, 6);
      candidate = `${slug.slice(0, 40)}-${suffix}`;
      attempts++;
    }

    throw new Error(`Could not generate unique slug for: ${slug}`);
  }
}

export const importService = new ImportService();
