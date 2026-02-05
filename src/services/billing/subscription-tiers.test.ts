import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  type SubscriptionTier,
  type SubscriptionPeriod,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PERIODS,
  TIER_PRICING,
  getTierPrice,
  formatTierPrice,
  TIER_CREDIT_ALLOWANCE,
  TIER_MARKUP_PERCENT,
  TOKEN_LIMITS,
  MAX_FREE_TIER_SPEND_CENTS,
  hasUnlimitedTokens,
  PLAN_BENEFITS,
  getAllFeaturesForTier,
  TIER_FEATURES,
  tierHasFeature,
  isAtLeastTier,
  getNextTier,
  getTierDisplayName,
  isValidTier,
  isValidPeriod,
} from "./subscription-tiers.ts";

// ========================================
// Type Constants
// ========================================

Deno.test("SUBSCRIPTION_TIERS contains all 5 tiers in order", () => {
  assertEquals(SUBSCRIPTION_TIERS, ["FREE", "PRO", "TEAM", "BUSINESS", "ENTERPRISE"]);
});

Deno.test("SUBSCRIPTION_PERIODS contains MONTHLY and YEARLY", () => {
  assertEquals(SUBSCRIPTION_PERIODS, ["MONTHLY", "YEARLY"]);
});

// ========================================
// Pricing
// ========================================

Deno.test("getTierPrice returns correct monthly prices", () => {
  assertEquals(getTierPrice("FREE", "MONTHLY"), 0);
  assertEquals(getTierPrice("PRO", "MONTHLY"), 2900);
  assertEquals(getTierPrice("TEAM", "MONTHLY"), 9900);
  assertEquals(getTierPrice("BUSINESS", "MONTHLY"), 29900);
  assertEquals(getTierPrice("ENTERPRISE", "MONTHLY"), null);
});

Deno.test("getTierPrice returns correct yearly prices", () => {
  assertEquals(getTierPrice("FREE", "YEARLY"), null); // FREE has no yearly
  assertEquals(getTierPrice("PRO", "YEARLY"), 21900);
  assertEquals(getTierPrice("TEAM", "YEARLY"), 89000);
  assertEquals(getTierPrice("BUSINESS", "YEARLY"), 299900);
  assertEquals(getTierPrice("ENTERPRISE", "YEARLY"), null);
});

Deno.test("formatTierPrice formats prices correctly", () => {
  assertEquals(formatTierPrice("FREE", "MONTHLY"), "$0");
  assertEquals(formatTierPrice("PRO", "MONTHLY"), "$29");
  assertEquals(formatTierPrice("TEAM", "MONTHLY"), "$99");
  assertEquals(formatTierPrice("BUSINESS", "MONTHLY"), "$299");
  assertEquals(formatTierPrice("ENTERPRISE", "MONTHLY"), "Custom");
});

Deno.test("formatTierPrice handles yearly prices", () => {
  assertEquals(formatTierPrice("PRO", "YEARLY"), "$219");
  assertEquals(formatTierPrice("FREE", "YEARLY"), "Custom"); // null -> Custom
});

// ========================================
// Usage Allowances
// ========================================

Deno.test("TIER_CREDIT_ALLOWANCE matches expected values", () => {
  assertEquals(TIER_CREDIT_ALLOWANCE["FREE"], 500); // $5
  assertEquals(TIER_CREDIT_ALLOWANCE["PRO"], 1000); // $10
  assertEquals(TIER_CREDIT_ALLOWANCE["TEAM"], 3000); // $30
  assertEquals(TIER_CREDIT_ALLOWANCE["BUSINESS"], 10000); // $100
});

Deno.test("TIER_MARKUP_PERCENT decreases with higher tiers", () => {
  assertEquals(TIER_MARKUP_PERCENT["PRO"], 30);
  assertEquals(TIER_MARKUP_PERCENT["TEAM"], 20);
  assertEquals(TIER_MARKUP_PERCENT["BUSINESS"], 15);
  assertEquals(TIER_MARKUP_PERCENT["ENTERPRISE"], 0);
});

// ========================================
// Token Limits
// ========================================

Deno.test("TOKEN_LIMITS: FREE has limit, paid tiers are unlimited", () => {
  assertEquals(TOKEN_LIMITS["FREE"], 100_000);
  assertEquals(TOKEN_LIMITS["PRO"], -1);
  assertEquals(TOKEN_LIMITS["TEAM"], -1);
  assertEquals(TOKEN_LIMITS["BUSINESS"], -1);
  assertEquals(TOKEN_LIMITS["ENTERPRISE"], -1);
});

Deno.test("hasUnlimitedTokens returns correct values", () => {
  assertEquals(hasUnlimitedTokens("FREE"), false);
  assertEquals(hasUnlimitedTokens("PRO"), true);
  assertEquals(hasUnlimitedTokens("TEAM"), true);
  assertEquals(hasUnlimitedTokens("BUSINESS"), true);
  assertEquals(hasUnlimitedTokens("ENTERPRISE"), true);
});

Deno.test("MAX_FREE_TIER_SPEND_CENTS is $20", () => {
  assertEquals(MAX_FREE_TIER_SPEND_CENTS, 2000);
});

// ========================================
// Feature Benefits
// ========================================

Deno.test("PLAN_BENEFITS has entries for all tiers", () => {
  for (const tier of SUBSCRIPTION_TIERS) {
    assertEquals(Array.isArray(PLAN_BENEFITS[tier]), true);
    assertEquals(PLAN_BENEFITS[tier].length > 0, true);
  }
});

Deno.test("getAllFeaturesForTier returns cumulative features", () => {
  const freeFeatures = getAllFeaturesForTier("FREE");
  const proFeatures = getAllFeaturesForTier("PRO");
  const teamFeatures = getAllFeaturesForTier("TEAM");

  // PRO should have more features than FREE
  assertEquals(proFeatures.length > freeFeatures.length, true);
  // TEAM should have more features than PRO
  assertEquals(teamFeatures.length > proFeatures.length, true);
});

Deno.test("getAllFeaturesForTier removes duplicates", () => {
  const enterpriseFeatures = getAllFeaturesForTier("ENTERPRISE");
  const uniqueFeatures = [...new Set(enterpriseFeatures)];
  assertEquals(enterpriseFeatures.length, uniqueFeatures.length);
});

// ========================================
// Feature Flags
// ========================================

Deno.test("FREE tier has no premium features", () => {
  assertEquals(tierHasFeature("FREE", "apiAccess"), false);
  assertEquals(tierHasFeature("FREE", "voiceAgents"), false);
  assertEquals(tierHasFeature("FREE", "teamManagement"), false);
  assertEquals(tierHasFeature("FREE", "whiteLabel"), false);
});

Deno.test("PRO tier has basic premium features", () => {
  assertEquals(tierHasFeature("PRO", "apiAccess"), true);
  assertEquals(tierHasFeature("PRO", "voiceAgents"), true);
  assertEquals(tierHasFeature("PRO", "slackIntegration"), true);
  assertEquals(tierHasFeature("PRO", "teamManagement"), false); // TEAM+ only
});

Deno.test("TEAM tier has team features", () => {
  assertEquals(tierHasFeature("TEAM", "teamManagement"), true);
  assertEquals(tierHasFeature("TEAM", "voiceCloning"), true);
  assertEquals(tierHasFeature("TEAM", "unlimitedHQs"), true);
  assertEquals(tierHasFeature("TEAM", "zeroDataRetention"), false); // BUSINESS+ only
});

Deno.test("BUSINESS tier has compliance features", () => {
  assertEquals(tierHasFeature("BUSINESS", "zeroDataRetention"), true);
  assertEquals(tierHasFeature("BUSINESS", "hipaaCompliant"), true);
  assertEquals(tierHasFeature("BUSINESS", "whiteLabel"), false); // ENTERPRISE only
});

Deno.test("ENTERPRISE tier has all features", () => {
  assertEquals(tierHasFeature("ENTERPRISE", "whiteLabel"), true);
  assertEquals(tierHasFeature("ENTERPRISE", "customDomain"), true);
  assertEquals(tierHasFeature("ENTERPRISE", "privateCloud"), true);
});

// ========================================
// Tier Comparison
// ========================================

Deno.test("isAtLeastTier compares correctly", () => {
  // Same tier
  assertEquals(isAtLeastTier("PRO", "PRO"), true);

  // Higher tier
  assertEquals(isAtLeastTier("TEAM", "PRO"), true);
  assertEquals(isAtLeastTier("ENTERPRISE", "FREE"), true);

  // Lower tier
  assertEquals(isAtLeastTier("FREE", "PRO"), false);
  assertEquals(isAtLeastTier("PRO", "TEAM"), false);
});

Deno.test("getNextTier returns correct upgrade path", () => {
  assertEquals(getNextTier("FREE"), "PRO");
  assertEquals(getNextTier("PRO"), "TEAM");
  assertEquals(getNextTier("TEAM"), "BUSINESS");
  assertEquals(getNextTier("BUSINESS"), "ENTERPRISE");
  assertEquals(getNextTier("ENTERPRISE"), null);
});

Deno.test("getTierDisplayName formats correctly", () => {
  assertEquals(getTierDisplayName("FREE"), "Free");
  assertEquals(getTierDisplayName("PRO"), "Pro");
  assertEquals(getTierDisplayName("TEAM"), "Team");
  assertEquals(getTierDisplayName("BUSINESS"), "Business");
  assertEquals(getTierDisplayName("ENTERPRISE"), "Enterprise");
});

// ========================================
// Validation
// ========================================

Deno.test("isValidTier validates correctly", () => {
  assertEquals(isValidTier("FREE"), true);
  assertEquals(isValidTier("PRO"), true);
  assertEquals(isValidTier("ENTERPRISE"), true);
  assertEquals(isValidTier("free"), false); // case sensitive
  assertEquals(isValidTier("INVALID"), false);
  assertEquals(isValidTier(""), false);
});

Deno.test("isValidPeriod validates correctly", () => {
  assertEquals(isValidPeriod("MONTHLY"), true);
  assertEquals(isValidPeriod("YEARLY"), true);
  assertEquals(isValidPeriod("monthly"), false); // case sensitive
  assertEquals(isValidPeriod("WEEKLY"), false);
  assertEquals(isValidPeriod(""), false);
});
