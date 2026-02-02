/**
 * Stripe Fixtures
 *
 * Pre-defined Stripe customer, subscription, and billing fixtures
 * for testing payment and subscription flows.
 *
 * FIXTURE TYPES:
 * 1. Stripe customers (sandbox mode)
 * 2. Subscriptions (v1 and v2 billing)
 * 3. Payment methods
 * 4. Invoices and charges
 * 5. Credit grants and balances
 * 6. Pricing plans
 *
 * USAGE:
 *   import { createMockCustomer, createMockSubscription, PRICING_PLANS } from "../fixtures/stripe.ts";
 *
 *   const customer = createMockCustomer("org_123");
 *   const subscription = createMockSubscription(customer.id, "PRO");
 *   const credits = createMockCreditBalance(customer.id, { availableCents: 2500 });
 *
 * NOTE: These are mock fixtures for unit tests. Integration tests
 * should use Stripe sandbox with real test API calls.
 */

// ========================================
// Types
// ========================================

export type SubscriptionTier =
  | "FREE"
  | "PRO"
  | "TEAM"
  | "BUSINESS"
  | "ENTERPRISE";

export interface MockStripeCustomer {
  id: string;
  object: "customer";
  email: string;
  name: string;
  metadata: {
    organizationId: string;
    environment: "sandbox" | "production";
  };
  created: number;
  livemode: boolean;
}

export interface MockStripeSubscription {
  id: string;
  object: "subscription";
  customer: string;
  status: "active" | "past_due" | "canceled" | "unpaid" | "trialing";
  current_period_start: number;
  current_period_end: number;
  items: {
    data: Array<{
      id: string;
      price: { id: string; unit_amount: number };
      quantity: number;
    }>;
  };
  metadata: {
    tier: SubscriptionTier;
    isV2Billing: string;
  };
  created: number;
  livemode: boolean;
}

export interface MockStripeInvoice {
  id: string;
  object: "invoice";
  customer: string;
  subscription: string;
  amount_due: number;
  amount_paid: number;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  lines: {
    data: Array<{
      id: string;
      description: string;
      amount: number;
      type: "subscription" | "invoiceitem";
    }>;
  };
  created: number;
}

export interface MockCreditGrant {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  expires_at: number | null;
  metadata: {
    source: "subscription" | "topup" | "promotional";
    tier: SubscriptionTier;
  };
}

export interface MockCreditBalance {
  customer: string;
  available: number;
  used: number;
  grants: MockCreditGrant[];
}

// ========================================
// Pricing Constants
// ========================================

export const PRICING_PLANS = {
  FREE: {
    priceId: "price_free",
    monthlyAmount: 0,
    yearlyAmount: 0,
    creditAllowance: 500, // $5 in cents
  },
  PRO: {
    priceId: "price_pro_monthly",
    monthlyAmount: 2900, // $29
    yearlyAmount: 29000, // $290
    creditAllowance: 2500, // $25
  },
  TEAM: {
    priceId: "price_team_monthly",
    monthlyAmount: 9900, // $99
    yearlyAmount: 99000, // $990
    creditAllowance: 10000, // $100
  },
  BUSINESS: {
    priceId: "price_business_monthly",
    monthlyAmount: 29900, // $299
    yearlyAmount: 299000, // $2990
    creditAllowance: 50000, // $500
  },
  ENTERPRISE: {
    priceId: "price_enterprise_custom",
    monthlyAmount: 0, // Custom pricing
    yearlyAmount: 0,
    creditAllowance: 100000, // $1000 default
  },
} as const;

// ========================================
// Customer Fixtures
// ========================================

/**
 * Create a mock Stripe customer.
 */
export function createMockCustomer(
  organizationId: string,
  options?: {
    email?: string;
    name?: string;
    isSandbox?: boolean;
  }
): MockStripeCustomer {
  const isSandbox = options?.isSandbox ?? true;
  return {
    id: `cus_${generateRandomId(14)}`,
    object: "customer",
    email: options?.email ?? `org-${organizationId}@test.chipp.ai`,
    name: options?.name ?? `Test Organization ${organizationId}`,
    metadata: {
      organizationId,
      environment: isSandbox ? "sandbox" : "production",
    },
    created: Math.floor(Date.now() / 1000),
    livemode: !isSandbox,
  };
}

/**
 * Create a customer with a saved payment method.
 */
export function createMockCustomerWithPaymentMethod(
  organizationId: string
): MockStripeCustomer & { default_payment_method: string } {
  return {
    ...createMockCustomer(organizationId),
    default_payment_method: `pm_${generateRandomId(24)}`,
  };
}

// ========================================
// Subscription Fixtures
// ========================================

/**
 * Create a mock active subscription.
 */
export function createMockSubscription(
  customerId: string,
  tier: SubscriptionTier,
  options?: {
    isV2Billing?: boolean;
    status?: MockStripeSubscription["status"];
  }
): MockStripeSubscription {
  const plan = PRICING_PLANS[tier];
  const now = Math.floor(Date.now() / 1000);

  return {
    id: `sub_${generateRandomId(24)}`,
    object: "subscription",
    customer: customerId,
    status: options?.status ?? "active",
    current_period_start: now,
    current_period_end: now + 30 * 24 * 60 * 60,
    items: {
      data: [
        {
          id: `si_${generateRandomId(14)}`,
          price: { id: plan.priceId, unit_amount: plan.monthlyAmount },
          quantity: 1,
        },
      ],
    },
    metadata: {
      tier,
      isV2Billing: String(options?.isV2Billing ?? false),
    },
    created: now,
    livemode: false,
  };
}

/**
 * Create a subscription that's past due (failed payment).
 */
export function createMockPastDueSubscription(
  customerId: string,
  tier: SubscriptionTier
): MockStripeSubscription {
  return createMockSubscription(customerId, tier, { status: "past_due" });
}

/**
 * Create a canceled subscription.
 */
export function createMockCanceledSubscription(
  customerId: string,
  tier: SubscriptionTier
): MockStripeSubscription {
  return createMockSubscription(customerId, tier, { status: "canceled" });
}

/**
 * Create a v2 Billing subscription (usage-based).
 */
export function createMockV2Subscription(
  customerId: string,
  tier: SubscriptionTier
): MockStripeSubscription {
  return createMockSubscription(customerId, tier, { isV2Billing: true });
}

// ========================================
// Invoice Fixtures
// ========================================

/**
 * Create a mock paid invoice.
 */
export function createMockInvoice(
  customerId: string,
  subscriptionId: string,
  options?: {
    amountCents?: number;
    status?: MockStripeInvoice["status"];
    lineItems?: Array<{ description: string; amount: number }>;
  }
): MockStripeInvoice {
  const amount = options?.amountCents ?? 2900;
  return {
    id: `in_${generateRandomId(24)}`,
    object: "invoice",
    customer: customerId,
    subscription: subscriptionId,
    amount_due: amount,
    amount_paid: options?.status === "paid" ? amount : 0,
    status: options?.status ?? "paid",
    lines: {
      data: options?.lineItems?.map((item, i) => ({
        id: `il_${generateRandomId(14)}`,
        description: item.description,
        amount: item.amount,
        type: "subscription" as const,
      })) ?? [
        {
          id: `il_${generateRandomId(14)}`,
          description: "Pro Plan - Monthly",
          amount: amount,
          type: "subscription" as const,
        },
      ],
    },
    created: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create an invoice with usage-based line items.
 */
export function createMockUsageInvoice(
  customerId: string,
  subscriptionId: string,
  usageDetails: {
    licenseFeeCents: number;
    tokenUsageCents: number;
    creditAppliedCents: number;
  }
): MockStripeInvoice {
  const lineItems = [
    {
      description: "Pro Plan - License Fee",
      amount: usageDetails.licenseFeeCents,
    },
    { description: "Token Usage", amount: usageDetails.tokenUsageCents },
  ];

  if (usageDetails.creditAppliedCents > 0) {
    lineItems.push({
      description: "Credit Applied",
      amount: -usageDetails.creditAppliedCents,
    });
  }

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return createMockInvoice(customerId, subscriptionId, {
    amountCents: Math.max(0, total),
    status: "open",
    lineItems,
  });
}

// ========================================
// Credit Grant Fixtures
// ========================================

/**
 * Create a mock credit grant.
 */
export function createMockCreditGrant(
  customerId: string,
  amountCents: number,
  options?: {
    source?: "subscription" | "topup" | "promotional";
    tier?: SubscriptionTier;
    expiresInDays?: number;
  }
): MockCreditGrant {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `cg_${generateRandomId(24)}`,
    customer: customerId,
    amount: amountCents,
    currency: "usd",
    expires_at: options?.expiresInDays
      ? now + options.expiresInDays * 24 * 60 * 60
      : null,
    metadata: {
      source: options?.source ?? "subscription",
      tier: options?.tier ?? "PRO",
    },
  };
}

/**
 * Create a mock credit balance with grants.
 */
export function createMockCreditBalance(
  customerId: string,
  options?: {
    availableCents?: number;
    usedCents?: number;
    grants?: MockCreditGrant[];
  }
): MockCreditBalance {
  const available = options?.availableCents ?? 2500;
  return {
    customer: customerId,
    available: available,
    used: options?.usedCents ?? 0,
    grants: options?.grants ?? [createMockCreditGrant(customerId, available)],
  };
}

/**
 * Create an exhausted credit balance.
 */
export function createMockExhaustedCreditBalance(
  customerId: string
): MockCreditBalance {
  return {
    customer: customerId,
    available: 0,
    used: 2500,
    grants: [
      {
        ...createMockCreditGrant(customerId, 2500),
        amount: 0, // All used
      },
    ],
  };
}

/**
 * Create a low credit balance (triggers warning).
 */
export function createMockLowCreditBalance(
  customerId: string,
  remainingPercent: number = 10
): MockCreditBalance {
  const total = 2500;
  const remaining = Math.floor(total * (remainingPercent / 100));
  return {
    customer: customerId,
    available: remaining,
    used: total - remaining,
    grants: [createMockCreditGrant(customerId, remaining)],
  };
}

// ========================================
// v2 Billing API Fixtures
// ========================================

/**
 * Create a mock v2 Billing pricing plan.
 */
export function createMockPricingPlan(tier: SubscriptionTier): {
  id: string;
  name: string;
  monthly_amount: number;
  credit_allowance: number;
} {
  const plan = PRICING_PLANS[tier];
  return {
    id: `bpp_${tier.toLowerCase()}`,
    name: `${tier} Plan`,
    monthly_amount: plan.monthlyAmount,
    credit_allowance: plan.creditAllowance,
  };
}

/**
 * Create a mock billing intent (v2 Billing).
 */
export function createMockBillingIntent(
  customerId: string,
  pricingPlanId: string
): {
  id: string;
  customer: string;
  pricing_plan: string;
  status: "pending" | "reserved" | "committed";
} {
  return {
    id: `bilint_${generateRandomId(24)}`,
    customer: customerId,
    pricing_plan: pricingPlanId,
    status: "pending",
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

/**
 * Calculate expected credit allowance for a tier.
 */
export function getCreditAllowanceForTier(tier: SubscriptionTier): number {
  return PRICING_PLANS[tier].creditAllowance;
}

/**
 * Calculate expected monthly price for a tier.
 */
export function getMonthlyPriceForTier(tier: SubscriptionTier): number {
  return PRICING_PLANS[tier].monthlyAmount;
}
