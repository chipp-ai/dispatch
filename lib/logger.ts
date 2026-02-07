/**
 * Unified Structured Logger
 *
 * Single entry point for all application logging. Replaces the previous pattern
 * of console.error + Sentry.captureException with a unified API that handles both.
 *
 * Dev: human-readable pretty-printed output
 * Staging/Prod: NDJSON (one JSON object per line) for machine parsing via kubectl logs
 *
 * Every log line auto-includes: timestamp, version (git SHA), environment, pod name.
 *
 * Usage:
 *   import { log } from "@/lib/logger.ts";
 *
 *   log.error("Payment failed", { source: "billing", feature: "auto-topup", orgId }, error);
 *   log.warn("Credits low", { source: "billing", feature: "credit-check", orgId });
 *   log.info("Webhook received", { source: "stripe-webhook", feature: "routing", eventType });
 *   log.debug("Checking cache", { source: "cache", feature: "lookup", key });
 */

import * as Sentry from "@sentry/deno";

// ========================================
// Types
// ========================================

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  /** Module or service name (e.g., "billing", "email-chat", "whatsapp-media") */
  source: string;
  /** Specific operation (e.g., "auto-topup", "send-reply", "media-download") */
  feature: string;
  /** Any additional context -- IDs, request data, domain-specific fields */
  [key: string]: unknown;
}

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

// ========================================
// Environment (read once at module load)
// ========================================

const VERSION = (() => {
  try {
    const sha = Deno.env.get("GIT_SHA");
    return sha ? sha.slice(0, 7) : "dev";
  } catch {
    return "dev";
  }
})();

const ENVIRONMENT = (() => {
  try {
    return Deno.env.get("ENVIRONMENT") ?? "development";
  } catch {
    return "development";
  }
})();

const POD_NAME = (() => {
  try {
    return Deno.env.get("HOSTNAME") ?? "local";
  } catch {
    return "local";
  }
})();

const IS_DEV = ENVIRONMENT === "development";

// ========================================
// Error serialization
// ========================================

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

// ========================================
// Dev pretty-printer
// ========================================

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function prettyPrint(level: LogLevel, msg: string, ctx: LogContext, error?: unknown): void {
  const color = LEVEL_COLORS[level];
  const { source, feature, ...rest } = ctx;
  const prefix = `${color}[${level.toUpperCase()}]${RESET} ${DIM}${source}/${feature}${RESET}`;

  const contextParts = Object.entries(rest)
    .map(([k, v]) => `${DIM}${k}=${RESET}${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("  ");

  const contextStr = contextParts ? `\n  ${contextParts}` : "";

  if (error) {
    const errObj = toError(error);
    if (level === "error" || level === "warn") {
      console.error(`${prefix} | ${msg}${contextStr}`);
      console.error(`  ${errObj.stack ?? errObj.message}`);
    } else {
      console.log(`${prefix} | ${msg}${contextStr}`);
      console.log(`  ${errObj.stack ?? errObj.message}`);
    }
  } else {
    if (level === "error" || level === "warn") {
      console.error(`${prefix} | ${msg}${contextStr}`);
    } else {
      console.log(`${prefix} | ${msg}${contextStr}`);
    }
  }
}

// ========================================
// NDJSON emitter (staging/production)
// ========================================

function emitJson(level: LogLevel, msg: string, ctx: LogContext, error?: unknown): void {
  const { source, feature, ...rest } = ctx;

  const entry: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    version: VERSION,
    env: ENVIRONMENT,
    pod: POD_NAME,
    source,
    feature,
    msg,
    ...rest,
  };

  if (error) {
    entry.error = serializeError(error);
  }

  // All levels go to stdout for k8s log collectors
  console.log(JSON.stringify(entry));
}

// ========================================
// Sentry integration
// ========================================

function sendToSentry(level: LogLevel, msg: string, ctx: LogContext, error?: unknown): void {
  const { source, feature, ...rest } = ctx;
  const tags = { source, feature };
  const extra = { ...rest, version: VERSION, pod: POD_NAME };

  if (level === "error" && error) {
    Sentry.captureException(toError(error), { tags, extra });
  } else if (level === "error") {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.setExtras(extra);
      scope.setLevel("error");
      Sentry.captureMessage(`[${source}/${feature}] ${msg}`);
    });
  } else if (level === "warn") {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.setExtras(extra);
      scope.setLevel("warning");
      Sentry.captureMessage(`[${source}/${feature}] ${msg}`);
    });
  }
  // info and debug: no Sentry
}

// ========================================
// Core emit function
// ========================================

function emit(level: LogLevel, msg: string, ctx: LogContext, error?: unknown): void {
  if (IS_DEV) {
    prettyPrint(level, msg, ctx, error);
  } else {
    emitJson(level, msg, ctx, error);
  }

  // Sentry for error and warn only
  if (level === "error" || level === "warn") {
    sendToSentry(level, msg, ctx, error);
  }
}

// ========================================
// Public API
// ========================================

export const log = {
  /**
   * Log an error. Always goes to Sentry.
   * Pass an error object as the 3rd arg for stack traces + Sentry.captureException.
   * Without an error object, sends Sentry.captureMessage at error level.
   */
  error(msg: string, ctx: LogContext, error?: unknown): void {
    emit("error", msg, ctx, error);
  },

  /**
   * Log a warning. Goes to Sentry as captureMessage(level: warning).
   */
  warn(msg: string, ctx: LogContext): void {
    emit("warn", msg, ctx);
  },

  /**
   * Operational info logging. Structured in prod, no Sentry.
   */
  info(msg: string, ctx: LogContext): void {
    emit("info", msg, ctx);
  },

  /**
   * Dev-only debug logging. Not emitted in staging/production.
   */
  debug(msg: string, ctx: LogContext): void {
    if (IS_DEV) {
      emit("debug", msg, ctx);
    }
  },
};
