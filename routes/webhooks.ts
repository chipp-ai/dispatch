/**
 * @deprecated This webhook handler is deprecated.
 * Use /api/webhooks/stripe instead (src/api/routes/webhooks/stripe.ts)
 * This file is kept for reference only.
 *
 * The primary webhook handler provides:
 * - Full billing service integration
 * - Better error handling
 * - Support for live/test mode via STRIPE_WEBHOOK_SECRET_LIVE and STRIPE_WEBHOOK_SECRET_TEST
 * - More comprehensive event handling
 *
 * Migration: Update your Stripe webhook endpoint from:
 *   https://your-domain.com/webhooks/stripe
 * to:
 *   https://your-domain.com/api/webhooks/stripe
 */

/**
 * Webhook Routes (LEGACY)
 *
 * Handles incoming webhooks from external services.
 */

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { log } from "@/lib/logger.ts";
import type { AppEnv } from "../types.ts";

export const webhooks = new Hono<AppEnv>();

// ============================================================
// Stripe Signature Verification
// ============================================================

/**
 * Compute HMAC-SHA256 signature for Stripe webhook verification
 */
async function computeStripeSignature(
  payload: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse Stripe signature header
 * Format: t=timestamp,v1=signature,v1=signature2,...
 */
function parseStripeSignatureHeader(
  header: string
): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

/**
 * Verify Stripe webhook signature
 */
async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const { timestamp, signatures } = parsed;

  // Check timestamp tolerance (5 minutes)
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300;

  if (Math.abs(now - timestampSeconds) > tolerance) {
    return false;
  }

  // Compute expected signature
  const expectedSignature = await computeStripeSignature(
    body,
    timestamp,
    secret
  );

  // Compare signatures (timing-safe)
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expectedSignature);

  for (const sig of signatures) {
    const sigBytes = encoder.encode(sig);
    if (
      sigBytes.length === expectedBytes.length &&
      timingSafeEqual(sigBytes, expectedBytes)
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================
// Twilio Signature Verification
// ============================================================

/**
 * Compute HMAC-SHA1 signature for Twilio webhook verification
 */
async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string
): Promise<string> {
  // Sort parameters and concatenate
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));

  // Twilio expects base64-encoded signature
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify Twilio webhook signature
 */
async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): Promise<boolean> {
  const expectedSignature = await computeTwilioSignature(
    url,
    params,
    authToken
  );

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expectedSignature);
  const receivedBytes = encoder.encode(signature);

  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

// ============================================================
// Stripe Webhooks
// ============================================================

webhooks.post("/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    return c.json({ error: "Missing signature or webhook secret" }, 400);
  }

  try {
    const body = await c.req.text();

    // Verify Stripe webhook signature
    const isValid = await verifyStripeSignature(body, signature, webhookSecret);
    if (!isValid) {
      log.warn("Invalid Stripe webhook signature", {
        source: "webhook",
        feature: "stripe",
      });
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const event = JSON.parse(body);

    switch (event.type) {
      case "checkout.session.completed":
        // Handle successful checkout
        log.info("Checkout completed", {
          source: "webhook",
          feature: "stripe",
          objectId: event.data.object.id,
        });
        break;

      case "customer.subscription.updated":
        // Handle subscription update
        log.info("Subscription updated", {
          source: "webhook",
          feature: "stripe",
          objectId: event.data.object.id,
        });
        break;

      case "customer.subscription.deleted":
        // Handle subscription cancellation
        log.info("Subscription deleted", {
          source: "webhook",
          feature: "stripe",
          objectId: event.data.object.id,
        });
        break;

      case "invoice.payment_failed":
        // Handle failed payment
        log.info("Payment failed", {
          source: "webhook",
          feature: "stripe",
          objectId: event.data.object.id,
        });
        break;

      default:
        log.info("Unhandled Stripe event type", {
          source: "webhook",
          feature: "stripe",
          eventType: event.type,
        });
    }

    return c.json({ received: true });
  } catch (error) {
    log.error("Stripe webhook error", { source: "webhook", feature: "stripe" }, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});

// ============================================================
// Twilio Webhooks (Voice)
// ============================================================

webhooks.post("/twilio/voice", async (c) => {
  const twilioSignature = c.req.header("x-twilio-signature");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioSignature) {
    return c.json({ error: "Missing Twilio signature" }, 400);
  }

  if (!authToken) {
    log.error("TWILIO_AUTH_TOKEN not configured", {
      source: "webhook",
      feature: "twilio-voice",
    });
    return c.json({ error: "Webhook verification not configured" }, 500);
  }

  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // Parse form-urlencoded body
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(rawBody);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    // Verify Twilio signature
    const isValid = await verifyTwilioSignature(
      c.req.url,
      params,
      twilioSignature,
      authToken
    );

    if (!isValid) {
      log.warn("Invalid Twilio voice signature", {
        source: "webhook",
        feature: "twilio-voice",
      });
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const callSid = params["CallSid"] || "";
    const from = params["From"] || "";
    const to = params["To"] || "";
    const callStatus = params["CallStatus"] || "";

    log.info("Twilio voice webhook", {
      source: "webhook",
      feature: "twilio-voice",
      callSid,
      from,
      to,
      callStatus,
    });

    // TODO: Implement voice call handling
    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. This feature is coming soon.</Say>
</Response>`;

    return c.text(twiml, 200, {
      "Content-Type": "application/xml",
    });
  } catch (error) {
    log.error("Twilio voice webhook error", {
      source: "webhook",
      feature: "twilio-voice",
    }, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});

// ============================================================
// Twilio Webhooks (WhatsApp)
// ============================================================

webhooks.post("/twilio/whatsapp", async (c) => {
  const twilioSignature = c.req.header("x-twilio-signature");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioSignature) {
    return c.json({ error: "Missing Twilio signature" }, 400);
  }

  if (!authToken) {
    log.error("TWILIO_AUTH_TOKEN not configured", {
      source: "webhook",
      feature: "twilio-whatsapp",
    });
    return c.json({ error: "Webhook verification not configured" }, 500);
  }

  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // Parse form-urlencoded body
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(rawBody);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    // Verify Twilio signature
    const isValid = await verifyTwilioSignature(
      c.req.url,
      params,
      twilioSignature,
      authToken
    );

    if (!isValid) {
      log.warn("Invalid Twilio WhatsApp signature", {
        source: "webhook",
        feature: "twilio-whatsapp",
      });
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const messageSid = params["MessageSid"] || "";
    const from = params["From"] || "";
    const messageBody = params["Body"] || "";

    log.info("WhatsApp message received", {
      source: "webhook",
      feature: "twilio-whatsapp",
      messageSid,
      from,
      body: messageBody,
    });

    // TODO: Implement WhatsApp message handling
    // Return empty TwiML for now
    return c.text(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      200,
      { "Content-Type": "application/xml" }
    );
  } catch (error) {
    log.error("WhatsApp webhook error", {
      source: "webhook",
      feature: "twilio-whatsapp",
    }, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});

// ============================================================
// Slack Webhooks
// ============================================================

webhooks.post("/slack/events", async (c) => {
  try {
    const body = await c.req.json();

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      return c.json({ challenge: body.challenge });
    }

    // Handle events
    if (body.type === "event_callback") {
      const event = body.event;

      switch (event.type) {
        case "message":
          // Handle incoming message
          log.info("Slack message received", {
            source: "webhook",
            feature: "slack",
            text: event.text,
          });
          break;

        case "app_mention":
          // Handle @mention
          log.info("Slack mention received", {
            source: "webhook",
            feature: "slack",
            text: event.text,
          });
          break;

        default:
          log.info("Unhandled Slack event type", {
            source: "webhook",
            feature: "slack",
            eventType: event.type,
          });
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    log.error("Slack webhook error", { source: "webhook", feature: "slack" }, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});

// ============================================================
// Generic Webhook Handler (for custom integrations)
// ============================================================

webhooks.post("/custom/:webhookId", async (c) => {
  const webhookId = c.req.param("webhookId");

  try {
    const body = await c.req.json();

    log.info("Custom webhook received", {
      source: "webhook",
      feature: "custom",
      webhookId,
      body,
    });

    // TODO: Look up webhook configuration and process accordingly

    return c.json({ received: true, webhookId });
  } catch (error) {
    log.error("Custom webhook error", {
      source: "webhook",
      feature: "custom",
      webhookId,
    }, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});
