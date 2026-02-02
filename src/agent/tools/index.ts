/**
 * Core Tool Definitions
 *
 * Default tools available to all agents.
 * Custom tools can be added per-application.
 */

import { z } from "zod";
import type { ToolRegistry } from "../registry.ts";
import { registerWebTools } from "./web.ts";
import { registerAITools } from "./ai.ts";
import { registerFileTools } from "./file.ts";

// Re-export tools for individual import
export { registerWebTools } from "./web.ts";
export { registerAITools } from "./ai.ts";
export { registerFileTools } from "./file.ts";

// ========================================
// Tool Dependencies (injected at runtime)
// ========================================

export interface ToolDependencies {
  appId: string;
  // Add more dependencies as needed:
  // vectorStore?: VectorStoreService;
  // emailService?: EmailService;
  // linearClient?: LinearClient;
}

// ========================================
// Core Tools
// ========================================

/**
 * Register core tools that are available to all applications
 *
 * Note: getCurrentTime and calculate tools were removed because:
 * - Current time is now included in the system prompt (more efficient)
 * - LLMs can do basic arithmetic themselves without tool calls
 */
export function registerCoreTools(
  _registry: ToolRegistry,
  _deps: ToolDependencies
): void {
  // No core tools registered by default
  // Web tools, RAG tools, and custom tools are registered separately
}

/**
 * Register RAG tools for knowledge base search
 */
export function registerRAGTools(
  registry: ToolRegistry,
  deps: ToolDependencies & {
    searchKnowledge: (
      appId: string,
      query: string,
      limit: number
    ) => Promise<unknown>;
  }
): void {
  registry.register({
    name: "searchKnowledge",
    description:
      "Search the knowledge base for information from uploaded documents, " +
      "websites, and files. Use this tool when the user asks a question " +
      "that might be answered by the knowledge base, or when you need to " +
      "look up specific information. You can call this multiple times with " +
      "different queries to find comprehensive answers.",
    parameters: z.object({
      query: z
        .string()
        .describe(
          "Semantic search query. Be specific - e.g. 'refund policy for annual plans' not just 'refund'"
        ),
      limit: z.number().default(5).describe("Maximum results to return"),
    }),
    execute: async ({ query, limit = 5 }) => {
      const results = await deps.searchKnowledge(deps.appId, query, limit);
      if (Array.isArray(results) && results.length > 0) {
        return {
          results,
          instructions:
            "When using this information, cite sources inline: [[TextChunkId]]. Only cite when directly using info from a chunk.",
        };
      }
      return results;
    },
  });
}
