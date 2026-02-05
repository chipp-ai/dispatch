/**
 * Billing Service
 *
 * Business logic for billing operations including credit balance,
 * token usage, and subscription management.
 */

import { sql } from "../db/client.ts";
import { NotFoundError, BadRequestError } from "../utils/errors.ts";
import type { SubscriptionTier } from "../db/schema.ts";
import Stripe from "npm:stripe";
import * as Sentry from "@sentry/deno";
import {
  stripe,
  isStripeConfigured,
  getStripeApiKey,
  STRIPE_API_VERSION,
  STRIPE_V2_API_VERSION,
} from "./stripe.client.ts";
import {
  getTierFromPriceId,
  isV2BillingPriceId,
} from "./stripe.constants.ts";

// ========================================
// Types
// ========================================

export interface CreditStatus {
  /** Whether the organization has usage-based billing enabled */
  usageBasedBillingEnabled: boolean;
  /** Current credit balance in cents (from Stripe, if available) */
  creditBalanceCents: number;
  /** Whether credits are completely exhausted */
  isExhausted: boolean;
  /** Whether credits are low (below threshold but not exhausted) */
  isLow: boolean;
  /** Whether to show a warning banner */
  showWarning: boolean;
  /** Warning severity level */
  warningSeverity: "none" | "low" | "exhausted";
  /** Human-readable credit balance */
  creditBalanceFormatted: string;
}

export interface UsageSummary {
  /** Total tokens used in the period */
  totalTokens: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Breakdown by model */
  byModel: {
    model: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  /** Breakdown by application */
  byApplication: {
    applicationId: number;
    applicationName: string;
    tokens: number;
  }[];
  /** Period start date */
  periodStart: Date;
  /** Period end date */
  periodEnd: Date;
}

export interface SubscriptionDetails {
  /** Current subscription tier */
  tier: SubscriptionTier;
  /** Stripe subscription ID if exists */
  stripeSubscriptionId: string | null;
  /** Stripe customer ID if exists */
  stripeCustomerId: string | null;
  /** Whether usage-based billing is enabled */
  usageBasedBillingEnabled: boolean;
  /** Whether credits are exhausted */
  creditsExhausted: boolean;
  /** Organization name */
  organizationName: string;
  /** Organization ID */
  organizationId: number;
}

export interface PaymentMethodStatus {
  customerId: string;
  has_default_payment_method: boolean;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  } | null;
}

export interface TopupSettings {
  customerId: string;
  settings: {
    enabled: boolean;
    amount_cents: number;
    threshold_percent: number;
  };
  has_default_payment_method: boolean;
}

export interface OrganizationBillingContext {
  organizationId: number;
  organizationName: string;
  stripeCustomerId: string | null;
  stripeSandboxCustomerId: string | null;
  useSandboxForUsageBilling: boolean;
  usageBasedBillingEnabled: boolean;
  subscriptionTier: SubscriptionTier;
}

// Low credits threshold in cents ($1.00)
// Used when determining if credits are "low" vs "exhausted"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LOW_CREDITS_THRESHOLD_CENTS = 100;

export interface CreditCheckResult {
  hasCredits: boolean;
  balance?: number;
}

// ========================================
// Webhook Event Types
// ========================================

export interface SubscriptionCreatedParams {
  subscriptionId: string;
  customerId: string;
  status: string;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface SubscriptionUpdatedParams {
  subscriptionId: string;
  customerId: string;
  status: string;
  metadata: Record<string, string>;
  cancelAtPeriodEnd: boolean;
  previousStatus?: string;
  livemode: boolean;
  /** Subscription items with price info for tier detection */
  items?: Array<{
    price?: {
      id: string;
      metadata?: Record<string, string>;
    };
  }>;
  /** Previous metadata for tier change detection */
  previousMetadata?: Record<string, string>;
  /** Timestamp when subscription will be cancelled */
  cancelAt?: number | null;
  /** Current period end timestamp */
  currentPeriodEnd?: number;
}

export interface SubscriptionDeletedParams {
  subscriptionId: string;
  customerId: string;
  metadata: Record<string, string>;
  livemode: boolean;
  /** Subscription items with price info for tier detection */
  items?: Array<{
    price?: {
      id: string;
      metadata?: Record<string, string>;
    };
  }>;
  /** Subscription created timestamp for tenure calculation */
  created?: number;
}

export interface InvoicePaidParams {
  invoiceId: string;
  customerId: string;
  subscriptionId: string | null;
  amountPaid: number;
  currency: string;
  metadata: Record<string, string>;
  livemode: boolean;
  /** Reason for billing: subscription_create, subscription_cycle, subscription_update, manual */
  billingReason?: string | null;
  /** Invoice line items with price/product metadata for credit detection */
  lines?: Array<{
    price?: {
      id: string;
      metadata?: Record<string, string>;
      product?: string;
    };
    quantity?: number;
    description?: string;
  }>;
}

export interface InvoicePaymentFailedParams {
  invoiceId: string;
  customerId: string;
  subscriptionId: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
  /** Number of payment attempts made */
  attemptCount?: number;
  /** Next payment attempt timestamp (Unix) */
  nextPaymentAttempt?: number | null;
  /** Amount that failed to be paid (cents) */
  amountDue?: number;
  /** Currency of the failed payment */
  currency?: string;
  /** Last error message from Stripe */
  lastFinalizationError?: string | null;
}

export interface CheckoutCompletedParams {
  sessionId: string;
  customerId: string | null;
  mode: "payment" | "subscription" | "setup";
  metadata: Record<string, string>;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  livemode: boolean;
}

export interface BillingAlertParams {
  /** The alert ID from Stripe */
  alertId: string;
  /** Stripe customer ID from the alert */
  customerId: string;
  /** Type of alert (e.g., 'credit_balance_threshold') */
  alertType: string;
  /** Alert title (notification alerts start with "notification:") */
  title?: string;
  /** Threshold amount in cents that triggered the alert */
  thresholdCents: number;
  /** Whether this is a live mode event */
  livemode: boolean;
  /** Full alert object for debugging/logging */
  rawAlert?: Record<string, unknown>;
}

export interface DisputeCreatedParams {
  /** The dispute ID from Stripe */
  disputeId: string;
  /** The charge ID associated with the dispute */
  chargeId: string;
  /** The payment intent ID if available */
  paymentIntentId?: string;
  /** The Stripe customer ID */
  customerId: string;
  /** Disputed amount in cents */
  amount: number;
  /** Currency of the dispute */
  currency: string;
  /** Reason for the dispute (e.g., 'fraudulent', 'duplicate', 'product_not_received') */
  reason: string;
  /** Current status of the dispute */
  status: string;
  /** Unix timestamp for evidence submission deadline */
  evidenceDueBy: number;
  /** Whether this is a live mode event */
  livemode: boolean;
  /** Additional metadata from Stripe */
  metadata?: Record<string, string>;
}

export interface DisputeClosedParams {
  /** The dispute ID from Stripe */
  disputeId: string;
  /** The charge ID associated with the dispute */
  chargeId: string;
  /** The Stripe customer ID */
  customerId: string;
  /** Disputed amount in cents */
  amount: number;
  /** Final status of the dispute: 'won', 'lost', or 'withdrawn' */
  status: string;
  /** Whether this is a live mode event */
  livemode: boolean;
  /** Additional metadata from Stripe */
  metadata?: Record<string, string>;
}

export interface ChargeRefundedParams {
  /** The charge ID that was refunded */
  chargeId: string;
  /** The refund ID from Stripe */
  refundId: string;
  /** The Stripe customer ID */
  customerId: string;
  /** Amount refunded in cents */
  amount: number;
  /** Currency of the refund */
  currency: string;
  /** Reason for the refund if provided */
  reason?: string;
  /** The payment intent ID if available */
  paymentIntentId?: string;
  /** Associated invoice ID if any */
  invoiceId?: string;
  /** Whether this is a live mode event */
  livemode: boolean;
  /** Additional metadata from Stripe */
  metadata?: Record<string, string>;
}

// ========================================
// Service
// ========================================

export const billingService = {
  /**
   * Get credit status for an organization
   * Note: In production, credit balance would come from Stripe API.
   * This implementation provides the local database state.
   */
  async getCreditStatus(organizationId: string): Promise<CreditStatus> {
    const result = await sql`
      SELECT id
      FROM app.organizations
      WHERE id = ${organizationId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization", String(organizationId));
    }

    // Usage-based billing is always enabled
    // Note: In a full implementation, we would fetch the actual credit balance
    // from Stripe's credit_grants API. For now, assume not exhausted.
    const isExhausted = false;
    const isLow = false;
    const showWarning = false;

    return {
      usageBasedBillingEnabled: true,
      creditBalanceCents: -1, // -1 indicates unknown (would need Stripe API)
      isExhausted,
      isLow,
      showWarning,
      warningSeverity: "none",
      creditBalanceFormatted: "Unknown",
    };
  },

  /**
   * Get token usage summary for an organization
   */
  async getUsageSummary(
    organizationId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<UsageSummary> {
    const now = new Date();
    const startDate =
      options?.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = options?.endDate || now;

    // Get organization's workspaces first
    const workspaces = await sql`
      SELECT id FROM app.workspaces WHERE organization_id = ${organizationId}
    `;

    if (workspaces.length === 0) {
      return {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        byModel: [],
        byApplication: [],
        periodStart: startDate,
        periodEnd: endDate,
      };
    }

    const workspaceIds = (workspaces as unknown as { id: string }[]).map(
      (w) => w.id
    );

    // Get totals from billing.token_usage
    const totalsResult = await sql`
      SELECT
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens
      FROM billing.token_usage
      WHERE organization_id = ${organizationId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `;

    // Get breakdown by model
    const byModelResult = await sql`
      SELECT
        model,
        SUM(total_tokens) as tokens,
        SUM(input_tokens) as inputTokens,
        SUM(output_tokens) as outputTokens
      FROM billing.token_usage
      WHERE organization_id = ${organizationId}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY model
      ORDER BY tokens DESC
    `;

    // Get breakdown by application
    const byAppResult = await sql`
      SELECT
        tu.application_id,
        a.name as applicationName,
        SUM(tu.total_tokens) as tokens
      FROM billing.token_usage tu
      LEFT JOIN app.applications a ON tu.application_id = a.id
      WHERE tu.organization_id = ${organizationId}
        AND tu.created_at >= ${startDate}
        AND tu.created_at <= ${endDate}
      GROUP BY tu.application_id, a.name
      ORDER BY tokens DESC
    `;

    const totals = totalsResult[0] || {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };

    return {
      totalTokens: Number(totals.totaltokens || 0),
      inputTokens: Number(totals.inputtokens || 0),
      outputTokens: Number(totals.outputtokens || 0),
      byModel: byModelResult.map((row: any) => ({
        model: row.model,
        tokens: Number(row.tokens),
        inputTokens: Number(row.inputtokens || 0),
        outputTokens: Number(row.outputtokens || 0),
      })),
      byApplication: byAppResult.map((row: any) => ({
        applicationId: row.application_id,
        applicationName: row.applicationname || "Unknown",
        tokens: Number(row.tokens),
      })),
      periodStart: startDate,
      periodEnd: endDate,
    };
  },

  /**
   * Get subscription details for an organization
   */
  async getSubscription(organizationId: string): Promise<SubscriptionDetails> {
    const result = await sql`
      SELECT
        id,
        name,
        subscription_tier,
        stripe_subscription_id,
        stripe_customer_id
      FROM app.organizations
      WHERE id = ${organizationId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization", String(organizationId));
    }

    const org = result[0];

    return {
      tier: org.subscription_tier as SubscriptionTier,
      stripeSubscriptionId: org.stripe_subscription_id || null,
      stripeCustomerId: org.stripe_customer_id || null,
      usageBasedBillingEnabled: true, // Always enabled
      creditsExhausted: false, // Not tracked in new schema
      organizationName: org.name,
      organizationId: org.id,
    };
  },

  /**
   * Get organization ID from user
   */
  async getOrganizationIdForUser(userId: string): Promise<string> {
    // Look up user's organization directly
    const userResult = await sql`
      SELECT organization_id FROM app.users WHERE id = ${userId}
    `;

    if (userResult.length === 0 || !userResult[0].organization_id) {
      throw new NotFoundError("User", userId);
    }

    return userResult[0].organization_id;
  },

  // ========================================
  // Webhook Handlers
  // ========================================

  /**
   * Handle subscription created event
   *
   * Called when a new subscription is created in Stripe.
   * Updates organization subscription status.
   */
  async handleSubscriptionCreated(
    params: SubscriptionCreatedParams
  ): Promise<void> {
    const { subscriptionId, customerId, status, metadata, livemode } = params;

    console.log("Processing subscription created", {
      subscriptionId,
      customerId,
      status,
      livemode,
    });

    // Check if this is a consumer subscription (has consumer metadata)
    const isConsumer = !!(
      metadata.consumerIdentifier &&
      metadata.developerId &&
      metadata.applicationId &&
      metadata.packageId
    );

    if (isConsumer) {
      // Handle consumer subscription
      await this.handleConsumerSubscriptionCreated(params);
    } else {
      // Handle organization subscription
      await this.handleOrganizationSubscriptionCreated(params);
    }
  },

  /**
   * Handle consumer subscription created
   */
  async handleConsumerSubscriptionCreated(
    params: SubscriptionCreatedParams
  ): Promise<void> {
    const { subscriptionId, metadata } = params;

    const { consumerIdentifier, developerId, applicationId, packageId } =
      metadata;

    console.log("Processing consumer subscription", {
      subscriptionId,
      consumerIdentifier,
      developerId,
      applicationId,
      packageId,
    });

    // TODO: Create or update ConsumerPurchase record
    // This would activate the consumer's access to the application
  },

  /**
   * Handle organization subscription created
   */
  async handleOrganizationSubscriptionCreated(
    params: SubscriptionCreatedParams
  ): Promise<void> {
    const { subscriptionId, customerId, metadata } = params;

    console.log("Processing organization subscription", {
      subscriptionId,
      customerId,
      tier: metadata.subscriptionTier,
    });

    // Find organization by Stripe customer ID
    const orgs = await sql`
      SELECT id, name FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
      LIMIT 1
    `;

    if (orgs.length === 0) {
      console.warn(`No organization found for Stripe customer: ${customerId}`);
      return;
    }

    const org = orgs[0];

    // Update organization subscription
    await sql`
      UPDATE app.organizations
      SET
        stripe_subscription_id = ${subscriptionId},
        subscription_tier = ${metadata.subscriptionTier || "PRO"},
        updated_at = NOW()
      WHERE id = ${org.id}
    `;

    console.log(
      `Updated organization ${org.id} subscription to ${subscriptionId}`
    );
  },

  /**
   * Handle subscription updated event
   *
   * Called when a subscription is modified (e.g., plan change, cancellation scheduled).
   * Handles:
   * - Tier changes (upgrades/downgrades)
   * - Status transitions (active, past_due, canceled, unpaid)
   * - Pending cancellation scheduling
   */
  async handleSubscriptionUpdated(
    params: SubscriptionUpdatedParams
  ): Promise<void> {
    const {
      subscriptionId,
      customerId,
      status,
      metadata,
      cancelAtPeriodEnd,
      previousStatus,
      items,
      cancelAt,
      currentPeriodEnd,
    } = params;

    console.log("[webhook] Processing subscription updated", {
      subscriptionId,
      customerId,
      status,
      previousStatus,
      cancelAtPeriodEnd,
    });

    // Check if this is a consumer subscription
    const isConsumer = !!(
      metadata.consumerIdentifier &&
      metadata.developerId &&
      metadata.applicationId
    );

    if (isConsumer) {
      // Handle consumer subscription update
      console.log("[webhook] Consumer subscription updated", {
        consumerIdentifier: metadata.consumerIdentifier,
        applicationId: metadata.applicationId,
        status,
      });
      // Consumer subscriptions are handled separately
      return;
    }

    // Find organization by Stripe customer ID
    const orgs = await sql`
      SELECT id, name, subscription_tier, stripe_subscription_id, subscription_cancelled_at
      FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
         OR stripe_sandbox_customer_id = ${customerId}
      LIMIT 1
    `;

    if (orgs.length === 0) {
      console.warn(
        `[webhook] No organization found for Stripe customer: ${customerId}`
      );
      return;
    }

    const org = orgs[0];
    const currentTier = org.subscription_tier as string;

    // Detect tier from price ID if available
    let newTier: string | null = null;
    if (items && items.length > 0) {
      const priceId = items[0]?.price?.id;
      if (priceId) {
        // Skip v2 billing subscriptions that don't have tier metadata
        // (v2 state is managed via checkout.session.completed)
        if (isV2BillingPriceId(priceId)) {
          console.log(
            "[webhook] Skipping subscription update for v2 billing - state managed via checkout"
          );
          // Still process cancellation scheduling for v2 subscriptions
          if (cancelAtPeriodEnd && currentPeriodEnd) {
            await this.handlePendingCancellation(
              org.id,
              currentPeriodEnd,
              cancelAt
            );
          }
          return;
        }

        const tierInfo = getTierFromPriceId(priceId);
        if (tierInfo.tier) {
          newTier = tierInfo.tier;
        }
      }
    }

    // Fallback to metadata for tier
    if (!newTier && metadata.subscriptionTier) {
      newTier = metadata.subscriptionTier;
    }

    // Detect tier change
    const tierChanged = newTier && newTier !== currentTier;

    if (tierChanged) {
      console.log(
        `[webhook] Tier change detected: ${currentTier} -> ${newTier}`
      );

      // Update organization tier
      await sql`
        UPDATE app.organizations
        SET
          subscription_tier = ${newTier},
          updated_at = NOW()
        WHERE id = ${org.id}
      `;

      console.log(
        `[webhook] Updated organization ${org.id} tier to ${newTier}`
      );

      // Log tier change for analytics
      Sentry.addBreadcrumb({
        category: "billing",
        message: `Subscription tier changed: ${currentTier} -> ${newTier}`,
        level: "info",
        data: {
          organizationId: org.id,
          subscriptionId,
          previousTier: currentTier,
          newTier,
        },
      });
    }

    // Handle status transitions
    if (status === "active" && previousStatus !== "active") {
      // Subscription became active
      console.log(`[webhook] Subscription ${subscriptionId} is now active`);

      // Clear any cancellation flags if subscription reactivated
      await sql`
        UPDATE app.organizations
        SET
          subscription_cancelled_at = NULL,
          subscription_ends_at = NULL,
          updated_at = NOW()
        WHERE id = ${org.id}
          AND subscription_cancelled_at IS NOT NULL
      `;
    } else if (status === "past_due") {
      // Payment failed but subscription still active
      console.log(`[webhook] Subscription ${subscriptionId} is past due`);

      Sentry.captureMessage("Subscription payment past due", {
        level: "warning",
        tags: { source: "billing-webhook", feature: "subscription-status" },
        extra: {
          organizationId: org.id,
          subscriptionId,
          customerId,
        },
      });
      // TODO: Send payment failed notification email
    } else if (status === "canceled" || status === "unpaid") {
      // Subscription ended
      console.log(
        `[webhook] Subscription ${subscriptionId} ended with status: ${status}`
      );

      // Downgrade to FREE tier
      await sql`
        UPDATE app.organizations
        SET
          subscription_tier = 'FREE',
          stripe_subscription_id = NULL,
          subscription_cancelled_at = NOW(),
          pending_downgrade_tier = NULL,
          downgrade_scheduled_at = NULL,
          downgrade_effective_at = NULL,
          updated_at = NOW()
        WHERE id = ${org.id}
      `;

      console.log(
        `[webhook] Downgraded organization ${org.id} to FREE due to ${status} status`
      );

      Sentry.captureMessage(`Subscription ${status} - organization downgraded`, {
        level: "warning",
        tags: { source: "billing-webhook", feature: "subscription-status" },
        extra: {
          organizationId: org.id,
          subscriptionId,
          previousTier: currentTier,
          status,
        },
      });
    }

    // Handle pending cancellation
    if (cancelAtPeriodEnd && currentPeriodEnd) {
      await this.handlePendingCancellation(org.id, currentPeriodEnd, cancelAt);
    } else if (!cancelAtPeriodEnd && org.subscription_cancelled_at) {
      // Cancellation was undone
      console.log(
        `[webhook] Cancellation undone for organization ${org.id}`
      );
      await sql`
        UPDATE app.organizations
        SET
          subscription_cancelled_at = NULL,
          subscription_ends_at = NULL,
          updated_at = NOW()
        WHERE id = ${org.id}
      `;
    }
  },

  /**
   * Handle pending cancellation by updating organization timestamps
   */
  async handlePendingCancellation(
    organizationId: number | string,
    currentPeriodEnd: number,
    cancelAt: number | null | undefined
  ): Promise<void> {
    const subscriptionEndsAt = cancelAt
      ? new Date(cancelAt * 1000)
      : new Date(currentPeriodEnd * 1000);

    console.log(
      `[webhook] Subscription scheduled for cancellation, ends at: ${subscriptionEndsAt.toISOString()}`
    );

    await sql`
      UPDATE app.organizations
      SET
        subscription_cancelled_at = NOW(),
        subscription_ends_at = ${subscriptionEndsAt},
        updated_at = NOW()
      WHERE id = ${organizationId}
    `;
  },

  /**
   * Handle subscription deleted event
   *
   * Called when a subscription is fully canceled/deleted.
   * Captures churn analytics and resets organization to FREE tier.
   */
  async handleSubscriptionDeleted(
    params: SubscriptionDeletedParams
  ): Promise<void> {
    const { subscriptionId, customerId, metadata, items, created } = params;

    console.log("[webhook] Processing subscription deleted", {
      subscriptionId,
      customerId,
    });

    // Check if consumer subscription
    const isConsumer = !!(
      metadata.consumerIdentifier &&
      metadata.developerId &&
      metadata.applicationId
    );

    if (isConsumer) {
      // Deactivate consumer access
      console.log("[webhook] Deactivating consumer subscription", {
        consumerIdentifier: metadata.consumerIdentifier,
        applicationId: metadata.applicationId,
      });
      // TODO: Update ConsumerPurchase to mark as inactive
      return;
    }

    // Find organization - check both by subscription ID and customer ID
    // (subscription ID might already be cleared if we processed an update event)
    let orgs = await sql`
      SELECT id, name, subscription_tier, created_at
      FROM app.organizations
      WHERE stripe_subscription_id = ${subscriptionId}
      LIMIT 1
    `;

    if (orgs.length === 0) {
      // Try finding by customer ID
      orgs = await sql`
        SELECT id, name, subscription_tier, created_at
        FROM app.organizations
        WHERE stripe_customer_id = ${customerId}
           OR stripe_sandbox_customer_id = ${customerId}
        LIMIT 1
      `;
    }

    if (orgs.length === 0) {
      console.warn(
        `[webhook] No organization found for deleted subscription: ${subscriptionId}`
      );
      return;
    }

    const org = orgs[0];
    const previousTier = org.subscription_tier as string;

    // Detect tier from price ID if not in metadata
    let churnedFromTier = metadata.subscriptionTier || previousTier;
    if (items && items.length > 0) {
      const priceId = items[0]?.price?.id;
      if (priceId) {
        const tierInfo = getTierFromPriceId(priceId);
        if (tierInfo.tier) {
          churnedFromTier = tierInfo.tier;
        }
      }
    }

    // Calculate subscription tenure
    let tenureDays: number | null = null;
    if (created) {
      const subscriptionCreatedAt = new Date(created * 1000);
      const now = new Date();
      tenureDays = Math.floor(
        (now.getTime() - subscriptionCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Log churn analytics
    console.log("[webhook] Churn event captured", {
      organizationId: org.id,
      organizationName: org.name,
      previousTier: churnedFromTier,
      subscriptionTenureDays: tenureDays,
      subscriptionId,
    });

    // Capture churn analytics in Sentry for tracking
    Sentry.captureMessage("Subscription churned", {
      level: "info",
      tags: {
        source: "billing-webhook",
        feature: "churn-analytics",
        previousTier: churnedFromTier,
      },
      extra: {
        organizationId: org.id,
        organizationName: org.name,
        previousTier: churnedFromTier,
        subscriptionTenureDays: tenureDays,
        subscriptionId,
        customerId,
      },
    });

    // Update organization to FREE tier and clear all subscription-related fields
    await sql`
      UPDATE app.organizations
      SET
        subscription_tier = 'FREE',
        stripe_subscription_id = NULL,
        subscription_cancelled_at = NOW(),
        subscription_ends_at = NULL,
        pending_downgrade_tier = NULL,
        downgrade_scheduled_at = NULL,
        downgrade_effective_at = NULL,
        updated_at = NOW()
      WHERE id = ${org.id}
    `;

    console.log(
      `[webhook] Downgraded organization ${org.id} (${org.name}) from ${churnedFromTier} to FREE tier`
    );

    // TODO: Send churn notification to Slack (#chipp-churn)
    // TODO: Send subscription canceled email to organization admins
  },

  /**
   * Handle invoice paid event
   *
   * Called when an invoice is successfully paid.
   * For subscriptions, this renews access and clears any payment_failed flags.
   * For one-time payments (credit packages), adds credits to the consumer balance.
   */
  async handleInvoicePaid(params: InvoicePaidParams): Promise<void> {
    const {
      invoiceId,
      customerId,
      subscriptionId,
      amountPaid,
      currency,
      metadata,
      billingReason,
      lines,
    } = params;

    console.log("[invoice.paid] Processing invoice", {
      invoiceId,
      customerId,
      subscriptionId,
      amountPaid,
      currency,
      billingReason,
      metadataType: metadata?.type,
    });

    // Check if this is a credit package purchase
    // Credit packages have metadata.type === 'PACKAGE' or 'package'
    const isPackagePurchase =
      metadata?.type?.toUpperCase() === "PACKAGE" ||
      lines?.some(
        (line) => line.price?.metadata?.type?.toUpperCase() === "PACKAGE"
      );

    if (isPackagePurchase) {
      // Handle credit package purchase
      await this.handleCreditPackagePurchase({
        invoiceId,
        customerId,
        amountPaid,
        currency,
        metadata,
        lines,
      });
      return;
    }

    if (subscriptionId) {
      // Subscription invoice - access is managed by subscription events
      // Clear any payment failure flags on the organization
      console.log(
        `[invoice.paid] Subscription payment successful: ${subscriptionId}`
      );

      // Find organization by Stripe customer ID and clear payment failure tracking
      const orgs = await sql`
        SELECT id, name FROM app.organizations
        WHERE stripe_customer_id = ${customerId}
        LIMIT 1
      `;

      if (orgs.length > 0) {
        console.log(
          `[invoice.paid] Payment successful for organization ${orgs[0].id} (${orgs[0].name})`
        );
        // Note: If we had a payment_failure_count column, we would reset it here:
        // UPDATE app.organizations SET payment_failure_count = 0 WHERE id = ${orgs[0].id}
      }
    } else {
      // One-time payment that isn't a credit package
      console.log(
        `[invoice.paid] One-time invoice paid: ${invoiceId} - ${amountPaid} ${currency}`
      );
    }
  },

  /**
   * Handle credit package purchase from invoice.paid
   *
   * Looks up the credit amount from line items and adds credits to the consumer's balance.
   */
  async handleCreditPackagePurchase(params: {
    invoiceId: string;
    customerId: string;
    amountPaid: number;
    currency: string;
    metadata: Record<string, string>;
    lines?: InvoicePaidParams["lines"];
  }): Promise<void> {
    const { invoiceId, customerId, metadata, lines } = params;

    console.log("[invoice.paid] Processing credit package purchase", {
      invoiceId,
      customerId,
      consumerIdentifier: metadata?.consumerIdentifier,
      applicationId: metadata?.applicationId,
      packageId: metadata?.packageId,
    });

    // Extract consumer info from metadata
    const consumerIdentifier = metadata?.consumerIdentifier;
    const applicationId = metadata?.applicationId;
    const packageId = metadata?.packageId;

    if (!consumerIdentifier || !applicationId) {
      console.warn(
        "[invoice.paid] Credit package purchase missing consumer metadata",
        {
          invoiceId,
          hasConsumerIdentifier: !!consumerIdentifier,
          hasApplicationId: !!applicationId,
        }
      );
      // Log but don't fail - we need the checkout.session.completed handler
      // to have the full context for credit purchases
      return;
    }

    // Look up credit amount from line item metadata or package lookup
    let creditAmount: number | null = null;

    // Try to get credit amount from line item price metadata
    if (lines && lines.length > 0) {
      for (const line of lines) {
        const tokenQty = line.price?.metadata?.tokenQty;
        if (tokenQty) {
          creditAmount = parseInt(tokenQty, 10);
          break;
        }
      }
    }

    // If no credit amount found in line items, try metadata directly
    if (!creditAmount && metadata?.tokenQty) {
      creditAmount = parseInt(metadata.tokenQty, 10);
    }

    if (!creditAmount) {
      console.warn(
        "[invoice.paid] Could not determine credit amount for package purchase",
        {
          invoiceId,
          packageId,
          linesCount: lines?.length,
        }
      );
      // TODO: Look up package from database by packageId to get tokenQty
      // For now, log and return - checkout.session.completed should handle this
      return;
    }

    console.log("[invoice.paid] Adding credits to consumer", {
      consumerIdentifier,
      applicationId,
      creditAmount,
      invoiceId,
    });

    // TODO: Create transaction record and update consumer credits
    // This requires the consumer billing tables to be fully implemented
    // For now, log the intent for audit purposes
    console.log("[invoice.paid] CREDIT_GRANT_INTENT", {
      type: "REFILL",
      consumerIdentifier,
      applicationId,
      creditAmount,
      invoiceId,
      customerId,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Handle invoice payment failed event
   *
   * Called when an invoice payment fails.
   * Tracks failure count, sends notifications, and considers access suspension after N failures.
   */
  async handleInvoicePaymentFailed(
    params: InvoicePaymentFailedParams
  ): Promise<void> {
    const {
      invoiceId,
      customerId,
      subscriptionId,
      attemptCount,
      nextPaymentAttempt,
      amountDue,
      currency,
      lastFinalizationError,
    } = params;

    console.log("[invoice.payment_failed] Processing payment failure", {
      invoiceId,
      customerId,
      subscriptionId,
      attemptCount,
      amountDue,
      currency,
      nextPaymentAttempt: nextPaymentAttempt
        ? new Date(nextPaymentAttempt * 1000).toISOString()
        : null,
      lastFinalizationError,
    });

    // Find the organization by Stripe customer ID
    const orgs = await sql`
      SELECT id, name FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
      LIMIT 1
    `;

    if (orgs.length === 0) {
      console.warn(
        `[invoice.payment_failed] No organization found for customer: ${customerId}`
      );
      return;
    }

    const org = orgs[0];

    // Log the failure details for querying/debugging
    // This provides an audit trail even without a dedicated column
    console.log("[invoice.payment_failed] PAYMENT_FAILURE_RECORD", {
      organizationId: org.id,
      organizationName: org.name,
      invoiceId,
      subscriptionId,
      attemptCount: attemptCount || 1,
      amountDue,
      currency,
      failureReason: lastFinalizationError || "Unknown",
      nextRetry: nextPaymentAttempt
        ? new Date(nextPaymentAttempt * 1000).toISOString()
        : null,
      timestamp: new Date().toISOString(),
    });

    // Determine severity based on attempt count
    const attempts = attemptCount || 1;
    const MAX_ATTEMPTS_BEFORE_REVIEW = 3;

    if (attempts >= MAX_ATTEMPTS_BEFORE_REVIEW) {
      // Flag organization for review after multiple failures
      console.warn(
        `[invoice.payment_failed] Organization ${org.id} has ${attempts} payment failures - flagging for review`,
        {
          organizationId: org.id,
          organizationName: org.name,
          attemptCount: attempts,
          invoiceId,
          subscriptionId,
        }
      );

      // Log a structured event for alerting/monitoring
      console.error("[invoice.payment_failed] PAYMENT_REVIEW_REQUIRED", {
        severity: "high",
        organizationId: org.id,
        organizationName: org.name,
        attemptCount: attempts,
        totalAmountDue: amountDue,
        currency,
        invoiceId,
        subscriptionId,
        timestamp: new Date().toISOString(),
      });

      // TODO: Consider suspending access or downgrading tier
      // This should be a business decision - for now we just flag it
    }

    // Send payment failed notification
    // TODO: Implement email notification when email service supports transactional billing emails
    // For now, log the notification intent
    console.log("[invoice.payment_failed] NOTIFICATION_INTENT", {
      type: "payment_failed",
      organizationId: org.id,
      organizationName: org.name,
      attemptCount: attempts,
      amountDue,
      currency,
      nextRetryDate: nextPaymentAttempt
        ? new Date(nextPaymentAttempt * 1000).toISOString()
        : null,
      failureReason: lastFinalizationError,
    });

    // Capture to Sentry for monitoring
    if (attempts >= 2) {
      Sentry.captureMessage("Payment failed for organization", {
        level: attempts >= MAX_ATTEMPTS_BEFORE_REVIEW ? "error" : "warning",
        tags: {
          source: "stripe-webhook",
          feature: "billing",
          eventType: "invoice.payment_failed",
        },
        extra: {
          organizationId: org.id,
          organizationName: org.name,
          invoiceId,
          subscriptionId,
          attemptCount: attempts,
          amountDue,
          currency,
          failureReason: lastFinalizationError,
        },
      });
    }
  },

  /**
   * Handle checkout session completed
   *
   * Called when a Stripe Checkout session is completed.
   * Handles various purchase types based on metadata.
   */
  async handleCheckoutCompleted(
    params: CheckoutCompletedParams
  ): Promise<void> {
    const {
      sessionId,
      customerId,
      mode,
      metadata,
      subscriptionId,
      paymentIntentId,
      livemode,
    } = params;

    console.log("[checkout] Processing checkout completed", {
      sessionId,
      customerId,
      mode,
      type: metadata.type,
      livemode,
    });

    // Normalize purchase type to uppercase for consistent matching
    const purchaseType = metadata.type?.toUpperCase();

    switch (purchaseType) {
      case "PACKAGE":
        await this.handleCheckoutPackagePurchase(params);
        break;

      case "ORG_PAYMENT_SETUP":
        await this.handleCheckoutOrgPaymentSetup(params);
        break;

      case "HQ_ACCESS":
        await this.handleCheckoutHqAccess(params);
        break;

      default:
        console.log(`[checkout] Unhandled checkout type: ${metadata.type}`);
    }
  },

  /**
   * Handle consumer credit package purchase from checkout.session.completed
   *
   * Steps:
   * 1. Find consumer by identifier + applicationId
   * 2. Look up credit package to get token quantity
   * 3. Add credits to consumer balance
   * 4. Create purchase record for audit trail
   *
   * Note: This may overlap with invoice.paid for subscription packages.
   * The idempotency should be handled via paymentIntentId.
   */
  async handleCheckoutPackagePurchase(
    params: CheckoutCompletedParams
  ): Promise<void> {
    const { sessionId, customerId, metadata, paymentIntentId, livemode } =
      params;

    const { consumerIdentifier, developerId, applicationId, packageId } =
      metadata;

    console.log("[checkout] Processing PACKAGE purchase", {
      sessionId,
      consumerIdentifier,
      developerId,
      applicationId,
      packageId,
    });

    // Validate required metadata
    if (!consumerIdentifier || !applicationId) {
      console.error(
        "[checkout] Missing required metadata for PACKAGE purchase",
        {
          consumerIdentifier,
          applicationId,
        }
      );
      Sentry.captureMessage("Missing metadata for package purchase checkout", {
        level: "warning",
        tags: { source: "billing-service", feature: "checkout-package" },
        extra: { sessionId, metadata },
      });
      return;
    }

    // Determine mode based on livemode flag
    const consumerMode = livemode ? "LIVE" : "TEST";

    // Find consumer by identifier and application
    const consumers = await sql`
      SELECT id, credits, stripe_customer_id
      FROM app.consumers
      WHERE identifier = ${consumerIdentifier}
        AND application_id = ${applicationId}::uuid
        AND mode = ${consumerMode}
        AND is_deleted = false
      LIMIT 1
    `;

    if (consumers.length === 0) {
      console.error("[checkout] Consumer not found for PACKAGE purchase", {
        consumerIdentifier,
        applicationId,
        mode: consumerMode,
      });
      Sentry.captureMessage("Consumer not found for package purchase", {
        level: "error",
        tags: { source: "billing-service", feature: "checkout-package" },
        extra: {
          consumerIdentifier,
          applicationId,
          mode: consumerMode,
          sessionId,
        },
      });
      return;
    }

    const consumer = consumers[0];

    // Determine credits to add
    // Priority: metadata.creditsAmount > package lookup > default
    let creditsToAdd = 0;

    if (metadata.creditsAmount) {
      // If credits amount is passed in metadata, use it
      creditsToAdd = parseInt(metadata.creditsAmount, 10);
      console.log("[checkout] Using creditsAmount from metadata", {
        creditsAmount: creditsToAdd,
      });
    } else if (packageId) {
      // TODO: Look up package from database when packages table exists
      // ChippMono does: Package.findUnique({ where: { id: packageId } }) -> tokenQty
      // For now, log a warning and use a default
      console.warn(
        "[checkout] Package lookup not implemented - packages table does not exist yet",
        { packageId }
      );
      // Default credit amount (should be replaced with actual package lookup)
      creditsToAdd = 100;
    }

    if (creditsToAdd <= 0) {
      console.error(
        "[checkout] Could not determine credits amount for PACKAGE purchase",
        { packageId, metadata }
      );
      Sentry.captureMessage("Could not determine credits for package", {
        level: "error",
        tags: { source: "billing-service", feature: "checkout-package" },
        extra: { packageId, metadata, sessionId },
      });
      return;
    }

    // Update consumer credits and store Stripe customer ID
    const currentCredits = consumer.credits || 0;
    const newCredits = currentCredits + creditsToAdd;

    await sql`
      UPDATE app.consumers
      SET
        credits = ${newCredits},
        stripe_customer_id = COALESCE(stripe_customer_id, ${customerId}),
        updated_at = NOW()
      WHERE id = ${consumer.id}::uuid
    `;

    console.log("[checkout] Added credits to consumer", {
      consumerId: consumer.id,
      creditsAdded: creditsToAdd,
      previousBalance: currentCredits,
      newBalance: newCredits,
    });

    // TODO: Create Purchase record when purchases table exists in database
    // The schema.ts defines PurchaseTable but it may not exist in the actual DB yet.
    // When it does, create a record like:
    // await sql`
    //   INSERT INTO app.purchases (
    //     consumer_id, application_id, stripe_payment_intent_id,
    //     amount, currency, status, credits_granted, mode
    //   )
    //   VALUES (
    //     ${consumer.id}, ${applicationId}, ${paymentIntentId},
    //     ${amountPaid}, 'usd', 'completed', ${creditsToAdd}, ${consumerMode}
    //   )
    // `;

    console.log("[checkout] PACKAGE purchase completed successfully", {
      consumerId: consumer.id,
      creditsGranted: creditsToAdd,
      paymentIntentId,
    });
  },

  /**
   * Handle organization payment method setup from checkout.session.completed
   *
   * This is triggered when an organization completes a checkout session
   * in setup mode to add a payment method (no immediate charge).
   *
   * Steps:
   * 1. Find organization by metadata.organizationId or customer lookup
   * 2. Log the event for audit trail
   * 3. Optionally update organization status
   */
  async handleCheckoutOrgPaymentSetup(
    params: CheckoutCompletedParams
  ): Promise<void> {
    const { sessionId, customerId, metadata } = params;

    console.log("[checkout] Processing ORG_PAYMENT_SETUP", {
      sessionId,
      customerId,
      organizationId: metadata.organizationId,
    });

    let orgId = metadata.organizationId;

    // If no organizationId in metadata, look up by customer ID
    if (!orgId && customerId) {
      const orgs = await sql`
        SELECT id FROM app.organizations
        WHERE stripe_customer_id = ${customerId}
        LIMIT 1
      `;

      if (orgs.length > 0) {
        orgId = orgs[0].id;
      }
    }

    if (!orgId) {
      console.warn("[checkout] Could not find organization for payment setup", {
        customerId,
        metadata,
      });
      Sentry.captureMessage("Could not find organization for payment setup", {
        level: "warning",
        tags: { source: "billing-service", feature: "checkout-payment-setup" },
        extra: { customerId, metadata, sessionId },
      });
      return;
    }

    // Log the successful payment method setup
    console.log("[checkout] Organization payment method setup completed", {
      organizationId: orgId,
      customerId,
      sessionId,
    });

    // Note: The payment method is now attached to the Stripe customer.
    // We don't need to store a flag in the database because we can
    // verify payment method status via getPaymentMethodStatus() when needed.
    //
    // If we later add a has_payment_method column to organizations for caching,
    // update it here:
    // await sql`
    //   UPDATE app.organizations
    //   SET has_payment_method = true, updated_at = NOW()
    //   WHERE id = ${orgId}::uuid
    // `;
  },

  /**
   * Handle HQ/Workspace access purchase from checkout.session.completed
   *
   * This is triggered when a user purchases access to another creator's
   * workspace/HQ (for public_paid workspaces).
   *
   * Steps:
   * 1. Find the workspace by workspaceId or hqId from metadata
   * 2. Find or identify the purchasing user
   * 3. Grant access by creating workspace_member record
   */
  async handleCheckoutHqAccess(params: CheckoutCompletedParams): Promise<void> {
    const { sessionId, customerId, metadata } = params;

    const workspaceId = metadata.workspaceId || metadata.hqId;
    const userId = metadata.userId || metadata.developerId;

    console.log("[checkout] Processing HQ_ACCESS purchase", {
      sessionId,
      customerId,
      workspaceId,
      userId,
    });

    if (!workspaceId) {
      console.error("[checkout] Missing workspaceId for HQ_ACCESS purchase", {
        metadata,
      });
      Sentry.captureMessage("Missing workspaceId for HQ access purchase", {
        level: "error",
        tags: { source: "billing-service", feature: "checkout-hq-access" },
        extra: { metadata, sessionId },
      });
      return;
    }

    if (!userId) {
      console.error("[checkout] Missing userId for HQ_ACCESS purchase", {
        metadata,
      });
      Sentry.captureMessage("Missing userId for HQ access purchase", {
        level: "error",
        tags: { source: "billing-service", feature: "checkout-hq-access" },
        extra: { metadata, sessionId },
      });
      return;
    }

    // Check if workspace exists
    const workspaces = await sql`
      SELECT id, name FROM app.workspaces
      WHERE id = ${workspaceId}::uuid
      LIMIT 1
    `;

    if (workspaces.length === 0) {
      console.error("[checkout] Workspace not found for HQ_ACCESS purchase", {
        workspaceId,
      });
      Sentry.captureMessage("Workspace not found for HQ access purchase", {
        level: "error",
        tags: { source: "billing-service", feature: "checkout-hq-access" },
        extra: { workspaceId, sessionId },
      });
      return;
    }

    const workspace = workspaces[0];

    // Check if user already has access
    const existingMembership = await sql`
      SELECT id FROM app.workspace_members
      WHERE workspace_id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid
      LIMIT 1
    `;

    if (existingMembership.length > 0) {
      console.log("[checkout] User already has workspace access", {
        workspaceId,
        userId,
        existingMembershipId: existingMembership[0].id,
      });
      // Not an error - user might have purchased access that was already granted
      return;
    }

    // Grant access by creating workspace member record
    // Use VIEWER role for purchased access (read-only access)
    await sql`
      INSERT INTO app.workspace_members (workspace_id, user_id, role, joined_via_public_invite)
      VALUES (${workspaceId}::uuid, ${userId}::uuid, 'VIEWER', true)
    `;

    console.log("[checkout] HQ_ACCESS granted successfully", {
      workspaceId,
      workspaceName: workspace.name,
      userId,
      sessionId,
    });

    // TODO: If HQAccessGrant table exists (for consumer access tracking), create record:
    // This would be for tracking consumer (non-user) access to public_paid workspaces.
    // ChippMono has both WorkspaceMember (for users) and HQAccessGrant (for consumers).
    // await sql`
    //   INSERT INTO app.hq_access_grants (workspace_id, consumer_id, granted_at, stripe_session_id)
    //   VALUES (${workspaceId}, ${consumerId}, NOW(), ${sessionId})
    // `;
  },

  // ========================================
  // Dispute & Refund Handlers (Compliance Critical)
  // ========================================

  /**
   * Handle dispute created event
   *
   * Called when a customer disputes a charge. This is compliance-critical
   * and requires immediate team notification.
   *
   * Actions:
   * - Log dispute details for audit trail
   * - Alert team immediately via Sentry (error level for visibility)
   * - Store dispute info for tracking
   */
  async handleDisputeCreated(params: DisputeCreatedParams): Promise<void> {
    const {
      disputeId,
      chargeId,
      paymentIntentId,
      customerId,
      amount,
      currency,
      reason,
      status,
      evidenceDueBy,
      livemode,
    } = params;

    const evidenceDeadline = new Date(evidenceDueBy * 1000);
    const daysUntilDeadline = Math.ceil(
      (evidenceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    console.log("[dispute.created] Processing dispute", {
      disputeId,
      chargeId,
      paymentIntentId,
      customerId,
      amount,
      currency,
      reason,
      status,
      evidenceDeadline: evidenceDeadline.toISOString(),
      daysUntilDeadline,
      livemode,
    });

    // Find organization by Stripe customer ID for context
    const orgs = await sql`
      SELECT id, name FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
         OR stripe_sandbox_customer_id = ${customerId}
      LIMIT 1
    `;

    const org = orgs[0] as { id: string; name: string } | undefined;

    // Log structured dispute record for querying
    console.error("[dispute.created] DISPUTE_RECORD", {
      severity: "critical",
      disputeId,
      chargeId,
      paymentIntentId,
      customerId,
      organizationId: org?.id || null,
      organizationName: org?.name || null,
      amount,
      currency,
      amountFormatted: `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`,
      reason,
      status,
      evidenceDeadline: evidenceDeadline.toISOString(),
      daysUntilDeadline,
      livemode,
      timestamp: new Date().toISOString(),
    });

    // Alert team immediately via Sentry at error level for high visibility
    // Disputes are compliance-critical and require prompt attention
    Sentry.captureMessage(`Dispute created: ${disputeId}`, {
      level: "error", // Error level ensures high visibility and alerts
      tags: {
        source: "stripe-webhook",
        feature: "dispute",
        eventType: "charge.dispute.created",
        reason,
        livemode: String(livemode),
      },
      extra: {
        disputeId,
        chargeId,
        paymentIntentId,
        customerId,
        organizationId: org?.id,
        organizationName: org?.name,
        amount,
        currency,
        amountFormatted: `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`,
        reason,
        status,
        evidenceDeadline: evidenceDeadline.toISOString(),
        daysUntilDeadline,
        actionRequired:
          "Review dispute and submit evidence before deadline. Contact customer if possible.",
      },
    });

    // TODO: Consider adding a disputes table for tracking
    // For now, disputes are tracked via Sentry alerts and structured logs
    // The team should review via Stripe Dashboard

    // TODO: Send Slack notification to #chipp-disputes or similar channel
    // This would be implemented when Slack integration service is available
  },

  /**
   * Handle dispute closed event
   *
   * Called when a dispute is resolved (won, lost, or withdrawn).
   * Logs the outcome for financial reporting.
   */
  async handleDisputeClosed(params: DisputeClosedParams): Promise<void> {
    const { disputeId, chargeId, customerId, amount, status, livemode } =
      params;

    console.log("[dispute.closed] Processing dispute resolution", {
      disputeId,
      chargeId,
      customerId,
      amount,
      status,
      livemode,
    });

    // Find organization for context
    const orgs = await sql`
      SELECT id, name FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
         OR stripe_sandbox_customer_id = ${customerId}
      LIMIT 1
    `;

    const org = orgs[0] as { id: string; name: string } | undefined;

    // Log structured resolution record for financial reporting
    console.log("[dispute.closed] DISPUTE_RESOLUTION", {
      disputeId,
      chargeId,
      customerId,
      organizationId: org?.id || null,
      organizationName: org?.name || null,
      amount,
      amountFormatted: `${(amount / 100).toFixed(2)} USD`,
      resolution: status, // 'won', 'lost', or 'withdrawn'
      livemode,
      timestamp: new Date().toISOString(),
    });

    // Different handling based on resolution
    if (status === "lost") {
      // Log loss for financial reporting - this is revenue that's gone
      console.warn("[dispute.closed] DISPUTE_LOST", {
        disputeId,
        chargeId,
        customerId,
        organizationId: org?.id,
        organizationName: org?.name,
        amountLost: amount,
        amountLostFormatted: `${(amount / 100).toFixed(2)} USD`,
        livemode,
        timestamp: new Date().toISOString(),
      });

      // Capture to Sentry for tracking lost disputes
      Sentry.captureMessage(`Dispute lost: ${disputeId}`, {
        level: "warning",
        tags: {
          source: "stripe-webhook",
          feature: "dispute",
          eventType: "charge.dispute.closed",
          resolution: "lost",
          livemode: String(livemode),
        },
        extra: {
          disputeId,
          chargeId,
          customerId,
          organizationId: org?.id,
          organizationName: org?.name,
          amountLost: amount,
          note: "Dispute was lost. Amount has been deducted from account.",
        },
      });
    } else if (status === "won") {
      console.log("[dispute.closed] Dispute won", {
        disputeId,
        chargeId,
        amount,
        organizationId: org?.id,
      });

      // Capture win for tracking
      Sentry.addBreadcrumb({
        category: "billing",
        message: `Dispute won: ${disputeId}`,
        level: "info",
        data: {
          disputeId,
          chargeId,
          customerId,
          organizationId: org?.id,
          amount,
        },
      });
    } else if (status === "withdrawn") {
      console.log("[dispute.closed] Dispute withdrawn by customer", {
        disputeId,
        chargeId,
        amount,
        organizationId: org?.id,
      });
    }
  },

  /**
   * Handle charge refunded event
   *
   * Called when a charge is refunded (full or partial).
   * Logs refund details for financial reporting and transaction tracking.
   */
  async handleChargeRefunded(params: ChargeRefundedParams): Promise<void> {
    const {
      chargeId,
      refundId,
      customerId,
      amount,
      currency,
      reason,
      paymentIntentId,
      invoiceId,
      livemode,
      metadata,
    } = params;

    console.log("[charge.refunded] Processing refund", {
      chargeId,
      refundId,
      customerId,
      amount,
      currency,
      reason,
      paymentIntentId,
      invoiceId,
      livemode,
    });

    // Find organization for context
    const orgs = await sql`
      SELECT id, name FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
         OR stripe_sandbox_customer_id = ${customerId}
      LIMIT 1
    `;

    const org = orgs[0] as { id: string; name: string } | undefined;

    // Log structured refund record for financial reporting
    console.log("[charge.refunded] REFUND_RECORD", {
      refundId,
      chargeId,
      paymentIntentId,
      invoiceId,
      customerId,
      organizationId: org?.id || null,
      organizationName: org?.name || null,
      amount,
      currency,
      amountFormatted: `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`,
      reason: reason || "not_specified",
      livemode,
      timestamp: new Date().toISOString(),
    });

    // Check if this refund relates to a credit purchase
    // If metadata indicates this was a credit package purchase, we may need to deduct credits
    const isCreditPurchase =
      metadata?.type?.toUpperCase() === "CREDIT_TOPUP" ||
      metadata?.type?.toUpperCase() === "PACKAGE";

    if (isCreditPurchase) {
      console.warn("[charge.refunded] CREDIT_REFUND_INTENT", {
        refundId,
        chargeId,
        customerId,
        organizationId: org?.id,
        amount,
        note: "Refund is for a credit purchase - credits may need to be deducted",
        timestamp: new Date().toISOString(),
      });

      // TODO: When credit tracking is fully implemented, deduct credits here
      // This would involve:
      // 1. Finding the original credit grant associated with this charge
      // 2. Voiding or reducing the credit grant proportionally
      // 3. Updating organization's credit balance

      Sentry.captureMessage("Credit purchase refunded - manual review needed", {
        level: "warning",
        tags: {
          source: "stripe-webhook",
          feature: "refund",
          eventType: "charge.refunded",
        },
        extra: {
          refundId,
          chargeId,
          customerId,
          organizationId: org?.id,
          amount,
          note: "Credits may need to be manually adjusted in Stripe",
        },
      });
    }

    // Capture to Sentry for significant refunds (over $50)
    if (amount >= 5000) {
      Sentry.addBreadcrumb({
        category: "billing",
        message: `Significant refund processed: ${refundId}`,
        level: "info",
        data: {
          refundId,
          chargeId,
          customerId,
          organizationId: org?.id,
          amount,
          currency,
          reason,
        },
      });
    }
  },

  // ========================================
  // Billing Alert Handlers (v2 Usage-Based Billing)
  // ========================================

  /**
   * Handle billing.alert.triggered webhook event
   *
   * Handles three types of billing alerts:
   * 1. $0 threshold alerts - Set creditsExhausted flag to block API usage
   * 2. Notification alerts (title starts with "notification:") - Log notification intent
   * 3. Auto-topup alerts - Charge payment method and grant credits
   *
   * Auto-topup flow:
   * 1. Check if topup_enabled is true in customer metadata
   * 2. Verify default payment method exists
   * 3. Create payment intent for topup_amount_cents
   * 4. On success, create credit grant via Stripe v2 API
   * 5. Clear creditsExhausted flag
   */
  async handleBillingAlert(params: BillingAlertParams): Promise<void> {
    const {
      alertId,
      customerId,
      alertType,
      title,
      thresholdCents,
      livemode,
    } = params;

    console.log("[billing.alert] Processing billing alert", {
      alertId,
      alertType,
      customerId,
      thresholdCents,
      title,
      livemode,
    });

    if (!customerId) {
      console.warn("[billing.alert] No customer ID in billing alert", {
        alertId,
      });
      return;
    }

    // Find organization by Stripe customer ID (check both production and sandbox)
    const orgs = await sql`
      SELECT
        id,
        name,
        stripe_customer_id,
        stripe_sandbox_customer_id,
        credits_exhausted
      FROM app.organizations
      WHERE stripe_customer_id = ${customerId}
         OR stripe_sandbox_customer_id = ${customerId}
      LIMIT 1
    `;

    if (orgs.length === 0) {
      console.warn("[billing.alert] Organization not found for customer", {
        customerId,
        alertId,
      });
      return;
    }

    const org = orgs[0];
    const isSandboxCustomer = org.stripe_sandbox_customer_id === customerId;

    console.log("[billing.alert] Processing alert for organization", {
      organizationId: org.id,
      organizationName: org.name,
      customerId,
      thresholdCents,
      isSandbox: isSandboxCustomer,
    });

    // Check if this is a notification alert (title starts with "notification:")
    const isNotificationAlert = title?.startsWith("notification:");

    // Handle $0 balance alert - set creditsExhausted flag
    if (thresholdCents === 0) {
      console.log("[billing.alert] Credits exhausted - setting flag", {
        organizationId: org.id,
        customerId,
      });

      // Update credits_exhausted flag in database
      await sql`
        UPDATE app.organizations
        SET
          credits_exhausted = true,
          updated_at = NOW()
        WHERE id = ${org.id}
      `;

      console.warn("[billing.alert] CREDITS_EXHAUSTED_FLAG_SET", {
        organizationId: org.id,
        organizationName: org.name,
        customerId,
        isSandbox: isSandboxCustomer,
        timestamp: new Date().toISOString(),
      });

      // Log notification intent for exhausted credits email
      // TODO: Implement sendLowCreditsEmail when email service supports it
      console.log("[billing.alert] NOTIFICATION_INTENT", {
        type: "credits_exhausted",
        severity: "exhausted",
        organizationId: org.id,
        organizationName: org.name,
        creditBalanceCents: 0,
        timestamp: new Date().toISOString(),
      });

      // $0 alerts don't trigger auto-topup - just set the flag
      return;
    }

    // Handle notification alerts (not auto-topup)
    if (isNotificationAlert) {
      console.log("[billing.alert] Processing notification alert", {
        organizationId: org.id,
        thresholdCents,
        title,
      });

      // Log notification intent for low credits email
      // TODO: Implement sendLowCreditsEmail when email service supports it
      console.log("[billing.alert] NOTIFICATION_INTENT", {
        type: "low_credits",
        severity: "low",
        organizationId: org.id,
        organizationName: org.name,
        thresholdCents,
        timestamp: new Date().toISOString(),
      });

      // Notification alerts don't trigger auto-topup
      return;
    }

    // This is an auto-topup alert - check settings and process topup
    await this.processAutoTopup(
      customerId,
      org.id,
      org.name,
      isSandboxCustomer,
      alertId
    );
  },

  /**
   * Process automatic credit top-up for a customer
   *
   * Steps:
   * 1. Get customer metadata to check if topup is enabled
   * 2. Verify default payment method exists
   * 3. Create payment intent for topup amount
   * 4. Create credit grant via Stripe v2 API
   * 5. Clear creditsExhausted flag
   * 6. Log for Slack notification (fire-and-forget)
   */
  async processAutoTopup(
    customerId: string,
    organizationId: number | string,
    organizationName: string,
    isSandbox: boolean,
    alertId: string
  ): Promise<void> {
    const stripeKey = getStripeApiKey(isSandbox);
    if (!stripeKey) {
      console.error("[billing.alert] Stripe not configured for auto-topup");
      return;
    }

    const stripeClient = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });

    // Get customer to read topup settings
    let customer: Stripe.Customer;
    try {
      customer = (await stripeClient.customers.retrieve(
        customerId
      )) as Stripe.Customer;
    } catch (error) {
      console.error("[billing.alert] Failed to retrieve customer", {
        customerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const metadata = customer.metadata || {};
    const topupEnabled = metadata.topup_enabled === "true";
    const topupAmountCents = metadata.topup_amount_cents
      ? parseInt(metadata.topup_amount_cents, 10)
      : 2000; // Default $20

    // Check if auto-topup is enabled
    if (!topupEnabled) {
      console.log("[billing.alert] Auto-topup not enabled for customer", {
        customerId,
        organizationId,
      });
      return;
    }

    // Check for default payment method
    const defaultPaymentMethod =
      customer.invoice_settings?.default_payment_method ||
      customer.default_source;

    if (!defaultPaymentMethod) {
      console.warn("[billing.alert] No default payment method for auto-topup", {
        customerId,
        organizationId,
      });
      return;
    }

    console.log("[billing.alert] Executing automatic top-up", {
      customerId,
      organizationId,
      amount: topupAmountCents,
      alertId,
    });

    // Create payment intent for the top-up amount
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.create({
        amount: topupAmountCents,
        currency: "usd",
        customer: customerId,
        payment_method: defaultPaymentMethod as string,
        confirm: true,
        off_session: true,
        description: `Automatic credit top-up (Alert ${alertId})`,
        metadata: {
          type: "auto_topup",
          alert_id: alertId,
          organization_id: organizationId.toString(),
          upsellSource: "auto_topup",
        },
      });
    } catch (paymentError) {
      console.error("[billing.alert] Auto-topup payment failed", {
        customerId,
        organizationId,
        error:
          paymentError instanceof Error
            ? paymentError.message
            : String(paymentError),
      });

      Sentry.captureException(paymentError, {
        tags: {
          source: "billing-service",
          feature: "auto-topup-payment",
        },
        extra: {
          customerId,
          organizationId,
          amountCents: topupAmountCents,
          alertId,
          isSandbox,
        },
      });
      return;
    }

    if (paymentIntent.status !== "succeeded") {
      console.error("[billing.alert] Auto-topup payment did not succeed", {
        customerId,
        organizationId,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
      });

      Sentry.captureMessage("Auto-topup payment incomplete", {
        level: "error",
        tags: {
          source: "billing-service",
          feature: "auto-topup-payment",
        },
        extra: {
          customerId,
          organizationId,
          paymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status,
          amountCents: topupAmountCents,
          isSandbox,
        },
      });
      return;
    }

    console.log("[billing.alert] Auto-topup payment succeeded", {
      customerId,
      organizationId,
      paymentIntentId: paymentIntent.id,
      isSandbox,
    });

    // Create credit grant via Stripe v2 API
    const grantResp = await fetch(
      "https://api.stripe.com/v1/billing/credit_grants",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": STRIPE_V2_API_VERSION,
        },
        body: new URLSearchParams({
          customer: customerId,
          "amount[type]": "monetary",
          "amount[monetary][currency]": "usd",
          "amount[monetary][value]": String(topupAmountCents),
          "applicability_config[scope][price_type]": "metered",
          category: "paid",
          name: `Automatic Top-up (Alert ${alertId})`,
          "metadata[type]": "auto_topup",
          "metadata[upsellSource]": "auto_topup",
          "metadata[organizationId]": organizationId.toString(),
        }).toString(),
      }
    );

    if (!grantResp.ok) {
      const grantErrorText = await grantResp.text();
      console.error(
        "[billing.alert] Failed to create credit grant for auto-topup",
        {
          customerId,
          organizationId,
          grantError: grantErrorText,
          paymentIntentId: paymentIntent.id,
        }
      );

      Sentry.captureException(
        new Error(`Failed to create credit grant: ${grantErrorText}`),
        {
          tags: {
            source: "billing-service",
            feature: "auto-topup-grant",
          },
          extra: {
            customerId,
            organizationId,
            paymentIntentId: paymentIntent.id,
            amountCents: topupAmountCents,
            responseStatus: grantResp.status,
            responseBody: grantErrorText,
            isSandbox,
          },
        }
      );

      // Attempt to refund the successful payment if we couldn't grant credits
      try {
        await stripeClient.refunds.create({
          payment_intent: paymentIntent.id,
          amount: topupAmountCents,
        });
        console.warn(
          "[billing.alert] Refunded auto-topup payment due to grant failure",
          {
            customerId,
            organizationId,
            paymentIntentId: paymentIntent.id,
          }
        );
      } catch (refundError) {
        console.error(
          "[billing.alert] Failed to refund after grant creation error",
          {
            customerId,
            organizationId,
            paymentIntentId: paymentIntent.id,
            error:
              refundError instanceof Error
                ? refundError.message
                : String(refundError),
          }
        );

        Sentry.captureException(refundError, {
          tags: {
            source: "billing-service",
            feature: "auto-topup-refund",
          },
          extra: {
            customerId,
            organizationId,
            paymentIntentId: paymentIntent.id,
            amountCents: topupAmountCents,
            originalError: grantErrorText,
            isSandbox,
          },
        });
      }

      return;
    }

    const grant = await grantResp.json();

    // Clear creditsExhausted flag now that credits have been added
    await sql`
      UPDATE app.organizations
      SET
        credits_exhausted = false,
        updated_at = NOW()
      WHERE id = ${organizationId}
    `;

    console.log("[billing.alert] Auto-topup completed successfully", {
      customerId,
      organizationId,
      paymentIntentId: paymentIntent.id,
      creditGrantId: (grant as Record<string, unknown>)?.id,
      amount: topupAmountCents,
    });

    // Log for Slack notification (fire-and-forget)
    // TODO: Implement notifySlackOfCreditTopup when Slack integration is ready
    console.log("[billing.alert] SLACK_NOTIFICATION_INTENT", {
      type: "automatic_credit_topup",
      amountCents: topupAmountCents,
      organizationId,
      organizationName,
      isSandbox,
      paymentIntentId: paymentIntent.id,
      creditGrantId: (grant as Record<string, unknown>)?.id,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Create Stripe billing portal session
   */
  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
    organizationName: string;
  }): Promise<string> {
    if (!isStripeConfigured() || !stripe) {
      throw new Error("Stripe is not configured");
    }

    try {
      // Ensure billing portal configuration exists
      // Note: This is idempotent - Stripe will return existing config if it exists
      await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: `${params.organizationName} Subscription Management`,
        },
        features: {
          invoice_history: {
            enabled: true,
          },
          payment_method_update: {
            enabled: true,
          },
          subscription_cancel: {
            enabled: true,
          },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price", "quantity"],
            proration_behavior: "create_prorations",
          },
        },
      });

      // Create billing portal session
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });

      return portalSession.url;
    } catch (error) {
      console.error("[billing] Stripe portal session creation error:", error);
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "stripe-portal" },
        extra: {
          customerId: params.customerId,
          organizationName: params.organizationName,
        },
      });

      // Handle customer not found
      if (
        error instanceof Error &&
        (error.message.includes("customer") ||
          error.message.includes("No such customer"))
      ) {
        throw new Error(
          "Billing account not found. Please contact support for assistance."
        );
      }

      throw error;
    }
  },

  /**
   * Get organization billing context for a user
   * Returns all org info needed for billing operations
   */
  async getOrganizationBillingContext(
    userId: string
  ): Promise<OrganizationBillingContext> {
    const result = await sql`
      SELECT
        o.id,
        o.name,
        o.stripe_customer_id,
        o.subscription_tier
      FROM app.users u
      JOIN app.organizations o ON u.organization_id = o.id
      WHERE u.id = ${userId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization for user", userId);
    }

    const org = result[0];
    const useSandbox = Deno.env.get("USE_STRIPE_SANDBOX") === "true";

    return {
      organizationId: org.id,
      organizationName: org.name,
      stripeCustomerId: org.stripe_customer_id || null,
      stripeSandboxCustomerId: null, // Not yet implemented in schema
      useSandboxForUsageBilling: useSandbox,
      usageBasedBillingEnabled: true, // Always enabled
      subscriptionTier: org.subscription_tier as SubscriptionTier,
    };
  },

  /**
   * Get the effective Stripe customer ID for an organization
   */
  getEffectiveCustomerId(context: OrganizationBillingContext): string | null {
    return context.useSandboxForUsageBilling
      ? context.stripeSandboxCustomerId
      : context.stripeCustomerId;
  },

  /**
   * Check if an organization has sufficient credits for voice usage.
   * Returns { hasCredits: true } if credits are available.
   * Returns { hasCredits: false, balance: number } if credits are exhausted.
   */
  async checkCreditsForVoice(
    organizationId: string
  ): Promise<CreditCheckResult> {
    // Get organization billing context
    const result = await sql`
      SELECT
        o.id,
        o.stripe_customer_id,
        o.stripe_sandbox_customer_id,
        o.use_sandbox_for_usage_billing
      FROM app.organizations o
      WHERE o.id = ${organizationId}
    `;

    if (result.length === 0) {
      // Organization not found - fail open
      return { hasCredits: true };
    }

    const org = result[0];

    // Determine sandbox mode
    const useSandbox =
      Deno.env.get("USE_STRIPE_SANDBOX") === "true" ||
      Boolean(org.use_sandbox_for_usage_billing);

    // Get customer ID
    const customerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;

    if (!customerId) {
      // No customer ID means no billing set up - allow the call
      return { hasCredits: true };
    }

    try {
      const stripeKey = getStripeApiKey(useSandbox);
      if (!stripeKey) {
        // Stripe not configured - fail open
        return { hasCredits: true };
      }

      // Fetch credit balance from Stripe
      const balanceParams = new URLSearchParams({
        customer: customerId,
        "filter[type]": "applicability_scope",
        "filter[applicability_scope][price_type]": "metered",
      });

      const balanceRes = await fetch(
        `https://api.stripe.com/v1/billing/credit_balance_summary?${balanceParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/json",
            "Stripe-Version": STRIPE_V2_API_VERSION,
          },
        }
      );

      if (!balanceRes.ok) {
        // On error, allow the call to proceed (fail open for credit checks)
        const errText = await balanceRes.text();
        console.error("[billing] Failed to check credit balance:", errText);
        Sentry.captureException(
          new Error(`Credit balance check failed: ${errText}`),
          {
            tags: { source: "billing-service", feature: "credit-check" },
            extra: { organizationId, customerId },
          }
        );
        return { hasCredits: true };
      }

      const balanceData = (await balanceRes.json()) as {
        balances?: Array<{
          available_balance?: { monetary?: { value?: number } };
        }>;
      };
      const creditBalanceCents =
        balanceData?.balances?.[0]?.available_balance?.monetary?.value ?? 0;

      // Check if credits are exhausted
      if (creditBalanceCents <= 0) {
        return { hasCredits: false, balance: creditBalanceCents };
      }

      return { hasCredits: true, balance: creditBalanceCents };
    } catch (error) {
      // On error, allow the call to proceed (fail open for credit checks)
      console.error("[billing] Error checking credit balance:", error);
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "credit-check" },
        extra: { organizationId },
      });
      return { hasCredits: true };
    }
  },

  /**
   * Get payment method status for an organization
   */
  async getPaymentMethodStatus(
    context: OrganizationBillingContext
  ): Promise<PaymentMethodStatus> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    let customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      // Return empty status if no customer
      return {
        customerId: "",
        has_default_payment_method: false,
        card: null,
      };
    }

    const stripeClient = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });

    const customer = (await stripeClient.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    })) as Stripe.Customer;

    const defaultPaymentMethodId =
      customer.invoice_settings?.default_payment_method;

    // Extract card details if available
    let cardDetails: PaymentMethodStatus["card"] = null;

    // First try to get card details from default payment method
    if (
      defaultPaymentMethodId &&
      typeof defaultPaymentMethodId === "object" &&
      "card" in defaultPaymentMethodId
    ) {
      const pm = defaultPaymentMethodId as Stripe.PaymentMethod;
      if (pm.card) {
        cardDetails = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    }

    // If no default payment method, check for any attached payment methods
    if (!cardDetails) {
      const paymentMethods = await stripeClient.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length > 0 && paymentMethods.data[0].card) {
        const card = paymentMethods.data[0].card;
        cardDetails = {
          brand: card.brand,
          last4: card.last4,
          exp_month: card.exp_month,
          exp_year: card.exp_year,
        };
      }
    }

    const hasPaymentMethod = Boolean(
      defaultPaymentMethodId || customer.default_source || cardDetails
    );

    return {
      customerId,
      has_default_payment_method: hasPaymentMethod,
      card: cardDetails,
    };
  },

  /**
   * Get auto-topup settings for an organization
   */
  async getTopupSettings(
    context: OrganizationBillingContext
  ): Promise<TopupSettings> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      return {
        customerId: "",
        settings: {
          enabled: false,
          amount_cents: 2000,
          threshold_percent: 20,
        },
        has_default_payment_method: false,
      };
    }

    const stripeClient = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });

    const customer = (await stripeClient.customers.retrieve(
      customerId
    )) as Stripe.Customer;
    const md = customer.metadata || {};

    const DEFAULTS = {
      enabled: false,
      amountCents: 2000,
      thresholdPercent: 20,
    };

    const enabled = md.topup_enabled
      ? md.topup_enabled === "true"
      : DEFAULTS.enabled;
    const amountCents = md.topup_amount_cents
      ? parseInt(md.topup_amount_cents, 10)
      : DEFAULTS.amountCents;
    const thresholdPercent = md.topup_threshold_percent
      ? parseInt(md.topup_threshold_percent, 10)
      : DEFAULTS.thresholdPercent;

    const hasDefaultPaymentMethod = Boolean(
      (customer.invoice_settings?.default_payment_method as string | null) ||
        customer.default_source
    );

    return {
      customerId,
      settings: {
        enabled,
        amount_cents: amountCents,
        threshold_percent: thresholdPercent,
      },
      has_default_payment_method: hasDefaultPaymentMethod,
    };
  },

  /**
   * Update auto-topup settings for an organization
   */
  async updateTopupSettings(
    context: OrganizationBillingContext,
    settings: {
      enabled?: boolean;
      amount_cents?: number;
      threshold_percent?: number;
    }
  ): Promise<TopupSettings> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      throw new BadRequestError("No Stripe customer found for organization");
    }

    // Validate inputs
    if (
      settings.amount_cents != null &&
      (typeof settings.amount_cents !== "number" || settings.amount_cents <= 0)
    ) {
      throw new BadRequestError("amount_cents must be a positive number");
    }
    if (
      settings.threshold_percent != null &&
      (typeof settings.threshold_percent !== "number" ||
        settings.threshold_percent < 0 ||
        settings.threshold_percent > 100)
    ) {
      throw new BadRequestError("threshold_percent must be between 0 and 100");
    }

    const stripeClient = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });

    const mdUpdates: Record<string, string> = {};
    if (settings.enabled != null)
      mdUpdates.topup_enabled = settings.enabled ? "true" : "false";
    if (settings.amount_cents != null)
      mdUpdates.topup_amount_cents = String(settings.amount_cents);
    if (settings.threshold_percent != null)
      mdUpdates.topup_threshold_percent = String(settings.threshold_percent);

    const updated = await stripeClient.customers.update(customerId, {
      metadata: mdUpdates,
    });

    const DEFAULTS = {
      enabled: false,
      amountCents: 2000,
      thresholdPercent: 20,
    };

    const hasDefaultPaymentMethod = Boolean(
      (updated.invoice_settings?.default_payment_method as string | null) ||
        updated.default_source
    );

    return {
      customerId,
      settings: {
        enabled: (updated.metadata?.topup_enabled || "false") === "true",
        amount_cents: parseInt(
          updated.metadata?.topup_amount_cents || String(DEFAULTS.amountCents),
          10
        ),
        threshold_percent: parseInt(
          updated.metadata?.topup_threshold_percent ||
            String(DEFAULTS.thresholdPercent),
          10
        ),
      },
      has_default_payment_method: hasDefaultPaymentMethod,
    };
  },

  /**
   * Perform a manual credit top-up
   */
  async topupNow(
    context: OrganizationBillingContext,
    params: { amount_cents: number; upsellSource?: string }
  ): Promise<{ success: boolean; grant?: object; payment_intent?: string }> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      throw new BadRequestError("No Stripe customer found for organization");
    }

    if (typeof params.amount_cents !== "number" || params.amount_cents <= 0) {
      throw new BadRequestError("amount_cents must be a positive number");
    }

    const stripeClient = new Stripe(stripeKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });

    // Get customer and check for default payment method
    const customer = (await stripeClient.customers.retrieve(
      customerId
    )) as Stripe.Customer;
    const defaultPm = customer.invoice_settings?.default_payment_method as
      | string
      | null;

    if (!defaultPm) {
      throw new BadRequestError(
        "No default payment method. Please add a payment method first."
      );
    }

    // 1) Charge the default payment method
    const pi = await stripeClient.paymentIntents.create({
      amount: params.amount_cents,
      currency: "usd",
      customer: customerId,
      payment_method: defaultPm,
      confirm: true,
      off_session: true,
      description: "Chipp credits top-up",
      metadata: {
        organizationId: context.organizationId.toString(),
        type: "credit_topup",
        upsellSource: params.upsellSource || "direct",
      },
    });

    if (pi.status !== "succeeded") {
      throw new BadRequestError(`Payment not completed: ${pi.status}`);
    }

    // 2) Create a credit grant so the allowance reflects in v2 billing
    const grantResp = await fetch(
      "https://api.stripe.com/v1/billing/credit_grants",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": STRIPE_V2_API_VERSION,
        },
        body: new URLSearchParams({
          customer: customerId,
          "amount[type]": "monetary",
          "amount[monetary][currency]": "usd",
          "amount[monetary][value]": String(params.amount_cents),
          "applicability_config[scope][price_type]": "metered",
          category: "paid",
          name: "Manual Top-up",
          "metadata[type]": "manual_topup",
          "metadata[upsellSource]": params.upsellSource || "direct",
          "metadata[organizationId]": context.organizationId.toString(),
        }).toString(),
      }
    );

    if (!grantResp.ok) {
      const errText = await grantResp.text();
      console.error("[TOPUP ERROR] Failed to create credit grant:", errText);
      Sentry.captureException(
        new Error(`Failed to create credit grant: ${errText}`),
        {
          tags: { source: "billing-service", feature: "credit-topup" },
          extra: {
            organizationId: context.organizationId,
            customerId,
            amountCents: params.amount_cents,
            paymentIntentId: pi.id,
          },
        }
      );

      // Attempt to refund the payment if we failed to grant credits
      try {
        await stripeClient.refunds.create({
          payment_intent: pi.id,
          amount: params.amount_cents,
        });
      } catch (refundErr) {
        console.error("[TOPUP ERROR] Failed to refund:", refundErr);
        Sentry.captureException(refundErr, {
          tags: { source: "billing-service", feature: "credit-topup-refund" },
          extra: {
            organizationId: context.organizationId,
            customerId,
            paymentIntentId: pi.id,
            amountCents: params.amount_cents,
          },
        });
      }

      throw new Error(`Failed to create credit grant: ${errText}`);
    }

    const grant = await grantResp.json();

    return { success: true, grant, payment_intent: pi.id };
  },

  /**
   * Get invoice preview for an organization
   */
  async getInvoicePreview(
    context: OrganizationBillingContext
  ): Promise<object> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new Error("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      return {
        empty: true,
        reason: "no_customer",
        currency: null,
        amount_due: 0,
        amount_subtotal: 0,
        amount_total: 0,
        next_payment_attempt: null,
        hosted_invoice_url: null,
        lines: [],
        estimatedUsage: null,
      };
    }

    // Query estimated usage from database
    const estimatedUsage = await this.getUsageSummary(
      context.organizationId.toString()
    );

    const headers = {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/json",
      "Stripe-Version": STRIPE_V2_API_VERSION,
    } as const;

    // List v2 billing cadences for this customer (payer)
    const cadencesRes = await fetch(
      `https://api.stripe.com/v2/billing/cadences?payer[type]=customer&payer[customer]=${encodeURIComponent(
        customerId
      )}`,
      { headers }
    );

    if (!cadencesRes.ok) {
      const errText = await cadencesRes.text();
      console.error("[INVOICE PREVIEW] Cadences error:", errText);
      Sentry.captureException(
        new Error(`Failed to fetch billing cadences: ${errText}`),
        {
          tags: { source: "billing-service", feature: "invoice-preview" },
          extra: { organizationId: context.organizationId, customerId },
        }
      );
      return {
        empty: true,
        reason: "cadences_error",
        error: errText,
        currency: null,
        amount_due: 0,
        amount_subtotal: 0,
        amount_total: 0,
        next_payment_attempt: null,
        hosted_invoice_url: null,
        lines: [],
        estimatedUsage,
      };
    }

    const cadencesJson = (await cadencesRes.json()) as { data?: unknown[] };
    const cadenceList: unknown[] = Array.isArray(cadencesJson?.data)
      ? cadencesJson.data
      : [];

    const cadence = cadenceList[0] as { id?: string } | undefined;

    if (!cadence?.id) {
      return {
        empty: true,
        reason: "no_cadence_found",
        currency: null,
        amount_due: 0,
        amount_subtotal: 0,
        amount_total: 0,
        next_payment_attempt: null,
        hosted_invoice_url: null,
        lines: [],
        estimatedUsage,
      };
    }

    // Create preview via v1 endpoint using billing_cadence
    const form = new URLSearchParams();
    form.set("billing_cadence", cadence.id);

    const previewRes = await fetch(
      "https://api.stripe.com/v1/invoices/create_preview",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": STRIPE_V2_API_VERSION,
        },
        body: form.toString(),
      }
    );

    if (!previewRes.ok) {
      const errText = await previewRes.text();
      let errorCode = "stripe_error";
      try {
        const parsed = JSON.parse(errText);
        errorCode = parsed?.error?.code || errorCode;
      } catch {
        // Ignore JSON parse errors - keep default errorCode
      }

      // If Stripe indicates there is no upcoming invoice, normalize to empty
      if (errorCode === "invoice_upcoming_none") {
        return {
          empty: true,
          reason: "invoice_upcoming_none",
          currency: null,
          amount_due: 0,
          amount_subtotal: 0,
          amount_total: 0,
          next_payment_attempt: null,
          hosted_invoice_url: null,
          lines: [],
          estimatedUsage,
        };
      }

      console.error("[INVOICE PREVIEW] Error:", errText);
      Sentry.captureException(
        new Error(`Failed to get invoice preview: ${errorCode}`),
        {
          tags: { source: "billing-service", feature: "invoice-preview" },
          extra: {
            organizationId: context.organizationId,
            customerId,
            errorCode,
          },
        }
      );
      throw new Error(`Failed to get invoice preview: ${errorCode}`);
    }

    const upcoming = (await previewRes.json()) as {
      currency?: string;
      amount_due?: number;
      subtotal?: number;
      total?: number;
      next_payment_attempt?: number | null;
      hosted_invoice_url?: string | null;
      lines?: { data?: unknown[] };
    };

    // Parse line items
    const lineItems =
      (
        (upcoming.lines?.data || []) as Array<{
          id?: string;
          description?: string;
          amount?: number;
          currency?: string;
          quantity?: number;
          period?: { start?: number; end?: number };
          proration?: boolean;
          pretax_credit_amounts?: Array<{ amount?: number }>;
          parent?: { type?: string };
        }>
      ).map((li) => ({
        id: li.id,
        description: li.description,
        amount: li.amount,
        currency: li.currency,
        quantity: li.quantity ?? null,
        period: li.period
          ? { start: li.period.start, end: li.period.end }
          : null,
        proration: li.proration ?? false,
        credits_applied_cents: Array.isArray(li?.pretax_credit_amounts)
          ? li.pretax_credit_amounts.reduce(
              (s: number, c: { amount?: number }) =>
                s + (typeof c?.amount === "number" ? c.amount : 0),
              0
            )
          : 0,
        parent_type: li?.parent?.type || null,
      })) || [];

    // Compute metrics
    const meteredSubtotalCents = lineItems.reduce(
      (sum, li) =>
        li.parent_type === "rate_card_subscription_details"
          ? sum + (typeof li.amount === "number" ? li.amount : 0)
          : sum,
      0
    );
    const creditsAppliedCents = lineItems.reduce(
      (sum, li) => sum + li.credits_applied_cents,
      0
    );
    const overageCents = Math.max(
      0,
      meteredSubtotalCents - creditsAppliedCents
    );

    // Fetch credit balance from Stripe
    let creditBalanceCents: number | null = null;
    try {
      const grantsRes = await fetch(
        `https://api.stripe.com/v1/billing/credit_grants?customer=${encodeURIComponent(
          customerId
        )}&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/json",
            "Stripe-Version": STRIPE_V2_API_VERSION,
          },
        }
      );
      if (grantsRes.ok) {
        const grantsData = (await grantsRes.json()) as {
          data?: Array<{
            effective_at?: number;
            expires_at?: number;
            voided_at?: number;
            balance?: { monetary?: { value?: number } };
          }>;
        };
        const grants = grantsData?.data || [];
        const now = Math.floor(Date.now() / 1000);
        creditBalanceCents = grants.reduce((sum, grant) => {
          const effective = grant?.effective_at;
          const expires = grant?.expires_at;
          const voidedAt = grant?.voided_at;
          // Exclude voided grants, not-yet-effective grants, and expired grants
          const isActive =
            !voidedAt &&
            (!effective || effective <= now) &&
            (!expires || expires > now);
          if (isActive && grant?.balance?.monetary?.value != null) {
            return sum + grant.balance.monetary.value;
          }
          return sum;
        }, 0);
      }
    } catch (e) {
      console.error("[CREDIT BALANCE] Exception:", e);
      Sentry.captureException(e, {
        tags: { source: "billing-service", feature: "credit-balance" },
        extra: { organizationId: context.organizationId, customerId },
      });
    }

    return {
      currency: upcoming.currency,
      amount_due: upcoming.amount_due,
      amount_subtotal: upcoming.subtotal,
      amount_total: upcoming.total,
      next_payment_attempt: upcoming.next_payment_attempt,
      hosted_invoice_url: upcoming.hosted_invoice_url ?? null,
      lines: lineItems,
      cadence: {
        id: cadence.id,
      },
      metrics: {
        metered_subtotal_cents: meteredSubtotalCents,
        credits_applied_cents: creditsAppliedCents,
        overage_cents: overageCents,
      },
      credit_balance_cents: creditBalanceCents,
      estimatedUsage,
    };
  },

  /**
   * Create a Stripe customer for an organization.
   * Called during new user signup to ensure every org has a customer ID
   * for usage-based billing.
   */
  async createStripeCustomerForOrganization(params: {
    organizationId: string;
    email: string;
    name?: string | null;
    useSandbox?: boolean;
  }): Promise<string | null> {
    const { organizationId, email, name, useSandbox = false } = params;

    try {
      const stripeKey = getStripeApiKey(useSandbox);
      if (!stripeKey) {
        console.error(
          "[billing] Stripe not configured - cannot create customer"
        );
        Sentry.captureMessage(
          "Stripe not configured - cannot create customer",
          {
            level: "warning",
            tags: {
              source: "billing-service",
              feature: "stripe-customer-create",
            },
            extra: { organizationId, email },
          }
        );
        return null;
      }

      const stripeClient = new Stripe(stripeKey, {
        apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      });

      // Create the Stripe customer
      const customer = await stripeClient.customers.create({
        email,
        name: name || undefined,
        metadata: {
          organizationId,
          type: "organization",
          environment: useSandbox ? "sandbox" : "production",
          createdAt: new Date().toISOString(),
        },
      });

      // Save the customer ID to the organization
      if (useSandbox) {
        await sql`
          UPDATE app.organizations
          SET stripe_sandbox_customer_id = ${customer.id}
          WHERE id = ${organizationId}::uuid
        `;
      } else {
        await sql`
          UPDATE app.organizations
          SET stripe_customer_id = ${customer.id}
          WHERE id = ${organizationId}::uuid
        `;
      }

      console.log(
        `[billing] Created Stripe ${useSandbox ? "sandbox" : "production"} customer ${customer.id} for organization ${organizationId}`
      );

      return customer.id;
    } catch (error) {
      // Log error but don't fail signup - we can retry later
      console.error(
        `[billing] Failed to create Stripe customer for organization ${organizationId}:`,
        error
      );
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "stripe-customer-create" },
        extra: { organizationId, email, useSandbox },
      });
      return null;
    }
  },

  /**
   * Subscribe an organization to the FREE plan (v2 billing).
   * This grants the $5 credit allowance included in the FREE plan.
   *
   * Called after creating a new user to ensure they get the free credit.
   */
  async subscribeFreeOrganization(params: {
    organizationId: string;
    customerId: string;
    useSandbox?: boolean;
  }): Promise<string | null> {
    const { organizationId, customerId, useSandbox = false } = params;

    try {
      const stripeKey = getStripeApiKey(useSandbox);
      if (!stripeKey) {
        console.error("[billing] Stripe not configured - cannot subscribe");
        Sentry.captureMessage(
          "Stripe not configured - cannot subscribe to FREE plan",
          {
            level: "warning",
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: { organizationId, customerId },
          }
        );
        return null;
      }

      // Import the FREE plan ID
      const { USAGE_BASED_FREE_PRICE } = await import("./stripe.constants.ts");
      const freePlanId = useSandbox
        ? USAGE_BASED_FREE_PRICE.TEST
        : USAGE_BASED_FREE_PRICE.LIVE;

      if (!freePlanId) {
        console.error("[billing] FREE plan ID not configured");
        Sentry.captureMessage("FREE plan ID not configured", {
          level: "warning",
          tags: { source: "billing-service", feature: "free-subscription" },
          extra: { organizationId, customerId, useSandbox },
        });
        return null;
      }

      const headers = {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/json",
        "Stripe-Version": STRIPE_V2_API_VERSION,
      };

      // 1. Get pricing plan version
      const planResponse = await fetch(
        `https://api.stripe.com/v2/billing/pricing_plans/${freePlanId}`,
        { headers }
      );

      if (!planResponse.ok) {
        const errorText = await planResponse.text();
        console.error("[billing] Failed to fetch pricing plan:", errorText);
        Sentry.captureException(
          new Error(`Failed to fetch pricing plan: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: { organizationId, customerId, freePlanId },
          }
        );
        return null;
      }

      const plan = (await planResponse.json()) as { latest_version: string };
      const planVersion = plan.latest_version;

      // 2. Create billing profile
      const profileResponse = await fetch(
        "https://api.stripe.com/v2/billing/profiles",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ customer: customerId }),
        }
      );

      if (!profileResponse.ok) {
        const errorText = await profileResponse.text();
        console.error("[billing] Failed to create billing profile:", errorText);
        Sentry.captureException(
          new Error(`Failed to create billing profile: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: { organizationId, customerId },
          }
        );
        return null;
      }

      // 3. Create billing cadence (monthly for FREE plan)
      const currentDay = new Date().getDate();
      const cadenceResponse = await fetch(
        "https://api.stripe.com/v2/billing/cadences",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            payer: { type: "customer", customer: customerId },
            billing_cycle: {
              type: "month",
              interval_count: 1,
              month: {
                day_of_month: currentDay,
                time: { hour: 0, minute: 0, second: 0 },
              },
            },
          }),
        }
      );

      if (!cadenceResponse.ok) {
        const errorText = await cadenceResponse.text();
        console.error("[billing] Failed to create cadence:", errorText);
        Sentry.captureException(
          new Error(`Failed to create billing cadence: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: { organizationId, customerId },
          }
        );
        return null;
      }

      const cadence = (await cadenceResponse.json()) as { id: string };

      // 4. Create billing intent
      const intentResponse = await fetch(
        "https://api.stripe.com/v2/billing/intents",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            cadence: cadence.id,
            currency: "usd",
            actions: [
              {
                type: "subscribe",
                subscribe: {
                  type: "pricing_plan_subscription_details",
                  pricing_plan_subscription_details: {
                    pricing_plan: freePlanId,
                    pricing_plan_version: planVersion,
                    component_configurations: [],
                  },
                },
              },
            ],
          }),
        }
      );

      if (!intentResponse.ok) {
        const errorText = await intentResponse.text();
        console.error("[billing] Failed to create billing intent:", errorText);
        Sentry.captureException(
          new Error(`Failed to create billing intent: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: { organizationId, customerId, cadenceId: cadence.id },
          }
        );
        return null;
      }

      const billingIntent = (await intentResponse.json()) as { id: string };

      // 5. Reserve billing intent
      const reserveResponse = await fetch(
        `https://api.stripe.com/v2/billing/intents/${billingIntent.id}/reserve`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }
      );

      if (!reserveResponse.ok) {
        const errorText = await reserveResponse.text();
        console.error("[billing] Failed to reserve billing intent:", errorText);
        Sentry.captureException(
          new Error(`Failed to reserve billing intent: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: {
              organizationId,
              customerId,
              billingIntentId: billingIntent.id,
            },
          }
        );
        return null;
      }

      // 6. Commit billing intent
      const commitResponse = await fetch(
        `https://api.stripe.com/v2/billing/intents/${billingIntent.id}/commit`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }
      );

      if (!commitResponse.ok) {
        const errorText = await commitResponse.text();
        console.error("[billing] Failed to commit billing intent:", errorText);
        Sentry.captureException(
          new Error(`Failed to commit billing intent: ${errorText}`),
          {
            tags: { source: "billing-service", feature: "free-subscription" },
            extra: {
              organizationId,
              customerId,
              billingIntentId: billingIntent.id,
            },
          }
        );
        return null;
      }

      // Update organization with subscription ID
      await sql`
        UPDATE app.organizations
        SET stripe_subscription_id = ${billingIntent.id}
        WHERE id = ${organizationId}::uuid
      `;

      console.log(
        `[billing] Subscribed organization ${organizationId} to FREE plan (${billingIntent.id})`
      );

      return billingIntent.id;
    } catch (error) {
      console.error(
        `[billing] Failed to subscribe organization ${organizationId} to FREE plan:`,
        error
      );
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "free-subscription" },
        extra: { organizationId, customerId, useSandbox },
      });
      return null;
    }
  },

  /**
   * Report web scrape usage to Stripe meter (fire-and-forget).
   * Logs and captures errors but never throws - don't block processing on billing.
   */
  async reportWebScrapeUsage(params: {
    stripeCustomerId: string;
    pagesScraped: number;
    applicationId: string;
    knowledgeSourceId: string;
    useSandbox?: boolean;
  }): Promise<void> {
    const {
      stripeCustomerId,
      pagesScraped,
      applicationId,
      knowledgeSourceId,
      useSandbox = false,
    } = params;

    if (pagesScraped <= 0) return;

    try {
      const stripeKey = getStripeApiKey(useSandbox);
      if (!stripeKey) {
        console.warn(
          "[billing] Stripe not configured - skipping web scrape usage report"
        );
        return;
      }

      const response = await fetch(
        "https://api.stripe.com/v2/billing/meter_events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/json",
            "Stripe-Version": STRIPE_V2_API_VERSION,
          },
          body: JSON.stringify({
            event_name: "chipp_web_scrape_pages",
            payload: {
              stripe_customer_id: stripeCustomerId,
              value: String(pagesScraped),
            },
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[billing] Failed to report web scrape usage", {
          status: response.status,
          error: errorBody,
          stripeCustomerId,
          pagesScraped,
        });
        Sentry.captureException(
          new Error(`Web scrape usage report failed: ${errorBody}`),
          {
            tags: { source: "billing-service", feature: "web-scrape-usage" },
            extra: {
              stripeCustomerId,
              pagesScraped,
              applicationId,
              knowledgeSourceId,
            },
          }
        );
        return;
      }

      console.log("[billing] Reported web scrape usage", {
        stripeCustomerId,
        pagesScraped,
        applicationId,
        knowledgeSourceId,
      });
    } catch (error) {
      console.error("[billing] Error reporting web scrape usage", {
        error: error instanceof Error ? error.message : String(error),
        stripeCustomerId,
        pagesScraped,
      });
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "web-scrape-usage" },
        extra: {
          stripeCustomerId,
          pagesScraped,
          applicationId,
          knowledgeSourceId,
        },
      });
    }
  },

  /**
   * Ensure a FREE tier organization is subscribed to the FREE plan.
   * Called during user signup to grant $5 credits.
   *
   * Flow:
   * 1. Create Stripe customer if not exists
   * 2. Subscribe to FREE plan if not already subscribed
   */
  async ensureFreeSubscriptionForOrganization(params: {
    organizationId: string;
    email: string;
    name?: string | null;
  }): Promise<void> {
    const { organizationId, email, name } = params;

    // Determine if we should use sandbox
    // Check if USE_STRIPE_SANDBOX is explicitly set, otherwise infer from key type
    const explicitSandbox = Deno.env.get("USE_STRIPE_SANDBOX");
    const stripeKey = getStripeApiKey(false);

    // If key starts with sk_test_, we're using test mode (not v2 sandbox)
    // If key starts with sk_live_, we're using production
    // Sandbox keys also start with sk_live_ but for sandbox environment
    const isLiveKey = stripeKey?.startsWith("sk_live_") ?? false;

    const useSandbox =
      explicitSandbox === "true"
        ? true
        : explicitSandbox === "false"
          ? false
          : !isLiveKey; // Default: use sandbox if not a live key

    // Check if organization already has subscription
    const orgCheck = await sql<
      {
        subscription_tier: string;
        stripe_subscription_id: string | null;
        stripe_customer_id: string | null;
        stripe_sandbox_customer_id: string | null;
      }[]
    >`
      SELECT subscription_tier, stripe_subscription_id,
             stripe_customer_id, stripe_sandbox_customer_id
      FROM app.organizations
      WHERE id = ${organizationId}::uuid
      LIMIT 1
    `;

    if (!orgCheck.length) {
      console.warn(`[billing] Organization not found: ${organizationId}`);
      return;
    }

    const org = orgCheck[0];

    // Only process FREE tier orgs without existing subscription
    if (org.subscription_tier !== "FREE") {
      return;
    }
    if (org.stripe_subscription_id) {
      return; // Already subscribed
    }

    // Get or create customer ID
    let customerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;

    if (!customerId) {
      customerId = await this.createStripeCustomerForOrganization({
        organizationId,
        email,
        name,
        useSandbox,
      });
    }

    if (!customerId) {
      console.warn(
        `[billing] Could not get/create customer for organization ${organizationId}`
      );
      return;
    }

    // Subscribe to FREE plan
    await this.subscribeFreeOrganization({
      organizationId,
      customerId,
      useSandbox,
    });
  },

  // ========================================
  // Subscription Management
  // ========================================

  /**
   * Schedule a subscription downgrade to a lower tier.
   * The downgrade takes effect at the end of the current billing period.
   */
  async scheduleDowngrade(
    context: OrganizationBillingContext,
    targetTier: string
  ): Promise<{
    success: boolean;
    pendingDowngradeTier: string;
    downgradeEffectiveAt: Date | null;
  }> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new BadRequestError("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      throw new BadRequestError("No Stripe customer found for organization");
    }

    // Validate tier order
    const tierOrder: Record<string, number> = {
      FREE: 0,
      PRO: 1,
      TEAM: 2,
      BUSINESS: 3,
      ENTERPRISE: 4,
    };

    const currentLevel = tierOrder[context.subscriptionTier] || 0;
    const targetLevel = tierOrder[targetTier] || 0;

    if (targetLevel >= currentLevel) {
      throw new BadRequestError(
        "Target tier must be lower than current tier for downgrade"
      );
    }

    // Get billing period end date from Stripe
    const periodEnd = await this.getBillingPeriodEnd(
      customerId,
      stripeKey,
      context.useSandboxForUsageBilling
    );

    // Update organization with pending downgrade info
    await sql`
      UPDATE app.organizations
      SET
        pending_downgrade_tier = ${targetTier},
        downgrade_scheduled_at = NOW(),
        downgrade_effective_at = ${periodEnd},
        updated_at = NOW()
      WHERE id = ${context.organizationId}
    `;

    console.log(
      `[billing] Scheduled downgrade for organization ${context.organizationId}: ${context.subscriptionTier} -> ${targetTier} effective ${periodEnd?.toISOString()}`
    );

    return {
      success: true,
      pendingDowngradeTier: targetTier,
      downgradeEffectiveAt: periodEnd,
    };
  },

  /**
   * Cancel a scheduled downgrade.
   */
  async undoDowngrade(
    context: OrganizationBillingContext
  ): Promise<{ success: boolean }> {
    await sql`
      UPDATE app.organizations
      SET
        pending_downgrade_tier = NULL,
        downgrade_scheduled_at = NULL,
        downgrade_effective_at = NULL,
        updated_at = NOW()
      WHERE id = ${context.organizationId}
    `;

    console.log(
      `[billing] Cancelled scheduled downgrade for organization ${context.organizationId}`
    );

    return { success: true };
  },

  /**
   * Schedule subscription cancellation at the end of the billing period.
   */
  async cancelSubscription(
    context: OrganizationBillingContext
  ): Promise<{
    success: boolean;
    subscriptionEndsAt: Date | null;
  }> {
    const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
    if (!stripeKey) {
      throw new BadRequestError("Stripe is not configured");
    }

    const customerId = this.getEffectiveCustomerId(context);
    if (!customerId) {
      throw new BadRequestError("No Stripe customer found for organization");
    }

    if (context.subscriptionTier === "FREE") {
      throw new BadRequestError("Cannot cancel a free subscription");
    }

    // Get billing period end date
    const periodEnd = await this.getBillingPeriodEnd(
      customerId,
      stripeKey,
      context.useSandboxForUsageBilling
    );

    // Update organization with cancellation info
    await sql`
      UPDATE app.organizations
      SET
        subscription_cancelled_at = NOW(),
        subscription_ends_at = ${periodEnd},
        updated_at = NOW()
      WHERE id = ${context.organizationId}
    `;

    // Note: For v2 billing, we would also need to update Stripe
    // to mark the subscription for cancellation at period end.
    // This is handled via Stripe billing portal in the current implementation.

    console.log(
      `[billing] Scheduled cancellation for organization ${context.organizationId} effective ${periodEnd?.toISOString()}`
    );

    return {
      success: true,
      subscriptionEndsAt: periodEnd,
    };
  },

  /**
   * Remove a scheduled cancellation.
   */
  async undoCancellation(
    context: OrganizationBillingContext
  ): Promise<{ success: boolean }> {
    await sql`
      UPDATE app.organizations
      SET
        subscription_cancelled_at = NULL,
        subscription_ends_at = NULL,
        updated_at = NOW()
      WHERE id = ${context.organizationId}
    `;

    console.log(
      `[billing] Cancelled scheduled cancellation for organization ${context.organizationId}`
    );

    return { success: true };
  },

  /**
   * Get the current subscription status including pending changes.
   */
  async getSubscriptionStatus(
    context: OrganizationBillingContext
  ): Promise<{
    currentTier: string;
    pendingDowngradeTier: string | null;
    downgradeEffectiveAt: Date | null;
    isCancelled: boolean;
    subscriptionEndsAt: Date | null;
    billingPeriodEnd: Date | null;
  }> {
    const result = await sql`
      SELECT
        subscription_tier,
        pending_downgrade_tier,
        downgrade_effective_at,
        subscription_cancelled_at,
        subscription_ends_at
      FROM app.organizations
      WHERE id = ${context.organizationId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization", context.organizationId.toString());
    }

    const org = result[0];

    // Get billing period end if we have a customer
    let billingPeriodEnd: Date | null = null;
    const customerId = this.getEffectiveCustomerId(context);
    if (customerId) {
      const stripeKey = getStripeApiKey(context.useSandboxForUsageBilling);
      if (stripeKey) {
        billingPeriodEnd = await this.getBillingPeriodEnd(
          customerId,
          stripeKey,
          context.useSandboxForUsageBilling
        );
      }
    }

    return {
      currentTier: org.subscription_tier,
      pendingDowngradeTier: org.pending_downgrade_tier || null,
      downgradeEffectiveAt: org.downgrade_effective_at
        ? new Date(org.downgrade_effective_at)
        : null,
      isCancelled: Boolean(org.subscription_cancelled_at),
      subscriptionEndsAt: org.subscription_ends_at
        ? new Date(org.subscription_ends_at)
        : null,
      billingPeriodEnd,
    };
  },

  /**
   * Get the billing period end date from Stripe.
   */
  async getBillingPeriodEnd(
    customerId: string,
    stripeKey: string,
    useSandbox: boolean
  ): Promise<Date | null> {
    try {
      const headers = {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/json",
        "Stripe-Version": STRIPE_V2_API_VERSION,
      };

      // List billing cadences for this customer
      const cadencesRes = await fetch(
        `https://api.stripe.com/v2/billing/cadences?payer[type]=customer&payer[customer]=${encodeURIComponent(
          customerId
        )}`,
        { headers }
      );

      if (!cadencesRes.ok) {
        console.error(
          "[billing] Failed to fetch billing cadences:",
          await cadencesRes.text()
        );
        return null;
      }

      const cadencesJson = (await cadencesRes.json()) as {
        data?: Array<{
          current_billing_period?: {
            end_at?: string;
          };
        }>;
      };

      const cadence = cadencesJson?.data?.[0];
      if (cadence?.current_billing_period?.end_at) {
        return new Date(cadence.current_billing_period.end_at);
      }

      return null;
    } catch (error) {
      console.error("[billing] Error fetching billing period end:", error);
      Sentry.captureException(error, {
        tags: { source: "billing-service", feature: "billing-period-end" },
        extra: { customerId, useSandbox },
      });
      return null;
    }
  },
};
