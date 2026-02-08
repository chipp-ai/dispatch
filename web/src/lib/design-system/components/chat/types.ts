/**
 * Chat Types
 *
 * Types for chat messages, tool calls, and streaming events.
 * Based on AI SDK format for compatibility with chipp-admin.
 */

// Staged file for upload (shared between consumer and builder)
export interface StagedFile {
  id: string;
  rawFileDetails: File;
  isUploading: boolean;
  hasError: boolean;
  uploadedFileDetails?: {
    url: string;
    name: string;
    type: string;
  };
}

// Tool invocation states
export type ToolState = "partial-call" | "call" | "result" | "error";

// Citation metadata for source references
export interface CitationMetadataEntry {
  displayName: string;
  similarity: number;
  fileName: string;
  faviconUrl?: string;
}

export type CitationMetadata = Record<string, CitationMetadataEntry>;

// Text chunk from RAG retrieval
export interface TextChunk {
  id: string;
  content: string;
  title?: string;
  fileName?: string;
  similarity?: number;
}

// RAG debug info for builder view
export interface RagDebugChunk {
  text: string;
  score: number;
  fileName: string;
  chunkIndex?: number;
}

export interface RagDebugInfo {
  chunks: RagDebugChunk[];
  query: string;
  timestamp: number;
}

// Video generation job status
export type VideoGenerationPhase =
  | "initializing"
  | "queued"
  | "generating"
  | "downloading"
  | "uploading"
  | "complete"
  | "failed";

export interface VideoGenerationStatus {
  jobId: string;
  phase: VideoGenerationPhase;
  progress: number;
  estimatedTimeRemaining?: number;
  videoUrl?: string;
  error?: string;
}

// Tool debug info for detailed execution display
export interface ToolDebugInfo {
  // For user-defined tools (HTTP requests)
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, unknown>;
    params?: unknown;
    data?: unknown;
  };
  response?: {
    status?: number | string;
    statusText?: string;
    headers?: Record<string, unknown>;
    data?: unknown;
    error?: unknown;
    result?: unknown;
  };
  // For core tools
  toolInputs?: unknown;
  internalRequests?: Array<{
    service: string;
    method?: string;
    url?: string;
    request?: unknown;
    response?: {
      status?: number | string;
      error?: unknown;
      data?: unknown;
    };
  }>;
  error?: {
    message?: string;
    code?: string;
    stack?: string;
    name?: string;
  };
  // Common fields
  toolName?: string;
  validationType?: string;
  validationErrors?: unknown;
  originalError?: {
    message?: string;
    name?: string;
    stack?: string;
  };
  timestamp?: string;
  context?: string;
  executionTime?: number;
}

// Tool invocation (tool call + result)
export interface ToolInvocation {
  id: string;
  name: string;
  state: ToolState;
  input: unknown;
  output?: unknown;
  error?: string;
}

// Message part types
export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolUsePart {
  type: "tool-invocation";
  toolInvocation: ToolInvocation;
}

export type MessagePart = TextPart | ToolUsePart;

// Chat message with parts (V2 rendering)
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string; // Plain text content (for user messages)
  parts?: MessagePart[]; // Structured parts (for assistant messages)
  annotations?: unknown[];
  createdAt?: Date;
  /** Image URLs attached to the message (builder preview) */
  images?: string[];
  /** Text currently streaming, not yet finalized into a part (builder preview) */
  pendingText?: string;
  /** Object URL for playable voice message audio */
  audioUrl?: string;
  /** Duration of voice message in milliseconds */
  audioDurationMs?: number;
  /** URL for attached video */
  videoUrl?: string;
  /** MIME type of the attached video */
  videoMimeType?: string;
  /** Whether this message has an error */
  error?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Multiplayer: sender participant ID */
  senderParticipantId?: string;
  /** Multiplayer: sender display name */
  senderName?: string;
  /** Multiplayer: sender avatar color */
  senderAvatarColor?: string;
  /** System message (join/leave, not persisted) */
  isSystemMessage?: boolean;
  /** Human operator name (for live takeover messages from builder) */
  operatorName?: string;
}

// SSE Event types from AI SDK format
export type SSEEventType =
  | "start"
  | "start-step"
  | "tool-input-start"
  | "tool-input-delta"
  | "tool-input-available"
  | "tool-output-available"
  | "message-metadata"
  | "finish-step"
  | "text-start"
  | "text-delta"
  | "text-end"
  | "finish";

// SSE Event payloads
export interface StartEvent {
  type: "start";
  messageId: string;
}

export interface StartStepEvent {
  type: "start-step";
}

export interface ToolInputStartEvent {
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
}

export interface ToolInputDeltaEvent {
  type: "tool-input-delta";
  toolCallId: string;
  delta: string;
}

export interface ToolInputAvailableEvent {
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ToolOutputAvailableEvent {
  type: "tool-output-available";
  toolCallId: string;
  output: unknown;
}

export interface MessageMetadataEvent {
  type: "message-metadata";
  messageMetadata: {
    annotations?: unknown[];
  };
}

export interface FinishStepEvent {
  type: "finish-step";
}

export interface TextStartEvent {
  type: "text-start";
  id: string;
}

export interface TextDeltaEvent {
  type: "text-delta";
  id: string;
  delta: string;
}

export interface TextEndEvent {
  type: "text-end";
  id: string;
}

export interface FinishEvent {
  type: "finish";
  finishReason: string;
}

export type SSEEvent =
  | StartEvent
  | StartStepEvent
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputAvailableEvent
  | ToolOutputAvailableEvent
  | MessageMetadataEvent
  | FinishStepEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | FinishEvent;

// Helper to check if event is a tool event
export function isToolEvent(
  event: SSEEvent
): event is
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputAvailableEvent
  | ToolOutputAvailableEvent {
  return (
    event.type === "tool-input-start" ||
    event.type === "tool-input-delta" ||
    event.type === "tool-input-available" ||
    event.type === "tool-output-available"
  );
}

// Helper to check if event is a text event
export function isTextEvent(
  event: SSEEvent
): event is TextStartEvent | TextDeltaEvent | TextEndEvent {
  return (
    event.type === "text-start" ||
    event.type === "text-delta" ||
    event.type === "text-end"
  );
}

/**
 * Chat Theme
 *
 * "default" - Standard chat bubble style (ChatGPT-like)
 * "imessage" - iMessage-style with bubble tails, no avatars, max 75% width
 * "classic-chipp" - Classic Chipp style with avatars, transparent background
 * "modern" - Modern chat style with rounded bubbles, avatars for assistant, no tails
 */
export type ChatTheme = "default" | "imessage" | "classic-chipp" | "modern";

/**
 * Animation Configuration
 *
 * Configuration for streaming text animation in chat responses.
 * Controls how text appears during AI response streaming.
 */
export type AnimationType = "fade" | "blur" | "slideUp" | "slideDown";
export type AnimationTokenize = "word" | "char";
export type AnimationTimingFunction =
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "linear";

export interface AnimationConfig {
  /** Whether animation is enabled */
  enabled: boolean;
  /** Animation type: fade, blur, slideUp, slideDown */
  type: AnimationType;
  /** Animation duration in milliseconds (50-500) */
  duration: number;
  /** Tokenization method: word or char */
  tokenize: AnimationTokenize;
  /** CSS timing function */
  timingFunction: AnimationTimingFunction;
  /** Whether to preserve single newlines as line breaks */
  preserveNewlines: boolean;
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  enabled: true,
  type: "fade",
  duration: 400,
  tokenize: "word",
  timingFunction: "ease-out",
  preserveNewlines: true,
};
