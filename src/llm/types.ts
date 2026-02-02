/**
 * LLM Types
 *
 * Core types for the LLM adapter layer.
 * Provider-agnostic interfaces for streaming chat completions.
 */

import type { z, ZodType } from "zod";

// ========================================
// Message Types
// ========================================

export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Content part for multimodal messages
 */
export type TextContentPart = {
  type: "text";
  text: string;
};

export type ImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type AudioContentPart = {
  type: "input_audio";
  input_audio: {
    data: string; // base64-encoded audio
    format: "webm" | "wav" | "mp3" | "mp4" | "ogg";
  };
};

export type VideoContentPart = {
  type: "input_video";
  input_video: {
    url: string; // GCS URL to the video file
    mimeType: string; // e.g. "video/mp4", "video/webm"
  };
};

export type ToolUseContentPart = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | AudioContentPart
  | VideoContentPart
  | ToolUseContentPart;

/**
 * Message with support for multimodal content
 * - string content: standard text message
 * - ContentPart[]: multimodal message with text and images
 */
export interface Message {
  role: MessageRole;
  content: string | ContentPart[];
  toolCallId?: string;
  name?: string;
}

// ========================================
// Tool Types
// ========================================

export interface Tool {
  name: string;
  description: string;
  parameters: ZodType;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ========================================
// Streaming Types
// ========================================

export type StreamChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_result"; callId: string; result: unknown }
  | { type: "tool_error"; callId: string; error: string }
  | {
      type: "done";
      finishReason: string;
      hasToolCalls: boolean;
      usage?: TokenUsage;
    };

// ========================================
// Provider Types
// ========================================

export interface StreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  systemPrompt?: string;
}

export interface LLMProvider {
  readonly name: string;
  stream(
    messages: Message[],
    tools: Tool[],
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk>;
  /**
   * Convenience method for streaming chat without tools
   * Alias for stream(messages, [], options)
   */
  chat(
    messages: Message[],
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk>;
}

// ========================================
// Usage Tracking
// ========================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
}

// ========================================
// Billing Context
// ========================================

/**
 * Billing context for Stripe Token Billing integration.
 * Passed to LLM providers to enable proper billing attribution.
 *
 * Note: Usage-based billing is the default for all organizations.
 * Every organization must have a stripeCustomerId for billing attribution.
 */
export interface BillingContext {
  /** Stripe customer ID for the organization (required for billing attribution) */
  stripeCustomerId?: string | null;
  /** Whether to use Stripe sandbox for billing */
  useSandboxForUsageBilling?: boolean;
  /** Organization ID for logging/tracking */
  organizationId?: string | null;
}
