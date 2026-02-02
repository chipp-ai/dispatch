/**
 * LLM Adapter Factory
 *
 * Creates provider-specific adapters for OpenAI, Anthropic, Google,
 * and Stripe Token Billing (for usage-based billing).
 *
 * All SDKs work natively with Deno.
 */

import type { LLMProvider, BillingContext } from "./types.ts";
import { OpenAIProvider } from "./providers/openai.ts";
import { AnthropicProvider } from "./providers/anthropic.ts";
import { GoogleProvider } from "./providers/google.ts";
import { StripeTokenBillingProvider } from "./providers/stripe-token-billing.ts";

export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "stripe-token-billing";

/**
 * Create an LLM provider adapter
 *
 * @param provider - Provider type
 * @param billingContext - Billing context for Stripe Token Billing (required for stripe-token-billing)
 */
export function createAdapter(
  provider: ProviderType,
  billingContext?: BillingContext
): LLMProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "google":
      return new GoogleProvider();
    case "stripe-token-billing":
      if (!billingContext) {
        throw new Error(
          "BillingContext is required for stripe-token-billing provider"
        );
      }
      return new StripeTokenBillingProvider(billingContext);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Detect provider from model name
 */
export function detectProvider(model: string): ProviderType {
  if (model.startsWith("claude")) {
    return "anthropic";
  }
  if (model.startsWith("gemini")) {
    return "google";
  }
  // Default to OpenAI for gpt-*, o1-*, etc.
  return "openai";
}

/**
 * Create adapter from model name (uses direct provider APIs)
 *
 * @deprecated For chat endpoints, use createAdapterWithBilling() instead.
 * This function bypasses Stripe Token Billing and should only be used for
 * internal/testing purposes where billing attribution is not required.
 */
export function createAdapterForModel(model: string): LLMProvider {
  return createAdapter(detectProvider(model));
}

/**
 * Check if Stripe Token Billing is available and configured
 */
export function isStripeTokenBillingConfigured(): boolean {
  return !!(
    Deno.env.get("STRIPE_CHIPP_KEY") || Deno.env.get("STRIPE_SANDBOX_KEY")
  );
}

/**
 * Create adapter with Stripe Token Billing
 *
 * All LLM requests in chipp-deno MUST go through Stripe Token Billing
 * for proper billing attribution. This function throws if Stripe Token
 * Billing is not configured.
 *
 * @param model - Model name (e.g., "gpt-4o", "claude-3-7-sonnet")
 * @param billingContext - Organization billing context
 * @returns LLM provider configured for Stripe Token Billing
 * @throws Error if Stripe Token Billing is not configured
 */
export function createAdapterWithBilling(
  model: string,
  billingContext: BillingContext
): LLMProvider {
  const stripeConfigured = isStripeTokenBillingConfigured();

  if (!stripeConfigured) {
    throw new Error(
      "Stripe Token Billing is not configured. " +
        "Set STRIPE_CHIPP_KEY or STRIPE_SANDBOX_KEY environment variable. " +
        "All LLM requests must go through Stripe Token Billing for billing attribution."
    );
  }

  // Every organization must have a Stripe customer ID
  if (!billingContext.stripeCustomerId) {
    throw new Error(
      "No Stripe customer ID available for billing attribution. " +
        "Every organization must have a stripeCustomerId configured."
    );
  }

  console.log("[llm-adapter] Using Stripe Token Billing", {
    model,
    customerId: billingContext.stripeCustomerId,
    organizationId: billingContext.organizationId,
  });

  return new StripeTokenBillingProvider(billingContext);
}

// Re-export types
export type {
  LLMProvider,
  Message,
  Tool,
  ToolCall,
  StreamChunk,
  StreamOptions,
} from "./types.ts";
