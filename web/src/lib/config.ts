/**
 * Application configuration
 *
 * In production, OAuth flows must go directly to the API domain
 * to ensure cookies are set on the correct domain for the callback.
 */

// API URL for OAuth and other cross-domain requests
// In dev, Vite proxy handles routing, so we use relative URLs
// In production, we need the full API domain for OAuth to work
export const API_URL = import.meta.env.PROD
  ? "https://dino-mullet.chipp.ai"
  : "";

// Helper to build API URLs that work in both dev and production
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
