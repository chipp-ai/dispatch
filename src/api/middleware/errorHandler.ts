/**
 * Error Handler Middleware
 *
 * Unified error handling for all routes.
 * Converts various error types to consistent JSON responses.
 */

console.log("=== ERROR HANDLER MODULE LOADED V2 ===");

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AuthContext } from "./auth.ts";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from "../../utils/errors.ts";

// Re-export error classes for convenience
export {
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  AppError,
};

export const errorHandler = createMiddleware<AuthContext>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error("=== CATCH BLOCK ENTERED ===");
    const requestId = c.get("requestId") || "unknown";

    // Log error for debugging
    console.error(`[${requestId}] Error:`, error);

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return c.json(
        {
          error: "Validation Error",
          message: "Invalid request data",
          details: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
          requestId,
        },
        400
      );
    }

    // Handle HTTPException (from Hono)
    if (error instanceof HTTPException) {
      return c.json(
        {
          error: error.message,
          message: error.message,
          requestId,
        },
        error.status
      );
    }

    // Handle custom app errors using duck-typing to avoid module resolution issues
    // Cast to any first to avoid TypeScript issues with property access
    // deno-lint-ignore no-explicit-any
    const err = error as any;
    console.error("[errorHandler] DUCK TYPE CHECK:", {
      typeOfStatusCode: typeof err?.statusCode,
      statusCode: err?.statusCode,
      typeOfCode: typeof err?.code,
      code: err?.code,
      willHandle:
        typeof err?.statusCode === "number" && typeof err?.code === "string",
    });
    if (typeof err?.statusCode === "number" && typeof err?.code === "string") {
      console.error("[errorHandler] RETURNING:", err.statusCode);
      const statusCode = err.statusCode as
        | 400
        | 401
        | 403
        | 404
        | 500
        | 409
        | 429
        | 502;
      return c.json(
        {
          error: err.name || "Error",
          message: err.message || "An error occurred",
          code: err.code,
          requestId,
        },
        statusCode
      );
    }
    console.error("[errorHandler] FALLING THROUGH TO 500");

    // Unknown errors - don't leak internal details
    const isDev = Deno.env.get("DENO_ENV") === "development";
    return c.json(
      {
        error: "Internal Server Error",
        message:
          isDev && error instanceof Error
            ? error.message
            : "An unexpected error occurred",
        requestId,
        ...(isDev && error instanceof Error && { stack: error.stack }),
      },
      500
    );
  }
});
