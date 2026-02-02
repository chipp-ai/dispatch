/**
 * History Normalization Utilities
 *
 * Wrapper functions that use the new normalization layer internally.
 * This file exists for import path compatibility.
 */

import type { Message } from "../types.ts";
import {
  normalizeHistory,
  historyHasToolCalls as checkHistoryHasToolCalls,
  fallbackToTextConversion,
  detectProvider,
  toUnified,
  fromUnified,
} from "../normalization/index.ts";

/**
 * Check if message history contains any tool calls
 */
export function historyHasToolCalls(messages: Message[]): boolean {
  const unified = toUnified(messages);
  return checkHistoryHasToolCalls(unified);
}

/**
 * Strip tool call history from messages (fallback to text conversion)
 *
 * @deprecated Use normalizeHistoryForModel instead - it preserves tool calls when possible
 */
export function stripToolCallHistory(messages: Message[]): Message[] {
  const unified = toUnified(messages);
  const stripped = fallbackToTextConversion(unified);
  return fromUnified(stripped);
}

/**
 * Normalize message history for a given model
 *
 * This is the main entry point. Call this when building messages from history
 * to ensure compatibility with the target model.
 *
 * The new normalizer preserves tool calls when possible by converting between
 * provider formats, rather than stripping them to text.
 *
 * @param messages - Raw messages from history
 * @param currentModel - The model that will receive these messages
 * @param previousModel - The model that generated the history (if known)
 * @returns Normalized messages safe for the current model
 */
export function normalizeHistoryForModel(
  messages: Message[],
  currentModel: string,
  previousModel?: string | null
): Message[] {
  console.log(`[normalizeHistoryForModel] Input: ${messages.length} messages`);

  // Convert to unified format
  const unified = toUnified(messages);
  console.log(
    `[normalizeHistoryForModel] After toUnified: ${unified.length} messages`
  );

  // Detect providers
  const targetProvider = detectProvider(currentModel);
  const sourceProvider = previousModel
    ? detectProvider(previousModel)
    : undefined;

  // Normalize using new layer
  const normalized = normalizeHistory(unified, targetProvider, sourceProvider);
  console.log(
    `[normalizeHistoryForModel] After normalizeHistory: ${normalized.length} messages`
  );

  // Convert back to legacy format
  const result = fromUnified(normalized);
  console.log(
    `[normalizeHistoryForModel] After fromUnified: ${result.length} messages`
  );
  return result;
}

// Re-export detectProvider for direct use
export { detectProvider };
