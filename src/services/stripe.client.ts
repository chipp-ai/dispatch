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

// Determine which key to use based on environment
const isProduction = Deno.env.get("ENVIRONMENT") === "production";
const stripeKey = isProduction
  ? STRIPE_SECRET_KEY || STRIPE_CHIPP_KEY
  : STRIPE_SECRET_KEY_TEST || STRIPE_SECRET_KEY || STRIPE_CHIPP_KEY;

// Stripe API versions
export const STRIPE_API_VERSION = "2025-02-24.acacia";
export const STRIPE_V2_API_VERSION = "2025-08-27.preview";

/**
 * Get the appropriate Stripe API key
 */
export function getStripeApiKey(useSandbox: boolean = false): string | null {
  if (useSandbox && STRIPE_SANDBOX_KEY) {
    return STRIPE_SANDBOX_KEY;
  }
  // Fall back to STRIPE_CHIPP_KEY if other keys not set
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
