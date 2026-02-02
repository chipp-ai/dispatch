/**
 * Consumer Context Utilities
 *
 * Helpers for extracting app context in consumer chat.
 * Apps are identified by vanity subdomain (e.g., my-app.chipp.ai)
 * rather than URL path.
 */

/**
 * Get the appNameId from the current context.
 *
 * Priority:
 * 1. window.__APP_BRAND__.slug (injected by Cloudflare Worker for vanity subdomains)
 * 2. Subdomain extraction (for local dev or direct subdomain access)
 *
 * @returns The appNameId/slug for the current app
 */
export function getAppNameIdFromContext(): string {
  if (typeof window === "undefined") {
    return "";
  }

  // Check for injected brand config (set by Cloudflare Worker)
  const injectedBrand = (
    window as unknown as {
      __APP_BRAND__?: {
        slug: string;
        name: string;
        color: string;
        logo: string;
      };
    }
  ).__APP_BRAND__;

  if (injectedBrand?.slug) {
    return injectedBrand.slug;
  }

  // Extract from subdomain (e.g., my-app.chipp.ai or my-app.localhost:5174)
  const hostname = window.location.hostname;
  const parts = hostname.split(".");

  // For localhost development (e.g., my-app.localhost)
  if (hostname.includes("localhost") && parts.length >= 2) {
    return parts[0];
  }

  // For chipp.ai subdomains (e.g., my-app.chipp.ai or my-app.staging.chipp.ai)
  if (hostname.endsWith(".chipp.ai") && parts.length >= 3) {
    // Skip reserved subdomains
    const subdomain = parts[0];
    const reserved = [
      "app",
      "staging",
      "build",
      "api",
      "www",
      "landing",
      "mcp",
      "dino-mullet",
    ];
    if (!reserved.includes(subdomain)) {
      return subdomain;
    }
  }

  // Fallback: empty string (will cause app loading to fail gracefully)
  return "";
}
