/**
 * Dev Routes
 *
 * Development-only endpoints for testing and debugging.
 * Only mounted in development and staging environments.
 *
 * NOTE: These routes do NOT require authentication. They are designed to be
 * called by MCP tools (dev_set_tier, dev_reset_credits, etc.) which run
 * outside the browser and don't have access to auth cookies.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../db/client.ts";
import {
  getUserConnectionCount,
  getTotalConnectionCount,
  getConnectedUserIds,
} from "../../../websocket/handler.ts";
import {
  publishToUser,
  publishToSession,
} from "../../../websocket/pubsub.ts";
import { billingService } from "../../../services/billing.service.ts";
import { multiplayerService } from "../../../services/multiplayer.service.ts";

// Email template imports for preview
import { newChat } from "../../../services/notifications/templates/new-chat.ts";
import { consumerSignup } from "../../../services/notifications/templates/consumer-signup.ts";
import { creditLow } from "../../../services/notifications/templates/credit-low.ts";
import { creditExhausted } from "../../../services/notifications/templates/credit-exhausted.ts";
import { paymentFailed } from "../../../services/notifications/templates/payment-failed.ts";
import { workspaceMemberJoined } from "../../../services/notifications/templates/workspace-member-joined.ts";
import { subscriptionChanged } from "../../../services/notifications/templates/subscription-changed.ts";
import { creditPurchase } from "../../../services/notifications/templates/credit-purchase.ts";
import { appEngagement } from "../../../services/notifications/templates/app-engagement.ts";
import type { BrandingParams } from "../../../services/notifications/templates/base-layout.ts";
import { generateAnonymousName, getAvatarColor } from "../../../utils/anonymous-identity.ts";

// Path for app state file (read by MCP tools)
const APP_STATE_FILE = ".scratch/app-state.md";

// Use generic Hono - no auth context required for dev routes
const router = new Hono();

// Helper to validate organization ID exists
// IMPORTANT: No fallback to "first" record - always require explicit ID
async function validateOrganizationId(organizationId?: string): Promise<string | null> {
  if (!organizationId) {
    return null;
  }

  // Verify the organization exists
  const org = await db
    .selectFrom("app.organizations")
    .select(["id"])
    .where("id", "=", organizationId)
    .executeTakeFirst();

  return org?.id || null;
}

// Helper to validate user ID exists
// IMPORTANT: No fallback to "first" record - always require explicit ID
async function validateUserId(userId?: string): Promise<string | null> {
  if (!userId) {
    return null;
  }

  // Verify the user exists
  const user = await db
    .selectFrom("app.users")
    .select(["id"])
    .where("id", "=", userId)
    .executeTakeFirst();

  return user?.id || null;
}

// Valid subscription tiers
const tierSchema = z.object({
  tier: z.enum(["FREE", "PRO", "TEAM", "BUSINESS", "ENTERPRISE"]),
  organizationId: z.string(), // Required - no implicit fallback
});

// Reset credits schema
const resetCreditsSchema = z.object({
  credits: z.number().int().min(0).max(100000).default(100),
  organizationId: z.string(), // Required - no implicit fallback
  userId: z.string().optional(), // Optional - only needed for consumer credits
});

// WebSocket event trigger schema
const wsEventSchema = z.object({
  event: z.enum([
    "message.new",
    "typing.start",
    "typing.stop",
    "credits.updated",
    "subscription.changed",
    "notification.push",
    "conversation.started",
    "conversation.activity",
    "conversation.ended",
  ]),
  payload: z.record(z.unknown()).optional(),
  userId: z.string(), // Required - no implicit fallback
});

// Webhook simulation schema
const webhookSchema = z.object({
  event: z.enum([
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
    "invoice.paid",
    "checkout.session.completed",
    "billing.alert.triggered",
    "charge.dispute.created",
    "charge.dispute.closed",
    "charge.refunded",
  ]),
  data: z.record(z.unknown()).optional(),
  customerId: z.string().optional(), // Stripe customer ID (e.g., cus_xxx) - finds org by this
  organizationId: z.string().optional(), // Organization ID - required if customerId not provided
}).refine(
  (data) => data.customerId || data.organizationId,
  { message: "Either customerId or organizationId is required - no implicit fallback to first record" }
);

// Error injection schema
const injectErrorSchema = z.object({
  type: z.enum(["rate_limit", "auth_failure", "network_timeout", "server_error"]),
  duration: z.number().int().min(0).max(60000).default(5000),
});

// In-memory state for error injection
// Maps error type to expiration timestamp
const injectedErrors = new Map<string, number>();

// Helper to check if an error is currently injected
export function isErrorInjected(type: string): boolean {
  const expiration = injectedErrors.get(type);
  if (!expiration) return false;
  if (Date.now() > expiration) {
    injectedErrors.delete(type);
    return false;
  }
  return true;
}

// Get all currently injected errors (for middleware)
export function getInjectedErrors(): string[] {
  const now = Date.now();
  const active: string[] = [];
  for (const [type, expiration] of injectedErrors.entries()) {
    if (now <= expiration) {
      active.push(type);
    } else {
      injectedErrors.delete(type);
    }
  }
  return active;
}

/**
 * POST /api/dev/set-tier
 *
 * Update the subscription tier for an organization.
 * Only available in development and staging environments.
 *
 * Can specify organizationId in body, or defaults to first organization.
 */
router.post("/set-tier", zValidator("json", tierSchema), async (c) => {
  // Double-check environment - never allow in production
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { tier, organizationId: requestedOrgId } = c.req.valid("json");

  try {
    // Get target organization (from request or default to first)
    const organizationId = await validateOrganizationId(requestedOrgId);
    if (!organizationId) {
      return c.json({ error: "No organization found. Create an organization first." }, 404);
    }

    // Update the organization's subscription tier
    const result = await db
      .updateTable("app.organizations")
      .set({
        subscriptionTier: tier,
        updatedAt: new Date(),
      })
      .where("id", "=", organizationId)
      .returning([
        "id",
        "name",
        "subscriptionTier",
        "createdAt",
        "updatedAt",
      ])
      .executeTakeFirst();

    if (!result) {
      return c.json({ error: "Organization not found" }, 404);
    }

    return c.json({
      data: result,
      message: `Subscription tier updated to ${tier}`,
    });
  } catch (error) {
    console.error("Failed to update subscription tier:", error);
    return c.json({ error: "Failed to update subscription tier" }, 500);
  }
});

/**
 * GET /api/dev/info
 *
 * Get current development environment info.
 * Query params: ?userId=xxx&organizationId=xxx (both optional, returns null if not provided)
 */
router.get("/info", async (c) => {
  const queryUserId = c.req.query("userId");
  const queryOrgId = c.req.query("organizationId");

  const userId = queryUserId ? await validateUserId(queryUserId) : null;
  const organizationId = queryOrgId ? await validateOrganizationId(queryOrgId) : null;

  return c.json({
    environment: Deno.env.get("ENVIRONMENT") || "unknown",
    userId,
    organizationId,
    features: {
      devPanel: true,
    },
  });
});

/**
 * GET /api/dev/stripe-info
 *
 * Get Stripe environment info for the DevPanel.
 * Returns mode (test/live), customer ID, and dashboard URLs.
 * Query param: ?organizationId=xxx (required to get org-specific info)
 */
router.get("/stripe-info", async (c) => {
  const queryOrgId = c.req.query("organizationId");
  const organizationId = queryOrgId ? await validateOrganizationId(queryOrgId) : null;

  // Determine Stripe mode from environment
  const isTestMode =
    Deno.env.get("USE_STRIPE_TEST_MODE") === "true" ||
    Deno.env.get("ENVIRONMENT") !== "production";

  const mode = isTestMode ? "test" : "live";
  const dashboardBase = isTestMode
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";

  try {
    if (!organizationId) {
      return c.json({
        mode,
        customerId: null,
        dashboardUrl: dashboardBase,
        customerUrl: null,
      });
    }

    // Get the organization's Stripe customer ID
    const org = await db
      .selectFrom("app.organizations")
      .select(["stripeCustomerId"])
      .where("id", "=", organizationId)
      .executeTakeFirst();

    const customerId = org?.stripeCustomerId || null;

    return c.json({
      mode,
      customerId,
      dashboardUrl: dashboardBase,
      customerUrl: customerId ? `${dashboardBase}/customers/${customerId}` : null,
    });
  } catch (error) {
    console.error("Failed to fetch Stripe info:", error);
    return c.json({
      mode,
      customerId: null,
      dashboardUrl: dashboardBase,
      customerUrl: null,
    });
  }
});

/**
 * GET /api/dev/ws-status
 *
 * Get WebSocket connection status for the DevPanel.
 * Returns connection counts and connected user IDs.
 * Query param: ?userId=xxx (optional, to get user-specific connection count)
 */
router.get("/ws-status", async (c) => {
  const queryUserId = c.req.query("userId");
  const userId = queryUserId ? await validateUserId(queryUserId) : null;

  return c.json({
    userConnections: userId ? getUserConnectionCount(userId) : 0,
    totalConnections: getTotalConnectionCount(),
    connectedUserIds: getConnectedUserIds(),
  });
});

// Schema for app state updates from the SPA
const appStateSchema = z.object({
  state: z.object({
    timestamp: z.string(),
    route: z.object({
      hash: z.string(),
      path: z.string(),
      params: z.record(z.string()),
    }),
    user: z.object({
      id: z.string().nullable(),
      email: z.string().nullable(),
      name: z.string().nullable(),
    }).nullable(),
    organization: z.object({
      id: z.unknown(),
      name: z.unknown(),
      subscriptionTier: z.unknown(),
    }).nullable(),
    workspace: z.object({
      id: z.unknown(),
      name: z.unknown(),
    }).nullable(),
    modelOverride: z.string().nullable(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }),
    stores: z.array(z.object({
      name: z.string(),
      value: z.unknown(),
    })),
  }),
  markdown: z.string(),
});

/**
 * POST /api/dev/app-state
 *
 * Receive app state from the SPA and write it to a file for MCP tools.
 * The SPA sends its current state periodically, and this endpoint
 * writes it to .scratch/app-state.md for the MCP dev-server to read.
 */
router.post("/app-state", zValidator("json", appStateSchema), async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { markdown } = c.req.valid("json");

  try {
    // Ensure .scratch directory exists
    try {
      await Deno.mkdir(".scratch", { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Write the markdown state file
    await Deno.writeTextFile(APP_STATE_FILE, markdown);

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to write app state:", error);
    return c.json({ error: "Failed to write app state" }, 500);
  }
});

/**
 * GET /api/dev/app-state
 *
 * Read the current app state markdown file.
 * Returns the markdown content for debugging.
 */
router.get("/app-state", async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  try {
    const markdown = await Deno.readTextFile(APP_STATE_FILE);
    return c.text(markdown, 200, {
      "Content-Type": "text/markdown",
    });
  } catch {
    return c.text("# No App State\n\nApp state has not been captured yet. Open the SPA to populate this.", 200, {
      "Content-Type": "text/markdown",
    });
  }
});

/**
 * POST /api/dev/reset-credits
 *
 * Reset consumer credits for testing credit exhaustion flows.
 * Note: This is a stub implementation. In production, credit balances
 * are managed by Stripe. This endpoint simulates the behavior for testing.
 */
router.post("/reset-credits", zValidator("json", resetCreditsSchema), async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { credits, organizationId: requestedOrgId, userId: requestedUserId } = c.req.valid("json");

  try {
    // Get target organization and user
    const organizationId = await validateOrganizationId(requestedOrgId);
    const userId = await validateUserId(requestedUserId);

    if (!organizationId) {
      return c.json({ error: "No organization found. Create an organization first." }, 404);
    }

    // Get the organization
    const org = await db
      .selectFrom("app.organizations")
      .select(["id", "name", "stripeCustomerId"])
      .where("id", "=", organizationId)
      .executeTakeFirst();

    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    // Note: In a real implementation, we would update Stripe credit grants.
    // For dev purposes, we log the action and return success.
    // The credit balance would need to be managed via Stripe's billing API.
    console.log(`[dev] Reset credits for org ${org.id}: ${credits} credits`);

    // Notify connected clients about credit update (if we have a user)
    if (userId) {
      await publishToUser(userId, {
        type: "billing:credits_low",
        balance: credits * 100, // Convert to cents
        threshold: 100, // $1.00 threshold
      });
    }

    return c.json({
      data: {
        organizationId: org.id,
        organizationName: org.name,
        creditsCents: credits * 100,
        message: "Credits reset (simulated for dev)",
      },
      message: `Credits reset to ${credits} for testing`,
    });
  } catch (error) {
    console.error("Failed to reset credits:", error);
    return c.json({ error: "Failed to reset credits" }, 500);
  }
});

/**
 * POST /api/dev/trigger-ws-event
 *
 * Trigger WebSocket events to test real-time UI updates.
 */
router.post("/trigger-ws-event", zValidator("json", wsEventSchema), async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { event, payload, userId: targetUserId } = c.req.valid("json");

  if (!targetUserId) {
    return c.json({ error: "userId is required - no implicit fallback" }, 400);
  }

  const recipientId = await validateUserId(targetUserId);
  if (!recipientId) {
    return c.json({ error: `User not found: ${targetUserId}` }, 404);
  }

  try {
    // Build the WebSocket event based on type
    let wsEvent: Record<string, unknown>;

    switch (event) {
      case "message.new":
        wsEvent = {
          type: "consumer:message",
          sessionId: payload?.sessionId || "test-session-" + Date.now(),
          content: payload?.content || "Test message from dev tools",
          timestamp: new Date().toISOString(),
        };
        break;

      case "typing.start":
        wsEvent = {
          type: "system:notification",
          title: "Typing indicator",
          body: "User is typing...",
          severity: "info",
        };
        break;

      case "typing.stop":
        wsEvent = {
          type: "system:notification",
          title: "Typing indicator",
          body: "User stopped typing",
          severity: "info",
        };
        break;

      case "credits.updated":
        wsEvent = {
          type: "billing:credits_low",
          balance: payload?.balance ?? 500, // $5.00 default
          threshold: payload?.threshold ?? 100, // $1.00 threshold
        };
        break;

      case "subscription.changed":
        wsEvent = {
          type: "system:notification",
          title: "Subscription Updated",
          body: payload?.tier
            ? `Your plan has been updated to ${payload.tier}`
            : "Your subscription has been updated",
          severity: "info",
        };
        break;

      case "notification.push":
        wsEvent = {
          type: "notification:push",
          notificationType: payload?.notificationType || "consumer_signup",
          category: payload?.category || "engagement",
          title: payload?.title || "Test Notification",
          body: payload?.body || "This is a test notification from dev tools",
          data: payload?.data || {},
          actionUrl: payload?.actionUrl,
          actionLabel: payload?.actionLabel,
          timestamp: new Date().toISOString(),
        };
        break;

      case "conversation.started":
        wsEvent = {
          type: "conversation:started",
          sessionId: payload?.sessionId || "test-session-" + Date.now(),
          applicationId: payload?.applicationId || "test-app",
          consumerEmail: payload?.consumerEmail,
          consumerName: payload?.consumerName || "Test User",
          timestamp: new Date().toISOString(),
        };
        break;

      case "conversation.activity":
        wsEvent = {
          type: "conversation:activity",
          sessionId: payload?.sessionId || "test-session-" + Date.now(),
          applicationId: payload?.applicationId || "test-app",
          consumerEmail: payload?.consumerEmail,
          consumerName: payload?.consumerName,
          messagePreview: payload?.messagePreview || "Hello, I have a question...",
          timestamp: new Date().toISOString(),
        };
        break;

      case "conversation.ended":
        wsEvent = {
          type: "conversation:ended",
          sessionId: payload?.sessionId || "test-session-" + Date.now(),
          applicationId: payload?.applicationId || "test-app",
          timestamp: new Date().toISOString(),
        };
        break;

      default:
        return c.json({ error: `Unknown event type: ${event}` }, 400);
    }

    // Publish to the target user
    // Using type assertion through unknown since we're constructing valid event objects dynamically
    const success = await publishToUser(recipientId, wsEvent as unknown as Parameters<typeof publishToUser>[1]);

    return c.json({
      data: {
        event,
        recipientId,
        wsEvent,
        delivered: success,
      },
      message: success
        ? `WebSocket event '${event}' triggered for user ${recipientId}`
        : `Failed to deliver event (user may not be connected)`,
    });
  } catch (error) {
    console.error("Failed to trigger WebSocket event:", error);
    return c.json({ error: "Failed to trigger WebSocket event" }, 500);
  }
});

/**
 * POST /api/dev/simulate-webhook
 *
 * Simulate Stripe webhook events without going through Stripe.
 * Calls the same handlers that real webhooks would trigger.
 */
router.post("/simulate-webhook", zValidator("json", webhookSchema), async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { event, data, customerId: requestedCustomerId, organizationId: requestedOrgId } = c.req.valid("json");

  try {
    let org: { id: string; name: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null } | undefined;

    // If customerId is provided, find org by Stripe customer ID (for testing with real data)
    if (requestedCustomerId) {
      org = await db
        .selectFrom("app.organizations")
        .select(["id", "name", "stripeCustomerId", "stripeSubscriptionId"])
        .where("stripeCustomerId", "=", requestedCustomerId)
        .executeTakeFirst();

      if (!org) {
        // Also check sandbox customer ID
        org = await db
          .selectFrom("app.organizations")
          .select(["id", "name", "stripeCustomerId", "stripeSubscriptionId"])
          .where("stripeSandboxCustomerId" as any, "=", requestedCustomerId)
          .executeTakeFirst();
      }

      if (!org) {
        return c.json({
          error: `No organization found with Stripe customer ID: ${requestedCustomerId}`,
          hint: "Check that this customer ID exists in the database with: SELECT * FROM app.organizations WHERE stripe_customer_id = '...'",
        }, 404);
      }
    } else {
      // Use explicit organizationId (required by schema validation)
      const organizationId = await validateOrganizationId(requestedOrgId);
      if (!organizationId) {
        return c.json({ error: `Organization not found: ${requestedOrgId}` }, 404);
      }

      org = await db
        .selectFrom("app.organizations")
        .select(["id", "name", "stripeCustomerId", "stripeSubscriptionId"])
        .where("id", "=", organizationId)
        .executeTakeFirst();

      if (!org) {
        return c.json({ error: "Organization not found" }, 404);
      }
    }

    const customerId = requestedCustomerId || org.stripeCustomerId || `cus_dev_${org.id}`;
    const subscriptionId = org.stripeSubscriptionId || `sub_dev_${org.id}`;

    // Call the appropriate billing service handler
    switch (event) {
      case "customer.subscription.updated":
        await billingService.handleSubscriptionUpdated({
          subscriptionId: data?.subscriptionId as string || subscriptionId,
          customerId: data?.customerId as string || customerId,
          status: data?.status as string || "active",
          metadata: data?.metadata as Record<string, string> || { organizationId: org.id },
          cancelAtPeriodEnd: data?.cancelAtPeriodEnd as boolean || false,
          previousStatus: data?.previousStatus as string || undefined,
          livemode: false,
        });
        break;

      case "customer.subscription.deleted":
        await billingService.handleSubscriptionDeleted({
          subscriptionId: data?.subscriptionId as string || subscriptionId,
          customerId: data?.customerId as string || customerId,
          metadata: data?.metadata as Record<string, string> || { organizationId: org.id },
          livemode: false,
        });
        break;

      case "invoice.payment_failed":
        await billingService.handleInvoicePaymentFailed({
          invoiceId: data?.invoiceId as string || `inv_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          subscriptionId: data?.subscriptionId as string || subscriptionId,
          metadata: data?.metadata as Record<string, string> || { organizationId: org.id },
          livemode: false,
          attemptCount: data?.attemptCount as number || 1,
          nextPaymentAttempt: data?.nextPaymentAttempt as number || Math.floor(Date.now() / 1000) + 86400,
          amountDue: data?.amountDue as number || 2000, // $20.00 default
          currency: data?.currency as string || "usd",
          lastFinalizationError: data?.lastFinalizationError as string || undefined,
        });
        break;

      case "invoice.paid":
        await billingService.handleInvoicePaid({
          invoiceId: data?.invoiceId as string || `inv_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          subscriptionId: data?.subscriptionId as string || subscriptionId,
          amountPaid: data?.amountPaid as number || 2000, // $20.00 default
          currency: data?.currency as string || "usd",
          metadata: data?.metadata as Record<string, string> || { organizationId: org.id },
          livemode: false,
          billingReason: data?.billingReason as string || "subscription_cycle",
          lines: data?.lines as Array<{
            price?: { id: string; metadata?: Record<string, string>; product?: string };
            quantity?: number;
            description?: string;
          }> || undefined,
        });
        break;

      case "checkout.session.completed":
        await billingService.handleCheckoutCompleted({
          sessionId: data?.sessionId as string || `cs_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          mode: data?.mode as "payment" | "subscription" | "setup" || "payment",
          metadata: data?.metadata as Record<string, string> || { type: "PACKAGE", organizationId: org.id },
          subscriptionId: data?.subscriptionId as string || null,
          paymentIntentId: data?.paymentIntentId as string || `pi_dev_${Date.now()}`,
          livemode: false,
        });
        break;

      case "billing.alert.triggered":
        await billingService.handleBillingAlert({
          alertId: data?.alertId as string || `alert_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          alertType: data?.alertType as string || "credit_balance_threshold",
          title: data?.title as string || undefined,
          thresholdCents: data?.thresholdCents as number || 0,
          livemode: false,
          rawAlert: data as Record<string, unknown> || undefined,
        });
        break;

      case "charge.dispute.created":
        await billingService.handleDisputeCreated({
          disputeId: data?.disputeId as string || `dp_dev_${Date.now()}`,
          chargeId: data?.chargeId as string || `ch_dev_${Date.now()}`,
          paymentIntentId: data?.paymentIntentId as string || undefined,
          customerId: data?.customerId as string || customerId,
          amount: data?.amount as number || 2000,
          currency: data?.currency as string || "usd",
          reason: data?.reason as string || "fraudulent",
          status: data?.status as string || "needs_response",
          evidenceDueBy: data?.evidenceDueBy as number || Math.floor(Date.now() / 1000) + 7 * 86400, // 7 days
          livemode: false,
          metadata: data?.metadata as Record<string, string> || {},
        });
        break;

      case "charge.dispute.closed":
        await billingService.handleDisputeClosed({
          disputeId: data?.disputeId as string || `dp_dev_${Date.now()}`,
          chargeId: data?.chargeId as string || `ch_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          amount: data?.amount as number || 2000,
          status: data?.status as string || "lost",
          livemode: false,
          metadata: data?.metadata as Record<string, string> || {},
        });
        break;

      case "charge.refunded":
        await billingService.handleChargeRefunded({
          chargeId: data?.chargeId as string || `ch_dev_${Date.now()}`,
          refundId: data?.refundId as string || `re_dev_${Date.now()}`,
          customerId: data?.customerId as string || customerId,
          amount: data?.amount as number || 2000,
          currency: data?.currency as string || "usd",
          reason: data?.reason as string || undefined,
          paymentIntentId: data?.paymentIntentId as string || undefined,
          invoiceId: data?.invoiceId as string || undefined,
          livemode: false,
          metadata: data?.metadata as Record<string, string> || {},
        });
        break;

      default:
        return c.json({ error: `Unknown webhook event: ${event}` }, 400);
    }

    return c.json({
      data: {
        event,
        organizationId: org.id,
        customerId,
        subscriptionId,
        simulated: true,
      },
      message: `Webhook '${event}' simulated successfully`,
    });
  } catch (error) {
    console.error("Failed to simulate webhook:", error);
    return c.json({
      error: "Failed to simulate webhook",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

/**
 * POST /api/dev/inject-error
 *
 * Inject errors for testing error handling UI.
 * The injected error will affect API calls for the specified duration.
 */
router.post("/inject-error", zValidator("json", injectErrorSchema), async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { type, duration } = c.req.valid("json");

  // Set the error to expire after the specified duration
  const expiresAt = Date.now() + duration;
  injectedErrors.set(type, expiresAt);

  return c.json({
    data: {
      type,
      duration,
      expiresAt: new Date(expiresAt).toISOString(),
      activeErrors: getInjectedErrors(),
    },
    message: `Error '${type}' injected for ${duration}ms`,
  });
});

/**
 * DELETE /api/dev/inject-error
 *
 * Clear all injected errors.
 */
router.delete("/inject-error", (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const cleared = injectedErrors.size;
  injectedErrors.clear();

  return c.json({
    data: { cleared },
    message: `Cleared ${cleared} injected error(s)`,
  });
});

/**
 * GET /api/dev/inject-error
 *
 * Get currently active injected errors.
 */
router.get("/inject-error", (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const activeErrors = getInjectedErrors();
  const errorDetails = activeErrors.map((type) => ({
    type,
    expiresAt: new Date(injectedErrors.get(type)!).toISOString(),
    remainingMs: injectedErrors.get(type)! - Date.now(),
  }));

  return c.json({
    data: {
      count: activeErrors.length,
      errors: errorDetails,
    },
  });
});

// ========================================
// Multiplayer Dev Endpoints
// ========================================

/**
 * GET /api/dev/multiplayer/sessions
 *
 * List active multiplayer sessions.
 */
router.get("/multiplayer/sessions", async (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const sessions = await db
    .selectFrom("chat.sessions")
    .select(["id", "applicationId", "isMultiplayer", "shareToken", "startedAt"])
    .where("isMultiplayer", "=", true)
    .orderBy("startedAt", "desc")
    .limit(20)
    .execute();

  // Get participant counts
  const sessionsWithCounts = await Promise.all(
    sessions.map(async (session) => {
      const participants = await db
        .selectFrom("chat.session_participants")
        .select(["id", "displayName", "avatarColor", "isActive", "isAnonymous"])
        .where("sessionId", "=", session.id)
        .execute();
      return { ...session, participants };
    })
  );

  return c.json({ data: sessionsWithCounts });
});

/**
 * POST /api/dev/multiplayer/simulate-join
 *
 * Simulate a participant joining a multiplayer session.
 */
router.post(
  "/multiplayer/simulate-join",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().uuid(),
      displayName: z.string().optional(),
    })
  ),
  async (c) => {
    const environment = Deno.env.get("ENVIRONMENT");
    if (environment === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }

    const { sessionId, displayName } = c.req.valid("json");

    const name = displayName || generateAnonymousName();
    const color = getAvatarColor(name);

    // Create participant directly
    const participant = await db
      .insertInto("chat.session_participants")
      .values({
        sessionId,
        displayName: name,
        avatarColor: color,
        isActive: true,
        isAnonymous: true,
        anonymousToken: crypto.randomUUID(),
      })
      .returning(["id", "displayName", "avatarColor", "isAnonymous", "isActive"])
      .executeTakeFirst();

    if (!participant) {
      return c.json({ error: "Failed to create participant" }, 500);
    }

    // Broadcast join event
    publishToSession(sessionId, {
      type: "multiplayer:participant_joined",
      sessionId,
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        avatarColor: participant.avatarColor,
        isAnonymous: participant.isAnonymous,
        isActive: true,
      },
    }).catch(() => {});

    return c.json({ data: participant });
  }
);

/**
 * POST /api/dev/multiplayer/simulate-message
 *
 * Simulate a participant sending a message in a multiplayer session.
 */
router.post(
  "/multiplayer/simulate-message",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().uuid(),
      participantId: z.string().uuid(),
      content: z.string().min(1),
    })
  ),
  async (c) => {
    const environment = Deno.env.get("ENVIRONMENT");
    if (environment === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }

    const { sessionId, participantId, content } = c.req.valid("json");

    // Create message in DB
    const message = await db
      .insertInto("chat.messages")
      .values({
        sessionId,
        role: "user",
        content,
        senderParticipantId: participantId,
      })
      .returning(["id", "role", "content", "senderParticipantId", "createdAt"])
      .executeTakeFirst();

    if (!message) {
      return c.json({ error: "Failed to create message" }, 500);
    }

    // Broadcast to session
    publishToSession(
      sessionId,
      {
        type: "multiplayer:user_message",
        sessionId,
        message: {
          id: message.id,
          role: "user",
          content: message.content,
          senderParticipantId: participantId,
          createdAt: message.createdAt,
        },
      },
      participantId
    ).catch(() => {});

    return c.json({ data: message });
  }
);

/**
 * POST /api/dev/multiplayer/simulate-stop
 *
 * Simulate stopping an AI response in a multiplayer session.
 */
router.post(
  "/multiplayer/simulate-stop",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().uuid(),
    })
  ),
  async (c) => {
    const environment = Deno.env.get("ENVIRONMENT");
    if (environment === "production") {
      return c.json({ error: "Not available in production" }, 403);
    }

    const { sessionId } = c.req.valid("json");

    const aborted = multiplayerService.abortActiveStream(sessionId);

    if (aborted) {
      publishToSession(sessionId, {
        type: "multiplayer:ai_stopped",
        sessionId,
      }).catch(() => {});
    }

    return c.json({
      data: { aborted },
      message: aborted ? "AI response stopped" : "No active stream found",
    });
  }
);

// ========================================
// Email Template Preview
// ========================================

// deno-lint-ignore no-explicit-any
const EMAIL_TEMPLATES: Record<string, { template: any; mockData: Record<string, unknown>; label: string }> = {
  "new-chat": {
    template: newChat,
    label: "New Chat Session",
    mockData: {
      appName: "Acme Support Bot",
      appId: "app_12345",
      sessionId: "sess_abc123",
      consumerName: "Sarah Chen",
      consumerEmail: "sarah@example.com",
      messagePreview: "Hi, I'm having trouble with my recent order #4521. The tracking says delivered but I haven't received it yet. Can you help?",
      source: "APP",
      timestamp: new Date().toISOString(),
    },
  },
  "new-chat-anonymous": {
    template: newChat,
    label: "New Chat (Anonymous)",
    mockData: {
      appName: "Acme Support Bot",
      appId: "app_12345",
      sessionId: "sess_abc123",
      source: "WHATSAPP",
      timestamp: new Date().toISOString(),
    },
  },
  "new-chat-email-source": {
    template: newChat,
    label: "New Chat (Email Source)",
    mockData: {
      appName: "Legal Assistant Pro",
      appId: "app_67890",
      sessionId: "sess_def456",
      consumerName: "Marcus Rodriguez",
      consumerEmail: "marcus@lawfirm.com",
      messagePreview: "I need help reviewing a non-compete clause in an employment contract. The clause seems overly broad.",
      source: "EMAIL",
      timestamp: new Date().toISOString(),
    },
  },
  "consumer-signup": {
    template: consumerSignup,
    label: "Consumer Signup",
    mockData: {
      consumerEmail: "newuser@example.com",
      appName: "Acme Support Bot",
      appId: "app_12345",
    },
  },
  "credit-low": {
    template: creditLow,
    label: "Credit Low",
    mockData: {
      creditBalanceFormatted: "$2.34",
      creditBalanceCents: 234,
      organizationName: "Acme Corp",
      addCreditsUrl: "http://localhost:5174/#/settings/billing",
    },
  },
  "credit-exhausted": {
    template: creditExhausted,
    label: "Credits Exhausted",
    mockData: {
      organizationName: "Acme Corp",
      addCreditsUrl: "http://localhost:5174/#/settings/billing",
    },
  },
  "payment-failed": {
    template: paymentFailed,
    label: "Payment Failed",
    mockData: {
      organizationName: "Acme Corp",
      amountFormatted: "$49.00",
      attemptCount: 2,
      nextRetryDate: "February 10, 2026",
      billingUrl: "http://localhost:5174/#/settings/billing",
    },
  },
  "workspace-member-joined": {
    template: workspaceMemberJoined,
    label: "Workspace Member Joined",
    mockData: {
      memberEmail: "alice@acme.com",
      memberName: "Alice Johnson",
      workspaceName: "Engineering",
      role: "Editor",
    },
  },
  "subscription-changed": {
    template: subscriptionChanged,
    label: "Subscription Changed",
    mockData: {
      organizationName: "Acme Corp",
      previousTier: "PRO",
      newTier: "BUSINESS",
      changeType: "upgraded",
      billingUrl: "http://localhost:5174/#/settings/billing",
    },
  },
  "credit-purchase": {
    template: creditPurchase,
    label: "Credit Purchase",
    mockData: {
      consumerEmail: "buyer@example.com",
      appName: "Acme Support Bot",
      amountFormatted: "$25.00",
    },
  },
  "app-engagement": {
    template: appEngagement,
    label: "App Engagement Digest",
    mockData: {
      organizationName: "Acme Corp",
      periodLabel: "Weekly",
      totalSessions: 342,
      totalMessages: 1847,
      topApps: [
        { name: "Support Bot", sessions: 198 },
        { name: "Sales Assistant", sessions: 87 },
        { name: "Onboarding Guide", sessions: 57 },
      ],
    },
  },
};

const BRAND_PRESETS: Record<string, BrandingParams> = {
  chipp:    { brandName: "Chipp", brandColor: "#000000" },
  blue:     { brandName: "Acme Corp", brandColor: "#2563eb" },
  purple:   { brandName: "Nebula AI", brandColor: "#7c3aed" },
  green:    { brandName: "EcoTech", brandColor: "#059669" },
  orange:   { brandName: "Firestarter", brandColor: "#ea580c" },
  rose:     { brandName: "Bloom Health", brandColor: "#e11d48" },
};

/**
 * GET /api/dev/email-preview
 *
 * Gallery page listing all available email templates with links to preview each.
 * Query param: ?brand=chipp|blue|purple|green|orange|rose (default: blue)
 */
router.get("/email-preview", (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const brand = (c.req.query("brand") || "blue") as string;
  const branding = BRAND_PRESETS[brand] || BRAND_PRESETS.blue;

  const brandButtons = Object.entries(BRAND_PRESETS)
    .map(([key, b]) => {
      const active = key === brand;
      return `<a href="?brand=${key}" style="
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
        text-decoration: none; border: 1px solid ${active ? b.brandColor : "#e4e4e7"};
        background: ${active ? b.brandColor : "#fff"}; color: ${active ? "#fff" : "#3f3f46"};
      "><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.brandColor};border:1px solid rgba(0,0,0,0.1);"></span>${b.brandName}</a>`;
    })
    .join(" ");

  const templateLinks = Object.entries(EMAIL_TEMPLATES)
    .map(([key, entry]) => {
      return `<a href="/api/dev/email-preview/${key}?brand=${brand}" target="_blank" style="
        display: block; padding: 14px 18px; margin: 0 0 8px 0;
        background: #fff; border: 1px solid #e4e4e7; border-radius: 10px;
        text-decoration: none; color: #18181b; font-size: 14px;
        transition: border-color 0.15s;
      " onmouseover="this.style.borderColor='${branding.brandColor}'" onmouseout="this.style.borderColor='#e4e4e7'">
        <strong>${entry.label}</strong>
        <span style="float:right;color:#a1a1aa;font-size:12px;">${key}</span>
      </a>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Template Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f5; margin: 0; padding: 32px; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 24px; font-weight: 700; color: #18181b; margin: 0 0 4px 0; }
    .subtitle { font-size: 14px; color: #71717a; margin: 0 0 24px 0; }
    .section-label { font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 10px 0; }
    .brands { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px 0; }
  </style>
</head><body>
  <div class="container">
    <h1>Email Template Preview</h1>
    <p class="subtitle">Click a template to preview it with the selected brand.</p>
    <div class="section-label">Brand</div>
    <div class="brands">${brandButtons}</div>
    <div class="section-label">Templates (${Object.keys(EMAIL_TEMPLATES).length})</div>
    ${templateLinks}
  </div>
</body></html>`;

  return c.html(html);
});

/**
 * GET /api/dev/email-preview/:template
 *
 * Render a specific email template with mock data.
 * Query param: ?brand=chipp|blue|purple|green|orange|rose (default: blue)
 */
router.get("/email-preview/:template", (c) => {
  const environment = Deno.env.get("ENVIRONMENT");
  if (environment === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const templateKey = c.req.param("template");
  const entry = EMAIL_TEMPLATES[templateKey];

  if (!entry) {
    return c.json({
      error: `Unknown template: ${templateKey}`,
      available: Object.keys(EMAIL_TEMPLATES),
    }, 404);
  }

  const brand = (c.req.query("brand") || "blue") as string;
  const branding = BRAND_PRESETS[brand] || BRAND_PRESETS.blue;

  const html = entry.template.renderHtml(entry.mockData, branding, {
    trackingPixelUrl: "https://example.com/pixel.gif",
    unsubscribeUrl: "http://localhost:5174/#/settings/notifications",
  });

  return c.html(html);
});

export { router as devRoutes };
