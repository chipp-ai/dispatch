/**
 * WhatsApp Webhook Routes
 *
 * Handles incoming WhatsApp events:
 * - GET: Webhook verification (hub.verify_token challenge)
 * - POST: Incoming messages and status updates
 */

import { Hono } from "hono";
import * as Sentry from "@sentry/deno";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { whatsappService } from "../../../services/whatsapp.service.ts";
import { handleWhatsAppMessage } from "../../../services/whatsapp-chat.service.ts";

// ========================================
// Types
// ========================================

interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: {
            id: string;
            mime_type: string;
            sha256?: string;
            caption?: string;
          };
          audio?: {
            id: string;
            mime_type: string;
            voice?: boolean;
          };
          video?: {
            id: string;
            mime_type: string;
            caption?: string;
          };
          document?: {
            id: string;
            mime_type: string;
            filename?: string;
            caption?: string;
          };
          sticker?: {
            id: string;
            mime_type: string;
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

// ========================================
// Routes
// ========================================

export const whatsappWebhookRoutes = new Hono<WebhookContext>()
  /**
   * GET /webhooks/whatsapp/:applicationId
   * Webhook verification endpoint
   *
   * Meta sends a GET request with:
   * - hub.mode: "subscribe"
   * - hub.verify_token: your configured verify token
   * - hub.challenge: a random string to echo back
   */
  .get("/:applicationId", async (c) => {
    const applicationId = c.req.param("applicationId");
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");

    console.log("[WhatsAppWebhook] Verification request", {
      applicationId,
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    });

    // Get config to validate token
    const config =
      await whatsappService.getConfigByApplicationId(applicationId);

    if (!config) {
      console.log("[WhatsAppWebhook] Config not found for verification");
      return c.json({ error: "Config not found" }, 404);
    }

    // Validate the request
    if (mode !== "subscribe") {
      console.log("[WhatsAppWebhook] Invalid mode", { mode });
      return c.json({ error: "Invalid mode" }, 403);
    }

    if (token !== config.webhookSecret) {
      console.log("[WhatsAppWebhook] Invalid verify token");
      return c.json({ error: "Invalid verify token" }, 403);
    }

    if (!challenge) {
      console.log("[WhatsAppWebhook] Missing challenge");
      return c.json({ error: "Missing challenge" }, 400);
    }

    console.log("[WhatsAppWebhook] Verification successful");
    // Return challenge as plain text (required by Meta)
    return c.text(challenge, 200, {
      "Content-Type": "text/plain",
    });
  })

  /**
   * POST /webhooks/whatsapp/:applicationId
   * Incoming message webhook
   *
   * Handles:
   * - Text messages
   * - Media messages (image, audio, video, document, sticker)
   * - Status updates (sent, delivered, read) - acknowledged but not processed
   */
  .post("/:applicationId", async (c) => {
    const applicationId = c.req.param("applicationId");

    let payload: WhatsAppWebhookPayload;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    console.log("[WhatsAppWebhook] Received event", {
      applicationId,
      object: payload.object,
      hasEntry: !!payload.entry?.length,
    });

    // Acknowledge immediately (required by Meta - must respond within 20 seconds)
    // Process async in the background

    // Extract the message from the payload
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Check if this is a status update (not a message) - acknowledge silently
    if (value?.statuses && !value?.messages) {
      console.log("[WhatsAppWebhook] Status update, acknowledging");
      return c.json({ success: true });
    }

    // Get the first message
    const message = value?.messages?.[0];
    if (!message) {
      console.log("[WhatsAppWebhook] No message in payload");
      return c.json({ success: true });
    }

    // Check for duplicate messages
    if (whatsappService.isDuplicateMessage(message.id, applicationId)) {
      console.log("[WhatsAppWebhook] Duplicate message, skipping", {
        messageId: message.id,
      });
      return c.json({ success: true });
    }

    // Get config and credentials
    const config =
      await whatsappService.getConfigByApplicationId(applicationId);
    if (!config) {
      console.log("[WhatsAppWebhook] Config not found");
      return c.json({ success: true }); // Acknowledge but don't process
    }

    if (!config.isActive) {
      console.log("[WhatsAppWebhook] Config is inactive");
      return c.json({ success: true });
    }

    const credentials =
      await whatsappService.getDecryptedCredentials(applicationId);
    if (!credentials) {
      console.log("[WhatsAppWebhook] Failed to get credentials");
      return c.json({ success: true });
    }

    // Extract correlation ID from headers
    const correlationId =
      c.req.header("X-Correlation-ID") || crypto.randomUUID();

    // Process message asynchronously (fire-and-forget)
    handleWhatsAppMessage({
      applicationId,
      message: {
        id: message.id,
        from: message.from,
        timestamp: message.timestamp,
        type: message.type,
        text: message.text,
        image: message.image,
        audio: message.audio,
        video: message.video,
        document: message.document,
        sticker: message.sticker,
      },
      credentials,
      correlationId,
    }).catch((err) => {
      console.error("[WhatsAppWebhook] Error processing message", {
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { source: "whatsapp-webhook" },
        extra: { correlationId, applicationId, messageId: message.id, messageType: message.type },
      });
    });

    // Acknowledge the webhook immediately
    return c.json({ success: true });
  });
