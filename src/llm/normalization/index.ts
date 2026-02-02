/**
 * LLM Format Normalization Layer
 *
 * Provider-agnostic message format for cross-provider compatibility.
 *
 * This module provides:
 * - Unified message types for storage and processing
 * - Encoders: Convert unified → provider-specific format
 * - Decoders: Convert provider-specific → unified format
 * - History normalizer: Handle provider switches mid-conversation
 * - Converters: Backward compatibility with legacy Message type
 *
 * Usage:
 * ```typescript
 * import {
 *   toUnified,
 *   normalizeHistory,
 *   detectProvider,
 *   openaiEncoder,
 * } from "./normalization/index.ts";
 *
 * // Convert legacy messages to unified format
 * const unified = toUnified(legacyMessages);
 *
 * // Normalize for provider switch
 * const normalized = normalizeHistory(unified, "anthropic", "openai");
 *
 * // Encode for API call
 * const { messages, system } = await openaiEncoder.encodeMessages(normalized);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  UnifiedRole,
  UnifiedMessage,
  UnifiedContentPart,
  // Content parts
  UnifiedTextPart,
  UnifiedImagePart,
  UnifiedToolCallPart,
  UnifiedToolResultPart,
  UnifiedReasoningPart,
  // Tool output types
  UnifiedToolOutput,
  UnifiedTextOutput,
  UnifiedJsonOutput,
  UnifiedErrorOutput,
  // Response types
  UnifiedResponse,
  UnifiedFinishReason,
  UnifiedUsage,
  // Streaming types
  UnifiedStreamChunk,
  UnifiedTextStreamChunk,
  UnifiedToolCallStreamChunk,
  UnifiedToolCallDeltaStreamChunk,
  UnifiedDoneStreamChunk,
  // Tool definition types
  JSONSchema7,
  UnifiedToolDefinition,
  // Provider types
  ProviderFamily,
  ProviderEncoder,
  ProviderDecoder,
} from "./types.ts";

// Type guards
export {
  isTextPart,
  isImagePart,
  isToolCallPart,
  isToolResultPart,
  isReasoningPart,
  hasStructuredContent,
  hasToolCalls,
  extractText,
  extractToolCalls,
} from "./types.ts";

// ============================================================================
// ENCODERS
// ============================================================================

export {
  OpenAIEncoder,
  openaiEncoder,
  AnthropicEncoder,
  anthropicEncoder,
  GoogleEncoder,
  googleEncoder,
  getEncoder,
} from "./encoders/index.ts";

export type {
  OpenAIEncoderConfig,
  AnthropicEncoderConfig,
  GoogleEncoderConfig,
} from "./encoders/index.ts";

// ============================================================================
// DECODERS
// ============================================================================

export {
  OpenAIDecoder,
  openaiDecoder,
  OpenAIStreamTracker,
  AnthropicDecoder,
  anthropicDecoder,
  AnthropicStreamTracker,
  GoogleDecoder,
  googleDecoder,
  GoogleStreamTracker,
  getDecoder,
} from "./decoders/index.ts";

// ============================================================================
// TOOL CALL TRACKER
// ============================================================================

export {
  ToolCallTracker,
  createToolCallTracker,
  globalToolCallTracker,
} from "./tool-call-tracker.ts";

export type { ToolCallEntry } from "./tool-call-tracker.ts";

// ============================================================================
// HISTORY NORMALIZER
// ============================================================================

export {
  normalizeHistory,
  detectProvider,
  isSameProviderFamily,
  historyHasToolCalls,
  fallbackToTextConversion,
} from "./history-normalizer.ts";

// ============================================================================
// CONVERTERS (Backward Compatibility)
// ============================================================================

export {
  toUnified,
  fromUnified,
  hasMultimodalContent,
  extractAllText,
  needsImageFetching,
} from "./converters.ts";
