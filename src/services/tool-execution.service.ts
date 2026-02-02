/**
 * Tool Execution Service
 *
 * Executes user-defined tools (custom actions) during chat conversations.
 * Handles variable resolution, dependency chaining, and HTTP requests.
 */

import { sql } from "../db/client.ts";
import {
  customActionService,
  type UserDefinedTool,
} from "./custom-action.service.ts";
import { validateUrl } from "./url-validation.service.ts";

export interface ExecutionContext {
  sessionId: string;
  applicationId: string;
  /** Developer user ID (for builder chat) */
  userId?: string;
  /** Consumer ID (for consumer chat) */
  consumerId?: string;
  messageHistory?: unknown[];
}

export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// Session-scoped tool output storage (for dependency chaining)
// In production, consider using Redis for distributed systems
const executionContexts = new Map<string, Map<string, unknown>>();
const cleanupTimers = new Map<string, number>(); // Store timer IDs for cleanup

const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Store tool output for dependency resolution
 */
function setToolOutput(
  sessionId: string,
  toolSlug: string,
  output: unknown
): void {
  if (!executionContexts.has(sessionId)) {
    executionContexts.set(sessionId, new Map());

    // Schedule cleanup and store timer ID
    const timerId = setTimeout(() => {
      executionContexts.delete(sessionId);
      cleanupTimers.delete(sessionId);
    }, CONTEXT_TTL);
    cleanupTimers.set(sessionId, timerId as unknown as number);
  }

  executionContexts.get(sessionId)!.set(toolSlug, output);
}

/**
 * Clear execution context for a session (for testing/cleanup)
 */
export function clearExecutionContext(sessionId: string): void {
  const timerId = cleanupTimers.get(sessionId);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    cleanupTimers.delete(sessionId);
  }
  executionContexts.delete(sessionId);
}

/**
 * Get tool output for dependency resolution
 */
function getToolOutput(
  sessionId: string,
  toolSlug: string
): unknown | undefined {
  return executionContexts.get(sessionId)?.get(toolSlug);
}

/**
 * Resolve variables in parameter values
 */
async function resolveVariables(
  tool: UserDefinedTool,
  context: ExecutionContext,
  parameters: Record<string, unknown>
): Promise<{
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  bodyParams: Record<string, unknown>;
  pathParams: Record<string, string>;
}> {
  // Load application variables
  const appVariables = await sql`
    SELECT name, value, is_encrypted, type
    FROM app.application_variables
    WHERE application_id = ${context.applicationId}::uuid
  `;

  const varMap = new Map(
    (
      appVariables as unknown as Array<{
        name: string;
        value: string;
        is_encrypted: boolean;
      }>
    ).map((v) => [v.name, v])
  );

  const VARIABLE_PATTERN = /\{\{(var|system)\.([^}]+)\}\}/g;

  const resolveValue = (value: unknown): unknown => {
    if (typeof value !== "string") return value;

    return value.replace(VARIABLE_PATTERN, (match, type, name) => {
      if (type === "var") {
        const variable = varMap.get(name);
        if (!variable) {
          throw new Error(`Variable not found: ${name}`);
        }

        // TODO: Decrypt if needed (when encryption is implemented)
        // if (variable.is_encrypted) {
        //   return decrypt(variable.value);
        // }
        return variable.value ?? "";
      }

      if (type === "system") {
        switch (name) {
          case "userId":
            if (!context.userId) {
              throw new Error(
                "System variable 'userId' is not available in this context"
              );
            }
            return context.userId;
          case "sessionId":
            return context.sessionId;
          case "timestamp":
            return new Date().toISOString();
          default:
            throw new Error(`Unknown system variable: ${name}`);
        }
      }

      return match;
    });
  };

  // Resolve headers
  const headers: Record<string, string> = {};
  if (Array.isArray(tool.headers)) {
    for (const header of tool.headers) {
      if (
        typeof header === "object" &&
        header !== null &&
        "key" in header &&
        "value" in header
      ) {
        const key = String(header.key);
        const value = String(await resolveValue(header.value));
        headers[key] = value;
      }
    }
  }

  // Resolve query params
  const queryParams: Record<string, string> = {};
  if (Array.isArray(tool.query_params)) {
    for (const param of tool.query_params) {
      if (
        typeof param === "object" &&
        param !== null &&
        "key" in param &&
        "value" in param
      ) {
        const key = String(param.key);
        const paramWithValue = param as unknown as {
          value: unknown;
          valueSource?: string;
        };
        let value = paramWithValue.value;

        // Check if value comes from AI parameters
        if (
          "valueSource" in param &&
          param.valueSource === "AI" &&
          typeof key === "string" &&
          key in parameters
        ) {
          value = parameters[key];
        }

        queryParams[key] = String(await resolveValue(value));
      }
    }
  }

  // Resolve path params
  const pathParams: Record<string, string> = {};
  if (Array.isArray(tool.path_params)) {
    for (const param of tool.path_params) {
      if (
        typeof param === "object" &&
        param !== null &&
        "key" in param &&
        "value" in param
      ) {
        const key = String(param.key);
        const paramWithValue = param as unknown as {
          value: unknown;
          valueSource?: string;
        };
        let value = paramWithValue.value;

        if (
          "valueSource" in param &&
          param.valueSource === "AI" &&
          typeof key === "string" &&
          key in parameters
        ) {
          value = parameters[key];
        }

        pathParams[key] = String(await resolveValue(value));
      }
    }
  }

  // Resolve body params
  const bodyParams: Record<string, unknown> = {};
  if (Array.isArray(tool.body_params)) {
    for (const param of tool.body_params) {
      if (typeof param === "object" && param !== null && "key" in param) {
        const key = String(param.key);
        const paramWithValue = param as unknown as {
          value: unknown;
          valueSource?: string;
        };
        let value = paramWithValue.value;

        // Check for dependency on another tool
        if (
          "valueSource" in param &&
          param.valueSource === "TOOL_OUTPUT" &&
          "dependency" in param &&
          typeof param.dependency === "object" &&
          param.dependency !== null &&
          "toolSlug" in param.dependency
        ) {
          const depSlug = String(param.dependency.toolSlug);
          const depOutput = getToolOutput(context.sessionId, depSlug);
          if (!depOutput) {
            throw new Error(
              `Dependency tool "${depSlug}" has not been executed`
            );
          }

          // Extract value via JSONPath if selector provided
          if (
            "outputSelector" in param.dependency &&
            typeof param.dependency.outputSelector === "string"
          ) {
            // TODO: Implement JSONPath extraction when jsonpath-plus is available
            value = depOutput;
          } else {
            value = depOutput;
          }
        } else if (
          "valueSource" in param &&
          param.valueSource === "AI" &&
          typeof key === "string" &&
          key in parameters
        ) {
          value = parameters[key];
        }

        bodyParams[key] = await resolveValue(value);
      }
    }
  }

  return { headers, queryParams, bodyParams, pathParams };
}

/**
 * Execute a user-defined tool
 */
export async function executeTool(
  toolId: string,
  context: ExecutionContext,
  parameters: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    if (!context.userId) {
      throw new Error("userId is required to execute tools");
    }

    // Get tool definition
    const tool = await customActionService.get(toolId, context.userId);

    // Resolve variables
    const resolved = await resolveVariables(tool, context, parameters);

    // Build URL with path params
    let url = tool.url;
    for (const [key, value] of Object.entries(resolved.pathParams)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
      url = url.replace(`{{${key}}}`, encodeURIComponent(value));
    }

    // Add query params
    const queryString = new URLSearchParams(
      Object.entries(resolved.queryParams).reduce(
        (acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        },
        {} as Record<string, string>
      )
    ).toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    // Validate URL (SSRF prevention)
    const { isValid, error } = await validateUrl(url);
    if (!isValid) {
      return {
        success: false,
        error: `Invalid URL: ${error}`,
      };
    }

    // Execute HTTP request
    const requestOptions: RequestInit = {
      method: tool.method,
      headers: {
        "Content-Type": "application/json",
        ...resolved.headers,
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    if (tool.method !== "GET" && Object.keys(resolved.bodyParams).length > 0) {
      requestOptions.body = JSON.stringify(resolved.bodyParams);
    }

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
      };
    }

    const result = await response.json().catch(async () => {
      // If JSON parsing fails, return text
      return await response.text();
    });

    // Store output for dependent tools
    const toolSlug = tool.slug || tool.name.toLowerCase().replace(/\s+/g, "_");
    setToolOutput(context.sessionId, toolSlug, result);

    // Truncate large responses (50KB limit)
    const resultStr = JSON.stringify(result);
    if (resultStr.length > 50000) {
      return {
        success: true,
        result: {
          ...result,
          _truncated: true,
          _originalLength: resultStr.length,
        },
      };
    }

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
