/**
 * Credit Calculator
 *
 * Converts token usage to estimated dollar cost based on model pricing.
 * Prices include a 30% markup matching the Stripe Token Billing proxy.
 *
 * Ported from ChippMono: shared/utils-server/src/domains/billing/stripeCreditCalculator.ts
 */

// Model pricing in USD per million tokens (with 30% markup already applied)
// Source: Stripe Token Billing proxy configuration
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI GPT models
  "gpt-4o": { input: 3.25, output: 13.0 },
  "gpt-4o-mini": { input: 0.2, output: 0.78 },
  "gpt-5.1": { input: 9.1, output: 36.4 },
  "gpt-5.1-chat-latest": { input: 9.1, output: 36.4 },
  "gpt-5.1-codex": { input: 9.1, output: 36.4 },
  "gpt-5": { input: 6.5, output: 26.0 },
  "gpt-5-mini": { input: 1.3, output: 5.2 },
  "gpt-5-nano": { input: 0.65, output: 2.6 },
  "gpt-5-chat-latest": { input: 6.5, output: 26.0 },
  "gpt-4.1": { input: 2.6, output: 10.4 },
  "gpt-4.1-mini": { input: 1.3, output: 5.2 },
  "gpt-4.1-nano": { input: 0.65, output: 2.6 },

  // OpenAI reasoning models
  "o4-mini": { input: 3.9, output: 15.6 },
  "o3": { input: 13.0, output: 52.0 },
  "o3-pro": { input: 26.0, output: 104.0 },
  "o3-mini": { input: 1.3, output: 5.2 },
  "o1": { input: 19.5, output: 78.0 },
  "o1-pro": { input: 39.0, output: 156.0 },
  "o1-preview": { input: 1.3, output: 5.2 },
  "o1-mini": { input: 1.3, output: 5.2 },

  // Anthropic Claude models
  "claude-3-7-sonnet": { input: 3.9, output: 19.5 },
  "claude-3-7-sonnet-latest": { input: 3.9, output: 19.5 },
  "claude-3-haiku": { input: 1.04, output: 5.2 },
  "claude-3-5-haiku": { input: 1.04, output: 5.2 },
  "claude-3-5-haiku-latest": { input: 1.04, output: 5.2 },
  "claude-3-5-sonnet-latest": { input: 1.3, output: 5.2 },
  "claude-opus-4.5": { input: 6.5, output: 32.5 },
  "claude-opus-4-1": { input: 19.5, output: 97.5 },
  "claude-opus-4": { input: 19.5, output: 97.5 },
  "claude-sonnet-4": { input: 3.9, output: 19.5 },
  "claude-sonnet-4-5": { input: 3.9, output: 19.5 },

  // Google Gemini models
  "gemini-3-pro-preview": { input: 2.6, output: 10.4 },
  "gemini-2.5-pro": { input: 1.63, output: 6.5 },
  "gemini-2.5-flash": { input: 0.1, output: 0.39 },
  "gemini-2.5-flash-lite": { input: 0.05, output: 0.2 },
  "gemini-2.0-flash": { input: 0.1, output: 0.39 },
  "gemini-2.0-flash-lite": { input: 0.05, output: 0.2 },

  // Other models (default pricing: $1.30 / $5.20)
  "deepseek-v3": { input: 1.3, output: 5.2 },
  "deepseek-r1": { input: 1.3, output: 5.2 },
  "qwen3-coder": { input: 1.3, output: 5.2 },
  "qwen3-235b": { input: 1.3, output: 5.2 },
  "qwen-2.5-coder-32b": { input: 1.3, output: 5.2 },
  "kimi-k2": { input: 1.3, output: 5.2 },
  "llama-3.3-70b": { input: 1.3, output: 5.2 },
  "mixtral-8x22b": { input: 1.3, output: 5.2 },
  "mistral-large-2411": { input: 1.3, output: 5.2 },
  "perplexity-sonar-reasoning-pro": { input: 1.3, output: 5.2 },
  "jamba-large-1.7": { input: 1.3, output: 5.2 },
};

// Default pricing for unknown models (with 30% markup)
const DEFAULT_PRICING = { input: 1.3, output: 5.2 };

/**
 * Look up pricing for a model name.
 * Tries exact match first, then strips common prefixes/suffixes.
 */
function getModelPricing(
  model: string
): { input: number; output: number } {
  if (!model) return DEFAULT_PRICING;

  // Exact match
  const normalized = model.toLowerCase().trim();
  if (MODEL_PRICING[normalized]) return MODEL_PRICING[normalized];

  // Try stripping provider prefix (e.g., "openai/gpt-4o" -> "gpt-4o")
  const withoutPrefix = normalized.split("/").pop() || normalized;
  if (MODEL_PRICING[withoutPrefix]) return MODEL_PRICING[withoutPrefix];

  // Try stripping date suffix (e.g., "gpt-4o-2024-08-06" -> "gpt-4o")
  const withoutDate = withoutPrefix.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (MODEL_PRICING[withoutDate]) return MODEL_PRICING[withoutDate];

  return DEFAULT_PRICING;
}

/**
 * Calculate the estimated credit cost for token usage.
 *
 * @param params.inputTokens - Number of input tokens
 * @param params.outputTokens - Number of output tokens
 * @param params.tokens - Total tokens (used if input/output not available, splits 25%/75%)
 * @param params.model - Model name for pricing lookup
 * @returns Estimated cost in cents
 */
export function calculateCredits(params: {
  inputTokens?: number | null;
  outputTokens?: number | null;
  tokens?: number | null;
  model?: string | null;
}): number {
  const { model } = params;
  let { inputTokens, outputTokens } = params;

  // If only total tokens available, estimate 25% input / 75% output
  if (
    (inputTokens == null || inputTokens === 0) &&
    (outputTokens == null || outputTokens === 0) &&
    params.tokens
  ) {
    inputTokens = Math.round(params.tokens * 0.25);
    outputTokens = Math.round(params.tokens * 0.75);
  }

  inputTokens = inputTokens || 0;
  outputTokens = outputTokens || 0;

  if (inputTokens === 0 && outputTokens === 0) return 0;

  const pricing = getModelPricing(model || "");

  // Cost = (tokens / 1_000_000) * price_per_million_usd * 100 (to cents)
  const inputCostCents = (inputTokens / 1_000_000) * pricing.input * 100;
  const outputCostCents = (outputTokens / 1_000_000) * pricing.output * 100;

  return Math.round((inputCostCents + outputCostCents) * 100) / 100;
}

/**
 * Get the display name for a model.
 */
export function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-5": "GPT-5",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5-nano": "GPT-5 Nano",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
    "o3": "o3",
    "o3-mini": "o3 Mini",
    "o4-mini": "o4 Mini",
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-opus-4.5": "Claude Opus 4.5",
    "claude-3-7-sonnet": "Claude 3.7 Sonnet",
    "claude-3-haiku": "Claude 3 Haiku",
    "claude-3-5-haiku": "Claude 3.5 Haiku",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
  };

  const normalized = model.toLowerCase().trim();
  const withoutPrefix = normalized.split("/").pop() || normalized;
  return names[withoutPrefix] || model;
}
