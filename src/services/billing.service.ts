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
import { log } from "@/lib/logger.ts";
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
import { calculateCredits } from "./billing/credit-calculator.ts";
import { TIER_CREDIT_ALLOWANCE } from "./billing/subscription-tiers.ts";
import { creditNotificationService } from "./billing/credit-notifications.ts";
import { notificationService } from "./notifications/notification.service.ts";

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
  /** Whether the org has a default payment method configured */
  hasDefaultPaymentMethod?: boolean;
}

export interface UsageAnalyticsResult {
  data: Array<{
    dimension: string;
    dimensionId?: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalRequests: number;
    estimatedCostCents: number;
  }>;
  totals: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalRequests: number;
    estimatedCostCents: number;
  };
  periodStart: string;
  periodEnd: string;
}

export interface NotificationSettings {
  enabled: boolean;
  defaultPercentage: number;
  thresholds: number[];
  tierAllowanceCents: number;
  subscriptionTier: string;
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
   * Fetch credit balance from Stripe for a customer.
   * Returns balance in cents (positive = credits available, 0 = exhausted).
   * Returns null on error (fail-open).
   */
  async fetchCreditBalance(
    customerId: string,
    useSandbox: boolean
  ): Promise<number | null> {
    const stripeKey = getStripeApiKey(useSandbox);
    if (!stripeKey) return null;

    try {
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
        const errText = await balanceRes.text();
        log.error("Failed to fetch credit balance", {
          source: "billing",
          feature: "credit-balance",
          customerId,
          useSandbox,
          responseText: errText,
        });
        return null;
      }

      const balanceData = (await balanceRes.json()) as {
        balances?: Array<{
          available_balance?: { monetary?: { value?: number } };
        }>;
      };
      return balanceData?.balances?.[0]?.available_balance?.monetary?.value ?? 0;
    } catch (error) {
      log.error("Error fetching credit balance", {
        source: "billing",
        feature: "credit-balance",
        customerId,
        useSandbox,
      }, error);
      return null;
    }
  },

  /**
   * Get credit status for an organization.
   * Fetches real credit balance from Stripe credit_balance_summary API.
   * Falls back to DB flags on Stripe errors (fail-open).
   */
  async getCreditStatus(organizationId: string): Promise<CreditStatus> {
    const result = await sql`
      SELECT
        id,
        stripe_customer_id,
        stripe_sandbox_customer_id,
        credits_exhausted,
        subscription_tier
      FROM app.organizations
      WHERE id = ${organizationId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization", String(organizationId));
    }

    const org = result[0];
    const useSandbox = Deno.env.get("USE_STRIPE_SANDBOX") === "true";
    const customerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;
    const dbExhausted = org.credits_exhausted === true;

    // No Stripe customer - return based on DB state only
    if (!customerId) {
      return {
        usageBasedBillingEnabled: true,
        creditBalanceCents: 0,
        isExhausted: dbExhausted,
        isLow: false,
        showWarning: dbExhausted,
        warningSeverity: dbExhausted ? "exhausted" : "none",
        creditBalanceFormatted: dbExhausted ? "$0.00" : "Unknown",
      };
    }

    // Fetch real balance from Stripe
    const creditBalanceCents = await this.fetchCreditBalance(
      customerId,
      useSandbox
    );

    // Stripe call failed - fall back to DB flag
    if (creditBalanceCents === null) {
      return {
        usageBasedBillingEnabled: true,
        creditBalanceCents: -1,
        isExhausted: dbExhausted,
        isLow: false,
        showWarning: dbExhausted,
        warningSeverity: dbExhausted ? "exhausted" : "none",
        creditBalanceFormatted: "Unknown",
      };
    }

    const isExhausted = creditBalanceCents <= 0;
    const isLow =
      !isExhausted && creditBalanceCents < LOW_CREDITS_THRESHOLD_CENTS;
    const showWarning = isExhausted || isLow;
    const warningSeverity: "none" | "low" | "exhausted" = isExhausted
      ? "exhausted"
      : isLow
        ? "low"
        : "none";

    return {
      usageBasedBillingEnabled: true,
      creditBalanceCents,
      isExhausted,
      isLow,
      showWarning,
      warningSeverity,
      creditBalanceFormatted: `$${(Math.abs(creditBalanceCents) / 100).toFixed(2)}`,
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

    log.info("Processing subscription created", {
      source: "billing",
      feature: "subscription-created",
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

    log.info("Processing consumer subscription", {
      source: "billing",
      feature: "consumer-subscription-created",
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

    log.info("Processing organization subscription", {
      source: "billing",
      feature: "org-subscription-created",
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
      log.warn("No organization found for Stripe customer", {
        source: "billing",
        feature: "org-subscription-created",
        customerId,
      });
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

    log.info("Updated organization subscription", {
      source: "billing",
      feature: "org-subscription-created",
      organizationId: org.id,
      subscriptionId,
    });
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

    log.info("Processing subscription updated", {
      source: "billing-webhook",
      feature: "subscription-updated",
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
      log.info("Consumer subscription updated", {
        source: "billing-webhook",
        feature: "subscription-updated",
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
      log.warn("No organization found for Stripe customer", {
        source: "billing-webhook",
        feature: "subscription-updated",
        customerId,
      });
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
          log.info("Skipping subscription update for v2 billing - state managed via checkout", {
            source: "billing-webhook",
            feature: "subscription-updated",
            subscriptionId,
          });
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
      log.info("Tier change detected", {
        source: "billing-webhook",
        feature: "subscription-updated",
        organizationId: org.id,
        previousTier: currentTier,
        newTier,
      });

      // Update organization tier
      await sql`
        UPDATE app.organizations
        SET
          subscription_tier = ${newTier},
          updated_at = NOW()
        WHERE id = ${org.id}
      `;

      log.info("Updated organization tier", {
        source: "billing-webhook",
        feature: "subscription-updated",
        organizationId: org.id,
        newTier,
      });

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

      // Fire-and-forget notification
      const appUrl = Deno.env.get("APP_URL") || "http://localhost:5174";
      const changeType = newTier === "FREE" ? "canceled" as const :
        (currentTier === "FREE" || ["PRO", "TEAM", "BUSINESS", "ENTERPRISE"].indexOf(newTier!) >
         ["PRO", "TEAM", "BUSINESS", "ENTERPRISE"].indexOf(currentTier)) ? "upgraded" as const : "downgraded" as const;
      notificationService.send({
        type: "subscription_changed",
        organizationId: String(org.id),
        data: {
          organizationName: org.name,
          previousTier: currentTier,
          newTier,
          changeType,
          billingUrl: `${appUrl}/#/settings/billing/plan`,
        },
      }).catch(() => {});
    }

    // Handle status transitions
    if (status === "active" && previousStatus !== "active") {
      // Subscription became active
      log.info("Subscription is now active", {
        source: "billing-webhook",
        feature: "subscription-status",
        subscriptionId,
        organizationId: org.id,
      });

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
      log.warn("Subscription payment past due", {
        source: "billing-webhook",
        feature: "subscription-status",
        organizationId: org.id,
        subscriptionId,
        customerId,
      });
      // TODO: Send payment failed notification email
    } else if (status === "canceled" || status === "unpaid") {
      // Subscription ended
      log.info("Subscription ended", {
        source: "billing-webhook",
        feature: "subscription-status",
        subscriptionId,
        status,
        organizationId: org.id,
      });

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

      log.warn("Subscription ended - organization downgraded to FREE", {
        source: "billing-webhook",
        feature: "subscription-status",
        organizationId: org.id,
        subscriptionId,
        previousTier: currentTier,
        status,
      });
    }

    // Handle pending cancellation
    if (cancelAtPeriodEnd && currentPeriodEnd) {
      await this.handlePendingCancellation(org.id, currentPeriodEnd, cancelAt);
    } else if (!cancelAtPeriodEnd && org.subscription_cancelled_at) {
      // Cancellation was undone
      log.info("Cancellation undone for organization", {
        source: "billing-webhook",
        feature: "subscription-updated",
        organizationId: org.id,
      });
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

    log.info("Subscription scheduled for cancellation", {
      source: "billing-webhook",
      feature: "pending-cancellation",
      organizationId,
      subscriptionEndsAt: subscriptionEndsAt.toISOString(),
    });

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

    log.info("Processing subscription deleted", {
      source: "billing-webhook",
      feature: "subscription-deleted",
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
      log.info("Deactivating consumer subscription", {
        source: "billing-webhook",
        feature: "subscription-deleted",
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
      log.warn("No organization found for deleted subscription", {
        source: "billing-webhook",
        feature: "subscription-deleted",
        subscriptionId,
        customerId,
      });
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
    log.info("Subscription churned", {
      source: "billing-webhook",
      feature: "churn-analytics",
      organizationId: org.id,
      organizationName: org.name,
      previousTier: churnedFromTier,
      subscriptionTenureDays: tenureDays,
      subscriptionId,
      customerId,
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

    log.info("Downgraded organization to FREE tier", {
      source: "billing-webhook",
      feature: "subscription-deleted",
      organizationId: org.id,
      organizationName: org.name,
      previousTier: churnedFromTier,
    });

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

    log.info("Processing invoice paid", {
      source: "billing-webhook",
      feature: "invoice-paid",
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
      log.info("Subscription payment successful", {
        source: "billing-webhook",
        feature: "invoice-paid",
        subscriptionId,
        customerId,
      });

      // Find organization by Stripe customer ID and clear payment failure tracking
      const orgs = await sql`
        SELECT id, name FROM app.organizations
        WHERE stripe_customer_id = ${customerId}
        LIMIT 1
      `;

      if (orgs.length > 0) {
        log.info("Payment successful for organization", {
          source: "billing-webhook",
          feature: "invoice-paid",
          organizationId: orgs[0].id,
          organizationName: orgs[0].name,
        });
        // Note: If we had a payment_failure_count column, we would reset it here:
        // UPDATE app.organizations SET payment_failure_count = 0 WHERE id = ${orgs[0].id}
      }
    } else {
      // One-time payment that isn't a credit package
      log.info("One-time invoice paid", {
        source: "billing-webhook",
        feature: "invoice-paid",
        invoiceId,
        amountPaid,
        currency,
      });
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

    log.info("Processing credit package purchase", {
      source: "billing-webhook",
      feature: "credit-package-purchase",
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
      log.warn("Credit package purchase missing consumer metadata", {
        source: "billing-webhook",
        feature: "credit-package-purchase",
        invoiceId,
        hasConsumerIdentifier: !!consumerIdentifier,
        hasApplicationId: !!applicationId,
      });
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
      log.warn("Could not determine credit amount for package purchase", {
        source: "billing-webhook",
        feature: "credit-package-purchase",
        invoiceId,
        packageId,
        linesCount: lines?.length,
      });
      // TODO: Look up package from database by packageId to get tokenQty
      // For now, log and return - checkout.session.completed should handle this
      return;
    }

    log.info("Adding credits to consumer", {
      source: "billing-webhook",
      feature: "credit-package-purchase",
      consumerIdentifier,
      applicationId,
      creditAmount,
      invoiceId,
    });

    // TODO: Create transaction record and update consumer credits
    // This requires the consumer billing tables to be fully implemented
    // For now, log the intent for audit purposes
    log.info("Credit grant intent", {
      source: "billing-webhook",
      feature: "credit-package-purchase",
      type: "REFILL",
      consumerIdentifier,
      applicationId,
      creditAmount,
      invoiceId,
      customerId,
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

    log.info("Processing payment failure", {
      source: "billing-webhook",
      feature: "invoice-payment-failed",
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
      log.warn("No organization found for customer", {
        source: "billing-webhook",
        feature: "invoice-payment-failed",
        customerId,
        invoiceId,
      });
      return;
    }

    const org = orgs[0];

    // Log the failure details for querying/debugging
    // This provides an audit trail even without a dedicated column
    log.info("Payment failure record", {
      source: "billing-webhook",
      feature: "invoice-payment-failed",
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
    });

    // Determine severity based on attempt count
    const attempts = attemptCount || 1;
    const MAX_ATTEMPTS_BEFORE_REVIEW = 3;

    if (attempts >= MAX_ATTEMPTS_BEFORE_REVIEW) {
      // Flag organization for review after multiple failures
      log.error("Payment review required - multiple failures", {
        source: "billing",
        feature: "payment-failure",
        organizationId: org.id,
        organizationName: org.name,
        attemptCount: attempts,
        totalAmountDue: amountDue,
        currency,
        invoiceId,
        subscriptionId,
      });

      // TODO: Consider suspending access or downgrading tier
      // This should be a business decision - for now we just flag it
    }

    // Send payment failed notification
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5174";
    const amountFormatted = `$${((amountDue ?? 0) / 100).toFixed(2)}`;
    notificationService.send({
      type: "payment_failed",
      organizationId: String(org.id),
      data: {
        organizationName: org.name,
        amountFormatted,
        attemptCount: attempts,
        nextRetryDate: nextPaymentAttempt
          ? new Date(nextPaymentAttempt * 1000).toLocaleDateString()
          : undefined,
        billingUrl: `${appUrl}/#/settings/billing/payment`,
      },
    }).catch(() => {});

    // Log to Sentry for monitoring via appropriate level
    if (attempts >= 2) {
      const logFn = attempts >= MAX_ATTEMPTS_BEFORE_REVIEW ? log.error : log.warn;
      logFn("Payment failed for organization", {
        source: "stripe-webhook",
        feature: "invoice-payment-failed",
        organizationId: org.id,
        organizationName: org.name,
        invoiceId,
        subscriptionId,
        attemptCount: attempts,
        amountDue,
        currency,
        failureReason: lastFinalizationError,
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

    log.info("Processing checkout completed", {
      source: "billing-webhook",
      feature: "checkout-completed",
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
        log.info("Unhandled checkout type", {
          source: "billing-webhook",
          feature: "checkout-completed",
          type: metadata.type,
          sessionId,
        });
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

    log.info("Processing PACKAGE purchase", {
      source: "billing-service",
      feature: "checkout-package",
      sessionId,
      consumerIdentifier,
      developerId,
      applicationId,
      packageId,
    });

    // Validate required metadata
    if (!consumerIdentifier || !applicationId) {
      log.warn("Missing required metadata for PACKAGE purchase", {
        source: "billing-service",
        feature: "checkout-package",
        sessionId,
        consumerIdentifier,
        applicationId,
        metadata,
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
      log.error("Consumer not found for PACKAGE purchase", {
        source: "billing-service",
        feature: "checkout-package",
        consumerIdentifier,
        applicationId,
        mode: consumerMode,
        sessionId,
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
      log.info("Using creditsAmount from metadata", {
        source: "billing-service",
        feature: "checkout-package",
        creditsAmount: creditsToAdd,
      });
    } else if (packageId) {
      // TODO: Look up package from database when packages table exists
      // ChippMono does: Package.findUnique({ where: { id: packageId } }) -> tokenQty
      // For now, log a warning and use a default
      log.warn("Package lookup not implemented - packages table does not exist yet", {
        source: "billing-service",
        feature: "checkout-package",
        packageId,
      });
      // Default credit amount (should be replaced with actual package lookup)
      creditsToAdd = 100;
    }

    if (creditsToAdd <= 0) {
      log.error("Could not determine credits amount for PACKAGE purchase", {
        source: "billing-service",
        feature: "checkout-package",
        packageId,
        metadata,
        sessionId,
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

    log.info("Added credits to consumer", {
      source: "billing-service",
      feature: "checkout-package",
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

    log.info("PACKAGE purchase completed successfully", {
      source: "billing-service",
      feature: "checkout-package",
      consumerId: consumer.id,
      creditsGranted: creditsToAdd,
      paymentIntentId,
    });

    // Fire-and-forget credit_purchase notification to app owner
    try {
      const apps = await sql`
        SELECT a.name, w.organization_id
        FROM app.applications a
        JOIN app.workspaces w ON a.workspace_id = w.id
        WHERE a.id = ${applicationId}::uuid
        LIMIT 1
      `;
      if (apps.length > 0) {
        const app = apps[0] as { name: string; organization_id: string };
        notificationService.send({
          type: "credit_purchase",
          organizationId: String(app.organization_id),
          data: {
            consumerEmail: consumerIdentifier || "Unknown",
            appName: app.name,
            amountFormatted: `${creditsToAdd} credits`,
          },
        }).catch(() => {});
      }
    } catch { /* fire-and-forget */ }
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

    log.info("Processing ORG_PAYMENT_SETUP", {
      source: "billing-service",
      feature: "checkout-payment-setup",
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
      log.warn("Could not find organization for payment setup", {
        source: "billing-service",
        feature: "checkout-payment-setup",
        customerId,
        metadata,
        sessionId,
      });
      return;
    }

    // Log the successful payment method setup
    log.info("Organization payment method setup completed", {
      source: "billing-service",
      feature: "checkout-payment-setup",
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

    log.info("Processing HQ_ACCESS purchase", {
      source: "billing-service",
      feature: "checkout-hq-access",
      sessionId,
      customerId,
      workspaceId,
      userId,
    });

    if (!workspaceId) {
      log.error("Missing workspaceId for HQ_ACCESS purchase", {
        source: "billing-service",
        feature: "checkout-hq-access",
        metadata,
        sessionId,
      });
      return;
    }

    if (!userId) {
      log.error("Missing userId for HQ_ACCESS purchase", {
        source: "billing-service",
        feature: "checkout-hq-access",
        metadata,
        sessionId,
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
      log.error("Workspace not found for HQ_ACCESS purchase", {
        source: "billing-service",
        feature: "checkout-hq-access",
        workspaceId,
        sessionId,
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
      log.info("User already has workspace access", {
        source: "billing-service",
        feature: "checkout-hq-access",
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

    log.info("HQ_ACCESS granted successfully", {
      source: "billing-service",
      feature: "checkout-hq-access",
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

    log.info("Processing dispute", {
      source: "billing-webhook",
      feature: "dispute",
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

    // Alert team immediately - disputes are compliance-critical
    log.error("Dispute created - review and submit evidence before deadline", {
      source: "billing-webhook",
      feature: "dispute",
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
      actionRequired: "Review dispute and submit evidence before deadline. Contact customer if possible.",
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

    log.info("Processing dispute resolution", {
      source: "billing-webhook",
      feature: "dispute-closed",
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
    log.info("Dispute resolution", {
      source: "billing-webhook",
      feature: "dispute-closed",
      disputeId,
      chargeId,
      customerId,
      organizationId: org?.id || null,
      organizationName: org?.name || null,
      amount,
      amountFormatted: `${(amount / 100).toFixed(2)} USD`,
      resolution: status,
      livemode,
    });

    // Different handling based on resolution
    if (status === "lost") {
      // Log loss for financial reporting - this is revenue that's gone
      log.warn("Dispute lost - amount deducted from account", {
        source: "billing-webhook",
        feature: "dispute-closed",
        disputeId,
        chargeId,
        customerId,
        organizationId: org?.id,
        organizationName: org?.name,
        amountLost: amount,
        amountLostFormatted: `${(amount / 100).toFixed(2)} USD`,
        livemode,
      });
    } else if (status === "won") {
      log.info("Dispute won", {
        source: "billing-webhook",
        feature: "dispute-closed",
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
      log.info("Dispute withdrawn by customer", {
        source: "billing-webhook",
        feature: "dispute-closed",
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

    log.info("Processing refund", {
      source: "billing-webhook",
      feature: "charge-refunded",
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
    log.info("Refund record", {
      source: "billing-webhook",
      feature: "charge-refunded",
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
    });

    // Check if this refund relates to a credit purchase
    // If metadata indicates this was a credit package purchase, we may need to deduct credits
    const isCreditPurchase =
      metadata?.type?.toUpperCase() === "CREDIT_TOPUP" ||
      metadata?.type?.toUpperCase() === "PACKAGE";

    if (isCreditPurchase) {
      // TODO: When credit tracking is fully implemented, deduct credits here
      // This would involve:
      // 1. Finding the original credit grant associated with this charge
      // 2. Voiding or reducing the credit grant proportionally
      // 3. Updating organization's credit balance

      log.warn("Credit purchase refunded - manual review needed", {
        source: "billing-webhook",
        feature: "charge-refunded",
        refundId,
        chargeId,
        customerId,
        organizationId: org?.id,
        amount,
        note: "Credits may need to be manually adjusted in Stripe",
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

    log.info("Processing billing alert", {
      source: "billing-webhook",
      feature: "billing-alert",
      alertId,
      alertType,
      customerId,
      thresholdCents,
      title,
      livemode,
    });

    if (!customerId) {
      log.warn("No customer ID in billing alert", {
        source: "billing-webhook",
        feature: "billing-alert",
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
      log.warn("Organization not found for customer", {
        source: "billing-webhook",
        feature: "billing-alert",
        customerId,
        alertId,
      });
      return;
    }

    const org = orgs[0];
    const isSandboxCustomer = org.stripe_sandbox_customer_id === customerId;

    log.info("Processing alert for organization", {
      source: "billing-webhook",
      feature: "billing-alert",
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
      log.info("Credits exhausted - setting flag", {
        source: "billing-webhook",
        feature: "billing-alert",
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

      log.warn("CREDITS_EXHAUSTED_FLAG_SET", {
        source: "billing-webhook",
        feature: "billing-alert",
        organizationId: org.id,
        organizationName: org.name,
        customerId,
        isSandbox: isSandboxCustomer,
      });

      // Send exhausted credits notification (fire-and-forget)
      creditNotificationService
        .sendLowCreditsEmail({
          organizationId: org.id,
          severity: "exhausted",
          creditBalanceCents: 0,
          thresholdCents: 0,
          organizationName: org.name,
        })
        .catch((err) => {
          log.error("Failed to send exhausted notification", {
            source: "billing-webhook",
            feature: "credit-exhausted-notification",
            organizationId: org.id,
            customerId,
          }, err);
        });

      // $0 alerts don't trigger auto-topup - just set the flag
      return;
    }

    // Handle notification alerts (not auto-topup)
    if (isNotificationAlert) {
      log.info("Processing notification alert", {
        source: "billing-webhook",
        feature: "billing-alert",
        organizationId: org.id,
        thresholdCents,
        title,
      });

      // Send low credits notification (fire-and-forget)
      creditNotificationService
        .sendLowCreditsEmail({
          organizationId: org.id,
          severity: "low",
          creditBalanceCents: thresholdCents,
          thresholdCents,
          organizationName: org.name,
        })
        .catch((err) => {
          log.error("Failed to send low credits notification", {
            source: "billing-webhook",
            feature: "low-credits-notification",
            organizationId: org.id,
            customerId,
            thresholdCents,
          }, err);
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
      log.error("Stripe not configured for auto-topup", {
        source: "billing-service",
        feature: "auto-topup",
        organizationId,
        customerId,
        isSandbox,
      });
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
      log.error("Failed to retrieve customer for auto-topup", {
        source: "billing-service",
        feature: "auto-topup",
        customerId,
        organizationId,
        isSandbox,
        alertId,
      }, error);
      return;
    }

    const metadata = customer.metadata || {};
    const topupEnabled = metadata.topup_enabled === "true";
    const topupAmountCents = metadata.topup_amount_cents
      ? parseInt(metadata.topup_amount_cents, 10)
      : 2000; // Default $20

    // Check if auto-topup is enabled
    if (!topupEnabled) {
      log.info("Auto-topup not enabled for customer", {
        source: "billing-service",
        feature: "auto-topup",
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
      log.warn("No default payment method for auto-topup", {
        source: "billing-service",
        feature: "auto-topup",
        customerId,
        organizationId,
      });
      return;
    }

    log.info("Executing automatic top-up", {
      source: "billing-service",
      feature: "auto-topup",
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
      log.error("Auto-topup payment failed", {
        source: "billing-service",
        feature: "auto-topup-payment",
        customerId,
        organizationId,
        amountCents: topupAmountCents,
        alertId,
        isSandbox,
      }, paymentError);
      return;
    }

    if (paymentIntent.status !== "succeeded") {
      log.error("Auto-topup payment did not succeed", {
        source: "billing-service",
        feature: "auto-topup",
        customerId,
        organizationId,
        paymentIntentId: paymentIntent.id,
        paymentStatus: paymentIntent.status,
        amountCents: topupAmountCents,
        isSandbox,
        alertId,
      });
      return;
    }

    log.info("Auto-topup payment succeeded", {
      source: "billing-service",
      feature: "auto-topup",
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
      log.error("Failed to create credit grant for auto-topup", {
        source: "billing-service",
        feature: "auto-topup-grant",
        customerId,
        organizationId,
        paymentIntentId: paymentIntent.id,
        amountCents: topupAmountCents,
        responseStatus: grantResp.status,
        responseBody: grantErrorText,
        isSandbox,
      }, new Error(`Failed to create credit grant: ${grantErrorText}`));

      // Attempt to refund the successful payment if we couldn't grant credits
      try {
        await stripeClient.refunds.create({
          payment_intent: paymentIntent.id,
          amount: topupAmountCents,
        });
        log.warn("Refunded auto-topup payment due to grant failure", {
          source: "billing-service",
          feature: "auto-topup-refund",
          customerId,
          organizationId,
          paymentIntentId: paymentIntent.id,
        });
      } catch (refundError) {
        log.error("Failed to refund after grant creation error", {
          source: "billing-service",
          feature: "auto-topup-refund",
          customerId,
          organizationId,
          paymentIntentId: paymentIntent.id,
          amountCents: topupAmountCents,
          originalError: grantErrorText,
          isSandbox,
        }, refundError);
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

    log.info("Auto-topup completed successfully", {
      source: "billing-service",
      feature: "auto-topup",
      customerId,
      organizationId,
      paymentIntentId: paymentIntent.id,
      creditGrantId: (grant as Record<string, unknown>)?.id,
      amount: topupAmountCents,
    });

    // Log for Slack notification (fire-and-forget)
    // TODO: Implement notifySlackOfCreditTopup when Slack integration is ready
    log.info("SLACK_NOTIFICATION_INTENT", {
      source: "billing-service",
      feature: "auto-topup",
      type: "automatic_credit_topup",
      amountCents: topupAmountCents,
      organizationId,
      organizationName,
      isSandbox,
      paymentIntentId: paymentIntent.id,
      creditGrantId: (grant as Record<string, unknown>)?.id,
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
      log.error("Stripe portal session creation error", {
        source: "billing-service",
        feature: "stripe-portal",
        customerId: params.customerId,
        organizationName: params.organizationName,
      }, error);

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
   * Uses shared fetchCreditBalance helper.
   */
  async checkCreditsForVoice(
    organizationId: string
  ): Promise<CreditCheckResult> {
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
      return { hasCredits: true };
    }

    const org = result[0];
    const useSandbox =
      Deno.env.get("USE_STRIPE_SANDBOX") === "true" ||
      Boolean(org.use_sandbox_for_usage_billing);
    const customerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;

    if (!customerId) {
      return { hasCredits: true };
    }

    const creditBalanceCents = await this.fetchCreditBalance(
      customerId,
      useSandbox
    );

    // On error, fail open
    if (creditBalanceCents === null) {
      return { hasCredits: true };
    }

    if (creditBalanceCents <= 0) {
      return { hasCredits: false, balance: creditBalanceCents };
    }

    return { hasCredits: true, balance: creditBalanceCents };
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
      log.error("Failed to create credit grant for topup", {
        source: "billing-service",
        feature: "credit-topup",
        organizationId: context.organizationId,
        customerId,
        amountCents: params.amount_cents,
        paymentIntentId: pi.id,
      }, new Error(`Failed to create credit grant: ${errText}`));

      // Attempt to refund the payment if we failed to grant credits
      try {
        await stripeClient.refunds.create({
          payment_intent: pi.id,
          amount: params.amount_cents,
        });
      } catch (refundErr) {
        log.error("Failed to refund after topup grant failure", {
          source: "billing-service",
          feature: "credit-topup-refund",
          organizationId: context.organizationId,
          customerId,
          paymentIntentId: pi.id,
          amountCents: params.amount_cents,
        }, refundErr);
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
      log.error("Failed to fetch billing cadences", {
        source: "billing-service",
        feature: "invoice-preview",
        organizationId: context.organizationId,
        customerId,
      }, new Error(`Failed to fetch billing cadences: ${errText}`));
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

      log.error("Failed to get invoice preview", {
        source: "billing-service",
        feature: "invoice-preview",
        organizationId: context.organizationId,
        customerId,
        errorCode,
      }, new Error(`Failed to get invoice preview: ${errorCode}`));
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
      log.error("Failed to fetch credit balance for invoice preview", {
        source: "billing-service",
        feature: "credit-balance",
        organizationId: context.organizationId,
        customerId,
      }, e);
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
        log.warn("Stripe not configured - cannot create customer", {
          source: "billing-service",
          feature: "stripe-customer-create",
          organizationId,
          email,
        });
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

      log.info("Created Stripe customer for organization", {
        source: "billing-service",
        feature: "stripe-customer-create",
        customerId: customer.id,
        organizationId,
        environment: useSandbox ? "sandbox" : "production",
      });

      return customer.id;
    } catch (error) {
      // Log error but don't fail signup - we can retry later
      log.error("Failed to create Stripe customer for organization", {
        source: "billing-service",
        feature: "stripe-customer-create",
        organizationId,
        email,
        useSandbox,
      }, error);
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
        log.warn("Stripe not configured - cannot subscribe to FREE plan", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
        });
        return null;
      }

      // Import the FREE plan ID
      const { USAGE_BASED_FREE_PRICE } = await import("./stripe.constants.ts");
      const freePlanId = useSandbox
        ? USAGE_BASED_FREE_PRICE.TEST
        : USAGE_BASED_FREE_PRICE.LIVE;

      if (!freePlanId) {
        log.warn("FREE plan ID not configured", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
          useSandbox,
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
        log.error("Failed to fetch pricing plan", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
          freePlanId,
        }, new Error(`Failed to fetch pricing plan: ${errorText}`));
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
        log.error("Failed to create billing profile", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
        }, new Error(`Failed to create billing profile: ${errorText}`));
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
        log.error("Failed to create billing cadence", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
        }, new Error(`Failed to create billing cadence: ${errorText}`));
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
        log.error("Failed to create billing intent", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
          cadenceId: cadence.id,
        }, new Error(`Failed to create billing intent: ${errorText}`));
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
        log.error("Failed to reserve billing intent", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
          billingIntentId: billingIntent.id,
        }, new Error(`Failed to reserve billing intent: ${errorText}`));
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
        log.error("Failed to commit billing intent", {
          source: "billing-service",
          feature: "free-subscription",
          organizationId,
          customerId,
          billingIntentId: billingIntent.id,
        }, new Error(`Failed to commit billing intent: ${errorText}`));
        return null;
      }

      // Update organization with subscription ID
      await sql`
        UPDATE app.organizations
        SET stripe_subscription_id = ${billingIntent.id}
        WHERE id = ${organizationId}::uuid
      `;

      log.info("Subscribed organization to FREE plan", {
        source: "billing-service",
        feature: "free-subscription",
        organizationId,
        billingIntentId: billingIntent.id,
      });

      return billingIntent.id;
    } catch (error) {
      log.error("Failed to subscribe organization to FREE plan", {
        source: "billing-service",
        feature: "free-subscription",
        organizationId,
        customerId,
        useSandbox,
      }, error);
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
        log.warn("Stripe not configured - skipping web scrape usage report", {
          source: "billing-service",
          feature: "web-scrape-usage",
        });
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
        log.error("Failed to report web scrape usage", {
          source: "billing-service",
          feature: "web-scrape-usage",
          status: response.status,
          stripeCustomerId,
          pagesScraped,
          applicationId,
          knowledgeSourceId,
        }, new Error(`Web scrape usage report failed: ${errorBody}`));
        return;
      }

      log.info("Reported web scrape usage", {
        source: "billing-service",
        feature: "web-scrape-usage",
        stripeCustomerId,
        pagesScraped,
        applicationId,
        knowledgeSourceId,
      });
    } catch (error) {
      log.error("Error reporting web scrape usage", {
        source: "billing-service",
        feature: "web-scrape-usage",
        stripeCustomerId,
        pagesScraped,
        applicationId,
        knowledgeSourceId,
      }, error);
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
      log.warn("Organization not found for free subscription", {
        source: "billing-service",
        feature: "free-subscription",
        organizationId,
      });
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
      log.warn("Could not get/create customer for organization", {
        source: "billing-service",
        feature: "free-subscription",
        organizationId,
      });
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

    log.info("Scheduled downgrade for organization", {
      source: "billing-service",
      feature: "schedule-downgrade",
      organizationId: context.organizationId,
      fromTier: context.subscriptionTier,
      toTier: targetTier,
      effectiveAt: periodEnd?.toISOString(),
    });

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

    log.info("Cancelled scheduled downgrade for organization", {
      source: "billing-service",
      feature: "undo-downgrade",
      organizationId: context.organizationId,
    });

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

    log.info("Scheduled cancellation for organization", {
      source: "billing-service",
      feature: "cancel-subscription",
      organizationId: context.organizationId,
      effectiveAt: periodEnd?.toISOString(),
    });

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

    log.info("Cancelled scheduled cancellation for organization", {
      source: "billing-service",
      feature: "undo-cancellation",
      organizationId: context.organizationId,
    });

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
        const cadencesErrText = await cadencesRes.text();
        log.error("Failed to fetch billing cadences", {
          source: "billing-service",
          feature: "billing-period-end",
          customerId,
          useSandbox,
          responseText: cadencesErrText,
        });
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
      log.error("Error fetching billing period end", {
        source: "billing-service",
        feature: "billing-period-end",
        customerId,
        useSandbox,
      }, error);
      return null;
    }
  },

  // ========================================
  // Usage Analytics
  // ========================================

  /**
   * Get usage analytics grouped by a dimension.
   * Returns token usage and estimated cost per group.
   */
  async getUsageAnalytics(
    organizationId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      groupBy?: "app" | "model" | "agentType";
    }
  ): Promise<UsageAnalyticsResult> {
    const now = new Date();
    const startDate =
      options.startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options.endDate || now;
    const groupBy = options.groupBy || "model";

    // Use parameterized queries for each dimension
    let rows: any[];
    if (groupBy === "app") {
      rows = await sql`
        SELECT
          tu.application_id as dimension_id,
          COALESCE(a.name, 'Unknown') as dimension,
          COALESCE(SUM(tu.input_tokens), 0)::bigint as input_tokens,
          COALESCE(SUM(tu.output_tokens), 0)::bigint as output_tokens,
          COALESCE(SUM(tu.total_tokens), 0)::bigint as total_tokens,
          COUNT(*)::bigint as total_requests
        FROM billing.token_usage tu
        LEFT JOIN app.applications a ON tu.application_id = a.id
        WHERE tu.organization_id = ${organizationId}
          AND tu.created_at >= ${startDate}
          AND tu.created_at <= ${endDate}
        GROUP BY tu.application_id, a.name
        ORDER BY total_tokens DESC
      `;
    } else if (groupBy === "agentType") {
      rows = await sql`
        SELECT
          COALESCE(s.source::text, 'Unknown') as dimension_id,
          COALESCE(s.source::text, 'Unknown') as dimension,
          COALESCE(SUM(tu.input_tokens), 0)::bigint as input_tokens,
          COALESCE(SUM(tu.output_tokens), 0)::bigint as output_tokens,
          COALESCE(SUM(tu.total_tokens), 0)::bigint as total_tokens,
          COUNT(*)::bigint as total_requests
        FROM billing.token_usage tu
        LEFT JOIN chat.sessions s ON tu.session_id = s.id
        WHERE tu.organization_id = ${organizationId}
          AND tu.created_at >= ${startDate}
          AND tu.created_at <= ${endDate}
        GROUP BY s.source
        ORDER BY total_tokens DESC
      `;
    } else {
      // model (default)
      rows = await sql`
        SELECT
          tu.model as dimension_id,
          tu.model as dimension,
          COALESCE(SUM(tu.input_tokens), 0)::bigint as input_tokens,
          COALESCE(SUM(tu.output_tokens), 0)::bigint as output_tokens,
          COALESCE(SUM(tu.total_tokens), 0)::bigint as total_tokens,
          COUNT(*)::bigint as total_requests
        FROM billing.token_usage tu
        WHERE tu.organization_id = ${organizationId}
          AND tu.created_at >= ${startDate}
          AND tu.created_at <= ${endDate}
        GROUP BY tu.model
        ORDER BY total_tokens DESC
      `;
    }

    // Calculate estimated costs per row
    let totalTokens = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalRequests = 0;
    let totalCostCents = 0;

    const data = (rows as any[]).map((row: any) => {
      const inputTokens = Number(row.input_tokens || 0);
      const outputTokens = Number(row.output_tokens || 0);
      const rowTotalTokens = Number(row.total_tokens || 0);
      const rowRequests = Number(row.total_requests || 0);

      const estimatedCostCents = calculateCredits({
        inputTokens,
        outputTokens,
        model: groupBy === "model" ? row.dimension : null,
      });

      totalTokens += rowTotalTokens;
      totalInput += inputTokens;
      totalOutput += outputTokens;
      totalRequests += rowRequests;
      totalCostCents += estimatedCostCents;

      return {
        dimension: row.dimension,
        dimensionId: row.dimension_id ? String(row.dimension_id) : undefined,
        totalTokens: rowTotalTokens,
        inputTokens,
        outputTokens,
        totalRequests: rowRequests,
        estimatedCostCents: Math.round(estimatedCostCents * 100) / 100,
      };
    });

    return {
      data,
      totals: {
        totalTokens,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        totalRequests,
        estimatedCostCents: Math.round(totalCostCents * 100) / 100,
      },
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
    };
  },

  // ========================================
  // Notification Settings
  // ========================================

  /**
   * Get notification settings for an organization.
   */
  async getNotificationSettings(
    organizationId: string
  ): Promise<NotificationSettings> {
    const result = await sql`
      SELECT
        credit_notifications_enabled,
        credit_notification_default_percentage,
        credit_notification_thresholds,
        subscription_tier
      FROM app.organizations
      WHERE id = ${organizationId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization", String(organizationId));
    }

    const org = result[0];

    // Parse JSONB thresholds (may come back as string)
    let thresholds: number[] = [];
    const raw = org.credit_notification_thresholds;
    if (raw) {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      thresholds = Array.isArray(parsed) ? parsed : [];
    }

    const tier = (org.subscription_tier || "FREE") as SubscriptionTier;

    return {
      enabled: org.credit_notifications_enabled !== false,
      defaultPercentage: org.credit_notification_default_percentage ?? 50,
      thresholds,
      tierAllowanceCents: TIER_CREDIT_ALLOWANCE[tier] ?? 0,
      subscriptionTier: tier,
    };
  },

  /**
   * Update notification settings for an organization.
   */
  async updateNotificationSettings(
    organizationId: string,
    settings: {
      enabled?: boolean;
      defaultPercentage?: number;
      thresholds?: number[];
    }
  ): Promise<NotificationSettings> {
    if (settings.enabled !== undefined || settings.defaultPercentage !== undefined || settings.thresholds !== undefined) {
      await sql`
        UPDATE app.organizations
        SET
          credit_notifications_enabled = COALESCE(${settings.enabled ?? null}, credit_notifications_enabled),
          credit_notification_default_percentage = COALESCE(${settings.defaultPercentage ?? null}, credit_notification_default_percentage),
          credit_notification_thresholds = COALESCE(${settings.thresholds ? JSON.stringify(settings.thresholds) : null}::jsonb, credit_notification_thresholds),
          updated_at = NOW()
        WHERE id = ${organizationId}
      `;
    }

    return this.getNotificationSettings(organizationId);
  },
};
