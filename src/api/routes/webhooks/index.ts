/**
 * Webhook Routes
 *
 * Main router for all webhook endpoints.
 * Webhooks use their own signature verification (not JWT auth).
 */

import { Hono } from "hono";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { stripeWebhookRoutes } from "./stripe.ts";
import { twilioWebhookRoutes } from "./twilio.ts";
import { slackWebhookRoutes } from "./slack.ts";
import { whatsappWebhookRoutes } from "./whatsapp.ts";
import { emailWebhookRoutes } from "./email.ts";

export const webhookRoutes = new Hono<WebhookContext>();

/**
 * Stripe webhooks - POST /api/webhooks/stripe
 *
 * Handles:
 * - customer.subscription.created/updated/deleted
 * - invoice.paid/payment_failed
 * - checkout.session.completed
 * - billing.alert.triggered
 *
 * Use ?testMode=true for test mode webhooks.
 */
webhookRoutes.route("/stripe", stripeWebhookRoutes);

/**
 * Twilio webhooks - POST /api/webhooks/twilio
 *
 * Handles:
 * - Voice call routing (returns TwiML)
 * - Status callbacks
 *
 * Sub-routes:
 * - POST /twilio - Main voice webhook
 * - POST /twilio/status - Call status updates
 */
webhookRoutes.route("/twilio", twilioWebhookRoutes);

/**
 * Slack webhooks - POST /api/webhooks/slack
 *
 * Handles:
 * - Events API (messages, app mentions)
 * - Interactive components (buttons, modals)
 * - Slash commands
 */
webhookRoutes.route("/slack", slackWebhookRoutes);

/**
 * WhatsApp webhooks - /api/webhooks/whatsapp/:applicationId
 *
 * Handles:
 * - GET: Webhook verification (hub.verify_token challenge)
 * - POST: Incoming messages (text and media)
 * - POST: Status updates (sent, delivered, read) - acknowledged silently
 */
webhookRoutes.route("/whatsapp", whatsappWebhookRoutes);

/**
 * Email webhooks - /api/webhooks/email/:applicationId
 *
 * Handles:
 * - GET: Health check
 * - POST: Incoming emails from Postmark (per-app or global)
 */
webhookRoutes.route("/email", emailWebhookRoutes);

/**
 * Health check for webhooks
 * Can be used to verify webhook endpoints are reachable
 */
webhookRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    webhooks: ["stripe", "twilio", "slack", "whatsapp", "email"],
    timestamp: new Date().toISOString(),
  });
});
