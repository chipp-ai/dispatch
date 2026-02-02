/**
 * Chat Service
 *
 * Business logic for chat session and message operations.
 * Uses Kysely query builder with CamelCasePlugin for automatic snake_case to camelCase conversion.
 */

import { db, sql as rawSql } from "../db/client.ts";
import { sql } from "kysely";
import { ForbiddenError, NotFoundError } from "../utils/errors.ts";
import type { ChatSessionMode, MessageRole } from "../db/schema.ts";

// ========================================
// Types
// ========================================

export type ChatSource =
  | "APP"
  | "API"
  | "WHATSAPP"
  | "SLACK"
  | "EMAIL"
  | "VOICE"
  | "WIDGET";

export interface ChatSession {
  id: string;
  applicationId: string;
  consumerId: string | null;
  source: ChatSource;
  title: string | null;
  mode: ChatSessionMode;
  takenOverBy: string | null;
  isBookmarked: boolean;
  externalId: string | null;
  metadata: unknown | null;
  startedAt: Date;
  endedAt: Date | null;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls: unknown | null;
  toolResults: unknown | null;
  model: string | null;
  tokenCount: number | null;
  latencyMs: number | null;
  tags: unknown | null;
  audioUrl: string | null;
  audioDurationMs: number | null;
  videoUrl: string | null;
  videoMimeType: string | null;
  createdAt: Date;
}

export interface UserMemory {
  id: string;
  memoryType: string;
  content: string;
  createdAt: Date;
}

export interface AppConfig {
  id: string;
  name: string;
  model: string;
  systemPrompt: string | null;
  temperature: number;
  organizationId: string | null;
  capabilities: Record<string, unknown> | null;
}

export interface CreateSessionParams {
  applicationId: string;
  consumerId?: string;
  title?: string;
  source?: ChatSource;
}

export interface ListSessionsParams {
  applicationId: string;
  userId?: string;
  consumerId?: string;
  source?: ChatSource;
  limit?: number;
  page?: number;
  cursor?: string;
  search?: string;
  status?: "all" | "unread";
  tag?: string;
  phoneNumber?: string;
}

export interface ListSessionsResult {
  sessions: ChatSessionWithUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ChatSessionWithUser extends ChatSession {
  messages: Message[];
  user: {
    id: string;
    name: string | null;
    email: string | null;
    identifier: string | null;
  } | null;
  tags: { id: string; name: string }[];
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: Message[];
}

// ========================================
// Service
// ========================================

export const chatService = {
  /**
   * List chat sessions for an application with full filtering support
   */
  async listSessions(params: ListSessionsParams): Promise<ListSessionsResult> {
    const {
      applicationId,
      userId,
      consumerId,
      source,
      limit = 50,
      page = 1,
      cursor,
      search,
      status = "all",
      tag,
      phoneNumber,
    } = params;

    const offset = (page - 1) * limit;

    // Build base query
    let query = db
      .selectFrom("chat.sessions as s")
      .select([
        "s.id",
        "s.applicationId",
        "s.consumerId",
        "s.source",
        "s.title",
        "s.mode",
        "s.takenOverBy",
        "s.isBookmarked",
        "s.externalId",
        "s.metadata",
        "s.startedAt",
        "s.endedAt",
      ])
      .where("s.applicationId", "=", applicationId);

    let countQuery = db
      .selectFrom("chat.sessions as s")
      .select(sql<number>`count(*)::int`.as("count"))
      .where("s.applicationId", "=", applicationId);

    // Source filter
    if (source) {
      query = query.where("s.source", "=", source);
      countQuery = countQuery.where("s.source", "=", source);
    }

    // Consumer filter (for consumer-facing routes)
    if (consumerId) {
      query = query.where("s.consumerId", "=", consumerId);
      countQuery = countQuery.where("s.consumerId", "=", consumerId);
    }

    // Search filter
    if (search) {
      const searchPattern = `%${search}%`;
      const searchCondition = sql<boolean>`(
        s.title ILIKE ${searchPattern}
        OR s.external_id ILIKE ${searchPattern}
        OR EXISTS (
          SELECT 1 FROM chat.messages m
          WHERE m.session_id = s.id AND m.content ILIKE ${searchPattern}
        )
      )`;
      query = query.where(searchCondition);
      countQuery = countQuery.where(searchCondition);
    }

    // Phone number filter
    if (phoneNumber) {
      const phonePattern = `%${phoneNumber}%`;
      const phoneCondition = sql<boolean>`(s.source = 'WHATSAPP' AND s.external_id ILIKE ${phonePattern})`;
      query = query.where(phoneCondition);
      countQuery = countQuery.where(phoneCondition);
    }

    // Tag filter
    if (tag) {
      const tagCondition = sql<boolean>`EXISTS (
        SELECT 1 FROM chat.message_tags mt
        INNER JOIN chat.messages m ON m.id = mt.message_id
        WHERE m.session_id = s.id AND mt.tag_id = ${tag}::uuid
      )`;
      query = query.where(tagCondition);
      countQuery = countQuery.where(tagCondition);
    }

    // Unread status filter
    if (status === "unread" && userId) {
      const unreadCondition = sql<boolean>`NOT EXISTS (
        SELECT 1 FROM chat.viewed_sessions vs
        WHERE vs.session_id = s.id AND vs.user_id = ${userId}::uuid
      )`;
      query = query.where(unreadCondition);
      countQuery = countQuery.where(unreadCondition);
    }

    // Legacy cursor support
    if (cursor) {
      const cursorCondition = sql<boolean>`s.started_at < (
        SELECT started_at FROM chat.sessions WHERE id = ${cursor}::uuid
      )`;
      query = query.where(cursorCondition);
    }

    // Get total count
    const countResult = await countQuery.executeTakeFirst();
    const total = countResult?.count ?? 0;

    // Execute main query with ordering and pagination
    const sessions = await query
      .orderBy("s.startedAt", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    // Enrich sessions with messages, user info, and tags
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        // Get latest 2 messages for preview
        const messages = await db
          .selectFrom("chat.messages")
          .select(["id", "sessionId", "role", "content", "createdAt"])
          .where("sessionId", "=", session.id)
          .orderBy("createdAt", "desc")
          .limit(2)
          .execute();

        // Get tags for this session's messages
        const tags = await db
          .selectFrom("chat.tags as t")
          .innerJoin("chat.message_tags as mt", "mt.tagId", "t.id")
          .innerJoin("chat.messages as m", "m.id", "mt.messageId")
          .select(["t.id", "t.name"])
          .where("m.sessionId", "=", session.id)
          .distinct()
          .execute();

        // Build user info
        let user: ChatSessionWithUser["user"] = null;
        if (session.externalId) {
          user = {
            id: session.consumerId || session.id,
            name: null,
            email: null,
            identifier: session.externalId,
          };
        }

        return {
          id: session.id,
          applicationId: session.applicationId,
          consumerId: session.consumerId,
          source: session.source as ChatSource,
          title: session.title,
          mode: session.mode as ChatSessionMode,
          takenOverBy: session.takenOverBy,
          isBookmarked: session.isBookmarked,
          externalId: session.externalId,
          metadata: session.metadata,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          messages: messages.reverse().map((m) => ({
            id: m.id,
            sessionId: m.sessionId,
            role: m.role as MessageRole,
            content: m.content,
            toolCalls: null,
            toolResults: null,
            model: null,
            tokenCount: null,
            latencyMs: null,
            tags: null,
            createdAt: m.createdAt,
          })),
          user,
          tags: tags.map((t) => ({ id: t.id, name: t.name })),
        } as ChatSessionWithUser;
      })
    );

    return {
      sessions: enrichedSessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single chat session by ID with messages
   */
  async getSession(sessionId: string): Promise<ChatSessionWithMessages> {
    // Validate UUID format first
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new NotFoundError("Chat session", sessionId);
    }

    const session = await db
      .selectFrom("chat.sessions")
      .select([
        "id",
        "applicationId",
        "consumerId",
        "source",
        "title",
        "mode",
        "takenOverBy",
        "isBookmarked",
        "externalId",
        "metadata",
        "startedAt",
        "endedAt",
      ])
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!session) {
      throw new NotFoundError("Chat session", sessionId);
    }

    const messages = await db
      .selectFrom("chat.messages")
      .select([
        "id",
        "sessionId",
        "role",
        "content",
        "toolCalls",
        "toolResults",
        "model",
        "tokenCount",
        "latencyMs",
        "tags",
        "audioUrl",
        "audioDurationMs",
        "videoUrl",
        "videoMimeType",
        "createdAt",
      ])
      .where("sessionId", "=", sessionId)
      .orderBy("createdAt", "asc")
      .execute();

    return {
      id: session.id,
      applicationId: session.applicationId,
      consumerId: session.consumerId,
      source: session.source as ChatSource,
      title: session.title,
      mode: session.mode as ChatSessionMode,
      takenOverBy: session.takenOverBy,
      isBookmarked: session.isBookmarked,
      externalId: session.externalId,
      metadata: session.metadata,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      messages: messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role as MessageRole,
        content: m.content,
        toolCalls: m.toolCalls,
        toolResults: m.toolResults,
        model: m.model,
        tokenCount: m.tokenCount,
        latencyMs: m.latencyMs,
        tags: m.tags,
        audioUrl: m.audioUrl,
        audioDurationMs: m.audioDurationMs,
        videoUrl: m.videoUrl,
        videoMimeType: m.videoMimeType,
        createdAt: m.createdAt,
      })),
    };
  },

  /**
   * Validate that a session exists and belongs to the specified application
   */
  async validateSession(
    sessionId: string,
    appId: string
  ): Promise<ChatSession> {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new NotFoundError("Chat session", sessionId);
    }

    const session = await db
      .selectFrom("chat.sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!session) {
      throw new NotFoundError("Chat session", sessionId);
    }

    if (session.applicationId !== appId) {
      throw new ForbiddenError("Session does not belong to this application");
    }

    return {
      id: session.id,
      applicationId: session.applicationId,
      consumerId: session.consumerId,
      source: session.source as ChatSource,
      title: session.title,
      mode: session.mode as ChatSessionMode,
      takenOverBy: session.takenOverBy,
      isBookmarked: session.isBookmarked,
      externalId: session.externalId,
      metadata: session.metadata,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  },

  /**
   * Create a new chat session
   */
  async createSession(params: CreateSessionParams): Promise<ChatSession> {
    const {
      applicationId,
      consumerId = null,
      title = "New Chat",
      source = "APP",
    } = params;

    const result = await db
      .insertInto("chat.sessions")
      .values({
        applicationId,
        consumerId,
        title,
        source,
        mode: "ai",
        isBookmarked: false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: result.id,
      applicationId: result.applicationId,
      consumerId: result.consumerId,
      source: result.source as ChatSource,
      title: result.title,
      mode: result.mode as ChatSessionMode,
      takenOverBy: result.takenOverBy,
      isBookmarked: result.isBookmarked,
      externalId: result.externalId,
      metadata: result.metadata,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
    };
  },

  /**
   * Get session by external ID (for integrations like Slack, WhatsApp)
   */
  async getSessionByExternalId(
    applicationId: string,
    externalId: string
  ): Promise<ChatSession | null> {
    const result = await db
      .selectFrom("chat.sessions")
      .selectAll()
      .where("applicationId", "=", applicationId)
      .where("externalId", "=", externalId)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      applicationId: result.applicationId,
      consumerId: result.consumerId,
      source: result.source as ChatSource,
      title: result.title,
      mode: result.mode as ChatSessionMode,
      takenOverBy: result.takenOverBy,
      isBookmarked: result.isBookmarked,
      externalId: result.externalId,
      metadata: result.metadata,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
    };
  },

  /**
   * Update session mode (for live takeover)
   */
  async updateSessionMode(
    sessionId: string,
    mode: ChatSessionMode,
    takenOverBy: string | null
  ): Promise<void> {
    await db
      .updateTable("chat.sessions")
      .set({
        mode,
        takenOverBy,
      })
      .where("id", "=", sessionId)
      .execute();
  },

  /**
   * Update session title
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await db
      .updateTable("chat.sessions")
      .set({ title })
      .where("id", "=", sessionId)
      .execute();
  },

  /**
   * Get session by ID (for title generation check)
   */
  async getSessionBasic(sessionId: string): Promise<ChatSession | null> {
    const result = await db
      .selectFrom("chat.sessions as s")
      .select([
        "s.id",
        "s.applicationId",
        "s.consumerId",
        "s.source",
        "s.title",
        "s.mode",
        "s.takenOverBy",
        "s.isBookmarked",
        "s.externalId",
        "s.metadata",
        "s.startedAt",
        "s.endedAt",
      ])
      .where("s.id", "=", sessionId)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      applicationId: result.applicationId,
      consumerId: result.consumerId,
      source: result.source as ChatSource,
      title: result.title,
      mode: result.mode as ChatSessionMode,
      takenOverBy: result.takenOverBy,
      isBookmarked: result.isBookmarked,
      externalId: result.externalId,
      metadata: result.metadata,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
    };
  },

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<void> {
    // Delete messages first
    await db
      .deleteFrom("chat.messages")
      .where("sessionId", "=", sessionId)
      .execute();
    // Then delete session
    await db.deleteFrom("chat.sessions").where("id", "=", sessionId).execute();
  },

  /**
   * Add a message to a session
   */
  async addMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    options?: {
      model?: string;
      toolCalls?: unknown;
      toolResults?: unknown;
      audioUrl?: string;
      audioDurationMs?: number;
      videoUrl?: string;
      videoMimeType?: string;
    }
  ): Promise<Message> {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw new NotFoundError("Chat session", sessionId);
    }

    // Verify session exists
    const sessionExists = await db
      .selectFrom("chat.sessions")
      .select("id")
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!sessionExists) {
      throw new NotFoundError("Chat session", sessionId);
    }

    const result = await db
      .insertInto("chat.messages")
      .values({
        sessionId,
        role,
        content,
        model: options?.model ?? null,
        toolCalls: options?.toolCalls
          ? JSON.stringify(options.toolCalls)
          : null,
        toolResults: options?.toolResults
          ? JSON.stringify(options.toolResults)
          : null,
        audioUrl: options?.audioUrl ?? null,
        audioDurationMs: options?.audioDurationMs ?? null,
        videoUrl: options?.videoUrl ?? null,
        videoMimeType: options?.videoMimeType ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: result.id,
      sessionId: result.sessionId,
      role: result.role as MessageRole,
      content: result.content,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
      model: result.model,
      tokenCount: result.tokenCount,
      latencyMs: result.latencyMs,
      tags: result.tags,
      audioUrl: result.audioUrl,
      audioDurationMs: result.audioDurationMs,
      videoUrl: result.videoUrl,
      videoMimeType: result.videoMimeType,
      createdAt: result.createdAt,
    };
  },

  /**
   * Verify user has access to an application
   */
  async verifyAppAccess(
    appId: string,
    userId: string
  ): Promise<{ id: string; name: string; organizationId: string | null }> {
    const result = await db
      .selectFrom("app.applications as a")
      .innerJoin("app.workspaces as w", "a.workspaceId", "w.id")
      .innerJoin("app.workspace_members as wm", "w.id", "wm.workspaceId")
      .select(["a.id", "a.name", "a.organizationId"])
      .where("a.id", "=", appId)
      .where("wm.userId", "=", userId)
      .where("a.isDeleted", "=", false)
      .executeTakeFirst();

    if (!result) {
      throw new ForbiddenError("You don't have access to this application");
    }

    return {
      id: result.id,
      name: result.name,
      organizationId: result.organizationId,
    };
  },

  /**
   * Get application configuration for chat
   */
  async getAppConfig(appId: string): Promise<AppConfig> {
    const result = await db
      .selectFrom("app.applications")
      .select([
        "id",
        "name",
        "model",
        "systemPrompt",
        "temperature",
        "organizationId",
        "capabilities",
        "launchedVersionId",
      ])
      .where("id", "=", appId)
      .where("isDeleted", "=", false)
      .executeTakeFirst();

    if (!result) {
      throw new NotFoundError("Application", String(appId));
    }

    // If app has a launched version, overlay its config onto the result
    if (result.launchedVersionId) {
      const version = await db
        .selectFrom("app.application_version_history")
        .select(["data"])
        .where("id", "=", result.launchedVersionId)
        .executeTakeFirst();

      if (version?.data) {
        const data =
          typeof version.data === "string"
            ? JSON.parse(version.data)
            : version.data;
        return {
          id: result.id,
          name: data.name ?? result.name,
          model: data.model ?? result.model,
          systemPrompt: data.systemPrompt ?? result.systemPrompt,
          temperature: Number(data.temperature ?? result.temperature),
          organizationId: result.organizationId,
          capabilities: (data.capabilities ?? result.capabilities) as Record<
            string,
            unknown
          > | null,
        };
      }
    }

    return {
      id: result.id,
      name: result.name,
      model: result.model,
      systemPrompt: result.systemPrompt,
      temperature: Number(result.temperature),
      organizationId: result.organizationId,
      capabilities: result.capabilities as Record<string, unknown> | null,
    };
  },

  /**
   * Get messages for a session
   */
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    const messages = await db
      .selectFrom("chat.messages")
      .select([
        "id",
        "sessionId",
        "role",
        "content",
        "toolCalls",
        "toolResults",
        "model",
        "tokenCount",
        "latencyMs",
        "tags",
        "audioUrl",
        "audioDurationMs",
        "videoUrl",
        "videoMimeType",
        "createdAt",
      ])
      .where("sessionId", "=", sessionId)
      .orderBy("createdAt", "asc")
      .execute();

    return messages.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as MessageRole,
      content: m.content,
      toolCalls: m.toolCalls,
      toolResults: m.toolResults,
      model: m.model,
      tokenCount: m.tokenCount,
      latencyMs: m.latencyMs,
      tags: m.tags,
      audioUrl: m.audioUrl,
      audioDurationMs: m.audioDurationMs,
      videoUrl: m.videoUrl,
      videoMimeType: m.videoMimeType,
      createdAt: m.createdAt,
    }));
  },

  /**
   * Get user memories for personalization
   */
  async getUserMemories(
    appId: string,
    options: { consumerId?: string | null; externalUserId?: string | null }
  ): Promise<UserMemory[]> {
    const { consumerId, externalUserId } = options;

    if (!consumerId && !externalUserId) return [];

    let query = db
      .selectFrom("chat.user_memories")
      .select(["id", "memoryType", "content", "createdAt"])
      .where("applicationId", "=", appId)
      .orderBy("createdAt", "desc")
      .limit(20);

    if (consumerId) {
      query = query.where("consumerId", "=", consumerId);
    } else if (externalUserId) {
      query = query.where("externalUserId", "=", externalUserId);
    }

    const memories = await query.execute();

    return memories.map((m) => ({
      id: m.id,
      memoryType: m.memoryType,
      content: m.content,
      createdAt: m.createdAt,
    }));
  },

  /**
   * Check organization credit balance
   */
  async checkCredits(
    organizationId: string | null
  ): Promise<{ hasCredits: boolean; balance: number } | null> {
    if (!organizationId) return null;

    const result = await db
      .selectFrom("app.organizations")
      .select(["usageBasedBillingEnabled", "creditsBalance"])
      .where("id", "=", organizationId)
      .executeTakeFirst();

    if (!result) return null;

    if (!result.usageBasedBillingEnabled) {
      return null;
    }

    return {
      hasCredits: result.creditsBalance > 0,
      balance: result.creditsBalance,
    };
  },

  /**
   * Get organization billing context for LLM provider
   *
   * Returns the Stripe customer ID and billing flags needed for
   * Stripe Token Billing attribution.
   *
   * Note: Usage-based billing is the default for all organizations.
   * Every organization must have a stripe_customer_id for billing.
   */
  async getBillingContext(organizationId: string | null): Promise<{
    stripeCustomerId: string | null;
    useSandboxForUsageBilling: boolean;
    organizationId: string | null;
  }> {
    if (!organizationId) {
      return {
        stripeCustomerId: null,
        useSandboxForUsageBilling: false,
        organizationId: null,
      };
    }

    // Query the organization's Stripe customer ID
    const result = await rawSql<
      {
        stripe_customer_id: string | null;
      }[]
    >`
      SELECT stripe_customer_id
      FROM app.organizations
      WHERE id = ${organizationId}::uuid
      LIMIT 1
    `;

    if (result.length === 0) {
      return {
        stripeCustomerId: null,
        useSandboxForUsageBilling: false,
        organizationId,
      };
    }

    const org = result[0];

    // Sandbox mode is controlled by environment variable only
    const useSandbox = Deno.env.get("USE_STRIPE_SANDBOX") === "true";

    // Use internal customer ID as fallback for local development
    let customerId = org.stripe_customer_id || null;
    if (!customerId) {
      const env = Deno.env.get("ENVIRONMENT") || "development";
      if (env === "development" || env === "local") {
        // Use internal sandbox customer for local dev
        customerId =
          Deno.env.get("STRIPE_CHIPP_INTERNAL_SANDBOX_CUSTOMER_ID") ||
          Deno.env.get("STRIPE_CHIPP_INTERNAL_CUSTOMER_ID") ||
          null;
        if (customerId) {
          console.log(
            "[billing] Using internal customer ID for local development:",
            customerId
          );
        }
      }
    }

    return {
      stripeCustomerId: customerId,
      useSandboxForUsageBilling: useSandbox,
      organizationId,
    };
  },

  /**
   * Record token usage for billing
   */
  async recordTokenUsage(params: {
    applicationId: string;
    organizationId: string | null;
    sessionId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    const {
      applicationId,
      organizationId,
      sessionId,
      model,
      inputTokens,
      outputTokens,
    } = params;

    await db
      .insertInto("billing.token_usage")
      .values({
        applicationId,
        organizationId,
        sessionId,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      })
      .execute();
  },

  // ========================================
  // Viewed Sessions Management
  // ========================================

  /**
   * Get list of viewed session IDs for a user
   */
  async getViewedSessionIds(
    applicationId: string,
    userId: string
  ): Promise<string[]> {
    const result = await db
      .selectFrom("chat.viewed_sessions as vs")
      .innerJoin("chat.sessions as s", "s.id", "vs.sessionId")
      .select("vs.sessionId")
      .where("s.applicationId", "=", applicationId)
      .where("vs.userId", "=", userId)
      .execute();

    return result.map((r) => r.sessionId);
  },

  /**
   * Mark a session as viewed by a user
   */
  async markSessionViewed(sessionId: string, userId: string): Promise<void> {
    // Use raw SQL for ON CONFLICT since Kysely's support varies
    await rawSql`
      INSERT INTO chat.viewed_sessions (session_id, user_id)
      VALUES (${sessionId}::uuid, ${userId}::uuid)
      ON CONFLICT (session_id, user_id) DO UPDATE SET viewed_at = NOW()
    `;
  },

  // ========================================
  // Tags Management
  // ========================================

  /**
   * Get all tags for an application
   */
  async getApplicationTags(
    applicationId: string
  ): Promise<{ id: string; name: string; color: string }[]> {
    const tags = await db
      .selectFrom("chat.tags")
      .select(["id", "name", "color"])
      .where("applicationId", "=", applicationId)
      .orderBy("name", "asc")
      .execute();

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    }));
  },

  /**
   * Create a new tag for an application
   */
  async createTag(
    applicationId: string,
    name: string,
    color?: string
  ): Promise<{ id: string; name: string; color: string }> {
    const result = await db
      .insertInto("chat.tags")
      .values({
        applicationId,
        name,
        color: color || "#EF4444",
      })
      .returning(["id", "name", "color"])
      .executeTakeFirstOrThrow();

    return {
      id: result.id,
      name: result.name,
      color: result.color,
    };
  },

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<void> {
    await db.deleteFrom("chat.tags").where("id", "=", tagId).execute();
  },

  /**
   * Add a tag to a message
   */
  async addMessageTag(messageId: string, tagId: string): Promise<void> {
    await rawSql`
      INSERT INTO chat.message_tags (message_id, tag_id)
      VALUES (${messageId}::uuid, ${tagId}::uuid)
      ON CONFLICT (message_id, tag_id) DO NOTHING
    `;
  },

  /**
   * Remove a tag from a message
   */
  async removeMessageTag(messageId: string, tagId: string): Promise<void> {
    await db
      .deleteFrom("chat.message_tags")
      .where("messageId", "=", messageId)
      .where("tagId", "=", tagId)
      .execute();
  },
};
