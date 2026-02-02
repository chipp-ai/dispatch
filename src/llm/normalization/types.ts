/**
 * Unified LLM Types
 *
 * Provider-agnostic types for message storage and processing.
 * These types serve as an intermediate representation for cross-provider compatibility.
 *
 * Key design principles:
 * - All tool call arguments are stored as parsed objects (not stringified)
 * - Tool call IDs are always present and normalized
 * - Content parts are discriminated by 'type' field for easy handling
 * - Types support bidirectional conversion to/from any provider format
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Unified role type - maps to all provider role types
 *
 * Mappings:
 * - 'system' → OpenAI: 'system', Anthropic: top-level 'system' field, Google: 'systemInstruction'
 * - 'user' → All providers: 'user'
 * - 'assistant' → OpenAI: 'assistant', Anthropic: 'assistant', Google: 'model'
 * - 'tool' → OpenAI: 'tool' message, Anthropic: 'user' with tool_result, Google: 'function' role
 */
export type UnifiedRole = "system" | "user" | "assistant" | "tool";

/**
 * Unified message format
 *
 * Content can be:
 * - string: Simple text content (stored as-is)
 * - UnifiedContentPart[]: Array of structured content parts (multimodal, tool calls, etc.)
 */
export interface UnifiedMessage {
  role: UnifiedRole;
  content: string | UnifiedContentPart[];
  /** For tool result messages - correlates to original tool call */
  toolCallId?: string;
  /** For tool result messages - the tool name */
  toolName?: string;
}

// ============================================================================
// CONTENT PARTS
// ============================================================================

/**
 * Discriminated union of all content part types
 */
export type UnifiedContentPart =
  | UnifiedTextPart
  | UnifiedImagePart
  | UnifiedToolCallPart
  | UnifiedToolResultPart
  | UnifiedReasoningPart;

/**
 * Text content
 */
export interface UnifiedTextPart {
  type: "text";
  text: string;
}

/**
 * Image content
 *
 * Stores both base64 data and original URL where available.
 * Some providers (OpenAI) can use URLs directly, others (Anthropic, Google) need base64.
 */
export interface UnifiedImagePart {
  type: "image";
  /** Base64-encoded image data */
  data: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  mediaType: string;
  /** Original URL if available (for providers that support URL references) */
  url?: string;
}

/**
 * Tool call made by the assistant
 *
 * Arguments are always stored as parsed objects, not stringified JSON.
 * This allows for:
 * - Consistent storage regardless of source provider
 * - Easy manipulation and inspection
 * - Proper serialization on encode to each provider's expected format
 */
export interface UnifiedToolCallPart {
  type: "tool-call";
  /** Unique identifier for this tool call (provider-specific or generated) */
  toolCallId: string;
  /** Name of the tool being called */
  toolName: string;
  /** Arguments as a parsed object (not stringified JSON) */
  input: Record<string, unknown>;
}

/**
 * Result from a tool execution
 */
export interface UnifiedToolResultPart {
  type: "tool-result";
  /** ID of the tool call this result corresponds to */
  toolCallId: string;
  /** Name of the tool (useful for Google which correlates by name) */
  toolName: string;
  /** The tool's output */
  output: UnifiedToolOutput;
}

/**
 * Tool output types
 */
export type UnifiedToolOutput =
  | UnifiedTextOutput
  | UnifiedJsonOutput
  | UnifiedErrorOutput;

export interface UnifiedTextOutput {
  type: "text";
  value: string;
}

export interface UnifiedJsonOutput {
  type: "json";
  value: unknown;
}

export interface UnifiedErrorOutput {
  type: "error";
  value: string;
}

/**
 * Reasoning/thinking content (Claude's extended thinking, etc.)
 */
export interface UnifiedReasoningPart {
  type: "reasoning";
  text: string;
  /** For Claude - reasoning signature for verification */
  signature?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Unified response from an LLM
 */
export interface UnifiedResponse {
  /** Content parts from the response */
  content: UnifiedContentPart[];
  /** Why the response ended */
  finishReason: UnifiedFinishReason;
  /** Token usage if available */
  usage?: UnifiedUsage;
  /** Raw provider response for debugging (optional) */
  rawResponse?: unknown;
}

/**
 * Unified finish reasons
 *
 * Mappings:
 * - 'stop' → Natural completion
 * - 'length' → Hit max tokens
 * - 'tool-calls' → Stopped to execute tool calls
 * - 'content-filter' → Content was filtered
 * - 'error' → Error occurred
 * - 'other' → Unknown/other reason
 */
export type UnifiedFinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error"
  | "other";

/**
 * Token usage tracking
 */
export interface UnifiedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * Unified stream chunk types
 *
 * These mirror the existing StreamChunk type but with unified content parts.
 */
export type UnifiedStreamChunk =
  | UnifiedTextStreamChunk
  | UnifiedToolCallStreamChunk
  | UnifiedToolCallDeltaStreamChunk
  | UnifiedDoneStreamChunk;

export interface UnifiedTextStreamChunk {
  type: "text";
  delta: string;
}

export interface UnifiedToolCallStreamChunk {
  type: "tool-call";
  call: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface UnifiedToolCallDeltaStreamChunk {
  type: "tool-call-delta";
  id: string;
  delta: string;
}

export interface UnifiedDoneStreamChunk {
  type: "done";
  finishReason: UnifiedFinishReason;
  hasToolCalls: boolean;
  usage?: UnifiedUsage;
}

// ============================================================================
// TOOL DEFINITION TYPES
// ============================================================================

/**
 * JSON Schema compatible type (subset of JSON Schema Draft 7)
 */
export interface JSONSchema7 {
  type?: string | string[];
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  items?: JSONSchema7 | JSONSchema7[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  $ref?: string;
  $schema?: string;
  additionalProperties?: boolean | JSONSchema7;
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;
  [key: string]: unknown;
}

/**
 * Unified tool definition
 *
 * Uses JSON Schema 7 for parameter definitions.
 * Encoders handle conversion to provider-specific formats (e.g., Google's OpenAPI 3.0).
 */
export interface UnifiedToolDefinition {
  name: string;
  description?: string;
  inputSchema: JSONSchema7;
}

// ============================================================================
// PROVIDER TYPES
// ============================================================================

/**
 * Supported LLM provider families
 */
export type ProviderFamily = "openai" | "anthropic" | "google";

/**
 * Provider encoder interface - converts unified format to provider-specific format
 */
export interface ProviderEncoder<TMessages, TTools, TSystemOut = string> {
  /**
   * Encode unified messages to provider format
   * @param messages - Unified messages
   * @returns Provider-specific message format
   */
  encodeMessages(
    messages: UnifiedMessage[]
  ): Promise<{ messages: TMessages; system?: TSystemOut }>;

  /**
   * Encode unified tool definitions to provider format
   * @param tools - Unified tool definitions
   * @returns Provider-specific tool format
   */
  encodeTools(tools: UnifiedToolDefinition[]): TTools;
}

/**
 * Provider decoder interface - converts provider-specific format to unified format
 */
export interface ProviderDecoder<TResponse, TStreamChunk> {
  /**
   * Decode provider response to unified format
   * @param response - Provider-specific response
   * @returns Unified response
   */
  decodeResponse(response: TResponse): UnifiedResponse;

  /**
   * Decode a stream chunk to unified format
   * @param chunk - Provider-specific stream chunk
   * @returns Unified stream chunk or null if chunk should be skipped
   */
  decodeStreamChunk(chunk: TStreamChunk): UnifiedStreamChunk | null;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a content part is a text part
 */
export function isTextPart(part: UnifiedContentPart): part is UnifiedTextPart {
  return part.type === "text";
}

/**
 * Check if a content part is an image part
 */
export function isImagePart(
  part: UnifiedContentPart
): part is UnifiedImagePart {
  return part.type === "image";
}

/**
 * Check if a content part is a tool call part
 */
export function isToolCallPart(
  part: UnifiedContentPart
): part is UnifiedToolCallPart {
  return part.type === "tool-call";
}

/**
 * Check if a content part is a tool result part
 */
export function isToolResultPart(
  part: UnifiedContentPart
): part is UnifiedToolResultPart {
  return part.type === "tool-result";
}

/**
 * Check if a content part is a reasoning part
 */
export function isReasoningPart(
  part: UnifiedContentPart
): part is UnifiedReasoningPart {
  return part.type === "reasoning";
}

/**
 * Check if message content is structured (array of parts)
 */
export function hasStructuredContent(
  message: UnifiedMessage
): message is UnifiedMessage & { content: UnifiedContentPart[] } {
  return Array.isArray(message.content);
}

/**
 * Check if message contains tool calls
 */
export function hasToolCalls(message: UnifiedMessage): boolean {
  if (typeof message.content === "string") {
    return false;
  }
  return message.content.some(isToolCallPart);
}

/**
 * Extract text from message content
 */
export function extractText(message: UnifiedMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter(isTextPart)
    .map((p) => p.text)
    .join("");
}

/**
 * Extract tool calls from message content
 */
export function extractToolCalls(
  message: UnifiedMessage
): UnifiedToolCallPart[] {
  if (typeof message.content === "string") {
    return [];
  }
  return message.content.filter(isToolCallPart);
}
