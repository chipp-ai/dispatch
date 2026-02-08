/**
 * Error Handler Middleware
 *
 * Unified error handling for all routes.
 * Converts various error types to consistent JSON responses.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { log } from "@/lib/logger.ts";
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
    const requestId = c.get("requestId") || "unknown";

    // Log error for debugging
    if (error instanceof Error) {
      log.error("Request error caught", {
        source: "error-handler",
        feature: "middleware",
        requestId,
        route: c.req.path,
        method: c.req.method,
      }, error);
    }

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
    log.debug("Duck type check on error", {
      source: "error-handler",
      feature: "duck-type",
      requestId,
      route: c.req.path,
      method: c.req.method,
      typeOfStatusCode: typeof err?.statusCode,
      statusCode: err?.statusCode,
      typeOfCode: typeof err?.code,
      code: err?.code,
      willHandle:
        typeof err?.statusCode === "number" && typeof err?.code === "string",
    });
    if (typeof err?.statusCode === "number" && typeof err?.code === "string") {
      log.debug("Returning app error response", {
        source: "error-handler",
        feature: "duck-type",
        requestId,
        route: c.req.path,
        method: c.req.method,
        statusCode: err.statusCode,
        code: err.code,
        errorName: err.name,
      });
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
    log.error("Unhandled error falling through to 500", {
      source: "error-handler",
      feature: "unhandled",
      requestId,
      route: c.req.path,
      method: c.req.method,
      statusCode: 500,
    }, error);

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
