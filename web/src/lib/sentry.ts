import * as Sentry from "@sentry/svelte";

let initialized = false;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.DEV ? "development" : "production",
    release: import.meta.env.VITE_VERSION ?? "development",
    tracesSampleRate: import.meta.env.DEV ? 0 : 0.1,
    ignoreErrors: ["ResizeObserver loop", "AbortError", "Failed to fetch"],
    beforeSend(event) {
      if (import.meta.env.DEV && !import.meta.env.VITE_SENTRY_FORCE_ENABLE)
        return null;
      return event;
    },
  });
  initialized = true;
}

/** Set user context from auth store */
export function setSentryUser(
  user: { id: string; email?: string } | null,
): void {
  if (!initialized) return;
  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

/** Set org/workspace context */
export function setSentryContext(
  name: string,
  data: Record<string, unknown> | null,
): void {
  if (!initialized) return;
  Sentry.setContext(name, data);
}

/** Capture exception with rich context. Logs to console AND Sentry. */
export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
): void {
  console.error(error);
  if (!initialized) return;

  const route =
    window.location.hash?.replace("#", "") || window.location.pathname;
  Sentry.captureException(error, {
    tags: { route, ...context?.tags },
    extra: context?.extra,
  });
}
