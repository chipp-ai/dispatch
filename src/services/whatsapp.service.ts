/**
 * WhatsApp Service
 *
 * Handles WhatsApp Business API interactions, config management,
 * credential encryption/decryption, and message sending.
 */

import { db } from "@/src/db/client.ts";
import { encrypt, decrypt } from "@/src/services/crypto.service.ts";
import type { WhatsAppConfig } from "@/src/db/schema.ts";

// ========================================
// Types
// ========================================

export interface WhatsAppCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export interface WhatsAppMediaInfo {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

// ========================================
// Event Deduplication
// ========================================

// In-memory cache for deduping WhatsApp message IDs
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
 * Get WhatsApp config by application ID
 */
export async function getConfigByApplicationId(
  applicationId: string
): Promise<WhatsAppConfig | null> {
  const result = await db
    .selectFrom("app.whatsapp_configs")
    .selectAll()
    .where("applicationId", "=", applicationId)
    .where("isDeleted", "=", false)
    .executeTakeFirst();

  return result ?? null;
}

/**
 * Create a new WhatsApp config
 */
export async function createConfig(data: {
  applicationId: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}): Promise<WhatsAppConfig> {
  // Encrypt sensitive fields
  const encryptedPhoneNumberId = await encrypt(data.phoneNumberId);
  const encryptedBusinessAccountId = await encrypt(data.businessAccountId);
  const encryptedAccessToken = await encrypt(data.accessToken);

  // Generate webhook secret (UUID for hub.verify_token)
  const webhookSecret = crypto.randomUUID();

  const [config] = await db
    .insertInto("app.whatsapp_configs")
    .values({
      applicationId: data.applicationId,
      phoneNumberId: encryptedPhoneNumberId,
      businessAccountId: encryptedBusinessAccountId,
      accessToken: encryptedAccessToken,
      webhookSecret,
      isActive: true,
      isDeleted: false,
    })
    .returningAll()
    .execute();

  return config;
}

/**
 * Update an existing WhatsApp config
 */
export async function updateConfig(
  applicationId: string,
  data: {
    phoneNumberId?: string;
    businessAccountId?: string;
    accessToken?: string;
    isActive?: boolean;
  }
): Promise<WhatsAppConfig | null> {
  const updateData: Record<string, unknown> = {};

  if (data.phoneNumberId !== undefined) {
    updateData.phoneNumberId = await encrypt(data.phoneNumberId);
  }
  if (data.businessAccountId !== undefined) {
    updateData.businessAccountId = await encrypt(data.businessAccountId);
  }
  if (data.accessToken !== undefined) {
    updateData.accessToken = await encrypt(data.accessToken);
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return getConfigByApplicationId(applicationId);
  }

  const [result] = await db
    .updateTable("app.whatsapp_configs")
    .set(updateData)
    .where("applicationId", "=", applicationId)
    .where("isDeleted", "=", false)
    .returningAll()
    .execute();

  return result ?? null;
}

/**
 * Upsert WhatsApp config (create or update)
 */
export async function upsertConfig(data: {
  applicationId: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}): Promise<WhatsAppConfig> {
  const existing = await getConfigByApplicationId(data.applicationId);

  if (existing) {
    const updated = await updateConfig(data.applicationId, {
      phoneNumberId: data.phoneNumberId,
      businessAccountId: data.businessAccountId,
      accessToken: data.accessToken,
    });
    return updated!;
  }

  return createConfig(data);
}

/**
 * Check if a phone number is already in use by another application.
 * Returns the conflicting applicationId if found, null otherwise.
 */
export async function checkDuplicatePhoneNumber(
  phoneNumberId: string,
  excludeApplicationId: string
): Promise<string | null> {
  const encryptedPhoneNumberId = await encrypt(phoneNumberId);

  const existing = await db
    .selectFrom("app.whatsapp_configs")
    .select("applicationId")
    .where("phoneNumberId", "=", encryptedPhoneNumberId)
    .where("applicationId", "!=", excludeApplicationId)
    .where("isDeleted", "=", false)
    .executeTakeFirst();

  return existing?.applicationId ?? null;
}

/**
 * Soft delete a WhatsApp config
 */
export async function softDeleteConfig(applicationId: string): Promise<void> {
  await db
    .updateTable("app.whatsapp_configs")
    .set({ isDeleted: true, isActive: false })
    .where("applicationId", "=", applicationId)
    .execute();
}

/**
 * Get decrypted credentials for an application
 */
export async function getDecryptedCredentials(
  applicationId: string
): Promise<WhatsAppCredentials | null> {
  const config = await getConfigByApplicationId(applicationId);
  if (!config) return null;

  try {
    const phoneNumberId = await decrypt(config.phoneNumberId);
    const businessAccountId = await decrypt(config.businessAccountId);
    const accessToken = await decrypt(config.accessToken);

    return {
      phoneNumberId,
      businessAccountId,
      accessToken,
    };
  } catch {
    // If decryption fails, credentials may not be encrypted (legacy)
    return {
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      accessToken: config.accessToken,
    };
  }
}

// ========================================
// WhatsApp API Calls
// ========================================

const WHATSAPP_API_VERSION = "v17.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

/**
 * Send a text message via WhatsApp Business API
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<WhatsAppSendMessageResponse> {
  const response = await fetch(
    `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );

  return response.json();
}

/**
 * Download media from WhatsApp Cloud API
 * Two-step process:
 * 1. GET /v17.0/{media_id} to get download URL
 * 2. GET {download_url} to get binary content
 */
export async function downloadMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Uint8Array; mimeType: string } | null> {
  try {
    // Step 1: Get media info/URL
    const mediaInfoResponse = await fetch(`${WHATSAPP_API_BASE}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!mediaInfoResponse.ok) {
      console.error("[WhatsApp] Failed to get media info", {
        mediaId,
        status: mediaInfoResponse.status,
      });
      return null;
    }

    const mediaInfo: WhatsAppMediaInfo = await mediaInfoResponse.json();
    const downloadUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || "application/octet-stream";

    if (!downloadUrl) {
      console.error("[WhatsApp] No download URL in media info", { mediaId });
      return null;
    }

    // Step 2: Download the media content
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!downloadResponse.ok) {
      console.error("[WhatsApp] Failed to download media", {
        mediaId,
        status: downloadResponse.status,
      });
      return null;
    }

    const buffer = new Uint8Array(await downloadResponse.arrayBuffer());

    console.log("[WhatsApp] Downloaded media successfully", {
      mediaId,
      mimeType,
      sizeBytes: buffer.length,
    });

    return { buffer, mimeType };
  } catch (error) {
    console.error("[WhatsApp] Error downloading media", {
      mediaId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Mark a message as read
 */
export async function markAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
        }),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

// ========================================
// Export Service Object
// ========================================

export const whatsappService = {
  // Deduplication
  isDuplicateMessage,

  // Config management
  getConfigByApplicationId,
  createConfig,
  updateConfig,
  upsertConfig,
  softDeleteConfig,
  getDecryptedCredentials,
  checkDuplicatePhoneNumber,

  // WhatsApp API
  sendTextMessage,
  downloadMedia,
  markAsRead,
};
