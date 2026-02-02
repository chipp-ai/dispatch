/**
 * Google Gemini Response Decoder
 *
 * Converts Google Generative AI API responses to unified format.
 *
 * Key transformations:
 * - Extract text and functionCall parts
 * - Generate tool call IDs (Google doesn't provide them)
 * - Map finish reasons to unified format
 * - Tool call arguments are already objects
 */

import type {
  GenerateContentResponse,
  GenerateContentStreamResult,
  EnhancedGenerateContentResponse,
} from "npm:@google/generative-ai@0.21.0";
import type {
  UnifiedResponse,
  UnifiedContentPart,
  UnifiedFinishReason,
  UnifiedStreamChunk,
  UnifiedUsage,
  ProviderDecoder,
} from "../types.ts";

// Google response types
type GoogleResponse = GenerateContentResponse | EnhancedGenerateContentResponse;

// Google stream chunk type (from sendMessageStream)
interface GoogleStreamChunk {
  text: () => string;
  functionCalls: () =>
    | Array<{ name: string; args: Record<string, unknown> }>
    | undefined;
}

/**
 * Map Google finish reason to unified format
 */
function mapFinishReason(
  reason: string | null | undefined
): UnifiedFinishReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content-filter";
    case "OTHER":
    default:
      return "other";
  }
}

/**
 * Generate a unique tool call ID
 *
 * Google doesn't provide tool call IDs, so we generate them.
 * Format: call_{timestamp}_{random}
 */
function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Google Gemini Response Decoder
 */
export class GoogleDecoder
  implements ProviderDecoder<GoogleResponse, GoogleStreamChunk>
{
  /**
   * Decode a complete Google response to unified format
   */
  decodeResponse(response: GoogleResponse): UnifiedResponse {
    const content: UnifiedContentPart[] = [];

    // Get the response data - handle both direct and wrapped response types
    // Some responses wrap the actual response in a .response property
    const responseData =
      "response" in response
        ? (response as unknown as { response: GenerateContentResponse })
            .response
        : response;
    const candidates = responseData?.candidates;

    if (!candidates || candidates.length === 0) {
      return {
        content: [],
        finishReason: "error",
      };
    }

    const candidate = candidates[0];
    const parts = candidate.content?.parts || [];

    // Process parts
    for (const part of parts) {
      if ("text" in part && part.text) {
        content.push({
          type: "text",
          text: part.text,
        });
      } else if ("functionCall" in part && part.functionCall) {
        content.push({
          type: "tool-call",
          toolCallId: generateToolCallId(),
          toolName: part.functionCall.name,
          input: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }

    // Extract usage if available
    let usage: UnifiedUsage | undefined;
    const usageMetadata = responseData?.usageMetadata;
    if (usageMetadata) {
      usage = {
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount,
      };
    }

    // Determine finish reason
    const finishReason = candidate.finishReason
      ? mapFinishReason(candidate.finishReason as string)
      : content.some((p) => p.type === "tool-call")
        ? "tool-calls"
        : "stop";

    return {
      content,
      finishReason,
      usage,
      rawResponse: response,
    };
  }

  /**
   * Decode a streaming chunk to unified format
   *
   * Google's streaming returns text and function calls in each chunk.
   */
  decodeStreamChunk(chunk: GoogleStreamChunk): UnifiedStreamChunk | null {
    const text = chunk.text();
    const functionCalls = chunk.functionCalls();

    if (text) {
      return {
        type: "text",
        delta: text,
      };
    }

    // Function calls in streaming come as complete calls, not deltas
    // We handle them via the stream tracker
    if (functionCalls && functionCalls.length > 0) {
      // Return first function call as a complete tool call
      const fc = functionCalls[0];
      return {
        type: "tool-call",
        call: {
          id: generateToolCallId(),
          name: fc.name,
          arguments: fc.args,
        },
      };
    }

    return null;
  }
}

/**
 * Default Google decoder instance
 */
export const googleDecoder = new GoogleDecoder();

/**
 * Streaming state tracker for Google
 *
 * Maintains state and generates tool call IDs for Google responses.
 */
export class GoogleStreamTracker {
  private toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }> = [];
  private textContent = "";

  /**
   * Process a stream chunk
   */
  processChunk(chunk: GoogleStreamChunk): {
    textDelta?: string;
    completedToolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>;
  } {
    const result: {
      textDelta?: string;
      completedToolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      }>;
    } = { completedToolCalls: [] };

    const text = chunk.text();
    if (text) {
      result.textDelta = text;
      this.textContent += text;
    }

    const functionCalls = chunk.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      for (const fc of functionCalls) {
        const toolCall = {
          id: generateToolCallId(),
          name: fc.name,
          arguments: fc.args,
        };
        this.toolCalls.push(toolCall);
        result.completedToolCalls.push(toolCall);
      }
    }

    return result;
  }

  /**
   * Get all accumulated tool calls
   */
  getToolCalls(): Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }> {
    return [...this.toolCalls];
  }

  /**
   * Get accumulated text content
   */
  getTextContent(): string {
    return this.textContent;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.toolCalls = [];
    this.textContent = "";
  }
}
