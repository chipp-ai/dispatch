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
}

export interface SubscriptionDeletedParams {
  subscriptionId: string;
  customerId: string;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface InvoicePaidParams {
  invoiceId: string;
  customerId: string;
  subscriptionId: string | null;
  amountPaid: number;
  currency: string;
  metadata: Record<string, string>;
  livemode: boolean;
}

export interface InvoicePaymentFailedParams {
  invoiceId: string;
  customerId: string;
  subscriptionId: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
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
   */
  async handleSubscriptionUpdated(
    params: SubscriptionUpdatedParams
  ): Promise<void> {
    const {
      subscriptionId,
      customerId,
      status,
      cancelAtPeriodEnd,
      previousStatus,
    } = params;

    console.log("Processing subscription updated", {
      subscriptionId,
      customerId,
      status,
      previousStatus,
      cancelAtPeriodEnd,
    });

    // Handle status transitions
    if (status === "active" && previousStatus !== "active") {
      // Subscription became active
      console.log(`Subscription ${subscriptionId} is now active`);
    } else if (status === "past_due") {
      // Payment failed but subscription still active
      console.log(`Subscription ${subscriptionId} is past due`);
      // TODO: Send payment failed notification
    } else if (status === "canceled" || status === "unpaid") {
      // Subscription ended
      console.log(
        `Subscription ${subscriptionId} ended with status: ${status}`
      );
      // TODO: Deactivate access
    }

    if (cancelAtPeriodEnd) {
      console.log(`Subscription ${subscriptionId} scheduled for cancellation`);
      // TODO: Update organization to reflect pending cancellation
    }
  },

  /**
   * Handle subscription deleted event
   *
   * Called when a subscription is fully canceled/deleted.
   */
  async handleSubscriptionDeleted(
    params: SubscriptionDeletedParams
  ): Promise<void> {
    const { subscriptionId, customerId, metadata } = params;

    console.log("Processing subscription deleted", {
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
      console.log("Deactivating consumer subscription", {
        consumerIdentifier: metadata.consumerIdentifier,
        applicationId: metadata.applicationId,
      });
      // TODO: Update ConsumerPurchase to mark as inactive
    } else {
      // Handle organization subscription cancellation
      const orgs = await sql`
        SELECT id FROM app.organizations
        WHERE stripe_subscription_id = ${subscriptionId}
        LIMIT 1
      `;

      if (orgs.length > 0) {
        await sql`
          UPDATE app.organizations
          SET
            subscription_tier = 'FREE',
            stripe_subscription_id = NULL,
            updated_at = NOW()
          WHERE id = ${orgs[0].id}
        `;

        console.log(`Downgraded organization ${orgs[0].id} to FREE tier`);
      }
    }
  },

  /**
   * Handle invoice paid event
   *
   * Called when an invoice is successfully paid.
   * For subscriptions, this renews access. For one-time payments, adds credits.
   */
  async handleInvoicePaid(params: InvoicePaidParams): Promise<void> {
    const { invoiceId, customerId, subscriptionId, amountPaid, currency } =
      params;

    console.log("Processing invoice paid", {
      invoiceId,
      customerId,
      subscriptionId,
      amountPaid,
      currency,
    });

    if (subscriptionId) {
      // Subscription invoice - access is already managed by subscription events
      console.log(
        `Invoice ${invoiceId} paid for subscription ${subscriptionId}`
      );
    } else {
      // One-time payment - might be a credit purchase
      console.log(
        `One-time invoice ${invoiceId} paid: ${amountPaid} ${currency}`
      );
      // TODO: Add credits if this is a credit purchase
    }
  },

  /**
   * Handle invoice payment failed event
   *
   * Called when an invoice payment fails.
   * May trigger access suspension for subscription invoices.
   */
  async handleInvoicePaymentFailed(
    params: InvoicePaymentFailedParams
  ): Promise<void> {
    const { invoiceId, customerId, subscriptionId } = params;

    console.log("Processing invoice payment failed", {
      invoiceId,
      customerId,
      subscriptionId,
    });

    // TODO: Send payment failed notification
    // TODO: For repeated failures, consider suspending access
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
    const { sessionId, mode, metadata, subscriptionId, paymentIntentId } =
      params;

    console.log("Processing checkout completed", {
      sessionId,
      mode,
      type: metadata.type,
    });

    const purchaseType = metadata.type;

    switch (purchaseType) {
      case "package":
        // Credit package purchase
        if (mode === "subscription") {
          console.log(`Subscription package purchased: ${subscriptionId}`);
        } else {
          console.log(`One-time package purchased: ${paymentIntentId}`);
        }
        break;

      case "org_payment_setup":
        // Organization added a payment method
        console.log(
          `Organization payment setup completed: ${metadata.organizationId}`
        );
        break;

      case "hq_access":
        // HQ/Workspace access purchase
        console.log(`HQ access purchased`, {
          workspaceId: metadata.workspaceId,
          developerId: metadata.developerId,
        });
        break;

      default:
        console.log(`Unhandled checkout type: ${purchaseType}`);
    }
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
        o.stripe_sandbox_customer_id,
        o.use_sandbox_for_usage_billing,
        o.subscription_tier
      FROM app.users u
      JOIN app.organizations o ON u.organization_id = o.id
      WHERE u.id = ${userId}
    `;

    if (result.length === 0) {
      throw new NotFoundError("Organization for user", userId);
    }

    const org = result[0];
    const useSandbox =
      Deno.env.get("USE_STRIPE_SANDBOX") === "true" ||
      Boolean(org.use_sandbox_for_usage_billing);

    return {
      organizationId: org.id,
      organizationName: org.name,
      stripeCustomerId: org.stripe_customer_id || null,
      stripeSandboxCustomerId: org.stripe_sandbox_customer_id || null,
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
};
