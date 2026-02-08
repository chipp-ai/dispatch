/**
 * WhatsApp Webhook Routes
 *
 * Handles incoming WhatsApp events:
 * - GET: Webhook verification (hub.verify_token challenge)
 * - POST: Incoming messages and status updates
 */

import { Hono } from "hono";
import { log } from "@/lib/logger.ts";
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

    log.info("Verification request", {
      source: "whatsapp-webhook",
      feature: "verification",
      applicationId,
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    });

    // Get config to validate token
    const config =
      await whatsappService.getConfigByApplicationId(applicationId);

    if (!config) {
      log.info("Config not found for verification", { source: "whatsapp-webhook", feature: "verification", applicationId });
      return c.json({ error: "Config not found" }, 404);
    }

    // Validate the request
    if (mode !== "subscribe") {
      log.info("Invalid mode", { source: "whatsapp-webhook", feature: "verification", applicationId, mode });
      return c.json({ error: "Invalid mode" }, 403);
    }

    if (token !== config.webhookSecret) {
      log.info("Invalid verify token", { source: "whatsapp-webhook", feature: "verification", applicationId });
      return c.json({ error: "Invalid verify token" }, 403);
    }

    if (!challenge) {
      log.info("Missing challenge", { source: "whatsapp-webhook", feature: "verification", applicationId });
      return c.json({ error: "Missing challenge" }, 400);
    }

    log.info("Verification successful", { source: "whatsapp-webhook", feature: "verification", applicationId });
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

    log.info("Received event", {
      source: "whatsapp-webhook",
      feature: "message",
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
      log.debug("Status update, acknowledging", { source: "whatsapp-webhook", feature: "message", applicationId });
      return c.json({ success: true });
    }

    // Get the first message
    const message = value?.messages?.[0];
    if (!message) {
      log.debug("No message in payload", { source: "whatsapp-webhook", feature: "message", applicationId });
      return c.json({ success: true });
    }

    // Check for duplicate messages
    if (whatsappService.isDuplicateMessage(message.id, applicationId)) {
      log.debug("Duplicate message, skipping", { source: "whatsapp-webhook", feature: "message", applicationId, messageId: message.id });
      return c.json({ success: true });
    }

    // Get config and credentials
    const config =
      await whatsappService.getConfigByApplicationId(applicationId);
    if (!config) {
      log.info("Config not found", { source: "whatsapp-webhook", feature: "message", applicationId });
      return c.json({ success: true }); // Acknowledge but don't process
    }

    if (!config.isActive) {
      log.info("Config is inactive", { source: "whatsapp-webhook", feature: "message", applicationId });
      return c.json({ success: true });
    }

    const credentials =
      await whatsappService.getDecryptedCredentials(applicationId);
    if (!credentials) {
      log.warn("Failed to get credentials", { source: "whatsapp-webhook", feature: "message", applicationId });
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
      log.error("Error processing message", {
        source: "whatsapp-webhook",
        feature: "message",
        correlationId,
        applicationId,
        messageId: message.id,
        messageType: message.type,
      }, err);
    });

    // Acknowledge the webhook immediately
    return c.json({ success: true });
  });
