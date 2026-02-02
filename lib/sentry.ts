/**
 * Sentry Integration
 *
 * Error tracking and performance monitoring for Deno.
 */

import * as Sentry from "@sentry/deno";

let initialized = false;

/**
 * Initialize Sentry SDK
 */
export function initSentry(): void {
  const dsn = Deno.env.get("SENTRY_DSN");
  const environment = Deno.env.get("ENVIRONMENT") ?? "development";

  if (!dsn) {
    console.log("[sentry] No DSN configured, skipping initialization");
    return;
  }

  if (initialized) {
    console.log("[sentry] Already initialized");
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release: Deno.env.get("VERSION") ?? "development",

    // Performance Monitoring
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,

    // Session Replay (if available in Deno SDK)
    // replaysSessionSampleRate: 0.1,
    // replaysOnErrorSampleRate: 1.0,

    // Filter out noisy errors
    ignoreErrors: [
      // Network errors that are usually client-side
      "Failed to fetch",
      "NetworkError",
      "AbortError",
      // Browser extension errors
      "ResizeObserver loop",
    ],

    // Before sending, add extra context
    beforeSend(event, hint) {
      // Don't send errors in development unless explicitly enabled
      if (
        environment === "development" &&
        !Deno.env.get("SENTRY_FORCE_ENABLE")
      ) {
        return null;
      }

      return event;
    },
  });

  initialized = true;
  console.log(`[sentry] Initialized for ${environment}`);
}

/**
 * Capture an exception with optional context
 */
export function captureException(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string; email?: string };
  }
): string | undefined {
  if (!initialized) {
    console.error("[sentry] Not initialized, logging error:", error);
    return undefined;
  }

  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (context?.user) {
      scope.setUser(context.user);
    }
  });

  return Sentry.captureException(error);
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): string | undefined {
  if (!initialized) {
    console.log(`[sentry] Not initialized, logging message: ${message}`);
    return undefined;
  }

  return Sentry.captureMessage(message, level);
}

/**
 * Set user context for all subsequent events
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (!initialized) return;
  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging context
 */
export function addBreadcrumb(breadcrumb: {
  category: string;
  message: string;
  level?: "debug" | "info" | "warning" | "error";
  data?: Record<string, unknown>;
}): void {
  if (!initialized) return;

  Sentry.addBreadcrumb({
    category: breadcrumb.category,
    message: breadcrumb.message,
    level: breadcrumb.level ?? "info",
    data: breadcrumb.data,
  });
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string
): Sentry.Span | undefined {
  if (!initialized) return undefined;

  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

/**
 * Flush pending events (call before process exit)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  if (!initialized) return true;
  return Sentry.flush(timeout);
}

/**
 * Check if Sentry is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}
