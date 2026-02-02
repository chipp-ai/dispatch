/**
 * Stripe Token Billing Model Mapping
 *
 * Maps model names to Stripe Token Billing format and handles parameter transformation.
 * Based on shared/utils-server/src/domains/llm/adapter/stripe-token-billing-models.ts
 */

// ============================================================================
// MODEL MAPPING
// ============================================================================

/**
 * Model name to Stripe Token Billing ID mapping
 * Format: "provider/model" (e.g., "openai/gpt-4o")
 */
export const MODEL_TO_STRIPE: Record<string, string> = {
  // OpenAI models
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-2024-08-06": "openai/gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20": "openai/gpt-4o-2024-11-20",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4o-mini-2024-07-18": "openai/gpt-4o-mini-2024-07-18",
  "gpt-5": "openai/gpt-5",
  "gpt-5-mini": "openai/gpt-5-mini",
  "gpt-5-nano": "openai/gpt-5-nano",
  "gpt-5-chat-latest": "openai/gpt-5-chat-latest",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4.1-nano": "openai/gpt-4.1-nano",
  o1: "openai/o1",
  "o1-preview": "openai/o1-preview",
  "o1-mini": "openai/o1-mini",
  "o1-pro": "openai/o1-pro",
  o3: "openai/o3",
  "o3-mini": "openai/o3-mini",
  "o3-pro": "openai/o3-pro",
  "o4-mini": "openai/o4-mini",

  // Anthropic models
  "claude-3-haiku-20240307": "anthropic/claude-3-haiku",
  "claude-3-7-sonnet": "anthropic/claude-3-7-sonnet",
  "claude-3.7-sonnet": "anthropic/claude-3-7-sonnet",
  "claude-3-7-sonnet-latest": "anthropic/claude-3-7-sonnet-latest",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet-20240620",
  "claude-3-5-sonnet-latest": "anthropic/claude-3.5-sonnet-20240620",
  "claude-3-5-haiku-latest": "anthropic/claude-3-5-haiku-latest",
  "claude-3-5-haiku-20241022": "anthropic/claude-3-5-haiku-latest",
  "claude-3-opus-20240229": "anthropic/claude-3-opus",
  "claude-opus-4": "anthropic/claude-opus-4",
  "claude-opus-4-1": "anthropic/claude-opus-4-1",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4-5",

  // Google models
  "gemini-1.5-pro": "google/gemini-2.5-pro",
  "gemini-1.5-pro-002": "google/gemini-2.5-pro",
  "gemini-1.5-flash": "google/gemini-2.5-flash",
  "gemini-1.5-flash-002": "google/gemini-2.5-flash",
  "gemini-2.0-flash": "google/gemini-2.0-flash",
  "gemini-2.0-flash-lite": "google/gemini-2.0-flash-lite",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite",

  // Other models
  "deepseek-v3": "deepseek/deepseek-chat-v3-0324",
  "deepseek-r1": "deepseek/deepseek-r1-0528",
  "qwen3-coder": "qwen/qwen3-coder",
  "qwen3-235b": "qwen/qwen3-235b-a22b-2507",
  "qwen-2.5-coder-32b": "qwen/qwen-2.5-coder-32b-instruct",
  "kimi-k2": "moonshotai/kimi-k2",
  "llama-3.3-70b": "meta-llama/llama-3.3-70b-instruct",
  "mixtral-8x22b": "mistralai/mixtral-8x22b-instruct",
  "mistral-large-2411": "mistralai/mistral-large-2411",
  "perplexity-sonar-reasoning-pro": "perplexity/sonar-reasoning-pro",
  "jamba-large-1.7": "ai21/jamba-large-1.7",
};

// ============================================================================
// PROVIDER EXTRACTION
// ============================================================================

/**
 * BYOK provider names recognized by Stripe Token Billing
 *
 * Note: Only OpenAI supports BYOK. Anthropic and Google requests are routed
 * through Stripe's proxy directly without BYOK credential support.
 */
export type ByokProviderName = "openai";

/**
 * Providers that actually support BYOK with Stripe Token Billing.
 * NOTE: Only OpenAI is currently supported. Anthropic and Google are "coming soon".
 */
export const BYOK_SUPPORTED_PROVIDERS = new Set<ByokProviderName>(["openai"]);

/**
 * Extract the provider name from a Stripe model ID
 * Used for BYOK (Bring Your Own Key) credential selection
 *
 * @param stripeModelId - Model ID in "provider/model" format (e.g., "openai/gpt-4o")
 * @returns The provider name, or null if not a BYOK-supported provider
 */
export function getProviderFromModel(
  stripeModelId: string
): ByokProviderName | null {
  const provider = stripeModelId.split("/")[0]?.toLowerCase();

  switch (provider) {
    case "openai":
      return "openai";
    // Note: Anthropic and Google do NOT support BYOK with Stripe Token Billing
    // Requests are routed through Stripe's proxy directly
    default:
      return null;
  }
}

// ============================================================================
// MODEL CAPABILITIES
// ============================================================================

interface ModelCapabilities {
  requiresMaxCompletionTokens: boolean;
  requiresResponsesApi: boolean;
  supportsTemperature: boolean;
  supportsTopP: boolean;
  supportsFrequencyPenalty: boolean;
  supportsPresencePenalty: boolean;
}

/**
 * Models that require the Responses API instead of Chat Completions
 */
const RESPONSES_API_MODELS = new Set([
  "openai/o1-pro",
  "openai/o3-pro",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5-chat-latest",
]);

/**
 * Check if a model requires the Responses API
 */
export function stripeModelRequiresResponsesApi(
  stripeModelId: string
): boolean {
  return RESPONSES_API_MODELS.has(stripeModelId);
}

/**
 * Get model capabilities for parameter transformation
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const normalized = modelId.toLowerCase();

  // Check for specific model patterns
  const isGPT5 =
    normalized.includes("gpt-5") || normalized.includes("openai/gpt-5");
  const isGPT41 =
    normalized.includes("gpt-4.1") || normalized.includes("openai/gpt-4.1");
  const isOSeries =
    /\/o[134]/.test(normalized) ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    /\/o[134]-/.test(normalized);

  const requiresResponsesApi =
    normalized.includes("o1-pro") || normalized.includes("o3-pro") || isGPT5;

  return {
    requiresMaxCompletionTokens:
      isGPT41 || isGPT5 || isOSeries || requiresResponsesApi,
    requiresResponsesApi,
    supportsTemperature: !(isGPT5 || isOSeries),
    supportsTopP: !(isGPT5 || isOSeries),
    supportsFrequencyPenalty: !(isGPT5 || isOSeries),
    supportsPresencePenalty: !(isGPT5 || isOSeries),
  };
}

/**
 * Transform request parameters based on model capabilities
 *
 * Handles:
 * - max_tokens → max_completion_tokens (for GPT-4.1, GPT-5, o-series)
 * - Removing unsupported sampling parameters (temperature, top_p, etc.)
 *
 * @param modelId - Stripe model ID (e.g., "openai/gpt-5")
 * @param bodyData - Request body object (modified IN PLACE)
 * @param isResponsesApiEndpoint - Whether using /responses endpoint
 * @returns Array of parameter names that were removed
 */
export function transformModelParameters(
  modelId: string,
  bodyData: Record<string, unknown>,
  isResponsesApiEndpoint: boolean = false
): string[] {
  const removedParams: string[] = [];
  const capabilities = getModelCapabilities(modelId);

  // === Token limit parameter transformation ===

  if (isResponsesApiEndpoint || capabilities.requiresResponsesApi) {
    // Responses API uses max_output_tokens
    const tokenValue =
      bodyData.max_output_tokens ??
      bodyData.max_completion_tokens ??
      bodyData.max_tokens;

    if (tokenValue !== undefined) {
      bodyData.max_output_tokens = tokenValue;
    }
    if (bodyData.max_completion_tokens !== undefined) {
      delete bodyData.max_completion_tokens;
    }
    if (bodyData.max_tokens !== undefined) {
      delete bodyData.max_tokens;
    }
  } else if (capabilities.requiresMaxCompletionTokens) {
    // Chat Completions API with newer models uses max_completion_tokens
    if (
      bodyData.max_tokens !== undefined &&
      bodyData.max_completion_tokens === undefined
    ) {
      bodyData.max_completion_tokens = bodyData.max_tokens;
    }
    delete bodyData.max_tokens;
  }

  // === Sampling parameter removal ===

  if (!capabilities.supportsTemperature && bodyData.temperature !== undefined) {
    delete bodyData.temperature;
    removedParams.push("temperature");
  }

  if (!capabilities.supportsTopP && bodyData.top_p !== undefined) {
    delete bodyData.top_p;
    removedParams.push("top_p");
  }

  if (
    !capabilities.supportsFrequencyPenalty &&
    bodyData.frequency_penalty !== undefined
  ) {
    delete bodyData.frequency_penalty;
    removedParams.push("frequency_penalty");
  }

  if (
    !capabilities.supportsPresencePenalty &&
    bodyData.presence_penalty !== undefined
  ) {
    delete bodyData.presence_penalty;
    removedParams.push("presence_penalty");
  }

  return removedParams;
}
