/**
 * Agent Framework
 *
 * Export all agent-related components.
 */

// Registry
export { ToolRegistry, createRegistry } from "./registry.ts";
export type { ToolDefinition, ToolExecutionResult } from "./registry.ts";

// Loop
export { agentLoop, singleCompletion } from "./loop.ts";
export type { AgentOptions } from "./loop.ts";

// Completion wrapper
export { withOnComplete } from "./completion.ts";
export type { CompletionResult, StreamWrapperOptions } from "./completion.ts";

// Stream
export {
  createSSEStream,
  createSSEResponse,
  sseHeaders,
  parseSSEStream,
  accumulateStream,
} from "./stream.ts";
export type { AccumulatedResponse } from "./stream.ts";

// Tools
export { registerCoreTools, registerRAGTools } from "./tools/index.ts";
export { registerCustomTools } from "./tools/custom.ts";
export type { ToolDependencies } from "./tools/index.ts";
