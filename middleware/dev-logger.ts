/**
 * Development Logger Middleware
 *
 * Enhanced logging for local development with detailed error output.
 * Request bodies are logged when validation fails.
 */

import type { Context, Next, MiddlewareHandler } from "hono";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorStatus(status: number): string {
  if (status >= 500) return `${COLORS.red}${status}${COLORS.reset}`;
  if (status >= 400) return `${COLORS.yellow}${status}${COLORS.reset}`;
  if (status >= 300) return `${COLORS.cyan}${status}${COLORS.reset}`;
  return `${COLORS.green}${status}${COLORS.reset}`;
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function indent(text: string, spaces: number = 4): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l, i) => (i === 0 ? l : pad + l))
    .join("\n");
}

/**
 * Enhanced dev logger that shows:
 * - Incoming requests with method, path
 * - Response status with timing
 * - Error details including validation errors
 */
export const devLogger: MiddlewareHandler = async (c: Context, next: Next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  // Log incoming request
  console.log(`${COLORS.cyan}<--${COLORS.reset} ${method} ${path}`);

  await next();

  const duration = performance.now() - start;
  const status = c.res.status;

  // Log response
  console.log(
    `${COLORS.cyan}-->${COLORS.reset} ${method} ${path} ${colorStatus(status)} ${COLORS.dim}${formatDuration(duration)}${COLORS.reset}`
  );

  // If it's an error response, log detailed error info
  if (status >= 400) {
    try {
      const clonedRes = c.res.clone();
      const contentType = clonedRes.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const errorBody = await clonedRes.json();

        // Format the error output
        const errorInfo: Record<string, unknown> = {};
        if (errorBody.error) errorInfo.error = errorBody.error;
        if (errorBody.message) errorInfo.message = errorBody.message;
        if (errorBody.details) errorInfo.details = errorBody.details;
        if (errorBody.code) errorInfo.code = errorBody.code;

        if (Object.keys(errorInfo).length > 0) {
          console.log(
            `${COLORS.red}    Error details:${COLORS.reset}`,
            indent(JSON.stringify(errorInfo, null, 2))
          );
        }
      }
    } catch {
      // Response might not be JSON, that's OK
    }
  }
};

/**
 * Create a validator wrapper that logs validation errors with the request body
 */
export function createLoggingValidator<T>(schema: {
  parse: (data: unknown) => T;
  safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown };
}) {
  return async (c: Context, next: Next) => {
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        const result = schema.safeParse(body);

        if (!result.success) {
          console.log(
            `${COLORS.red}${COLORS.bold}Validation failed:${COLORS.reset}`
          );
          console.log(
            `${COLORS.dim}    Request body:${COLORS.reset}`,
            indent(JSON.stringify(body, null, 2))
          );
          console.log(
            `${COLORS.red}    Validation errors:${COLORS.reset}`,
            indent(JSON.stringify(result.error, null, 2))
          );
        }
      } catch {
        // Body parsing failed, will be caught by actual handler
      }
    }
    await next();
  };
}
