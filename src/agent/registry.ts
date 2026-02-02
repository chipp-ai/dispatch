/**
 * Tool Registry
 *
 * Manages tool definitions and execution.
 * ~50 LOC as per migration plan.
 */

import type { ZodType } from "zod";
import type { Tool } from "../llm/types.ts";

// ========================================
// Types
// ========================================

export interface ToolDefinition<T = unknown> {
  name: string;
  description: string;
  parameters: ZodType<T>;
  execute: (params: T) => Promise<unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// ========================================
// Registry
// ========================================

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Register a tool
   */
  register<T>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool as ToolDefinition);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools formatted for LLM consumption
   */
  getForLLM(): Tool[] {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, params: unknown): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      // Validate parameters with Zod schema
      const validated = tool.parameters.parse(params);
      const result = await tool.execute(validated);
      return { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  /**
   * Get count of registered tools
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Create a new registry with optional initial tools
 */
export function createRegistry(tools?: ToolDefinition[]): ToolRegistry {
  const registry = new ToolRegistry();
  if (tools) {
    for (const tool of tools) {
      registry.register(tool);
    }
  }
  return registry;
}
