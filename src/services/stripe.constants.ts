/**
 * Stripe Constants
 *
 * Price IDs and configuration for Stripe billing.
 * Uses v2 usage-based pricing plans for new subscriptions.
 */

// Subscription tier type
export type SubscriptionTier =
  | "FREE"
  | "PRO"
  | "TEAM"
  | "BUSINESS"
  | "ENTERPRISE";
export type SubscriptionPeriod = "MONTHLY" | "YEARLY";

// Environment mode
type Mode = "TEST" | "LIVE";

// Stripe API version for v2 billing (required for checkout_items)
export const STRIPE_V2_API_VERSION =
  "2025-05-28.basil;checkout_product_catalog_preview=v1";

// Explicit mode toggle - overrides environment-based detection
// Set STRIPE_USE_LIVE_MODE=true to force live pricing plans in any environment
const STRIPE_USE_LIVE_MODE = Deno.env.get("STRIPE_USE_LIVE_MODE") === "true";

// Determine if we're using test mode
// Priority: STRIPE_USE_LIVE_MODE=true forces live mode, otherwise check environment
const isProduction = Deno.env.get("ENVIRONMENT") === "production";
const useLiveMode = STRIPE_USE_LIVE_MODE || isProduction;

const currentMode: Mode = useLiveMode ? "LIVE" : "TEST";

// Export for other modules to check
export { useLiveMode as isLiveMode };

// ========================================
// Legacy Subscription Prices (for backwards compatibility)
// ========================================

const PRO_MONTHLY_PRICE = {
  TEST: "price_1OXbwmDDECPSIOsvOrUOuXqd",
  LIVE: "price_1OYuakDDECPSIOsvkN4IaAXC",
};

const PRO_YEARLY_PRICE = {
  TEST: "price_1OXiIlDDECPSIOsvXR86CfYH",
  LIVE: "price_1OYuakDDECPSIOsv4Uu8bTQY",
};

const TEAM_MONTHLY_PRICE = {
  TEST: "price_1OY3e2DDECPSIOsvEmvzHxZX",
  LIVE: "price_1QJpnsDDECPSIOsvSt5WlYHY",
};

const TEAM_YEARLY_PRICE = {
  TEST: "price_1OY3ejDDECPSIOsvmEcV4SB7",
  LIVE: "price_1OYuaRDDECPSIOsvoxRNMsQX",
};

const BUSINESS_MONTHLY_PRICE = {
  TEST: "price_1SDqTCDDECPSIOsv5EhmaRra",
  LIVE: "price_1SDYRCDDECPSIOsv5wKLFsMV",
};

const BUSINESS_YEARLY_PRICE = {
  TEST: "price_1SDqTODDECPSIOsvbfhOR7zt",
  LIVE: "price_1SDYSjDDECPSIOsvEwiuoVL0",
};

// ========================================
// V2 Usage-Based Pricing Plans (bpp_* IDs)
// These are the actual pricing plans users subscribe to
// ========================================

export const USAGE_BASED_PRO_MONTHLY_PRICE = {
  TEST: "bpp_test_61T9UyPP167CaUjY016T9TMHRuSQ9dYb669EuoS3UFjs",
  LIVE: "bpp_61TqjPr9aBFLlL1sS16PAYkwRuSQV6uTJRipwOFHUF96", // $29/month
};

export const USAGE_BASED_PRO_YEARLY_PRICE = {
  TEST: "bpp_test_61T9V3gI81fWnF58916T9TMHRuSQ9dYb669EuoS3UCGu",
  LIVE: "bpp_61Tqjd7nn2AbpROt816PAYkwRuSQV6uTJRipwOFHUI3c", // $219/year
};

export const USAGE_BASED_TEAM_MONTHLY_PRICE = {
  TEST: "bpp_test_61T9V5JqjQgudRWiY16T9TMHRuSQ9dYb669EuoS3UU6a",
  LIVE: "bpp_61TqjNcQzOlILWykg16PAYkwRuSQV6uTJRipwOFHUI5g", // $99/month
};

export const USAGE_BASED_TEAM_YEARLY_PRICE = {
  TEST: "bpp_test_61T9V7O30ojRiytGo16T9TMHRuSQ9dYb669EuoS3UTsW",
  LIVE: "bpp_61TqjaI2Glr6O4hMf16PAYkwRuSQV6uTJRipwOFHU6jY", // $890/year
};

export const USAGE_BASED_BUSINESS_MONTHLY_PRICE = {
  TEST: "bpp_test_61TWJFmkF3dDTVsXs16T9TMHRuSQ9dYb669EuoS3U3m4",
  LIVE: "bpp_61TqjQUV9CZIlomEz16PAYkwRuSQV6uTJRipwOFHULUu", // $299/month
};

export const USAGE_BASED_BUSINESS_YEARLY_PRICE = {
  TEST: "", // No test plan created yet
  LIVE: "bpp_61TqjeTTkWvBFEFPX16PAYkwRuSQV6uTJRipwOFHUXWa", // $2999/year
};

export const USAGE_BASED_FREE_PRICE = {
  TEST: "bpp_test_61TKgsFe1GnyO4mLj16T9TMHRuSQ9dYb669EuoS3UPzk",
  LIVE: "bpp_61TKhGasnDFU0Hgtp16PAYkwRuSQV6uTJRipwOFHU0Xg", // $0
};

// ========================================
// Helper Functions
// ========================================

/**
 * Get the v2 usage-based pricing plan ID for a subscription tier and period.
 * These are the actual plans that users subscribe to.
 */
export function getPricingPlanId(
  tier: SubscriptionTier,
  period: SubscriptionPeriod
): string | null {
  const planMap: Record<
    string,
    Record<string, typeof USAGE_BASED_PRO_MONTHLY_PRICE>
  > = {
    PRO: {
      MONTHLY: USAGE_BASED_PRO_MONTHLY_PRICE,
      YEARLY: USAGE_BASED_PRO_YEARLY_PRICE,
    },
    TEAM: {
      MONTHLY: USAGE_BASED_TEAM_MONTHLY_PRICE,
      YEARLY: USAGE_BASED_TEAM_YEARLY_PRICE,
    },
    BUSINESS: {
      MONTHLY: USAGE_BASED_BUSINESS_MONTHLY_PRICE,
      YEARLY: USAGE_BASED_BUSINESS_YEARLY_PRICE,
    },
  };

  const planConfig = planMap[tier]?.[period];
  if (!planConfig) {
    return null;
  }

  return planConfig[currentMode] || null;
}

/**
 * Get the legacy price ID for a subscription tier and period.
 * Used only for backwards compatibility with existing v1 subscribers.
 */
export function getLegacyPriceId(
  tier: SubscriptionTier,
  period: SubscriptionPeriod
): string | null {
  const priceMap: Record<string, Record<string, typeof PRO_MONTHLY_PRICE>> = {
    PRO: {
      MONTHLY: PRO_MONTHLY_PRICE,
      YEARLY: PRO_YEARLY_PRICE,
    },
    TEAM: {
      MONTHLY: TEAM_MONTHLY_PRICE,
      YEARLY: TEAM_YEARLY_PRICE,
    },
    BUSINESS: {
      MONTHLY: BUSINESS_MONTHLY_PRICE,
      YEARLY: BUSINESS_YEARLY_PRICE,
    },
  };

  const priceConfig = priceMap[tier]?.[period];
  if (!priceConfig) {
    return null;
  }

  return priceConfig[currentMode];
}

/**
 * @deprecated Use getPricingPlanId for v2 billing or getLegacyPriceId for v1
 * Kept for backwards compatibility
 */
export function getPriceId(
  tier: SubscriptionTier,
  period: SubscriptionPeriod
): string | null {
  return getPricingPlanId(tier, period);
}

/**
 * Check if a price/plan ID is from v2 billing (bpp_* prefix)
 */
export function isV2BillingPriceId(priceId: string): boolean {
  if (!priceId) return false;
  return priceId.startsWith("bpp_") || priceId.startsWith("bpp_test_");
}

/**
 * Get the Stripe API key based on the current mode
 *
 * Mode is determined by:
 * 1. STRIPE_USE_LIVE_MODE=true forces live mode
 * 2. ENVIRONMENT=production forces live mode
 * 3. Otherwise uses sandbox/test mode
 *
 * IMPORTANT: v2 billing APIs (pricing plans with bpp_* IDs) require Stripe Sandboxes.
 * They do NOT work with test mode (sk_test_*). See:
 * https://docs.stripe.com/billing/subscriptions/usage-based/pricing-plans
 */
export function getStripeApiKey(): string {
  // Live mode: use the live key
  if (useLiveMode) {
    return Deno.env.get("STRIPE_CHIPP_KEY") || "";
  }

  // Test mode: use sandbox key for v2 billing (bpp_test_* plans)
  // v2 APIs require sandboxes, not regular test mode
  const sandboxKey = Deno.env.get("STRIPE_SANDBOX_KEY");
  if (sandboxKey) {
    return sandboxKey;
  }

  // Fallback to test key if no sandbox configured (will fail for v2 billing)
  console.warn(
    "[stripe] STRIPE_SANDBOX_KEY not configured - v2 billing will not work in test mode"
  );
  return (
    Deno.env.get("STRIPE_SECRET_KEY_TEST") ||
    Deno.env.get("STRIPE_CHIPP_KEY") ||
    ""
  );
}

/**
 * Get the tier and period from a price/plan ID
 */
export function getTierFromPriceId(priceId: string): {
  tier: SubscriptionTier | null;
  period: SubscriptionPeriod | null;
} {
  // V2 usage-based pricing plans
  const v2PlanMap: Record<
    string,
    { tier: SubscriptionTier; period: SubscriptionPeriod | null }
  > = {
    [USAGE_BASED_PRO_MONTHLY_PRICE.TEST]: { tier: "PRO", period: "MONTHLY" },
    [USAGE_BASED_PRO_MONTHLY_PRICE.LIVE]: { tier: "PRO", period: "MONTHLY" },
    [USAGE_BASED_PRO_YEARLY_PRICE.TEST]: { tier: "PRO", period: "YEARLY" },
    [USAGE_BASED_PRO_YEARLY_PRICE.LIVE]: { tier: "PRO", period: "YEARLY" },
    [USAGE_BASED_TEAM_MONTHLY_PRICE.TEST]: { tier: "TEAM", period: "MONTHLY" },
    [USAGE_BASED_TEAM_MONTHLY_PRICE.LIVE]: { tier: "TEAM", period: "MONTHLY" },
    [USAGE_BASED_TEAM_YEARLY_PRICE.TEST]: { tier: "TEAM", period: "YEARLY" },
    [USAGE_BASED_TEAM_YEARLY_PRICE.LIVE]: { tier: "TEAM", period: "YEARLY" },
    [USAGE_BASED_BUSINESS_MONTHLY_PRICE.TEST]: {
      tier: "BUSINESS",
      period: "MONTHLY",
    },
    [USAGE_BASED_BUSINESS_MONTHLY_PRICE.LIVE]: {
      tier: "BUSINESS",
      period: "MONTHLY",
    },
    [USAGE_BASED_BUSINESS_YEARLY_PRICE.LIVE]: {
      tier: "BUSINESS",
      period: "YEARLY",
    },
    [USAGE_BASED_FREE_PRICE.TEST]: { tier: "FREE", period: null },
    [USAGE_BASED_FREE_PRICE.LIVE]: { tier: "FREE", period: null },
  };

  // Legacy subscription prices
  const legacyPriceMap: Record<
    string,
    { tier: SubscriptionTier; period: SubscriptionPeriod }
  > = {
    [PRO_MONTHLY_PRICE.TEST]: { tier: "PRO", period: "MONTHLY" },
    [PRO_MONTHLY_PRICE.LIVE]: { tier: "PRO", period: "MONTHLY" },
    [PRO_YEARLY_PRICE.TEST]: { tier: "PRO", period: "YEARLY" },
    [PRO_YEARLY_PRICE.LIVE]: { tier: "PRO", period: "YEARLY" },
    [TEAM_MONTHLY_PRICE.TEST]: { tier: "TEAM", period: "MONTHLY" },
    [TEAM_MONTHLY_PRICE.LIVE]: { tier: "TEAM", period: "MONTHLY" },
    [TEAM_YEARLY_PRICE.TEST]: { tier: "TEAM", period: "YEARLY" },
    [TEAM_YEARLY_PRICE.LIVE]: { tier: "TEAM", period: "YEARLY" },
    [BUSINESS_MONTHLY_PRICE.TEST]: { tier: "BUSINESS", period: "MONTHLY" },
    [BUSINESS_MONTHLY_PRICE.LIVE]: { tier: "BUSINESS", period: "MONTHLY" },
    [BUSINESS_YEARLY_PRICE.TEST]: { tier: "BUSINESS", period: "YEARLY" },
    [BUSINESS_YEARLY_PRICE.LIVE]: { tier: "BUSINESS", period: "YEARLY" },
  };

  return (
    v2PlanMap[priceId] ||
    legacyPriceMap[priceId] || { tier: null, period: null }
  );
}
