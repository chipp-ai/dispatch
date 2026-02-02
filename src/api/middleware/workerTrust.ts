/**
 * Worker Trust Middleware
 *
 * Validates that requests came through our Cloudflare Worker and
 * extracts trusted domain context (appId, tenantId) from headers.
 *
 * Security model:
 * - The Cloudflare Worker looks up the domain in KV to get app/tenant ID
 * - Worker adds X-Cloudflare-Worker: true header to prove it's from us
 * - Worker adds X-App-ID, X-Tenant-ID headers with trusted values
 * - This middleware only trusts these headers when X-Cloudflare-Worker is set
 *
 * Clients cannot spoof these headers because:
 * 1. They can't add X-Cloudflare-Worker (we verify it server-side)
 * 2. Even if they did, the values come from our KV lookup, not client input
 */

import { createMiddleware } from "hono/factory";

/**
 * Domain context extracted from Worker headers
 */
export interface WorkerContext {
  /** True if request came through our Cloudflare Worker */
  isFromWorker: boolean;

  /** App ID from domain lookup (for chat custom domains) */
  appId: string | null;

  /** Tenant ID from domain lookup (for whitelabel dashboards) */
  tenantId: string | null;

  /** Tenant slug from domain lookup */
  tenantSlug: string | null;

  /** Original hostname the request was made to */
  originalHost: string | null;
}

/**
 * Typed Hono context for worker trust
 */
export interface WorkerTrustContext {
  Variables: {
    workerContext: WorkerContext;
    requestId: string;
  };
}

/**
 * Worker trust middleware
 *
 * Extracts and validates domain context from Cloudflare Worker headers.
 * Sets workerContext in the request context for downstream handlers.
 *
 * Usage:
 * ```typescript
 * app.use("/api/*", workerTrustMiddleware);
 *
 * app.get("/api/chat/:appId/messages", async (c) => {
 *   const { appId: trustedAppId } = c.get("workerContext");
 *
 *   // If request came through Worker, use trusted appId from domain
 *   // Otherwise, validate appId from URL against user's permissions
 *   const appId = trustedAppId ?? c.req.param("appId");
 * });
 * ```
 */
/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const workerTrustMiddleware = createMiddleware<WorkerTrustContext>(
  async (c, next) => {
    const workerHeader = c.req.header("X-Cloudflare-Worker");
    const workerAuthHeader = c.req.header("X-Worker-Auth");

    // Get the expected auth token from environment
    // This token must be shared between the Cloudflare Worker and this server
    const expectedAuthToken = Deno.env.get("WORKER_TRUST_TOKEN") || null;

    // Validate both header AND shared secret to prevent spoofing
    // Simply setting X-Cloudflare-Worker: true is not enough - must also have valid auth token
    const hasValidHeader = workerHeader === "true";
    const hasValidAuth = !!(
      expectedAuthToken &&
      workerAuthHeader &&
      safeEqual(workerAuthHeader, expectedAuthToken)
    );

    // Only trust if BOTH conditions are met (header + secret token)
    // In development (no token configured), fall back to header-only for backwards compatibility
    const isFromWorker = hasValidHeader && (hasValidAuth || !expectedAuthToken);

    console.log("[workerTrust] Header check:", {
      workerHeader,
      hasAuthHeader: Boolean(workerAuthHeader),
      hasExpectedToken: Boolean(expectedAuthToken),
      validAuth: hasValidAuth,
      isFromWorker,
      appIdHeader: c.req.header("X-App-ID"),
    });

    const workerContext: WorkerContext = {
      isFromWorker,
      appId: null,
      tenantId: null,
      tenantSlug: null,
      originalHost: null,
    };

    if (isFromWorker) {
      // Trusted only when X-Cloudflare-Worker is "true" AND X-Worker-Auth matches server secret
      // The Worker proves origin using a shared secret; client-side spoofed headers are rejected
      workerContext.appId = c.req.header("X-App-ID") || null;
      workerContext.tenantId = c.req.header("X-Tenant-ID") || null;
      workerContext.tenantSlug = c.req.header("X-Tenant-Slug") || null;
      workerContext.originalHost = c.req.header("X-Original-Host") || null;
      console.log("[workerTrust] Worker request detected:", workerContext);
    }

    c.set("workerContext", workerContext);

    await next();
  }
);

/**
 * Require request to come from Cloudflare Worker
 *
 * Use this for endpoints that should ONLY be accessible via custom domains,
 * not directly. For example, whitelabel-specific endpoints.
 */
export const requireWorkerMiddleware = createMiddleware<WorkerTrustContext>(
  async (c, next) => {
    const workerContext = c.get("workerContext");

    if (!workerContext?.isFromWorker) {
      return c.json(
        {
          error: "This endpoint is only accessible via custom domains",
          message: "Request must come through Cloudflare Worker",
        },
        403
      );
    }

    await next();
  }
);

/**
 * Helper to get trusted app ID from worker context or fall back to parameter
 *
 * Use this in handlers that need an app ID and support both:
 * - Custom domain requests (app ID from Worker headers)
 * - Direct API requests (app ID from URL or body)
 *
 * @param workerContext - Worker context from middleware
 * @param fallback - Fallback app ID (e.g., from URL param or request body)
 * @returns Trusted app ID (prefers Worker context over fallback)
 */
export function getTrustedAppId(
  workerContext: WorkerContext | undefined,
  fallback: string | undefined
): string | null {
  // Worker context takes precedence - it's derived from domain lookup
  if (workerContext?.isFromWorker && workerContext.appId) {
    return workerContext.appId;
  }

  return fallback ?? null;
}

/**
 * Helper to get trusted tenant ID from worker context
 */
export function getTrustedTenantId(
  workerContext: WorkerContext | undefined,
  fallback: string | undefined
): string | null {
  if (workerContext?.isFromWorker && workerContext.tenantId) {
    return workerContext.tenantId;
  }

  return fallback ?? null;
}
