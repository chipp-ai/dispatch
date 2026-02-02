/**
 * Custom Tool Registration
 *
 * Registers user-defined tools (custom actions) for an application.
 */

import { z } from "zod";
import type { ToolRegistry } from "../registry.ts";
import type { UserDefinedTool } from "../../services/custom-action.service.ts";
import { executeTool } from "../../services/tool-execution.service.ts";
import type { ExecutionContext } from "../../services/tool-execution.service.ts";

/**
 * Register custom tools for an application
 */
export function registerCustomTools(
  registry: ToolRegistry,
  tools: UserDefinedTool[],
  context: ExecutionContext
): void {
  for (const tool of tools) {
    // Build Zod schema from parameter definitions
    const schema = buildZodSchema(tool);

    // Use slug or generate from name
    const toolName = tool.slug || tool.name.toLowerCase().replace(/\s+/g, "_");

    registry.register({
      name: toolName,
      description: tool.description,
      parameters: schema,
      execute: async (params: Record<string, unknown>) => {
        const result = await executeTool(tool.id, context, params);
        if (!result.success) {
          throw new Error(result.error || "Tool execution failed");
        }
        return result.result;
      },
    });
  }
}

/**
 * Build Zod schema from tool parameter definitions
 */
function buildZodSchema(tool: UserDefinedTool): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  // Collect all parameters that need AI input
  const allParams = [
    ...(Array.isArray(tool.query_params) ? tool.query_params : []),
    ...(Array.isArray(tool.body_params) ? tool.body_params : []),
    ...(Array.isArray(tool.path_params) ? tool.path_params : []),
    ...(Array.isArray(tool.headers) ? tool.headers : []),
  ];

  for (const param of allParams) {
    if (
      typeof param === "object" &&
      param !== null &&
      "key" in param &&
      "valueSource" in param &&
      param.valueSource === "AI"
    ) {
      const key = String(param.key);
      let fieldSchema: z.ZodTypeAny;

      // Determine type
      const paramType = "type" in param ? String(param.type) : "string";
      switch (paramType) {
        case "number":
          fieldSchema = z.number();
          break;
        case "boolean":
          fieldSchema = z.boolean();
          break;
        case "array":
          fieldSchema = z.array(z.unknown());
          break;
        case "object":
          fieldSchema = z.record(z.unknown());
          break;
        default:
          fieldSchema = z.string();
      }

      // Add description if available
      if ("description" in param && typeof param.description === "string") {
        fieldSchema = fieldSchema.describe(param.description);
      }

      // Add sample value to description if available
      if ("sampleValue" in param && typeof param.sampleValue === "string") {
        const currentDesc = fieldSchema._def.description || "";
        fieldSchema = fieldSchema.describe(
          `${currentDesc} (sample: ${param.sampleValue})`
        );
      }

      // Make optional if not required
      const isRequired =
        "isRequired" in param ? Boolean(param.isRequired) : false;
      if (!isRequired) {
        fieldSchema = fieldSchema.optional();
      }

      shape[key] = fieldSchema;
    }
  }

  return z.object(shape);
}

