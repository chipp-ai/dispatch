/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events for subscriptions, invoices, and payments.
 * Uses raw body from middleware for signature verification.
 */

import { Hono } from "hono";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { stripeWebhookMiddleware } from "../../middleware/webhookAuth.ts";
import { billingService } from "../../../services/billing.service.ts";

// ========================================
// Types
// ========================================

/**
 * Stripe event structure (simplified for stub)
 * In production, use the full Stripe types
 */
interface StripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
  data: {
    object: Record<string, unknown>;
    previous_attributes?: Record<string, unknown>;
  };
}

// ========================================
// Route Handler
// ========================================

export const stripeWebhookRoutes = new Hono<WebhookContext>();

// Apply Stripe signature verification middleware
stripeWebhookRoutes.use("*", stripeWebhookMiddleware);

/**
 * POST /webhooks/stripe
 *
 * Main Stripe webhook endpoint. Handles:
 * - customer.subscription.created/updated/deleted
 * - invoice.paid/payment_failed
 * - checkout.session.completed
 * - billing.alert.triggered
 */
stripeWebhookRoutes.post("/", async (c) => {
  const rawBody = c.get("rawBody");

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  const requestId = c.get("requestId") || "unknown";

  console.log(`[${requestId}] Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      // ========================================
      // Subscription Events
      // ========================================

      case "customer.subscription.created": {
        const subscription = event.data.object as {
          id: string;
          customer: string;
          status: string;
          metadata: Record<string, string>;
        };

        await billingService.handleSubscriptionCreated({
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          metadata: subscription.metadata,
          livemode: event.livemode,
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as {
          id: string;
          customer: string;
          status: string;
          metadata: Record<string, string>;
          cancel_at_period_end: boolean;
        };
        const previousAttributes = event.data.previous_attributes as
          | Record<string, unknown>
          | undefined;

        await billingService.handleSubscriptionUpdated({
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          metadata: subscription.metadata,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          previousStatus: previousAttributes?.status as string | undefined,
          livemode: event.livemode,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as {
          id: string;
          customer: string;
          metadata: Record<string, string>;
        };

        await billingService.handleSubscriptionDeleted({
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          metadata: subscription.metadata,
          livemode: event.livemode,
        });
        break;
      }

      // ========================================
      // Invoice Events
      // ========================================

      case "invoice.paid": {
        const invoice = event.data.object as {
          id: string;
          customer: string;
          subscription: string | null;
          amount_paid: number;
          currency: string;
          metadata: Record<string, string>;
        };

        await billingService.handleInvoicePaid({
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          metadata: invoice.metadata,
          livemode: event.livemode,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as {
          id: string;
          customer: string;
          subscription: string | null;
          metadata: Record<string, string>;
        };

        await billingService.handleInvoicePaymentFailed({
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
          metadata: invoice.metadata,
          livemode: event.livemode,
        });
        break;
      }

      // ========================================
      // Checkout Events
      // ========================================

      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string;
          customer: string | null;
          mode: "payment" | "subscription" | "setup";
          metadata: Record<string, string>;
          subscription: string | null;
          payment_intent: string | null;
        };

        await billingService.handleCheckoutCompleted({
          sessionId: session.id,
          customerId: session.customer,
          mode: session.mode,
          metadata: session.metadata,
          subscriptionId: session.subscription,
          paymentIntentId: session.payment_intent,
          livemode: event.livemode,
        });
        break;
      }

      // ========================================
      // Billing Alert Events
      // ========================================

      case "billing.alert.triggered": {
        const alert = event.data.object as {
          id: string;
          title: string;
          status: string;
          customer: string;
        };

        console.log(`[${requestId}] Billing alert triggered: ${alert.title}`);
        // TODO: Implement billing alert handling
        // This would typically send notifications to customers
        break;
      }

      // ========================================
      // Account Events (Stripe Connect)
      // ========================================

      case "account.updated": {
        const account = event.data.object as {
          id: string;
          capabilities: {
            transfers?: string;
            card_payments?: string;
          };
        };

        console.log(`[${requestId}] Account updated: ${account.id}`);
        // TODO: Handle Connect account updates
        // Check if account is ready to receive payments
        break;
      }

      default:
        // Log unhandled event types for debugging
        console.log(
          `[${requestId}] Unhandled Stripe event type: ${event.type}`
        );
    }

    return c.json({ received: true });
  } catch (error) {
    console.error(`[${requestId}] Error processing Stripe webhook:`, error);

    // Return 200 to acknowledge receipt even on error
    // This prevents Stripe from retrying and potentially causing duplicate processing
    // Errors should be logged and monitored via Sentry/logs
    return c.json({
      received: true,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
