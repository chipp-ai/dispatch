/**
 * Slack Service
 *
 * Handles Slack API interactions, installation management,
 * OAuth state, chat mappings, and thread context.
 */

import { db } from "@/src/db/client.ts";
import { encrypt, decrypt } from "@/src/services/crypto.service.ts";
import type {
  SlackInstallation as SlackInstallationType,
  SlackChatMapping,
  SlackOAuthState,
  SlackThreadContext,
  SlackUser,
} from "@/src/db/schema.ts";

// ========================================
// Types
// ========================================

export type SlackInstallation = SlackInstallationType;

export interface SlackCredentials {
  slackClientId: string;
  slackClientSecret: string;
  slackSigningSecret?: string;
}

export interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  team?: {
    id: string;
    name: string;
  };
  app_id?: string;
  error?: string;
}

export interface SlackUserInfo {
  ok: boolean;
  user?: {
    id: string;
    name?: string;
    real_name?: string;
    tz?: string;
    profile?: {
      email?: string;
      display_name?: string;
      image_48?: string;
      title?: string;
      status_text?: string;
    };
  };
  error?: string;
}

// ========================================
// Installation Management
// ========================================

/**
 * Get installation by workspace team ID and Slack app ID
 */
export async function getInstallationByTeamAndApp(
  teamId: string,
  appId: string
): Promise<SlackInstallationType | null> {
  const result = await db
    .selectFrom("app.slack_installations")
    .selectAll()
    .where("workspaceTeamId", "=", teamId)
    .where("slackAppId", "=", appId)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Create a new Slack installation
 */
export async function createInstallation(data: {
  workspaceTeamId: string;
  slackAppId: string;
  workspaceName?: string;
  botToken: string;
  signingSecret?: string;
  slackClientId?: string;
  slackClientSecret?: string;
  installedById?: number;
}): Promise<SlackInstallationType> {
  // Encrypt sensitive fields
  const encryptedBotToken = await encrypt(data.botToken);
  const encryptedSigningSecret = data.signingSecret
    ? await encrypt(data.signingSecret)
    : null;
  const encryptedClientSecret = data.slackClientSecret
    ? await encrypt(data.slackClientSecret)
    : null;

  const [installation] = await db
    .insertInto("app.slack_installations")
    .values({
      workspaceTeamId: data.workspaceTeamId,
      slackAppId: data.slackAppId,
      workspaceName: data.workspaceName ?? null,
      botToken: encryptedBotToken,
      signingSecret: encryptedSigningSecret,
      slackClientId: data.slackClientId ?? null,
      slackClientSecret: encryptedClientSecret,
      installedById: data.installedById ?? null,
    })
    .returningAll()
    .execute();

  return installation;
}

/**
 * Update an existing Slack installation
 */
export async function updateInstallation(
  id: number,
  data: {
    workspaceName?: string;
    botToken?: string;
    signingSecret?: string;
    slackClientId?: string;
    slackClientSecret?: string;
  }
): Promise<SlackInstallationType | null> {
  const updateData: Record<string, unknown> = {};

  if (data.workspaceName !== undefined) {
    updateData.workspaceName = data.workspaceName;
  }
  if (data.botToken) {
    updateData.botToken = await encrypt(data.botToken);
  }
  if (data.signingSecret) {
    updateData.signingSecret = await encrypt(data.signingSecret);
  }
  if (data.slackClientId !== undefined) {
    updateData.slackClientId = data.slackClientId;
  }
  if (data.slackClientSecret) {
    updateData.slackClientSecret = await encrypt(data.slackClientSecret);
  }

  const [result] = await db
    .updateTable("app.slack_installations")
    .set(updateData)
    .where("id", "=", id)
    .returningAll()
    .execute();

  return result ?? null;
}

/**
 * Upsert a Slack installation
 */
export async function upsertInstallation(data: {
  workspaceTeamId: string;
  slackAppId: string;
  workspaceName?: string;
  botToken: string;
  signingSecret?: string;
  slackClientId?: string;
  slackClientSecret?: string;
  installedById?: number;
}): Promise<SlackInstallationType> {
  const existing = await getInstallationByTeamAndApp(
    data.workspaceTeamId,
    data.slackAppId
  );

  if (existing) {
    const updated = await updateInstallation(existing.id, {
      workspaceName: data.workspaceName,
      botToken: data.botToken,
      signingSecret: data.signingSecret,
      slackClientId: data.slackClientId,
      slackClientSecret: data.slackClientSecret,
    });
    return updated!;
  }

  return createInstallation(data);
}

/**
 * Delete a Slack installation
 */
export async function deleteInstallation(id: number): Promise<void> {
  // First delete related chat mappings
  await db
    .deleteFrom("app.slack_chat_mappings")
    .where("slackInstallationId", "=", id)
    .execute();

  // Then delete the installation
  await db.deleteFrom("app.slack_installations").where("id", "=", id).execute();
}

/**
 * Get installation with decrypted bot token
 */
export async function getInstallationWithToken(
  teamId: string,
  appId: string
): Promise<(SlackInstallation & { decryptedBotToken: string }) | null> {
  const installation = await getInstallationByTeamAndApp(teamId, appId);
  if (!installation) return null;

  let decryptedBotToken: string;
  try {
    decryptedBotToken = await decrypt(installation.botToken);
  } catch {
    // Token might not be encrypted (legacy)
    decryptedBotToken = installation.botToken;
  }

  return { ...installation, decryptedBotToken };
}

/**
 * Get decrypted signing secret for an installation
 */
export async function getSigningSecret(
  installation: SlackInstallation
): Promise<string | null> {
  if (!installation.signingSecret) return null;

  try {
    return await decrypt(installation.signingSecret);
  } catch {
    // Secret might not be encrypted (legacy)
    return installation.signingSecret;
  }
}

// ========================================
// OAuth State Management
// ========================================

/**
 * Create OAuth state for CSRF protection
 */
export async function createOAuthState(
  applicationId: string,
  developerId: string
): Promise<string> {
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db
    .insertInto("app.slack_oauth_states")
    .values({
      state,
      applicationId,
      developerId,
      expiresAt,
    })
    .execute();

  return state;
}

/**
 * Validate and consume an OAuth state
 */
export async function validateAndConsumeState(
  state: string
): Promise<SlackOAuthState | null> {
  const record = await db
    .selectFrom("app.slack_oauth_states")
    .selectAll()
    .where("state", "=", state)
    .executeTakeFirst();

  if (!record) return null;

  // Delete the state regardless of expiry
  await db
    .deleteFrom("app.slack_oauth_states")
    .where("state", "=", state)
    .execute();

  // Check if expired
  if (record.expiresAt < new Date()) {
    return null;
  }

  return record;
}

// ========================================
// Chat Mapping Management
// ========================================

/**
 * Get chat mapping by installation and chat name
 */
export async function getChatMappingByInstallation(
  installationId: number,
  chatName: string
): Promise<SlackChatMapping | null> {
  const result = await db
    .selectFrom("app.slack_chat_mappings")
    .selectAll()
    .where("slackInstallationId", "=", installationId)
    .where("chatName", "=", chatName)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Get all chat mappings for an installation
 */
export async function getChatMappingsForInstallation(
  installationId: number
): Promise<SlackChatMapping[]> {
  return db
    .selectFrom("app.slack_chat_mappings")
    .selectAll()
    .where("slackInstallationId", "=", installationId)
    .execute();
}

/**
 * Create a chat mapping
 */
export async function createChatMapping(data: {
  slackInstallationId: number;
  chatName: string;
  applicationId: string;
}): Promise<SlackChatMapping> {
  const [mapping] = await db
    .insertInto("app.slack_chat_mappings")
    .values(data)
    .returningAll()
    .execute();

  return mapping;
}

/**
 * Delete all chat mappings for an installation
 */
export async function deleteChatMappingsForInstallation(
  installationId: number
): Promise<void> {
  await db
    .deleteFrom("app.slack_chat_mappings")
    .where("slackInstallationId", "=", installationId)
    .execute();
}

/**
 * Get installation by application ID
 */
export async function getInstallationByApplicationId(
  applicationId: string
): Promise<{ installation: SlackInstallation; chatName: string } | null> {
  const mapping = await db
    .selectFrom("app.slack_chat_mappings")
    .innerJoin(
      "app.slack_installations",
      "app.slack_installations.id",
      "app.slack_chat_mappings.slackInstallationId"
    )
    .select([
      "app.slack_installations.id",
      "app.slack_installations.workspaceTeamId",
      "app.slack_installations.slackAppId",
      "app.slack_installations.slackClientId",
      "app.slack_installations.slackClientSecret",
      "app.slack_installations.workspaceName",
      "app.slack_installations.botToken",
      "app.slack_installations.signingSecret",
      "app.slack_installations.installedById",
      "app.slack_installations.createdAt",
      "app.slack_installations.updatedAt",
      "app.slack_chat_mappings.chatName",
    ])
    .where("app.slack_chat_mappings.applicationId", "=", applicationId)
    .executeTakeFirst();

  if (!mapping) return null;

  return {
    installation: {
      id: mapping.id,
      workspaceTeamId: mapping.workspaceTeamId,
      slackAppId: mapping.slackAppId,
      slackClientId: mapping.slackClientId,
      slackClientSecret: mapping.slackClientSecret,
      workspaceName: mapping.workspaceName,
      botToken: mapping.botToken,
      signingSecret: mapping.signingSecret,
      installedById: mapping.installedById,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    },
    chatName: mapping.chatName,
  };
}

// ========================================
// Thread Context Management
// ========================================

/**
 * Get thread context by thread timestamp
 */
export async function getThreadContext(
  threadTs: string
): Promise<SlackThreadContext | null> {
  const result = await db
    .selectFrom("app.slack_thread_contexts")
    .selectAll()
    .where("threadTs", "=", threadTs)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Save thread context
 */
export async function saveThreadContext(data: {
  threadTs: string;
  channelId: string | null;
  workspaceTeamId: string;
  slackAppId: string;
  chatName: string;
}): Promise<SlackThreadContext> {
  // Use upsert pattern since threadTs is primary key
  const existing = await getThreadContext(data.threadTs);

  if (existing) {
    const [updated] = await db
      .updateTable("app.slack_thread_contexts")
      .set({
        channelId: data.channelId,
        workspaceTeamId: data.workspaceTeamId,
        slackAppId: data.slackAppId,
        chatName: data.chatName,
      })
      .where("threadTs", "=", data.threadTs)
      .returningAll()
      .execute();
    return updated;
  }

  const [created] = await db
    .insertInto("app.slack_thread_contexts")
    .values(data)
    .returningAll()
    .execute();

  return created;
}

// ========================================
// Slack User Caching
// ========================================

/**
 * Get cached Slack user
 */
export async function getSlackUser(
  slackUserId: string,
  workspaceTeamId: string
): Promise<SlackUser | null> {
  const result = await db
    .selectFrom("app.slack_users")
    .selectAll()
    .where("slackUserId", "=", slackUserId)
    .where("workspaceTeamId", "=", workspaceTeamId)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Upsert Slack user info
 */
export async function upsertSlackUser(data: {
  slackUserId: string;
  workspaceTeamId: string;
  email?: string | null;
  realName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  title?: string | null;
  timezone?: string | null;
  statusText?: string | null;
}): Promise<SlackUser> {
  const existing = await getSlackUser(data.slackUserId, data.workspaceTeamId);

  if (existing) {
    const [updated] = await db
      .updateTable("app.slack_users")
      .set({
        email: data.email ?? existing.email,
        realName: data.realName ?? existing.realName,
        displayName: data.displayName ?? existing.displayName,
        avatar: data.avatar ?? existing.avatar,
        title: data.title ?? existing.title,
        timezone: data.timezone ?? existing.timezone,
        statusText: data.statusText ?? existing.statusText,
      })
      .where("id", "=", existing.id)
      .returningAll()
      .execute();
    return updated;
  }

  const [created] = await db
    .insertInto("app.slack_users")
    .values({
      slackUserId: data.slackUserId,
      workspaceTeamId: data.workspaceTeamId,
      email: data.email ?? null,
      realName: data.realName ?? null,
      displayName: data.displayName ?? null,
      avatar: data.avatar ?? null,
      title: data.title ?? null,
      timezone: data.timezone ?? null,
      statusText: data.statusText ?? null,
    })
    .returningAll()
    .execute();

  return created;
}

/**
 * Get or fetch Slack user (fetches from API if cache is stale)
 */
export async function getOrFetchSlackUser(
  slackUserId: string,
  workspaceTeamId: string,
  botToken: string
): Promise<SlackUser | null> {
  // Check cache first
  const cached = await getSlackUser(slackUserId, workspaceTeamId);

  // Return cached data if it's less than 24 hours old
  if (cached) {
    const cacheAge = Date.now() - cached.updatedAt.getTime();
    if (cacheAge < 24 * 60 * 60 * 1000) {
      return cached;
    }
  }

  // Fetch from Slack API
  try {
    const userInfo = await fetchSlackUserInfo(slackUserId, botToken);
    if (!userInfo.ok || !userInfo.user) {
      return cached; // Return stale cache if fetch fails
    }

    return upsertSlackUser({
      slackUserId,
      workspaceTeamId,
      email: userInfo.user.profile?.email,
      realName: userInfo.user.real_name || userInfo.user.name,
      displayName: userInfo.user.profile?.display_name,
      avatar: userInfo.user.profile?.image_48,
      title: userInfo.user.profile?.title,
      timezone: userInfo.user.tz,
      statusText: userInfo.user.profile?.status_text,
    });
  } catch {
    return cached;
  }
}

// ========================================
// Slack API Calls
// ========================================

/**
 * Fetch user info from Slack API
 */
export async function fetchSlackUserInfo(
  slackUserId: string,
  botToken: string
): Promise<SlackUserInfo> {
  const response = await fetch(
    `https://slack.com/api/users.info?user=${slackUserId}`,
    {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    }
  );
  return response.json();
}

/**
 * Post a message to Slack
 */
export async function postMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const body: Record<string, unknown> = {
    channel,
    text,
  };

  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  botToken: string,
  channel: string,
  timestamp: string,
  emoji: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      timestamp,
      name: emoji,
    }),
  });

  return response.json();
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<SlackTokenResponse> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  return response.json();
}

/**
 * Join a channel to ensure we receive message events
 */
export async function joinChannel(
  botToken: string,
  channel: string
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("https://slack.com/api/conversations.join", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel }),
  });

  return response.json();
}

// ========================================
// Export Service Object
// ========================================

export const slackService = {
  // Installation
  getInstallationByTeamAndApp,
  createInstallation,
  updateInstallation,
  upsertInstallation,
  deleteInstallation,
  getInstallationWithToken,
  getSigningSecret,
  getInstallationByApplicationId,

  // OAuth State
  createOAuthState,
  validateAndConsumeState,

  // Chat Mapping
  getChatMappingByInstallation,
  getChatMappingsForInstallation,
  createChatMapping,
  deleteChatMappingsForInstallation,

  // Thread Context
  getThreadContext,
  saveThreadContext,

  // User Caching
  getSlackUser,
  upsertSlackUser,
  getOrFetchSlackUser,

  // Slack API
  fetchSlackUserInfo,
  postMessage,
  addReaction,
  exchangeCodeForToken,
  joinChannel,
};
