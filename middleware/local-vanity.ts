/**
 * Local Vanity URL Middleware
 *
 * Enables subdomain-style vanity URLs for local development.
 *
 * When LOCAL_VANITY_HOST is set (e.g., "localhost"), this middleware
 * allows requests like http://myapp.localhost:8000 to be resolved
 * by extracting the subdomain as the app identifier.
 *
 * Usage:
 * 1. Set LOCAL_VANITY_HOST=localhost in your .env
 * 2. Access your app at http://your-app-slug.localhost:8000/chat
 *
 * Note: Most browsers resolve *.localhost to 127.0.0.1 automatically.
 * If yours doesn't, add entries to /etc/hosts:
 *   127.0.0.1 your-app-slug.localhost
 */

import type { Context, Next } from "hono";

interface VanityConfig {
  enabled: boolean;
  baseHost: string;
}

function getVanityConfig(): VanityConfig {
  const baseHost = Deno.env.get("LOCAL_VANITY_HOST");
  return {
    enabled: !!baseHost && Deno.env.get("ENVIRONMENT") !== "production",
    baseHost: baseHost ?? "localhost",
  };
}

/**
 * Extract app slug from subdomain
 *
 * Examples:
 *   myapp.localhost:8000 -> myapp
 *   myapp-123.localhost:8000 -> myapp-123
 *   localhost:8000 -> null (no subdomain)
 */
function extractAppSlug(host: string, baseHost: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0];

  // Check if it ends with the base host
  if (!hostWithoutPort.endsWith(baseHost)) {
    return null;
  }

  // If the host is exactly the base host (no subdomain), return null
  if (hostWithoutPort === baseHost) {
    return null;
  }

  // Ensure there's a dot separator before the base host (proper subdomain format)
  // e.g., myapp.localhost should have a dot before localhost
  const expectedDotPosition = hostWithoutPort.length - baseHost.length - 1;
  if (expectedDotPosition < 0 || hostWithoutPort[expectedDotPosition] !== ".") {
    return null;
  }

  // Extract subdomain (everything before the dot)
  const subdomain = hostWithoutPort.slice(0, expectedDotPosition);

  // No subdomain (e.g., just ".localhost")
  if (!subdomain || subdomain.length === 0) {
    return null;
  }

  return subdomain;
}

/**
 * Paths that should be rewritten to consumer routes when accessed via subdomain
 * These map from vanity paths to consumer route paths
 */
const VANITY_PATH_MAPPINGS: Record<string, string> = {
  "/chat": "/consumer/:appSlug/chat",
  "/app": "/consumer/:appSlug/app",
  "/manifest": "/consumer/:appSlug/manifest",
  "/auth/signup": "/consumer/:appSlug/auth/signup",
  "/auth/login": "/consumer/:appSlug/auth/login",
  "/auth/verify": "/consumer/:appSlug/auth/verify",
  "/auth/logout": "/consumer/:appSlug/auth/logout",
  "/auth/magic-link": "/consumer/:appSlug/auth/magic-link",
  "/auth/magic-link/verify": "/consumer/:appSlug/auth/magic-link/verify",
  "/auth/password-reset": "/consumer/:appSlug/auth/password-reset",
  "/auth/password-reset/confirm":
    "/consumer/:appSlug/auth/password-reset/confirm",
  "/auth/resend-otp": "/consumer/:appSlug/auth/resend-otp",
  "/user/me": "/consumer/:appSlug/user/me",
};

/**
 * Check if a path should be rewritten when accessed via vanity subdomain
 */
function getRewrittenPath(path: string, appSlug: string): string | null {
  // Check exact matches first
  for (const [vanityPath, consumerPath] of Object.entries(
    VANITY_PATH_MAPPINGS
  )) {
    if (path === vanityPath) {
      return consumerPath.replace(":appSlug", appSlug);
    }
  }

  // Check prefix matches (for routes with additional path segments)
  // e.g., /chat/session/123 -> /consumer/myapp/chat/session/123
  if (path.startsWith("/chat/")) {
    return `/consumer/${appSlug}${path}`;
  }
  if (path.startsWith("/user/")) {
    return `/consumer/${appSlug}${path}`;
  }
  if (path.startsWith("/auth/")) {
    return `/consumer/${appSlug}${path}`;
  }

  return null;
}

// Store the app reference for internal request forwarding
let appInstance: {
  fetch: (request: Request) => Response | Promise<Response>;
} | null = null;

/**
 * Set the app instance for internal request forwarding
 * Must be called from app.ts after app is created
 */
export function setVanityAppInstance(app: {
  fetch: (request: Request) => Response | Promise<Response>;
}): void {
  appInstance = app;
}

/**
 * Local vanity URL middleware
 *
 * When enabled, extracts app slug from subdomain and:
 * - Rewrites vanity paths to consumer routes (e.g., /chat -> /consumer/myapp/chat)
 * - Forwards the request internally to the rewritten path
 * - Sets X-App-ID header for downstream middleware
 * - Adds vanityApp context variable
 * - Logs the resolution for debugging
 */
export function localVanityMiddleware() {
  const config = getVanityConfig();

  return async (c: Context, next: Next) => {
    if (!config.enabled) {
      await next();
      return;
    }

    const host = c.req.header("host");
    if (!host) {
      await next();
      return;
    }

    const appSlug = extractAppSlug(host, config.baseHost);

    if (appSlug) {
      // Store in context for access by routes
      c.set("vanityAppSlug", appSlug);

      // Check if we should rewrite the path
      const originalPath = new URL(c.req.url).pathname;
      const rewrittenPath = getRewrittenPath(originalPath, appSlug);

      if (rewrittenPath && appInstance) {
        console.log(
          `[vanity] Rewriting ${host}${originalPath} -> ${rewrittenPath}`
        );

        // Create a new URL with the rewritten path
        const url = new URL(c.req.url);
        url.pathname = rewrittenPath;
        // Use localhost to avoid subdomain recursion
        url.host = `localhost:${url.port || "8000"}`;

        // Clone headers and add X-App-ID for downstream middleware
        const newHeaders = new Headers(c.req.raw.headers);
        newHeaders.set("X-App-ID", appSlug);

        // Forward the request internally to the rewritten path
        const newRequest = new Request(url.toString(), {
          method: c.req.raw.method,
          headers: newHeaders,
          body:
            c.req.raw.method !== "GET" && c.req.raw.method !== "HEAD"
              ? c.req.raw.body
              : undefined,
          // @ts-ignore - duplex is needed for streaming bodies
          duplex: c.req.raw.body ? "half" : undefined,
        });

        // Forward to the app and return the response
        const response = await appInstance.fetch(newRequest);
        return response;
      } else {
        console.log(`[vanity] Resolved ${host} -> app slug: ${appSlug}`);
      }
    }

    await next();
  };
}

/**
 * Helper to generate local vanity URL for an app
 */
export function getLocalVanityUrl(appSlug: string, path = ""): string | null {
  const config = getVanityConfig();
  if (!config.enabled) {
    return null;
  }

  const port = Deno.env.get("PORT") ?? "8000";
  return `http://${appSlug}.${config.baseHost}:${port}${path}`;
}

/**
 * Extend AppEnv type to include vanity context
 */
declare module "hono" {
  interface ContextVariableMap {
    vanityAppSlug?: string;
  }
}
