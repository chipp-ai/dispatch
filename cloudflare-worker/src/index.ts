/**
 * Chipp Deno SPA Worker
 *
 * Serves static Svelte SPA from R2 bucket and proxies API calls to GKE.
 * Injects app-specific branding for consumer chat routes and vanity subdomains.
 *
 * ## Vanity URL Support
 *
 * Handles vanity URLs like merry-visiting-quasar-7nee.chipp.ai:
 * - Detects vanity pattern (4-part: adjective-verb-noun-suffix)
 * - Serves SPA with instant brand injection for root path
 * - Proxies API calls to Deno backend with X-Vanity-Slug header
 * - Legacy patterns (e.g., myapp-12345) pass through to origin (Caddy)
 */

import {
  injectBrandingIfNeeded,
  injectBrandingForVanity,
  type Env as BrandEnv,
} from "./brand-inject";
import { injectTenantBranding, type TenantConfig } from "./tenant-inject";

export interface Env extends BrandEnv {
  ASSETS: R2Bucket;
  BRAND_ASSETS?: R2Bucket;
  API_ORIGIN: string;
  R2_PUBLIC_URL?: string;
  TENANT_CONFIG?: KVNamespace;
  WORKER_TRUST_TOKEN?: string;
}

/**
 * Reserved subdomains that should NOT be treated as vanity URLs.
 * These pass through to origin (Caddy) for proper routing.
 */
const RESERVED_SUBDOMAINS = new Set([
  "app",
  "staging",
  "build",
  "api",
  "www",
  "landing",
  "mcp",
  "dino-mullet",
  "pg-staging",
  // Dedicated tenant subdomains
  "hub",
  "ifda",
  "gener8tor",
]);

/**
 * Detect vanity slug pattern: 4 hyphen-separated parts where last part contains letters.
 * Examples: merry-visiting-quasar-7nee, happy-jumping-dolphin-x7k9
 * Non-matches: myapp-12345, app, staging
 */
const VANITY_PATTERN = /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]*[a-z][a-z0-9]*$/;

/**
 * Extract vanity slug from hostname if it matches the pattern.
 * Returns null for reserved subdomains, legacy patterns, or non-subdomain hosts.
 */
function getVanitySlug(hostname: string): string | null {
  // Remove port if present
  const hostWithoutPort = hostname.split(":")[0];

  // Check if this is a chipp.ai subdomain
  const match = hostWithoutPort.match(/^([^.]+)\.(?:staging\.)?chipp\.ai$/);
  if (!match) {
    return null; // Not a chipp.ai subdomain
  }

  const subdomain = match[1];

  // Skip reserved subdomains
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return null;
  }

  // Check if it matches vanity pattern
  if (VANITY_PATTERN.test(subdomain)) {
    return subdomain;
  }

  return null; // Legacy pattern, pass through
}

// Routes that should be proxied to the Deno API server
const API_ROUTES = [
  "/api/",
  "/auth/",
  "/ws",
  "/consumer/",
  "/generate/",
  "/webhooks/",
  "/health",
  "/debug/",
];

// Content type mapping for static files
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".map": "application/json",
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function shouldProxy(pathname: string): boolean {
  return API_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Proxy API request to Deno backend with optional vanity slug context.
 */
async function proxyToAPI(
  request: Request,
  env: Env,
  vanitySlug?: string
): Promise<Response> {
  const url = new URL(request.url);
  const apiUrl = new URL(url.pathname + url.search, env.API_ORIGIN);

  // Clone headers, removing Cloudflare-specific ones
  const headers = new Headers(request.headers);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("cf-ipcountry");

  // Add forwarded headers
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set(
    "X-Real-IP",
    request.headers.get("cf-connecting-ip") || "unknown"
  );

  // Add vanity slug header for Deno middleware routing
  if (vanitySlug) {
    headers.set("X-Vanity-Slug", vanitySlug);
  }

  // Handle WebSocket upgrade
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    // WebSocket proxying requires special handling
    // For now, redirect to API origin directly
    return Response.redirect(apiUrl.toString(), 307);
  }

  const proxyRequest = new Request(apiUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });

  try {
    const response = await fetch(proxyRequest);

    // Clone response with CORS headers for browser compatibility
    const responseHeaders = new Headers(response.headers);

    // Preserve Set-Cookie headers
    const cookies = response.headers.getAll("set-cookie");
    if (cookies.length > 0) {
      responseHeaders.delete("set-cookie");
      cookies.forEach((cookie) => {
        responseHeaders.append("set-cookie", cookie);
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({ error: "API proxy error", message: String(error) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Sanitize pathname to prevent path traversal attacks.
 * Removes ../ sequences and normalizes the path.
 */
function sanitizePath(pathname: string): string | null {
  // Decode URL-encoded characters first
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Invalid URL encoding
    return null;
  }

  // Remove leading slash and normalize
  let normalized = decoded.startsWith("/") ? decoded.slice(1) : decoded;

  // Split into segments and filter out dangerous ones
  const segments = normalized.split("/").filter((segment) => {
    // Reject empty segments, current dir, and parent dir references
    if (segment === "" || segment === "." || segment === "..") {
      return false;
    }
    // Reject segments with null bytes or other control characters
    if (/[\x00-\x1f]/.test(segment)) {
      return false;
    }
    return true;
  });

  // Rebuild the path
  return segments.join("/");
}

async function serveStaticFile(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  // Sanitize the path to prevent directory traversal
  const sanitized = sanitizePath(pathname);
  if (sanitized === null) {
    return null;
  }

  // Default to index.html for root
  let key = sanitized === "" ? "index.html" : sanitized;

  const object = await env.ASSETS.get(key);

  if (!object) {
    return null;
  }

  const headers = new Headers();
  headers.set("Content-Type", getContentType(key));
  headers.set("ETag", object.etag);

  // Cache static assets aggressively (1 year for hashed files)
  if (key.match(/\.[a-f0-9]{8}\.(js|css|woff2?)$/)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (key === "index.html") {
    // Don't cache index.html
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  } else {
    // Cache other assets for 1 hour
    headers.set("Cache-Control", "public, max-age=3600");
  }

  // Handle conditional requests
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === object.etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}

/**
 * Handle requests for vanity subdomains (e.g., merry-visiting-quasar-7nee.chipp.ai).
 * - Root path: Serve SPA with instant branding
 * - API routes: Proxy to Deno with X-Vanity-Slug header
 * - Static assets: Serve from R2
 */
async function handleVanityRequest(
  request: Request,
  env: Env,
  slug: string
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // API routes: proxy to Deno with vanity slug context
  if (shouldProxy(pathname)) {
    return proxyToAPI(request, env, slug);
  }

  // Static assets (files with extensions): serve directly from R2
  if (pathname.includes(".")) {
    const staticResponse = await serveStaticFile(request, env, pathname);
    if (staticResponse) {
      return staticResponse;
    }
    return new Response("Not Found", { status: 404 });
  }

  // SPA route (no file extension): serve index.html with brand injection
  const indexResponse = await serveStaticFile(request, env, "index.html");
  if (indexResponse) {
    const html = await indexResponse.text();
    const brandedHtml = await injectBrandingForVanity(html, slug, env);

    const headers = new Headers(indexResponse.headers);
    headers.set(
      "Content-Length",
      new TextEncoder().encode(brandedHtml).length.toString()
    );

    return new Response(brandedHtml, {
      status: indexResponse.status,
      headers,
    });
  }

  return new Response("Not Found", { status: 404 });
}

// ========================================
// Custom Domain Support
// ========================================

interface DomainMapping {
  type: "chat" | "dashboard" | "api";
  appId?: string;
  appNameId?: string;
  tenantId?: string;
  tenantSlug?: string;
  brandStyles?: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
    companyName?: string;
  };
  features?: {
    isGoogleAuthDisabled?: boolean;
    isMicrosoftAuthDisabled?: boolean;
    isBillingDisabled?: boolean;
    isHelpCenterDisabled?: boolean;
  };
}

// In-memory cache for domain lookups (per-isolate)
const domainCache = new Map<
  string,
  { mapping: DomainMapping | null; expires: number }
>();
const DOMAIN_CACHE_TTL = 5 * 60_000; // 5 minutes

/**
 * Look up custom domain mapping.
 * Checks KV first, falls back to API, caches result in KV.
 */
async function lookupCustomDomain(
  hostname: string,
  env: Env
): Promise<DomainMapping | null> {
  // Check in-memory cache first
  const cached = domainCache.get(hostname);
  if (cached && cached.expires > Date.now()) {
    return cached.mapping;
  }

  // Check KV cache
  if (env.TENANT_CONFIG) {
    try {
      const kvResult = await env.TENANT_CONFIG.get(hostname, "json");
      if (kvResult) {
        const mapping = kvResult as DomainMapping;
        domainCache.set(hostname, {
          mapping,
          expires: Date.now() + DOMAIN_CACHE_TTL,
        });
        return mapping;
      }
    } catch (error) {
      console.error("[CustomDomain] KV lookup failed:", error);
    }
  }

  // Fall back to API lookup
  try {
    const response = await fetch(`${env.API_ORIGIN}/api/internal/domain-lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Request": "cloudflare-router",
      },
      body: JSON.stringify({ hostname }),
    });

    if (!response.ok) {
      // Cache negative result briefly to avoid hammering API
      domainCache.set(hostname, {
        mapping: null,
        expires: Date.now() + 60_000, // 1 minute for misses
      });
      return null;
    }

    const mapping = (await response.json()) as DomainMapping;

    // Cache in memory
    domainCache.set(hostname, {
      mapping,
      expires: Date.now() + DOMAIN_CACHE_TTL,
    });

    // Write back to KV for next time (fire-and-forget)
    if (env.TENANT_CONFIG) {
      try {
        await env.TENANT_CONFIG.put(hostname, JSON.stringify(mapping), {
          expirationTtl: 300, // 5 minutes TTL in KV
        });
      } catch {
        // Non-critical
      }
    }

    return mapping;
  } catch (error) {
    console.error("[CustomDomain] API lookup failed:", error);
    return null;
  }
}

/**
 * Proxy API request with trust headers for custom domain context.
 */
async function proxyToAPIWithTrust(
  request: Request,
  env: Env,
  mapping: DomainMapping
): Promise<Response> {
  const url = new URL(request.url);
  const apiUrl = new URL(url.pathname + url.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("cf-ipcountry");

  // Add forwarded headers
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set(
    "X-Real-IP",
    request.headers.get("cf-connecting-ip") || "unknown"
  );

  // Add trust headers for custom domain context
  headers.set("X-Cloudflare-Worker", "true");
  if (env.WORKER_TRUST_TOKEN) {
    headers.set("X-Worker-Auth", env.WORKER_TRUST_TOKEN);
  }
  if (mapping.tenantId) {
    headers.set("X-Tenant-ID", mapping.tenantId);
  }
  headers.set("X-Original-Host", url.hostname);

  // Handle WebSocket upgrade
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return Response.redirect(apiUrl.toString(), 307);
  }

  const proxyRequest = new Request(apiUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });

  try {
    const response = await fetch(proxyRequest);
    const responseHeaders = new Headers(response.headers);

    const cookies = response.headers.getAll("set-cookie");
    if (cookies.length > 0) {
      responseHeaders.delete("set-cookie");
      cookies.forEach((cookie) => {
        responseHeaders.append("set-cookie", cookie);
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[CustomDomain] Proxy error:", error);
    return new Response(
      JSON.stringify({ error: "API proxy error", message: String(error) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Handle a request for a custom dashboard domain.
 * Serves SPA from R2 with tenant branding injected.
 */
async function handleCustomDomainRequest(
  request: Request,
  env: Env,
  mapping: DomainMapping
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // API routes: proxy to Deno with trust headers
  if (shouldProxy(pathname)) {
    return proxyToAPIWithTrust(request, env, mapping);
  }

  // Static assets (files with extensions): serve directly from R2
  if (pathname.includes(".")) {
    const staticResponse = await serveStaticFile(request, env, pathname);
    if (staticResponse) {
      return staticResponse;
    }
    return new Response("Not Found", { status: 404 });
  }

  // SPA route (no file extension): serve index.html with tenant branding
  const indexResponse = await serveStaticFile(request, env, "index.html");
  if (indexResponse) {
    const html = await indexResponse.text();

    const tenantConfig: TenantConfig = {
      companyName: mapping.brandStyles?.companyName || "",
      logoUrl: mapping.brandStyles?.logoUrl || null,
      faviconUrl: mapping.brandStyles?.faviconUrl || null,
      primaryColor: mapping.brandStyles?.primaryColor || null,
      secondaryColor: mapping.brandStyles?.secondaryColor || null,
      slug: mapping.tenantSlug || "",
      features: mapping.features || {},
    };

    const brandedHtml = injectTenantBranding(html, tenantConfig);

    const headers = new Headers(indexResponse.headers);
    headers.set(
      "Content-Length",
      new TextEncoder().encode(brandedHtml).length.toString()
    );

    return new Response(brandedHtml, {
      status: indexResponse.status,
      headers,
    });
  }

  return new Response("Not Found", { status: 404 });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Check for vanity subdomain first
    const vanitySlug = getVanitySlug(url.hostname);
    if (vanitySlug) {
      // Vanity subdomain: serve SPA with branding from this worker
      return handleVanityRequest(request, env, vanitySlug);
    }

    // For build.chipp.ai: continue with existing behavior
    // For other subdomains (reserved or legacy): check custom domains, then pass through
    const hostWithoutPort = url.hostname.split(":")[0];
    if (
      hostWithoutPort !== "build.chipp.ai" &&
      hostWithoutPort !== "localhost"
    ) {
      // Check if this is a registered custom domain (e.g., dashboard.acme.com)
      const domainMapping = await lookupCustomDomain(hostWithoutPort, env);
      if (domainMapping) {
        if (domainMapping.type === "dashboard") {
          return handleCustomDomainRequest(request, env, domainMapping);
        }
        // Chat or API custom domains: proxy with trust headers
        return proxyToAPIWithTrust(request, env, domainMapping);
      }

      // Not a custom domain - pass through to origin (Caddy)
      return fetch(request);
    }

    // Proxy API routes to Deno server
    if (shouldProxy(pathname)) {
      return proxyToAPI(request, env);
    }

    // Try to serve static file
    const staticResponse = await serveStaticFile(request, env, pathname);
    if (staticResponse) {
      return staticResponse;
    }

    // SPA fallback: serve index.html for non-file routes
    // (allows client-side routing to work)
    if (!pathname.includes(".")) {
      const indexResponse = await serveStaticFile(request, env, "index.html");
      if (indexResponse) {
        return indexResponse;
      }
    }

    // 404 for missing files
    return new Response("Not Found", { status: 404 });
  },
};
