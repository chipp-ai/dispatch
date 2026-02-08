/**
 * Vanity URL Middleware
 *
 * Enables subdomain-style vanity URLs for both local development and production.
 *
 * ## Production Mode
 *
 * In production, the Cloudflare Worker detects vanity subdomains and sets
 * the `X-Vanity-Slug` header. This middleware reads that header and rewrites
 * paths to consumer routes.
 *
 * Example: merry-visiting-quasar-7nee.chipp.ai/chat
 *   -> X-Vanity-Slug: merry-visiting-quasar-7nee
 *   -> Rewritten to: /consumer/merry-visiting-quasar-7nee/chat
 *
 * ## Local Development Mode
 *
 * When LOCAL_VANITY_HOST is set (e.g., "localhost"), this middleware
 * extracts the subdomain directly from the request host.
 *
 * Example: myapp.localhost:8000/chat
 *   -> Rewritten to: /consumer/myapp/chat
 *
 * Usage:
 * 1. Production: Cloudflare Worker sets X-Vanity-Slug header
 * 2. Local: Set LOCAL_VANITY_HOST=localhost in your .env
 *    Access at http://your-app-slug.localhost:8000/chat
 */

import { log } from "@/lib/logger.ts";
import type { Context, Next } from "hono";

interface VanityConfig {
  localEnabled: boolean;
  baseHost: string;
}

function getVanityConfig(): VanityConfig {
  const baseHost = Deno.env.get("LOCAL_VANITY_HOST");
  const environment = Deno.env.get("ENVIRONMENT");

  return {
    // Local mode only enabled when LOCAL_VANITY_HOST is set and not in production
    localEnabled: !!baseHost && environment !== "production",
    baseHost: baseHost ?? "localhost",
  };
}

/**
 * Extract app slug from subdomain (for local development)
 *
 * Examples:
 *   myapp.localhost:8000 -> myapp
 *   myapp-123.localhost:8000 -> myapp-123
 *   localhost:8000 -> null (no subdomain)
 */
function extractAppSlugFromHost(host: string, baseHost: string): string | null {
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

  // Ensure there's a dot separator before the base host
  const expectedDotPosition = hostWithoutPort.length - baseHost.length - 1;
  if (expectedDotPosition < 0 || hostWithoutPort[expectedDotPosition] !== ".") {
    return null;
  }

  // Extract subdomain (everything before the dot)
  const subdomain = hostWithoutPort.slice(0, expectedDotPosition);

  if (!subdomain || subdomain.length === 0) {
    return null;
  }

  return subdomain;
}

/**
 * Paths that should be rewritten to consumer routes when accessed via vanity subdomain.
 * These map from vanity paths to consumer route paths.
 */
const VANITY_PATH_MAPPINGS: Record<string, string> = {
  "/": "/consumer/:appSlug/chat", // Root path goes to chat
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
 * Rewrite path to consumer route for vanity subdomain access
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
 * Set the app instance for internal request forwarding.
 * Must be called from app.ts after app is created.
 */
export function setVanityAppInstance(app: {
  fetch: (request: Request) => Response | Promise<Response>;
}): void {
  appInstance = app;
}

/**
 * Vanity URL middleware
 *
 * Extracts app slug from:
 * 1. X-Vanity-Slug header (set by Cloudflare Worker in production)
 * 2. Subdomain (for local development when LOCAL_VANITY_HOST is set)
 *
 * Then rewrites paths to consumer routes and forwards internally.
 */
export function vanityMiddleware() {
  const config = getVanityConfig();

  return async (c: Context, next: Next) => {
    // Try to get vanity slug from header (production) or subdomain (local)
    let appSlug = c.req.header("X-Vanity-Slug") ?? null;

    // If no header, try local subdomain extraction
    if (!appSlug && config.localEnabled) {
      const host = c.req.header("host");
      if (host) {
        appSlug = extractAppSlugFromHost(host, config.baseHost);
      }
    }

    // No vanity slug found, continue normally
    if (!appSlug) {
      await next();
      return;
    }

    // Store in context for access by routes
    c.set("vanityAppSlug", appSlug);

    // Check if we should rewrite the path
    const originalPath = new URL(c.req.url).pathname;
    const rewrittenPath = getRewrittenPath(originalPath, appSlug);

    if (rewrittenPath && appInstance) {
      log.debug("Rewriting vanity path", {
        source: "vanity",
        feature: "rewrite",
        originalPath,
        rewrittenPath,
        appSlug,
      });

      // Create a new URL with the rewritten path
      const url = new URL(c.req.url);
      url.pathname = rewrittenPath;
      // Use localhost to avoid subdomain recursion
      url.host = `localhost:${url.port || "8000"}`;

      // Clone headers and add X-App-ID for downstream middleware
      const newHeaders = new Headers(c.req.raw.headers);
      newHeaders.set("X-App-ID", appSlug);
      // Remove X-Vanity-Slug to prevent re-processing
      newHeaders.delete("X-Vanity-Slug");

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
    }

    await next();
  };
}

/**
 * Helper to generate vanity URL for an app (local development only)
 */
export function getLocalVanityUrl(appSlug: string, path = ""): string | null {
  const config = getVanityConfig();
  if (!config.localEnabled) {
    return null;
  }

  const port = Deno.env.get("PORT") ?? "8000";
  return `http://${appSlug}.${config.baseHost}:${port}${path}`;
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use vanityMiddleware instead
 */
export const localVanityMiddleware = vanityMiddleware;

/**
 * Extend AppEnv type to include vanity context
 */
declare module "hono" {
  interface ContextVariableMap {
    vanityAppSlug?: string;
  }
}
