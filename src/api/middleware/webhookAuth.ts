/**
 * Webhook Authentication Middleware
 *
 * Signature verification for external webhook providers.
 * These middlewares verify that requests are authentic before processing.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { timingSafeEqual } from "node:crypto";
import { log } from "@/lib/logger.ts";

// ========================================
// Types
// ========================================

/**
 * Context for webhook requests
 * Includes the raw body for signature verification
 */
export interface WebhookContext {
  Variables: {
    requestId: string;
    rawBody: string;
  };
}

// ========================================
// Stripe Webhook Middleware
// ========================================

// Read webhook secrets at request time (not module load time) so tests can set them after import
function getStripeWebhookSecret(): string | undefined {
  return Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE");
}
function getStripeWebhookSecretTest(): string | undefined {
  return Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST");
}

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
 * Stripe webhook verification middleware
 *
 * Verifies the stripe-signature header using HMAC-SHA256.
 * Must receive the raw request body (not parsed JSON).
 */
export const stripeWebhookMiddleware = createMiddleware<WebhookContext>(
  async (c, next) => {
    const signatureHeader = c.req.header("stripe-signature");

    if (!signatureHeader) {
      throw new HTTPException(401, {
        message: "Missing stripe-signature header",
      });
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text();
    c.set("rawBody", rawBody);

    // Determine if this is a test mode webhook
    const isTestMode = c.req.query("testMode") === "true";
    const webhookSecret = isTestMode
      ? getStripeWebhookSecretTest()
      : getStripeWebhookSecret();

    if (!webhookSecret) {
      log.error("Stripe webhook secret not configured", {
        source: "webhook-auth",
        feature: "stripe",
        isTestMode,
        endpoint: c.req.path,
      });
      throw new HTTPException(500, {
        message: "Webhook secret not configured",
      });
    }

    // Parse signature header
    const parsed = parseStripeSignatureHeader(signatureHeader);
    if (!parsed) {
      throw new HTTPException(401, {
        message: "Invalid stripe-signature header format",
      });
    }

    const { timestamp, signatures } = parsed;

    // Check timestamp tolerance (5 minutes)
    const timestampSeconds = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - timestampSeconds) > tolerance) {
      throw new HTTPException(401, {
        message: "Webhook timestamp outside tolerance window",
      });
    }

    // Compute expected signature
    const expectedSignature = await computeStripeSignature(
      rawBody,
      timestamp,
      webhookSecret
    );

    // Compare signatures (timing-safe)
    const encoder = new TextEncoder();
    const expectedBytes = encoder.encode(expectedSignature);
    let isValid = false;

    for (const sig of signatures) {
      const sigBytes = encoder.encode(sig);
      if (
        sigBytes.length === expectedBytes.length &&
        timingSafeEqual(sigBytes, expectedBytes)
      ) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      throw new HTTPException(401, {
        message: "Invalid webhook signature",
      });
    }

    await next();
  }
);

// ========================================
// Firecrawl Webhook Middleware
// ========================================

function getFirecrawlWebhookSecret(): string | undefined {
  return Deno.env.get("FIRECRAWL_WEBHOOK_SECRET");
}

/**
 * Firecrawl webhook verification middleware
 *
 * Verifies the X-Firecrawl-Signature header: sha256=<hmac_hex>
 * HMAC-SHA256 of the raw body using FIRECRAWL_WEBHOOK_SECRET.
 */
export const firecrawlWebhookMiddleware = createMiddleware<WebhookContext>(
  async (c, next) => {
    const rawBody = await c.req.text();
    c.set("rawBody", rawBody);

    const secret = getFirecrawlWebhookSecret();

    // In dev mode without a secret, skip verification
    if (!secret) {
      const env = Deno.env.get("ENVIRONMENT") || "development";
      if (env === "development") {
        log.warn("Firecrawl webhook secret not configured, skipping verification in dev", {
          source: "webhook-auth",
          feature: "firecrawl",
        });
        return next();
      }
      log.error("Firecrawl webhook secret not configured", {
        source: "webhook-auth",
        feature: "firecrawl",
        endpoint: c.req.path,
      });
      throw new HTTPException(500, {
        message: "Webhook secret not configured",
      });
    }

    const signatureHeader = c.req.header("X-Firecrawl-Signature");
    if (!signatureHeader) {
      throw new HTTPException(401, {
        message: "Missing X-Firecrawl-Signature header",
      });
    }

    // Parse "sha256=<hex>"
    const match = signatureHeader.match(/^sha256=([a-f0-9]+)$/i);
    if (!match) {
      throw new HTTPException(401, {
        message: "Invalid signature format",
      });
    }
    const receivedSig = match[1];

    // Compute expected HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expectedSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Timing-safe comparison
    const expectedBytes = encoder.encode(expectedSig);
    const receivedBytes = encoder.encode(receivedSig);

    if (
      expectedBytes.length !== receivedBytes.length ||
      !timingSafeEqual(expectedBytes, receivedBytes)
    ) {
      throw new HTTPException(401, {
        message: "Invalid Firecrawl webhook signature",
      });
    }

    await next();
  }
);

// ========================================
// Twilio Webhook Middleware
// ========================================

// Read at request time for testability
function getTwilioAuthToken(): string | undefined {
  return Deno.env.get("TWILIO_AUTH_TOKEN");
}

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

// ========================================
// Slack Webhook Middleware
// ========================================

/**
 * Compute HMAC-SHA256 signature for Slack webhook verification
 * Format: v0={hash}
 */
async function computeSlackSignature(
  rawBody: string,
  timestamp: string,
  signingSecret: string
): Promise<string> {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(sigBasestring)
  );
  return (
    "v0=" +
    Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Slack webhook verification middleware
 *
 * Verifies the X-Slack-Signature header using HMAC-SHA256.
 * URL verification challenges bypass signature check since they occur
 * during initial setup before signing secret may be configured.
 */
export const slackWebhookMiddleware = createMiddleware<WebhookContext>(
  async (c, next) => {
    // Get raw body first for signature verification
    const rawBody = await c.req.text();
    c.set("rawBody", rawBody);

    // Parse payload to check for URL verification
    let payload: { type?: string; challenge?: string };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON payload" });
    }

    // URL verification doesn't require signature check (initial setup)
    if (payload.type === "url_verification") {
      return next();
    }

    // Get signature headers
    const slackSignature = c.req.header("X-Slack-Signature");
    const timestamp = c.req.header("X-Slack-Request-Timestamp");

    if (!slackSignature || !timestamp) {
      throw new HTTPException(401, {
        message: "Missing Slack signature headers",
      });
    }

    // Check timestamp tolerance (5 minutes) to prevent replay attacks
    const timestampSeconds = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = 300; // 5 minutes

    if (Math.abs(now - timestampSeconds) > tolerance) {
      throw new HTTPException(401, {
        message: "Slack request timestamp outside tolerance window",
      });
    }

    // Signing secret will be resolved per-installation in the handler
    // For now, store context and let the handler verify with the correct secret
    // The actual signature verification happens in the route handler
    // since we need to look up the installation-specific signing secret

    await next();
  }
);

/**
 * Verify Slack signature with a specific signing secret
 * Called by route handlers after looking up the installation
 */
export async function verifySlackSignature(
  rawBody: string,
  timestamp: string,
  slackSignature: string,
  signingSecret: string
): Promise<boolean> {
  if (!signingSecret) return false;

  // Check timestamp tolerance (5 minutes)
  const timestampSeconds = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300;

  if (Math.abs(now - timestampSeconds) > tolerance) return false;

  const expectedSignature = await computeSlackSignature(
    rawBody,
    timestamp,
    signingSecret
  );

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expectedSignature);
  const receivedBytes = encoder.encode(slackSignature);

  if (expectedBytes.length !== receivedBytes.length) return false;

  try {
    return timingSafeEqual(expectedBytes, receivedBytes);
  } catch {
    return false;
  }
}

// ========================================
// Twilio Webhook Middleware
// ========================================

/**
 * Twilio webhook verification middleware
 *
 * Verifies the X-Twilio-Signature header using HMAC-SHA1.
 * Twilio sends form-urlencoded data.
 */
export const twilioWebhookMiddleware = createMiddleware<WebhookContext>(
  async (c, next) => {
    const twilioSignature = c.req.header("X-Twilio-Signature");

    if (!twilioSignature) {
      throw new HTTPException(401, {
        message: "Missing X-Twilio-Signature header",
      });
    }

    const twilioAuthToken = getTwilioAuthToken();
    if (!twilioAuthToken) {
      log.error("Twilio auth token not configured", {
        source: "webhook-auth",
        feature: "twilio",
        endpoint: c.req.path,
      });
      throw new HTTPException(500, {
        message: "Twilio auth token not configured",
      });
    }

    // Get raw body and parse as form data
    const rawBody = await c.req.text();
    c.set("rawBody", rawBody);

    // Parse form-urlencoded body
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(rawBody);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    // Get the full URL for signature verification
    const url = c.req.url;

    // Compute expected signature
    const expectedSignature = await computeTwilioSignature(
      url,
      params,
      twilioAuthToken
    );

    // Compare signatures (timing-safe)
    const encoder = new TextEncoder();
    const expectedBytes = encoder.encode(expectedSignature);
    const receivedBytes = encoder.encode(twilioSignature);

    if (
      expectedBytes.length !== receivedBytes.length ||
      !timingSafeEqual(expectedBytes, receivedBytes)
    ) {
      throw new HTTPException(401, {
        message: "Invalid Twilio signature",
      });
    }

    await next();
  }
);
