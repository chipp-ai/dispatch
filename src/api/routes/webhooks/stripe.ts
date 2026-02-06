/**
 * Stripe Webhook Handler
 *
 * Handles Stripe webhook events for subscriptions, invoices, and payments.
 * Uses raw body from middleware for signature verification.
 */

import { Hono } from "hono";
import * as Sentry from "@sentry/deno";
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
          cancel_at: number | null;
          current_period_end: number;
          items: {
            data: Array<{
              price: {
                id: string;
                metadata?: Record<string, string>;
              };
            }>;
          };
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
          items: subscription.items?.data?.map((item) => ({
            price: item.price
              ? {
                  id: item.price.id,
                  metadata: item.price.metadata,
                }
              : undefined,
          })),
          previousMetadata: previousAttributes?.metadata as
            | Record<string, string>
            | undefined,
          cancelAt: subscription.cancel_at,
          currentPeriodEnd: subscription.current_period_end,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as {
          id: string;
          customer: string;
          metadata: Record<string, string>;
          created: number;
          items: {
            data: Array<{
              price: {
                id: string;
                metadata?: Record<string, string>;
              };
            }>;
          };
        };

        await billingService.handleSubscriptionDeleted({
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          metadata: subscription.metadata,
          livemode: event.livemode,
          items: subscription.items?.data?.map((item) => ({
            price: item.price
              ? {
                  id: item.price.id,
                  metadata: item.price.metadata,
                }
              : undefined,
          })),
          created: subscription.created,
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
          billing_reason: string | null;
          lines?: {
            data: Array<{
              price?: {
                id: string;
                metadata?: Record<string, string>;
                product?: string;
              };
              quantity?: number;
              description?: string;
            }>;
          };
        };

        await billingService.handleInvoicePaid({
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          metadata: invoice.metadata,
          livemode: event.livemode,
          billingReason: invoice.billing_reason,
          lines: invoice.lines?.data?.map((line) => ({
            price: line.price
              ? {
                  id: line.price.id,
                  metadata: line.price.metadata,
                  product: line.price.product,
                }
              : undefined,
            quantity: line.quantity,
            description: line.description,
          })),
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as {
          id: string;
          customer: string;
          subscription: string | null;
          metadata: Record<string, string>;
          attempt_count: number;
          next_payment_attempt: number | null;
          amount_due: number;
          currency: string;
          last_finalization_error?: {
            message?: string;
          } | null;
        };

        await billingService.handleInvoicePaymentFailed({
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
          metadata: invoice.metadata,
          livemode: event.livemode,
          attemptCount: invoice.attempt_count,
          nextPaymentAttempt: invoice.next_payment_attempt,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
          lastFinalizationError: invoice.last_finalization_error?.message,
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
      // Billing Alert Events (v2 Usage-Based Billing)
      // ========================================

      case "billing.alert.triggered": {
        // The billing alert object structure from Stripe v2
        const alert = event.data.object as {
          id: string;
          alert_type: string;
          title?: string;
          status: string;
          credit_balance_threshold?: {
            customer: string;
            threshold?: number;
            title?: string;
          };
        };

        // Extract customer ID and threshold from the alert
        // v2 billing alerts have credit_balance_threshold with customer and threshold
        const customerId =
          alert.credit_balance_threshold?.customer ||
          ((alert as Record<string, unknown>).customer as string);
        const thresholdCents = alert.credit_balance_threshold?.threshold || 0;
        const alertTitle =
          alert.credit_balance_threshold?.title || alert.title || "";

        console.log(`[${requestId}] Billing alert triggered`, {
          alertId: alert.id,
          alertType: alert.alert_type,
          title: alertTitle,
          customerId,
          thresholdCents,
        });

        await billingService.handleBillingAlert({
          alertId: alert.id,
          customerId: customerId || "",
          alertType: alert.alert_type || "credit_balance_threshold",
          title: alertTitle,
          thresholdCents,
          livemode: event.livemode,
          rawAlert: alert as Record<string, unknown>,
        });
        break;
      }

      // ========================================
      // Dispute Events (Compliance Critical)
      // ========================================

      case "charge.dispute.created": {
        const dispute = event.data.object as {
          id: string;
          charge: string;
          payment_intent?: string | null;
          customer?: string | null;
          amount: number;
          currency: string;
          reason: string;
          status: string;
          evidence_details?: {
            due_by?: number | null;
          };
          metadata?: Record<string, string>;
        };

        await billingService.handleDisputeCreated({
          disputeId: dispute.id,
          chargeId: dispute.charge,
          paymentIntentId: dispute.payment_intent || undefined,
          customerId: dispute.customer || "",
          amount: dispute.amount,
          currency: dispute.currency,
          reason: dispute.reason,
          status: dispute.status,
          evidenceDueBy: dispute.evidence_details?.due_by || 0,
          livemode: event.livemode,
          metadata: dispute.metadata,
        });
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as {
          id: string;
          charge: string;
          customer?: string | null;
          amount: number;
          status: string;
          metadata?: Record<string, string>;
        };

        await billingService.handleDisputeClosed({
          disputeId: dispute.id,
          chargeId: dispute.charge,
          customerId: dispute.customer || "",
          amount: dispute.amount,
          status: dispute.status,
          livemode: event.livemode,
          metadata: dispute.metadata,
        });
        break;
      }

      // ========================================
      // Refund Events
      // ========================================

      case "charge.refunded": {
        const charge = event.data.object as {
          id: string;
          customer?: string | null;
          payment_intent?: string | null;
          invoice?: string | null;
          amount_refunded: number;
          currency: string;
          refunds?: {
            data?: Array<{
              id: string;
              amount: number;
              reason?: string | null;
              metadata?: Record<string, string>;
            }>;
          };
          metadata?: Record<string, string>;
        };

        // Get the most recent refund from the refunds list
        const latestRefund = charge.refunds?.data?.[0];

        await billingService.handleChargeRefunded({
          chargeId: charge.id,
          refundId: latestRefund?.id || `refund_${charge.id}`,
          customerId: charge.customer || "",
          amount: latestRefund?.amount || charge.amount_refunded,
          currency: charge.currency,
          reason: latestRefund?.reason || undefined,
          paymentIntentId: charge.payment_intent || undefined,
          invoiceId: charge.invoice || undefined,
          livemode: event.livemode,
          metadata: latestRefund?.metadata || charge.metadata,
        });
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
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "stripe-webhook" },
      extra: { requestId, eventType: event.type, eventId: event.id },
    });

    // Return 200 to acknowledge receipt even on error
    // This prevents Stripe from retrying and potentially causing duplicate processing
    // Errors should be logged and monitored via Sentry/logs
    return c.json({
      received: true,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
