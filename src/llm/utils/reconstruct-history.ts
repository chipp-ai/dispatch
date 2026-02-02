/**
 * Reconstruct History
 *
 * Converts DB message records into properly structured LLM messages,
 * including tool calls and tool results that would otherwise be lost
 * when only sending msg.content (plain text).
 *
 * Without this, the LLM has no context that tools were already used
 * in previous turns, causing it to hallucinate duplicate tool calls.
 */

import type { Message as LLMMessage, ContentPart } from "../types.ts";
import type { Message as DBMessage } from "../../services/chat.service.ts";

/**
 * Parse a JSON column from Kysely, which may be a string or already parsed.
 */
function parseJsonField<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
}

interface ToolResultRecord {
  callId: string;
  name: string;
  result: unknown;
  success: boolean;
}

/**
 * Reconstruct LLM message history from DB records.
 *
 * Handles:
 * - User messages (plain text)
 * - Assistant messages with tool_use ContentParts
 * - Separate role:"tool" messages for tool results
 * - Hard limit of 50 tool calls per message (corruption safeguard)
 *
 * Does NOT reconstruct:
 * - Audio (stored as GCS URL, needs base64 — text content captures semantics)
 * - Video (skipped to match builder chat behavior)
 */
export function reconstructHistory(
  history: DBMessage[],
  options?: { logPrefix?: string }
): LLMMessage[] {
  const prefix = options?.logPrefix || "[reconstruct-history]";
  const messages: LLMMessage[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else {
      // Assistant message — check for tool calls
      const toolCalls = parseJsonField<ToolCallRecord[]>(msg.toolCalls);
      const toolResults = parseJsonField<ToolResultRecord[]>(msg.toolResults);

      if (toolCalls && toolCalls.length > 0) {
        // Build content array with text and tool_use blocks
        const contentParts: ContentPart[] = [];
        if (msg.content) {
          contentParts.push({ type: "text", text: msg.content });
        }
        for (const call of toolCalls) {
          contentParts.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.input as Record<string, unknown>,
          });
        }
        messages.push({ role: "assistant", content: contentParts });

        // Add tool result messages
        if (toolResults && toolResults.length > 0) {
          const HARD_LIMIT = 50;
          const effectiveToolCalls = Math.min(toolCalls.length, HARD_LIMIT);
          const maxToolResults = Math.min(
            toolResults.length,
            effectiveToolCalls,
            HARD_LIMIT
          );

          if (
            toolResults.length > maxToolResults ||
            toolCalls.length > HARD_LIMIT
          ) {
            console.error(
              `${prefix} CORRUPTED DATA: ${toolResults.length} toolResults, ${toolCalls.length} toolCalls in msg ${msg.id?.slice(0, 8)}. Limiting to ${maxToolResults}.`
            );
          }

          for (let i = 0; i < maxToolResults; i++) {
            const result = toolResults[i];
            if (!result.callId) {
              console.warn(
                `${prefix} Skipping tool result without callId: ${result.name}`
              );
              continue;
            }
            messages.push({
              role: "tool",
              content: JSON.stringify(result.result),
              toolCallId: result.callId,
              name: result.name,
            });
          }
        }
      } else {
        // No tool calls, just text content
        messages.push({
          role: "assistant",
          content: msg.content || "",
        });
      }
    }
  }

  console.log(
    `${prefix} Reconstructed ${messages.length} LLM messages from ${history.length} DB records`
  );

  return messages;
}
