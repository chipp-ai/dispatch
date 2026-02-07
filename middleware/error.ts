/**
 * Error Handler Middleware
 *
 * Catches all errors and returns consistent JSON error responses.
 * Also reports errors to Sentry in production.
 */

import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { log } from "@/lib/logger.ts";
import { AppError } from "../src/utils/errors.ts";

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export class HttpError extends Error implements ApiError {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code ?? httpStatusToCode(status);
    this.details = details;
  }
}

// Common HTTP errors
export const BadRequest = (
  message: string,
  details?: Record<string, unknown>
) => new HttpError(400, message, "BAD_REQUEST", details);

export const Unauthorized = (message = "Unauthorized") =>
  new HttpError(401, message, "UNAUTHORIZED");

export const Forbidden = (message = "Forbidden") =>
  new HttpError(403, message, "FORBIDDEN");

export const NotFound = (message = "Not found") =>
  new HttpError(404, message, "NOT_FOUND");

export const Conflict = (message: string) =>
  new HttpError(409, message, "CONFLICT");

export const RateLimited = (retryAfter?: number) =>
  new HttpError(429, "Too many requests", "RATE_LIMITED", { retryAfter });

export const InternalError = (message = "Internal server error") =>
  new HttpError(500, message, "INTERNAL_ERROR");

function httpStatusToCode(status: number): string {
  const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
  };
  return codes[status] ?? "UNKNOWN_ERROR";
}

export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
  const requestId = c.get("requestId") ?? "unknown";
  const isProduction = Deno.env.get("ENVIRONMENT") === "production";

  // Determine error details
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal server error";
  let details: Record<string, unknown> | undefined;

  if (err instanceof HTTPException) {
    // Hono's HTTPException (from middleware like auth)
    status = err.status;
    code = httpStatusToCode(status);
    message = err.message;
  } else if (err instanceof AppError) {
    // Custom application errors (NotFoundError, ForbiddenError, etc.)
    status = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err instanceof HttpError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === "ZodError") {
    // Zod validation errors - format nicely for debugging
    status = 400;
    code = "VALIDATION_ERROR";
    // deno-lint-ignore no-explicit-any
    const zodError = err as any;
    const issues = zodError.issues || zodError.errors || [];

    // Create a human-readable message
    const errorMessages = issues.map(
      (issue: { path: string[]; message: string }) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      }
    );
    message =
      errorMessages.length === 1
        ? errorMessages[0]
        : `Validation failed: ${errorMessages.join("; ")}`;

    details = {
      issues: issues.map(
        (issue: { path: string[]; message: string; code: string }) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        })
      ),
    };

    // Log validation errors in development
    if (!isProduction) {
      log.debug("Validation error", {
        source: "error-handler",
        feature: "validation",
        requestId,
        message,
        issues,
      });
    }
  } else if (err.name === "SyntaxError" && err.message.includes("JSON")) {
    status = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON in request body";
  }

  // Log error
  if (status >= 500) {
    log.error("Server error", {
      source: "error-handler",
      feature: "response",
      requestId,
      path: c.req.path,
      method: c.req.method,
      status,
      code,
    }, err);
  } else {
    log.warn("Client error", {
      source: "error-handler",
      feature: "response",
      requestId,
      path: c.req.path,
      method: c.req.method,
      status,
      code,
      message,
    });
  }

  // Build response
  const response: Record<string, unknown> = {
    error: code,
    message,
    requestId,
  };

  if (details) {
    response.details = details;
  }

  // Include stack trace in development
  if (!isProduction && status >= 500) {
    response.stack = err.stack;
  }

  return c.json(response, status as 400 | 401 | 403 | 404 | 500);
};
