/**
 * History Normalizer
 *
 * Handles message format compatibility when switching LLM providers mid-conversation.
 *
 * Unlike the previous implementation that stripped tool calls when providers changed,
 * this normalizer converts tool calls and results to the target provider's format,
 * preserving full functionality.
 *
 * Key capabilities:
 * - Convert tool call IDs between providers
 * - Adjust tool result message placement (separate message vs in user message)
 * - Preserve all information - no stripping or loss of context
 * - Fallback to text conversion only when data is malformed
 */

import { log } from "@/lib/logger.ts";
import type {
  UnifiedMessage,
  UnifiedContentPart,
  ProviderFamily,
} from "./types.ts";
import { hasToolCalls, isToolCallPart, isToolResultPart } from "./types.ts";
import { ToolCallTracker } from "./tool-call-tracker.ts";

/**
 * Detect provider family from model name
 */
export function detectProvider(model: string): ProviderFamily {
  const modelLower = model.toLowerCase();

  if (modelLower.startsWith("claude") || modelLower.includes("anthropic")) {
    return "anthropic";
  }
  if (modelLower.startsWith("gemini") || modelLower.includes("google")) {
    return "google";
  }
  if (
    modelLower.startsWith("gpt") ||
    modelLower.startsWith("o1") ||
    modelLower.startsWith("o3") ||
    modelLower.startsWith("o4") ||
    modelLower.includes("openai")
  ) {
    return "openai";
  }

  // Default to openai for unknown models (most compatible through OpenRouter)
  return "openai";
}

/**
 * Check if two providers are in the same family
 */
export function isSameProviderFamily(
  provider1: ProviderFamily,
  provider2: ProviderFamily
): boolean {
  return provider1 === provider2;
}

/**
 * Normalize message history for a target provider
 *
 * This is the main entry point for history normalization. Call this when
 * building messages from history to ensure compatibility with the target model.
 *
 * @param messages - Messages in unified format
 * @param targetProvider - The provider that will receive these messages
 * @param sourceProvider - The provider that generated the history (if known)
 * @returns Normalized messages safe for the target provider
 */
export function normalizeHistory(
  messages: UnifiedMessage[],
  targetProvider: ProviderFamily,
  sourceProvider?: ProviderFamily
): UnifiedMessage[] {
  // If no tool calls in history, nothing to normalize
  if (!historyHasToolCalls(messages)) {
    return messages;
  }

  // If same provider family, minimal normalization needed
  if (sourceProvider && isSameProviderFamily(sourceProvider, targetProvider)) {
    log.debug("Same provider family, keeping tool calls", { source: "llm", feature: "history-normalizer", targetProvider });
    return messages;
  }

  log.info("Converting history between providers", { source: "llm", feature: "history-normalizer", sourceProvider: sourceProvider || "unknown", targetProvider });

  try {
    return convertHistoryForProvider(messages, targetProvider, sourceProvider);
  } catch (error) {
    log.error("Conversion failed, falling back to text", { source: "llm", feature: "history-normalizer", targetProvider, sourceProvider, messageCount: messages.length }, error);
    return fallbackToTextConversion(messages);
  }
}

/**
 * Check if message history contains any tool calls
 */
export function historyHasToolCalls(messages: UnifiedMessage[]): boolean {
  return messages.some((msg) => {
    if (msg.role === "tool") {
      return true;
    }
    return hasToolCalls(msg);
  });
}

/**
 * Convert history for a specific provider
 *
 * This handles the actual conversion of tool calls and results between providers.
 */
function convertHistoryForProvider(
  messages: UnifiedMessage[],
  targetProvider: ProviderFamily,
  _sourceProvider?: ProviderFamily
): UnifiedMessage[] {
  switch (targetProvider) {
    case "google":
      return convertHistoryForGoogle(messages);
    case "anthropic":
      return convertHistoryForAnthropic(messages);
    case "openai":
    default:
      return convertHistoryForOpenAI(messages);
  }
}

/**
 * Convert history for Google (Gemini)
 *
 * Google specifics:
 * - Correlates tool results by function name (not ID)
 * - Tool results are in 'function' role messages
 * - Tool call arguments should be objects (not stringified)
 */
function convertHistoryForGoogle(messages: UnifiedMessage[]): UnifiedMessage[] {
  const result: UnifiedMessage[] = [];
  const tracker = new ToolCallTracker();

  for (const msg of messages) {
    if (msg.role === "system") {
      // Keep system messages as-is (handled separately by encoder)
      result.push(msg);
      continue;
    }

    if (msg.role === "user") {
      // User messages pass through
      result.push(msg);
      continue;
    }

    if (msg.role === "assistant") {
      // Process assistant messages - regenerate tool call IDs
      if (typeof msg.content === "string") {
        result.push(msg);
        continue;
      }

      const newContent: UnifiedContentPart[] = [];
      for (const part of msg.content) {
        if (isToolCallPart(part)) {
          // Generate new ID for Google (it will be ignored, but keeps structure)
          const newId = tracker.generateId(part.toolName);
          newContent.push({
            ...part,
            toolCallId: newId,
          });
        } else {
          newContent.push(part);
        }
      }
      result.push({ ...msg, content: newContent });
      continue;
    }

    if (msg.role === "tool") {
      // Tool results - correlate by name
      const toolName = msg.toolName || extractToolNameFromContent(msg);
      const toolCallId = tracker.correlate(toolName);

      if (toolCallId) {
        tracker.markUsed(toolCallId);
      }

      // Include the tool name for Google's correlation
      result.push({
        ...msg,
        toolName: toolName,
        toolCallId: toolCallId || msg.toolCallId,
      });
      continue;
    }

    result.push(msg);
  }

  return result;
}

/**
 * Convert history for Anthropic (Claude)
 *
 * Anthropic specifics:
 * - Tool results are in user messages with tool_result blocks
 * - Tool call IDs are required and must match
 * - Arguments can be objects
 */
function convertHistoryForAnthropic(
  messages: UnifiedMessage[]
): UnifiedMessage[] {
  // Anthropic can handle OpenAI-style tool call IDs, minimal conversion needed
  return regenerateToolCallIds(messages);
}

/**
 * Convert history for OpenAI
 *
 * OpenAI specifics:
 * - Tool results are separate 'tool' role messages
 * - Tool call IDs are required and must match
 * - Arguments must be stringified JSON (handled by encoder)
 */
function convertHistoryForOpenAI(messages: UnifiedMessage[]): UnifiedMessage[] {
  // OpenAI format is the default, regenerate IDs for consistency
  return regenerateToolCallIds(messages);
}

/**
 * Regenerate tool call IDs with consistent format
 *
 * This ensures tool call IDs follow a consistent pattern and that
 * tool results properly correlate with their calls.
 */
function regenerateToolCallIds(messages: UnifiedMessage[]): UnifiedMessage[] {
  const result: UnifiedMessage[] = [];
  const idMap = new Map<string, string>(); // old ID -> new ID
  let idCounter = 0;

  log.debug("Processing messages for ID regeneration", { source: "llm", feature: "history-normalizer", messageCount: messages.length });

  for (const msg of messages) {
    if (msg.role === "assistant" && typeof msg.content !== "string") {
      const newContent: UnifiedContentPart[] = [];

      for (const part of msg.content) {
        if (isToolCallPart(part)) {
          // Generate new consistent ID
          const newId = `call_${++idCounter}_${Date.now().toString(36)}`;
          log.debug("Mapping tool call ID", { source: "llm", feature: "history-normalizer", oldId: part.toolCallId || "MISSING", newId });
          if (part.toolCallId) {
            idMap.set(part.toolCallId, newId);
          }
          newContent.push({
            ...part,
            toolCallId: newId,
          });
        } else {
          newContent.push(part);
        }
      }

      result.push({ ...msg, content: newContent });
      continue;
    }

    if (msg.role === "tool") {
      // Update tool call ID to match the regenerated one
      const originalId = msg.toolCallId;
      const newId = originalId ? idMap.get(originalId) : undefined;

      log.debug("Tool result ID mapping", { source: "llm", feature: "history-normalizer", originalId: originalId || "MISSING", newId: newId || "NOT_FOUND", idMapSize: idMap.size });

      result.push({
        ...msg,
        toolCallId: newId || msg.toolCallId,
      });
      continue;
    }

    result.push(msg);
  }

  log.debug("ID regeneration complete", { source: "llm", feature: "history-normalizer", idMap: [...idMap.entries()] });
  return result;
}

/**
 * Extract tool name from message content
 */
function extractToolNameFromContent(msg: UnifiedMessage): string {
  if (typeof msg.content === "string") {
    return "unknown";
  }

  for (const part of msg.content) {
    if (isToolResultPart(part)) {
      return part.toolName;
    }
  }

  return msg.toolName || "unknown";
}

/**
 * Fallback: Convert tool calls to text representation
 *
 * This is a last resort when proper conversion fails.
 * It preserves context but loses tool call functionality.
 */
export function fallbackToTextConversion(
  messages: UnifiedMessage[]
): UnifiedMessage[] {
  log.warn("Falling back to text conversion - tool calls will be lost", { source: "llm", feature: "history-normalizer" });

  const result: UnifiedMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system" || msg.role === "user") {
      // System and user messages pass through
      result.push(msg);
      continue;
    }

    if (msg.role === "tool") {
      // Convert tool result to text summary
      const toolName = msg.toolName || "unknown tool";
      const content =
        typeof msg.content === "string"
          ? msg.content
          : extractTextFromParts(msg.content);

      const truncated =
        content.length > 500 ? content.slice(0, 500) + "..." : content;

      result.push({
        role: "assistant",
        content: `[Tool "${toolName}" returned: ${truncated}]`,
      });
      continue;
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        result.push(msg);
        continue;
      }

      // Extract text and tool call descriptions
      const textParts: string[] = [];
      const toolDescriptions: string[] = [];

      for (const part of msg.content) {
        if (part.type === "text") {
          textParts.push(part.text);
        } else if (isToolCallPart(part)) {
          toolDescriptions.push(`[Called tool "${part.toolName}"]`);
        }
      }

      const combinedContent = [...textParts, ...toolDescriptions]
        .filter(Boolean)
        .join(" ");

      if (combinedContent) {
        result.push({
          role: "assistant",
          content: combinedContent,
        });
      }
      continue;
    }

    result.push(msg);
  }

  return result;
}

/**
 * Extract text from content parts
 */
function extractTextFromParts(parts: UnifiedContentPart[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}
