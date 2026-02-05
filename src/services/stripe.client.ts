/**
 * Stripe Client
 *
 * Initializes and exports Stripe SDK instance for Deno.
 */

import Stripe from "npm:stripe";

// Support multiple env var names for Stripe keys
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_SECRET_KEY_TEST = Deno.env.get("STRIPE_SECRET_KEY_TEST");
const STRIPE_SANDBOX_KEY = Deno.env.get("STRIPE_SANDBOX_KEY");
const STRIPE_CHIPP_KEY = Deno.env.get("STRIPE_CHIPP_KEY");

// Explicit mode toggle - overrides environment-based detection
// Set STRIPE_USE_LIVE_MODE=true to force live keys in any environment
const STRIPE_USE_LIVE_MODE = Deno.env.get("STRIPE_USE_LIVE_MODE") === "true";

// Determine which key to use based on environment or explicit toggle
const isProduction = Deno.env.get("ENVIRONMENT") === "production";
const useLiveMode = STRIPE_USE_LIVE_MODE || isProduction;
const stripeKey = useLiveMode
  ? STRIPE_SECRET_KEY || STRIPE_CHIPP_KEY
  : STRIPE_SECRET_KEY_TEST || STRIPE_SECRET_KEY || STRIPE_CHIPP_KEY;

// Stripe API versions
export const STRIPE_API_VERSION = "2025-02-24.acacia";
export const STRIPE_V2_API_VERSION = "2025-08-27.preview";

/**
 * Check if we should use live mode (for billing decisions)
 *
 * Returns true if:
 * - STRIPE_USE_LIVE_MODE=true is set (explicit toggle), OR
 * - ENVIRONMENT=production
 */
export function shouldUseLiveMode(): boolean {
  return useLiveMode;
}

/**
 * Get the appropriate Stripe API key
 *
 * Mode determination:
 * 1. If STRIPE_USE_LIVE_MODE=true, always use live keys (STRIPE_CHIPP_KEY)
 * 2. If ENVIRONMENT=production, use live keys
 * 3. Otherwise, use sandbox keys for v2 billing (bpp_test_* pricing plans)
 *
 * Note: bpp_test_* pricing plans exist ONLY in the sandbox account (1S05Ov).
 * They do NOT exist in the Chipp account's (1NmfTh) test mode.
 */
export function getStripeApiKey(useSandbox: boolean = false): string | null {
  // If explicitly set to live mode, always return live key
  if (STRIPE_USE_LIVE_MODE) {
    return STRIPE_CHIPP_KEY || STRIPE_SECRET_KEY || null;
  }

  // If requesting sandbox (for v2 billing in dev), use sandbox key
  if (useSandbox && STRIPE_SANDBOX_KEY) {
    return STRIPE_SANDBOX_KEY;
  }

  // Default to the computed stripeKey (respects environment)
  return stripeKey || STRIPE_CHIPP_KEY || null;
}

if (!stripeKey && !STRIPE_CHIPP_KEY) {
  console.warn(
    "[stripe] Stripe secret key not configured. Billing features will not work."
  );
}

export const stripe = stripeKey
  ? new Stripe(stripeKey, {
      apiVersion: "2025-02-24.acacia", // Use a recent stable API version
    })
  : null;

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}
