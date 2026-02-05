/**
 * Subscription Tiers
 *
 * Defines subscription tiers, pricing, and feature limits for Chipp.
 * This is the source of truth for tier-related constants.
 *
 * Migrated from ChippMono:
 * - schema.prisma (SubscriptionTier, SubscriptionPeriod enums)
 * - apps/chipp-admin/apiService/stripe/constants.ts (pricing)
 * - apps/chipp-admin/app/(authenticated)/settings/billing/constants.tsx (benefits)
 * - shared/utils-server/src/lib/utils/usagelimits.ts (limits)
 */

// ========================================
// Types
// ========================================

/**
 * Subscription tier levels.
 * Note: This is also defined in src/db/schema.ts for database compatibility.
 */
export type SubscriptionTier =
  | "FREE"
  | "PRO"
  | "TEAM"
  | "BUSINESS"
  | "ENTERPRISE";

/**
 * Billing period for subscriptions.
 */
export type SubscriptionPeriod = "MONTHLY" | "YEARLY";

/**
 * All valid subscription tiers as an array (useful for validation).
 */
export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  "FREE",
  "PRO",
  "TEAM",
  "BUSINESS",
  "ENTERPRISE",
];

/**
 * All valid subscription periods as an array.
 */
export const SUBSCRIPTION_PERIODS: SubscriptionPeriod[] = ["MONTHLY", "YEARLY"];

// ========================================
// Pricing
// ========================================

/**
 * Tier pricing in USD cents.
 * Enterprise pricing is custom (null).
 */
export const TIER_PRICING: Record<
  SubscriptionTier,
  { monthly: number | null; yearly: number | null }
> = {
  FREE: { monthly: 0, yearly: null },
  PRO: { monthly: 2900, yearly: 21900 }, // $29/month, $219/year
  TEAM: { monthly: 9900, yearly: 89000 }, // $99/month, $890/year
  BUSINESS: { monthly: 29900, yearly: 299900 }, // $299/month, $2999/year
  ENTERPRISE: { monthly: null, yearly: null }, // Custom pricing
};

/**
 * Get tier price in cents.
 * Returns null for FREE yearly (not offered) and ENTERPRISE (custom).
 */
export function getTierPrice(
  tier: SubscriptionTier,
  period: SubscriptionPeriod
): number | null {
  return period === "MONTHLY"
    ? TIER_PRICING[tier].monthly
    : TIER_PRICING[tier].yearly;
}

/**
 * Get tier price formatted as USD string (e.g., "$29" or "$219").
 * Returns "Custom" for null prices.
 */
export function formatTierPrice(
  tier: SubscriptionTier,
  period: SubscriptionPeriod
): string {
  const priceCents = getTierPrice(tier, period);
  if (priceCents === null) return "Custom";
  return `$${Math.floor(priceCents / 100)}`;
}

// ========================================
// Usage Allowances
// ========================================

/**
 * Monthly credit allowance per tier in USD cents.
 * This is the amount of LLM usage included with the subscription.
 */
export const TIER_CREDIT_ALLOWANCE: Record<SubscriptionTier, number> = {
  FREE: 500, // $5 total trial (one-time, not monthly)
  PRO: 1000, // $10/month
  TEAM: 3000, // $30/month
  BUSINESS: 10000, // $100/month
  ENTERPRISE: 0, // Custom
};

/**
 * Usage markup percentage by tier.
 * Applied to LLM usage costs above the included allowance.
 */
export const TIER_MARKUP_PERCENT: Record<SubscriptionTier, number> = {
  FREE: 30, // 30% markup (same as PRO for overage)
  PRO: 30, // 30% markup
  TEAM: 20, // 20% markup
  BUSINESS: 15, // 15% markup
  ENTERPRISE: 0, // Custom (typically 0-15%)
};

// ========================================
// Token Limits (Legacy)
// ========================================

/**
 * Token limits by tier.
 * -1 means unlimited (usage-based billing applies).
 * This is a legacy limit - modern billing uses credit allowances instead.
 */
export const TOKEN_LIMITS: Record<SubscriptionTier, number> = {
  FREE: 100_000, // 100k tokens
  PRO: -1, // Unlimited (usage-based)
  TEAM: -1, // Unlimited (usage-based)
  BUSINESS: -1, // Unlimited (usage-based)
  ENTERPRISE: -1, // Unlimited (usage-based)
};

/**
 * Maximum lifetime spend for FREE tier in USD cents.
 * After this limit, user must upgrade.
 */
export const MAX_FREE_TIER_SPEND_CENTS = 2000; // $20

/**
 * Check if a tier has unlimited tokens (usage-based billing).
 */
export function hasUnlimitedTokens(tier: SubscriptionTier): boolean {
  return TOKEN_LIMITS[tier] === -1;
}

// ========================================
// Feature Benefits
// ========================================

/**
 * Feature benefits displayed on pricing/billing pages.
 * These are the key selling points for each tier.
 */
export const PLAN_BENEFITS: Record<SubscriptionTier, string[]> = {
  FREE: ["1000 Message Trial", "Best Models", "Unlimited Knowledge Sources"],
  PRO: [
    "Best Models",
    "Unlimited Knowledge Sources",
    "API Access",
    "Voice Agents",
    "Deploy to WhatsApp, Slack, more",
    "Sell Individual Agents",
    "Community Support",
  ],
  TEAM: [
    "Unlimited AI HQs",
    "Team Management",
    "Voice Cloning",
    "Sell Agent Bundles",
    "Email Support",
  ],
  BUSINESS: [
    "Zero Data Retention (ZDR)",
    "HIPAA Compliant",
    "White Glove Onboarding and Training",
    "Private Slack Support",
  ],
  ENTERPRISE: [
    "Zero Data Retention (ZDR)",
    "HIPAA Compliant",
    "White Glove Onboarding and Training",
    "Private Slack Support",
    "Private Cloud (VPC)",
    "Data Sovereignty",
    "Custom Subdomain",
    "White-label Platform",
  ],
};

/**
 * Get all features for a tier (includes features from lower tiers).
 * PRO includes FREE features, TEAM includes PRO features, etc.
 */
export function getAllFeaturesForTier(tier: SubscriptionTier): string[] {
  const tierOrder: SubscriptionTier[] = [
    "FREE",
    "PRO",
    "TEAM",
    "BUSINESS",
    "ENTERPRISE",
  ];
  const tierIndex = tierOrder.indexOf(tier);

  const allFeatures: string[] = [];
  for (let i = 0; i <= tierIndex; i++) {
    allFeatures.push(...PLAN_BENEFITS[tierOrder[i]]);
  }

  // Remove duplicates while preserving order
  return [...new Set(allFeatures)];
}

// ========================================
// Feature Flags by Tier
// ========================================

/**
 * Feature availability by tier.
 * Used for runtime feature gating.
 */
export const TIER_FEATURES: Record<
  SubscriptionTier,
  {
    apiAccess: boolean;
    voiceAgents: boolean;
    voiceCloning: boolean;
    teamManagement: boolean;
    unlimitedHQs: boolean;
    whatsappIntegration: boolean;
    slackIntegration: boolean;
    emailIntegration: boolean;
    zeroDataRetention: boolean;
    hipaaCompliant: boolean;
    whiteLabel: boolean;
    customDomain: boolean;
    privateCloud: boolean;
    sellAgents: boolean;
    sellBundles: boolean;
  }
> = {
  FREE: {
    apiAccess: false,
    voiceAgents: false,
    voiceCloning: false,
    teamManagement: false,
    unlimitedHQs: false,
    whatsappIntegration: false,
    slackIntegration: false,
    emailIntegration: false,
    zeroDataRetention: false,
    hipaaCompliant: false,
    whiteLabel: false,
    customDomain: false,
    privateCloud: false,
    sellAgents: false,
    sellBundles: false,
  },
  PRO: {
    apiAccess: true,
    voiceAgents: true,
    voiceCloning: false,
    teamManagement: false,
    unlimitedHQs: false,
    whatsappIntegration: true,
    slackIntegration: true,
    emailIntegration: true,
    zeroDataRetention: false,
    hipaaCompliant: false,
    whiteLabel: false,
    customDomain: false,
    privateCloud: false,
    sellAgents: true,
    sellBundles: false,
  },
  TEAM: {
    apiAccess: true,
    voiceAgents: true,
    voiceCloning: true,
    teamManagement: true,
    unlimitedHQs: true,
    whatsappIntegration: true,
    slackIntegration: true,
    emailIntegration: true,
    zeroDataRetention: false,
    hipaaCompliant: false,
    whiteLabel: false,
    customDomain: false,
    privateCloud: false,
    sellAgents: true,
    sellBundles: true,
  },
  BUSINESS: {
    apiAccess: true,
    voiceAgents: true,
    voiceCloning: true,
    teamManagement: true,
    unlimitedHQs: true,
    whatsappIntegration: true,
    slackIntegration: true,
    emailIntegration: true,
    zeroDataRetention: true,
    hipaaCompliant: true,
    whiteLabel: false,
    customDomain: false,
    privateCloud: false,
    sellAgents: true,
    sellBundles: true,
  },
  ENTERPRISE: {
    apiAccess: true,
    voiceAgents: true,
    voiceCloning: true,
    teamManagement: true,
    unlimitedHQs: true,
    whatsappIntegration: true,
    slackIntegration: true,
    emailIntegration: true,
    zeroDataRetention: true,
    hipaaCompliant: true,
    whiteLabel: true,
    customDomain: true,
    privateCloud: true,
    sellAgents: true,
    sellBundles: true,
  },
};

/**
 * Check if a tier has a specific feature.
 */
export function tierHasFeature(
  tier: SubscriptionTier,
  feature: keyof (typeof TIER_FEATURES)[SubscriptionTier]
): boolean {
  return TIER_FEATURES[tier][feature];
}

// ========================================
// Tier Comparison Utilities
// ========================================

/**
 * Tier hierarchy for comparison.
 * Higher number = higher tier.
 */
const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
};

/**
 * Check if tierA is higher than or equal to tierB.
 */
export function isAtLeastTier(
  currentTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  return TIER_HIERARCHY[currentTier] >= TIER_HIERARCHY[requiredTier];
}

/**
 * Get the next tier upgrade from current tier.
 * Returns null if already at ENTERPRISE.
 */
export function getNextTier(tier: SubscriptionTier): SubscriptionTier | null {
  const tierOrder: SubscriptionTier[] = [
    "FREE",
    "PRO",
    "TEAM",
    "BUSINESS",
    "ENTERPRISE",
  ];
  const currentIndex = tierOrder.indexOf(tier);
  if (currentIndex === tierOrder.length - 1) return null;
  return tierOrder[currentIndex + 1];
}

/**
 * Get the tier display name (for UI).
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

/**
 * Validate that a string is a valid subscription tier.
 */
export function isValidTier(tier: string): tier is SubscriptionTier {
  return SUBSCRIPTION_TIERS.includes(tier as SubscriptionTier);
}

/**
 * Validate that a string is a valid subscription period.
 */
export function isValidPeriod(period: string): period is SubscriptionPeriod {
  return SUBSCRIPTION_PERIODS.includes(period as SubscriptionPeriod);
}
