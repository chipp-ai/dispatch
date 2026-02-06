/**
 * Tier Allowance Helpers
 *
 * Utility functions for calculating credit thresholds relative to
 * tier allowances. Used by notification settings and billing alerts.
 */

import {
  TIER_CREDIT_ALLOWANCE,
  type SubscriptionTier,
} from "./subscription-tiers.ts";

/**
 * Get the credit allowance in cents for a tier.
 */
export function getTierAllowanceCents(tier: SubscriptionTier): number {
  return TIER_CREDIT_ALLOWANCE[tier] ?? 0;
}

/**
 * Calculate a percentage-based threshold in cents.
 * E.g., 80% of PRO ($10) = 800 cents.
 */
export function calculatePercentageThreshold(
  tier: SubscriptionTier,
  percentage: number
): number {
  const allowance = getTierAllowanceCents(tier);
  return Math.round((allowance * percentage) / 100);
}

/**
 * Get effective notification thresholds for an organization.
 * Combines the default percentage-based threshold with any custom thresholds.
 * Returns sorted descending (highest threshold first).
 */
export function getEffectiveNotificationThresholds(params: {
  tier: SubscriptionTier;
  defaultPercentage: number;
  customThresholds: number[];
}): number[] {
  const { tier, defaultPercentage, customThresholds } = params;

  const percentageThreshold = calculatePercentageThreshold(
    tier,
    defaultPercentage
  );

  const all = new Set([percentageThreshold, ...customThresholds]);
  // Remove zero/negative values
  all.delete(0);
  for (const v of all) {
    if (v < 0) all.delete(v);
  }

  return [...all].sort((a, b) => b - a);
}
