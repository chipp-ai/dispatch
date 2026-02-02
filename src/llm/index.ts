/**
 * LLM Module
 *
 * Export all LLM-related components.
 */

// Types
export type {
  Message,
  MessageRole,
  Tool,
  ToolCall,
  StreamChunk,
  StreamOptions,
  LLMProvider,
  TokenUsage,
  BillingContext,
} from "./types.ts";

// Adapter
export {
  createAdapter,
  createAdapterForModel,
  createAdapterWithBilling,
  detectProvider,
  isStripeTokenBillingConfigured,
} from "./adapter.ts";
export type { ProviderType } from "./adapter.ts";

// Providers (for direct use if needed)
export { OpenAIProvider } from "./providers/openai.ts";
export { AnthropicProvider } from "./providers/anthropic.ts";
export { StripeTokenBillingProvider } from "./providers/stripe-token-billing.ts";

// History normalization (wrapper using new normalizer internally)
export {
  normalizeHistoryForModel,
  stripToolCallHistory,
  historyHasToolCalls,
} from "./utils/normalize-history.ts";

// New normalization layer - unified format with bidirectional conversion
export {
  // Unified types
  type UnifiedMessage,
  type UnifiedContentPart,
  type UnifiedToolDefinition,
  type UnifiedResponse,
  type UnifiedFinishReason,
  type UnifiedUsage,
  type ProviderFamily,
  // Encoders
  OpenAIEncoder,
  openaiEncoder,
  AnthropicEncoder,
  anthropicEncoder,
  GoogleEncoder,
  googleEncoder,
  getEncoder,
  // Decoders
  OpenAIDecoder,
  openaiDecoder,
  AnthropicDecoder,
  anthropicDecoder,
  GoogleDecoder,
  googleDecoder,
  getDecoder,
  // Stream trackers
  OpenAIStreamTracker,
  AnthropicStreamTracker,
  GoogleStreamTracker,
  // Converters
  toUnified,
  fromUnified,
  // History normalizer
  normalizeHistory,
  detectProvider as detectProviderFamily,
  isSameProviderFamily,
  // Type guards
  isTextPart,
  isImagePart,
  isToolCallPart,
  isToolResultPart,
  hasToolCalls,
  extractText,
  extractToolCalls,
} from "./normalization/index.ts";
