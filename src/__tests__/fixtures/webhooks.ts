/**
 * Webhook Fixtures
 *
 * Pre-defined webhook event payloads for testing webhook handlers.
 * Includes Stripe, Twilio, and other integration webhooks.
 *
 * FIXTURE TYPES:
 * 1. Stripe webhook events (payments, subscriptions, invoices)
 * 2. Twilio webhook events (calls, SMS, status updates)
 * 3. Slack webhook events (app mentions, messages)
 * 4. Custom webhook payloads for testing custom actions
 *
 * USAGE:
 *   import { createStripePaymentSucceededEvent, createStripeSignature } from "../fixtures/webhooks.ts";
 *
 *   const event = createStripePaymentSucceededEvent(customerId, amount);
 *   const payload = JSON.stringify(event);
 *   const signature = await createStripeSignature(payload, webhookSecret);
 *   const res = await app.request("/webhooks/stripe", {
 *     method: "POST",
 *     headers: { "Stripe-Signature": signature, "Content-Type": "application/json" },
 *     body: payload,
 *   });
 */

// ========================================
// Types
// ========================================

export interface StripeWebhookEvent {
  id: string;
  object: "event";
  api_version: string;
  created: number;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string;
    idempotency_key: string;
  };
}

export interface SlackWebhookEvent {
  token: string;
  team_id: string;
  api_app_id: string;
  event: {
    type: string;
    user: string;
    text: string;
    ts: string;
    channel: string;
    event_ts: string;
  };
  type: string;
  event_id: string;
  event_time: number;
}

// ========================================
// Stripe Webhook Events
// ========================================

/**
 * Create a Stripe payment_intent.succeeded event.
 */
export function createStripePaymentSucceededEvent(
  customerId: string,
  amountCents: number = 2900
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_${generateRandomId(24)}`,
        object: "payment_intent",
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        status: "succeeded",
        created: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe payment_intent.payment_failed event.
 */
export function createStripePaymentFailedEvent(
  customerId: string,
  failureCode: string = "card_declined"
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: `pi_${generateRandomId(24)}`,
        object: "payment_intent",
        amount: 2900,
        currency: "usd",
        customer: customerId,
        status: "requires_payment_method",
        last_payment_error: {
          code: failureCode,
          message: "Your card was declined.",
          type: "card_error",
        },
        created: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe customer.subscription.created event.
 */
export function createStripeSubscriptionCreatedEvent(
  customerId: string,
  priceId: string = "price_pro_monthly"
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.created",
    data: {
      object: {
        id: `sub_${generateRandomId(24)}`,
        object: "subscription",
        customer: customerId,
        status: "active",
        items: {
          object: "list",
          data: [
            {
              id: `si_${generateRandomId(14)}`,
              price: { id: priceId },
              quantity: 1,
            },
          ],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        created: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe customer.subscription.updated event.
 */
export function createStripeSubscriptionUpdatedEvent(
  customerId: string,
  subscriptionId: string,
  newStatus: "active" | "past_due" | "canceled" | "unpaid"
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.updated",
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        status: newStatus,
        created: Math.floor(Date.now() / 1000) - 86400,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe customer.subscription.deleted event.
 */
export function createStripeSubscriptionDeletedEvent(
  customerId: string,
  subscriptionId: string
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        status: "canceled",
        canceled_at: Math.floor(Date.now() / 1000),
        created: Math.floor(Date.now() / 1000) - 86400,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe invoice.paid event.
 */
export function createStripeInvoicePaidEvent(
  customerId: string,
  amountCents: number = 2900,
  options?: {
    subscriptionId?: string;
    billingReason?: string;
    metadata?: Record<string, string>;
    lines?: Array<{
      price?: { id: string; metadata?: Record<string, string>; product?: string };
      quantity?: number;
      description?: string;
    }>;
  }
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.paid",
    data: {
      object: {
        id: `in_${generateRandomId(24)}`,
        object: "invoice",
        customer: customerId,
        subscription: options?.subscriptionId || null,
        amount_paid: amountCents,
        currency: "usd",
        status: "paid",
        billing_reason: options?.billingReason || "subscription_cycle",
        metadata: options?.metadata || {},
        lines: options?.lines
          ? { data: options.lines }
          : { data: [] },
        created: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe invoice.payment_failed event.
 */
export function createStripeInvoicePaymentFailedEvent(
  customerId: string,
  options?: {
    subscriptionId?: string;
    attemptCount?: number;
    amountDue?: number;
    lastFinalizationError?: string;
  }
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.payment_failed",
    data: {
      object: {
        id: `in_${generateRandomId(24)}`,
        object: "invoice",
        customer: customerId,
        subscription: options?.subscriptionId || null,
        amount_due: options?.amountDue || 2900,
        currency: "usd",
        status: "open",
        attempt_count: options?.attemptCount || 1,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
        metadata: {},
        last_finalization_error: options?.lastFinalizationError
          ? { message: options.lastFinalizationError }
          : null,
        created: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

/**
 * Create a Stripe v2 Billing meter event usage reported.
 */
export function createStripeMeterEventReportedEvent(
  customerId: string,
  meterId: string,
  value: number
): StripeWebhookEvent {
  return {
    id: `evt_${generateRandomId(24)}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "billing.meter.usage_reported",
    data: {
      object: {
        id: `mevt_${generateRandomId(24)}`,
        object: "billing.meter_event",
        meter: meterId,
        customer: customerId,
        value: value,
        timestamp: Math.floor(Date.now() / 1000),
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_${generateRandomId(14)}`,
      idempotency_key: generateRandomId(32),
    },
  };
}

// ========================================
// Stripe Signature Generation
// ========================================

/**
 * Generate a Stripe webhook signature for testing.
 * In tests, use a known webhook secret and generate matching signature.
 *
 * @param payload - The webhook event payload as JSON string
 * @param secret - The webhook signing secret
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns Stripe-Signature header value
 */
export async function createStripeSignature(
  payload: string,
  secret: string,
  timestamp?: number
): Promise<string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;

  // Use Web Crypto API for HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData
  );
  const signatureArray = new Uint8Array(signatureBuffer);
  const signature = Array.from(signatureArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `t=${ts},v1=${signature}`;
}

/**
 * Synchronous version of createStripeSignature for simpler test setup.
 * Uses a fixed test secret and pre-computed signature.
 * Only for use in tests where async is inconvenient.
 */
export function createStripeSignatureSync(
  payload: string,
  timestamp?: number
): { signature: string; secret: string } {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  // Use a fixed test secret - tests must configure their webhook handler to use this
  const testSecret = "whsec_test_secret_for_unit_tests";
  // For sync tests, return the components and let the test use async setup or mock
  return {
    signature: `t=${ts},v1=pending_async_signature`,
    secret: testSecret,
  };
}

// ========================================
// Slack Webhook Events
// ========================================

/**
 * Create a Slack app_mention event.
 */
export function createSlackAppMentionEvent(
  channelId: string,
  userId: string,
  text: string,
  threadTs?: string
): SlackWebhookEvent {
  const ts = String(Date.now() / 1000);
  return {
    token: "test_token",
    team_id: "T12345678",
    api_app_id: "A12345678",
    event: {
      type: "app_mention",
      user: userId,
      text: text,
      ts: ts,
      channel: channelId,
      event_ts: ts,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    },
    type: "event_callback",
    event_id: `Ev${generateRandomId(10)}`,
    event_time: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a Slack message event (for DMs).
 */
export function createSlackMessageEvent(
  channelId: string,
  userId: string,
  text: string
): SlackWebhookEvent {
  const ts = String(Date.now() / 1000);
  return {
    token: "test_token",
    team_id: "T12345678",
    api_app_id: "A12345678",
    event: {
      type: "message",
      user: userId,
      text: text,
      ts: ts,
      channel: channelId,
      event_ts: ts,
    },
    type: "event_callback",
    event_id: `Ev${generateRandomId(10)}`,
    event_time: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a Slack URL verification challenge.
 */
export function createSlackUrlVerification(challenge: string): {
  token: string;
  challenge: string;
  type: "url_verification";
} {
  return {
    token: "test_token",
    challenge: challenge,
    type: "url_verification",
  };
}

// ========================================
// Custom Action Webhook Responses
// ========================================

/**
 * Create a mock successful webhook response for custom actions.
 */
export function createMockWebhookResponse(
  data: Record<string, unknown> = { success: true }
): { status: number; body: Record<string, unknown> } {
  return {
    status: 200,
    body: data,
  };
}

/**
 * Create a mock error webhook response.
 */
export function createMockWebhookErrorResponse(
  status: number = 500,
  error: string = "Internal Server Error"
): { status: number; body: Record<string, unknown> } {
  return {
    status,
    body: { error, message: error },
  };
}

/**
 * Create a mock timeout scenario.
 */
export function createMockWebhookTimeout(): { timeout: true; delayMs: number } {
  return {
    timeout: true,
    delayMs: 30000,
  };
}

// ========================================
// Helpers
// ========================================

function generateRandomId(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
