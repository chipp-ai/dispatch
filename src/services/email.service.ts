/**
 * Email Service
 *
 * Handles Postmark email integration, config management,
 * credential encryption/decryption, thread management, and email sending.
 */

import { db } from "@/src/db/client.ts";
import { encrypt, decrypt } from "@/src/services/crypto.service.ts";
import type { EmailConfig, EmailThread } from "@/src/db/schema.ts";
import { chatService } from "./chat.service.ts";
import * as Sentry from "@sentry/deno";

// ========================================
// Types
// ========================================

export interface EmailCredentials {
  postmarkServerToken: string | null;
  webhookUsername: string;
  webhookPassword: string;
}

export interface PostmarkInboundEmail {
  MessageID: string;
  From: string;
  FromName: string;
  FromFull: {
    Email: string;
    Name: string;
  };
  To: string;
  ToFull: Array<{
    Email: string;
    Name: string;
  }>;
  Cc: string;
  CcFull: Array<{
    Email: string;
    Name: string;
  }>;
  Subject: string;
  MessageStream: string;
  ReplyTo: string;
  MailboxHash: string;
  Date: string;
  TextBody: string;
  HtmlBody: string;
  StrippedTextReply: string;
  Headers: Array<{
    Name: string;
    Value: string;
  }>;
  Attachments: Array<{
    Name: string;
    Content: string;
    ContentType: string;
    ContentLength: number;
  }>;
}

export interface EmailThreadInfo {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
}

export interface SendEmailParams {
  to: string;
  from: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  textBody: string;
  inReplyTo?: string;
  references?: string[];
  serverToken: string;
  messageStream?: string;
}

export interface PostmarkSendResponse {
  To: string;
  SubmittedAt: string;
  MessageID: string;
  ErrorCode: number;
  Message: string;
}

// ========================================
// Event Deduplication
// ========================================

// In-memory cache for deduping email Message-IDs
const processedMessageIds = new Set<string>();

/**
 * Check if a message has already been processed
 * Returns true if duplicate (should be skipped)
 */
export function isDuplicateMessage(
  messageId: string,
  applicationId: string
): boolean {
  const dedupeKey = `${messageId}-${applicationId}`;
  if (processedMessageIds.has(dedupeKey)) {
    return true;
  }

  processedMessageIds.add(dedupeKey);

  // Auto-prune after 5 minutes to prevent unbounded memory growth
  setTimeout(() => processedMessageIds.delete(dedupeKey), 5 * 60 * 1000);

  return false;
}

// ========================================
// Config Management
// ========================================

/**
 * Get email config by application ID
 */
export async function getConfigByApplicationId(
  applicationId: string
): Promise<EmailConfig | null> {
  const result = await db
    .selectFrom("app.email_configs")
    .selectAll()
    .where("applicationId", "=", applicationId)
    .where("isDeleted", "=", false)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Get email config by inbound email address (for global webhook)
 */
export async function getConfigByInboundEmail(
  email: string
): Promise<EmailConfig | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const result = await db
    .selectFrom("app.email_configs")
    .selectAll()
    .where("inboundEmailAddress", "=", normalizedEmail)
    .where("isDeleted", "=", false)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Create a new email config
 */
export async function createConfig(data: {
  applicationId: string;
  postmarkServerToken?: string;
  postmarkMessageStream?: string;
  useSharedInfrastructure?: boolean;
  inboundEmailAddress: string;
  fromEmailAddress: string;
  fromEmailName: string;
  enableWhitelist?: boolean;
}): Promise<EmailConfig> {
  // Generate webhook credentials
  const webhookUsername = crypto.randomUUID();
  const webhookPassword = crypto.randomUUID();

  // Encrypt credentials
  const encryptedWebhookUsername = await encrypt(webhookUsername);
  const encryptedWebhookPassword = await encrypt(webhookPassword);
  const encryptedServerToken = data.postmarkServerToken
    ? await encrypt(data.postmarkServerToken)
    : null;

  const [config] = await db
    .insertInto("app.email_configs")
    .values({
      applicationId: data.applicationId,
      postmarkServerToken: encryptedServerToken,
      postmarkMessageStream: data.postmarkMessageStream || "inbound",
      webhookUsername: encryptedWebhookUsername,
      webhookPassword: encryptedWebhookPassword,
      useSharedInfrastructure: data.useSharedInfrastructure ?? true,
      inboundEmailAddress: data.inboundEmailAddress.toLowerCase().trim(),
      fromEmailAddress: data.fromEmailAddress.toLowerCase().trim(),
      fromEmailName: data.fromEmailName,
      enableWhitelist: data.enableWhitelist ?? true,
      isActive: true,
      isDeleted: false,
    })
    .returningAll()
    .execute();

  return config;
}

/**
 * Update an existing email config
 */
export async function updateConfig(
  applicationId: string,
  data: {
    postmarkServerToken?: string | null;
    postmarkMessageStream?: string;
    useSharedInfrastructure?: boolean;
    inboundEmailAddress?: string;
    fromEmailAddress?: string;
    fromEmailName?: string;
    enableWhitelist?: boolean;
    isActive?: boolean;
  }
): Promise<EmailConfig | null> {
  const updateData: Record<string, unknown> = {};

  if (data.postmarkServerToken !== undefined) {
    updateData.postmarkServerToken = data.postmarkServerToken
      ? await encrypt(data.postmarkServerToken)
      : null;
  }
  if (data.postmarkMessageStream !== undefined) {
    updateData.postmarkMessageStream = data.postmarkMessageStream;
  }
  if (data.useSharedInfrastructure !== undefined) {
    updateData.useSharedInfrastructure = data.useSharedInfrastructure;
  }
  if (data.inboundEmailAddress !== undefined) {
    updateData.inboundEmailAddress = data.inboundEmailAddress
      .toLowerCase()
      .trim();
  }
  if (data.fromEmailAddress !== undefined) {
    updateData.fromEmailAddress = data.fromEmailAddress.toLowerCase().trim();
  }
  if (data.fromEmailName !== undefined) {
    updateData.fromEmailName = data.fromEmailName;
  }
  if (data.enableWhitelist !== undefined) {
    updateData.enableWhitelist = data.enableWhitelist;
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return getConfigByApplicationId(applicationId);
  }

  updateData.updatedAt = new Date();

  const [result] = await db
    .updateTable("app.email_configs")
    .set(updateData)
    .where("applicationId", "=", applicationId)
    .where("isDeleted", "=", false)
    .returningAll()
    .execute();

  return result ?? null;
}

/**
 * Upsert email config (create or update)
 */
export async function upsertConfig(data: {
  applicationId: string;
  postmarkServerToken?: string;
  postmarkMessageStream?: string;
  useSharedInfrastructure?: boolean;
  inboundEmailAddress: string;
  fromEmailAddress: string;
  fromEmailName: string;
  enableWhitelist?: boolean;
}): Promise<EmailConfig> {
  const existing = await getConfigByApplicationId(data.applicationId);

  if (existing) {
    const updated = await updateConfig(data.applicationId, {
      postmarkServerToken: data.postmarkServerToken,
      postmarkMessageStream: data.postmarkMessageStream,
      useSharedInfrastructure: data.useSharedInfrastructure,
      inboundEmailAddress: data.inboundEmailAddress,
      fromEmailAddress: data.fromEmailAddress,
      fromEmailName: data.fromEmailName,
      enableWhitelist: data.enableWhitelist,
    });
    return updated!;
  }

  return createConfig(data);
}

/**
 * Toggle whitelist setting
 */
export async function toggleWhitelist(
  applicationId: string,
  enableWhitelist: boolean
): Promise<EmailConfig | null> {
  return updateConfig(applicationId, { enableWhitelist });
}

/**
 * Soft delete an email config
 */
export async function softDeleteConfig(applicationId: string): Promise<void> {
  await db
    .updateTable("app.email_configs")
    .set({ isDeleted: true, isActive: false, updatedAt: new Date() })
    .where("applicationId", "=", applicationId)
    .execute();
}

/**
 * Get decrypted credentials for an application
 */
export async function getDecryptedCredentials(
  applicationId: string
): Promise<EmailCredentials | null> {
  const config = await getConfigByApplicationId(applicationId);
  if (!config) return null;

  try {
    const webhookUsername = await decrypt(config.webhookUsername);
    const webhookPassword = await decrypt(config.webhookPassword);
    const postmarkServerToken = config.postmarkServerToken
      ? await decrypt(config.postmarkServerToken)
      : null;

    return {
      postmarkServerToken,
      webhookUsername,
      webhookPassword,
    };
  } catch {
    // If decryption fails, return null
    console.error("[Email] Failed to decrypt credentials");
    Sentry.captureMessage("Failed to decrypt email credentials", {
      level: "error",
      tags: { source: "email", feature: "credential-decryption" },
      extra: { applicationId },
    });
    return null;
  }
}

/**
 * Validate webhook token from query parameter
 */
export async function validateWebhookToken(
  applicationId: string,
  token: string
): Promise<boolean> {
  const credentials = await getDecryptedCredentials(applicationId);
  if (!credentials) return false;

  return credentials.webhookPassword === token;
}

// ========================================
// Thread Management
// ========================================

/**
 * Extract thread information from email headers
 */
export function extractThreadInfo(
  headers: Array<{ Name: string; Value: string }>,
  subject: string,
  messageId: string
): EmailThreadInfo {
  let inReplyTo: string | null = null;
  let references: string[] = [];

  for (const header of headers) {
    const name = header.Name.toLowerCase();
    if (name === "in-reply-to") {
      inReplyTo = header.Value.trim();
    } else if (name === "references") {
      references = header.Value.split(/\s+/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);
    }
  }

  return {
    messageId,
    inReplyTo,
    references,
    subject,
  };
}

/**
 * Generate a thread ID from message threading headers
 * Uses SHA256 hash of the root message ID, truncated to 16 chars
 */
export async function generateThreadId(
  messageId: string,
  inReplyTo: string | null,
  references: string[]
): Promise<string> {
  // Determine the root message ID (first message in thread)
  let rootMessageId = messageId;

  if (references.length > 0) {
    rootMessageId = references[0];
  } else if (inReplyTo) {
    rootMessageId = inReplyTo;
  }

  // Hash the root message ID
  const encoder = new TextEncoder();
  const data = encoder.encode(rootMessageId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Return first 16 characters
  return hashHex.substring(0, 16);
}

/**
 * Get thread by thread ID
 */
export async function getThread(
  emailConfigId: string,
  threadId: string
): Promise<EmailThread | null> {
  const result = await db
    .selectFrom("app.email_threads")
    .selectAll()
    .where("emailConfigId", "=", emailConfigId)
    .where("threadId", "=", threadId)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Find or create a thread for an email conversation
 */
export async function findOrCreateThread(params: {
  emailConfigId: string;
  applicationId: string;
  threadInfo: EmailThreadInfo;
  senderEmail: string;
}): Promise<{ thread: EmailThread; isNew: boolean }> {
  const { emailConfigId, applicationId, threadInfo, senderEmail } = params;

  // Generate thread ID
  const threadId = await generateThreadId(
    threadInfo.messageId,
    threadInfo.inReplyTo,
    threadInfo.references
  );

  // Try to find existing thread
  const existing = await getThread(emailConfigId, threadId);
  if (existing) {
    // Update message count and participants
    const participants = (existing.participants as string[]) || [];
    if (!participants.includes(senderEmail.toLowerCase())) {
      participants.push(senderEmail.toLowerCase());
    }

    await db
      .updateTable("app.email_threads")
      .set({
        messageCount: existing.messageCount + 1,
        participants: JSON.stringify(participants),
        updatedAt: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();

    return { thread: existing, isNew: false };
  }

  // Create a new chat session for this thread
  const chatSession = await chatService.createSession({
    applicationId,
    source: "EMAIL",
    title: threadInfo.subject || "Email Conversation",
  });

  // Create new thread
  const [thread] = await db
    .insertInto("app.email_threads")
    .values({
      emailConfigId,
      threadId,
      subject: threadInfo.subject || "(No Subject)",
      chatSessionId: chatSession.id,
      firstMessageId: threadInfo.messageId,
      participants: JSON.stringify([senderEmail.toLowerCase()]),
      isActive: true,
      messageCount: 1,
    })
    .returningAll()
    .execute();

  return { thread, isNew: true };
}

// ========================================
// Whitelist Management
// ========================================

/**
 * Check if an email is whitelisted for an application
 */
export async function isEmailWhitelisted(
  applicationId: string,
  email: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();

  const result = await db
    .selectFrom("app.application_email_whitelist")
    .select("id")
    .where("applicationId", "=", applicationId)
    .where("email", "=", normalizedEmail)
    .executeTakeFirst();

  return !!result;
}

/**
 * Get all whitelisted emails for an application
 */
export async function getWhitelistedEmails(
  applicationId: string
): Promise<string[]> {
  const results = await db
    .selectFrom("app.application_email_whitelist")
    .select("email")
    .where("applicationId", "=", applicationId)
    .execute();

  return results.map((r) => r.email);
}

/**
 * Add email to whitelist
 */
export async function addToWhitelist(
  applicationId: string,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if already exists
  const existing = await db
    .selectFrom("app.application_email_whitelist")
    .select("id")
    .where("applicationId", "=", applicationId)
    .where("email", "=", normalizedEmail)
    .executeTakeFirst();

  if (existing) return;

  await db
    .insertInto("app.application_email_whitelist")
    .values({
      applicationId,
      email: normalizedEmail,
    })
    .execute();
}

/**
 * Remove email from whitelist
 */
export async function removeFromWhitelist(
  applicationId: string,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  await db
    .deleteFrom("app.application_email_whitelist")
    .where("applicationId", "=", applicationId)
    .where("email", "=", normalizedEmail)
    .execute();
}

// ========================================
// Postmark API
// ========================================

const POSTMARK_API_BASE = "https://api.postmarkapp.com";

/**
 * Send an email reply via Postmark
 * Matches chipp-admin implementation with HtmlBody, ReplyTo, and tracking disabled
 */
export async function sendReply(
  params: SendEmailParams
): Promise<PostmarkSendResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Postmark-Server-Token": params.serverToken,
  };

  // Build email headers for threading
  const emailHeaders: Array<{ Name: string; Value: string }> = [];
  if (params.inReplyTo) {
    emailHeaders.push({ Name: "In-Reply-To", Value: params.inReplyTo });
  }
  if (params.references && params.references.length > 0) {
    emailHeaders.push({
      Name: "References",
      Value: params.references.join(" "),
    });
  }

  // Generate HtmlBody from TextBody (convert newlines to <br>)
  const htmlBody = `<div>${params.textBody.replace(/\n/g, "<br>")}</div>`;

  const body: Record<string, unknown> = {
    From: params.fromName ? `${params.fromName} <${params.from}>` : params.from,
    To: params.to,
    Subject: params.subject,
    TextBody: params.textBody,
    HtmlBody: htmlBody,
    MessageStream: params.messageStream || "outbound",
    Headers: emailHeaders.length > 0 ? emailHeaders : undefined,
    // Disable tracking to match chipp-admin behavior
    TrackOpens: false,
    TrackLinks: "None",
  };

  // Add ReplyTo if provided
  if (params.replyTo) {
    body.ReplyTo = params.replyTo;
  }

  const response = await fetch(`${POSTMARK_API_BASE}/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result: PostmarkSendResponse = await response.json();

  if (result.ErrorCode !== 0) {
    console.error("[Email] Postmark send error", {
      errorCode: result.ErrorCode,
      message: result.Message,
    });
    Sentry.captureMessage("Postmark send error", {
      level: "error",
      tags: { source: "email", feature: "postmark-send" },
      extra: {
        errorCode: result.ErrorCode,
        errorMessage: result.Message,
        to: params.to,
        subject: params.subject,
      },
    });
  }

  return result;
}

/**
 * Get the Postmark server token to use (shared or custom)
 */
export async function getServerToken(
  config: EmailConfig
): Promise<string | null> {
  if (config.useSharedInfrastructure) {
    return Deno.env.get("POSTMARK_SHARED_SERVER_TOKEN") || null;
  }

  if (!config.postmarkServerToken) return null;

  try {
    return await decrypt(config.postmarkServerToken);
  } catch {
    return null;
  }
}

// ========================================
// Export Service Object
// ========================================

export const emailService = {
  // Deduplication
  isDuplicateMessage,

  // Config management
  getConfigByApplicationId,
  getConfigByInboundEmail,
  createConfig,
  updateConfig,
  upsertConfig,
  toggleWhitelist,
  softDeleteConfig,
  getDecryptedCredentials,
  validateWebhookToken,

  // Thread management
  extractThreadInfo,
  generateThreadId,
  getThread,
  findOrCreateThread,

  // Whitelist management
  isEmailWhitelisted,
  getWhitelistedEmails,
  addToWhitelist,
  removeFromWhitelist,

  // Postmark API
  sendReply,
  getServerToken,
};
