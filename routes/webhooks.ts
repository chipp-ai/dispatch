/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services.
 */

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
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
      console.error("[webhook] Invalid Stripe signature");
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const event = JSON.parse(body);

    switch (event.type) {
      case "checkout.session.completed":
        // Handle successful checkout
        console.log("[webhook] Checkout completed:", event.data.object.id);
        break;

      case "customer.subscription.updated":
        // Handle subscription update
        console.log("[webhook] Subscription updated:", event.data.object.id);
        break;

      case "customer.subscription.deleted":
        // Handle subscription cancellation
        console.log("[webhook] Subscription deleted:", event.data.object.id);
        break;

      case "invoice.payment_failed":
        // Handle failed payment
        console.log("[webhook] Payment failed:", event.data.object.id);
        break;

      default:
        console.log("[webhook] Unhandled event type:", event.type);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("[webhook] Stripe webhook error:", error);
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
    console.error("[webhook] TWILIO_AUTH_TOKEN not configured");
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
      console.error("[webhook] Invalid Twilio voice signature");
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const callSid = params["CallSid"] || "";
    const from = params["From"] || "";
    const to = params["To"] || "";
    const callStatus = params["CallStatus"] || "";

    console.log("[webhook] Twilio voice:", { callSid, from, to, callStatus });

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
    console.error("[webhook] Twilio webhook error:", error);
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
    console.error("[webhook] TWILIO_AUTH_TOKEN not configured");
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
      console.error("[webhook] Invalid Twilio WhatsApp signature");
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const messageSid = params["MessageSid"] || "";
    const from = params["From"] || "";
    const messageBody = params["Body"] || "";

    console.log("[webhook] WhatsApp message:", {
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
    console.error("[webhook] WhatsApp webhook error:", error);
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
          console.log("[webhook] Slack message:", event.text);
          break;

        case "app_mention":
          // Handle @mention
          console.log("[webhook] Slack mention:", event.text);
          break;

        default:
          console.log("[webhook] Unhandled Slack event:", event.type);
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error("[webhook] Slack webhook error:", error);
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

    console.log(`[webhook] Custom webhook ${webhookId}:`, body);

    // TODO: Look up webhook configuration and process accordingly

    return c.json({ received: true, webhookId });
  } catch (error) {
    console.error(`[webhook] Custom webhook ${webhookId} error:`, error);
    return c.json({ error: "Webhook processing failed" }, 400);
  }
});
