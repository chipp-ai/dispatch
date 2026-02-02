/**
 * Brand Injection for Consumer Chat
 *
 * Injects app-specific branding into HTML for instant consumer chat loading.
 * Fetches brand config from R2 and transforms HTML before serving.
 *
 * ## IMPORTANT: Branding Separation
 *
 * This module injects APP-SPECIFIC branding (--consumer-primary), NOT platform
 * whitelabeling (--brand-color). These are two distinct branding systems:
 *
 * 1. **Platform Whitelabeling** (`--brand-color`)
 *    - For agencies/resellers to brand the entire Chipp platform
 *    - Set globally in tokens.css, configured per-deployment
 *    - This module does NOT touch --brand-color
 *
 * 2. **App Branding** (`--consumer-primary`, `--app-brand-color`)
 *    - For individual AI apps to have their own consumer chat branding
 *    - Injected here via window.__APP_BRAND__ and CSS variables
 *    - Only affects consumer chat experience for that specific app
 *
 * The frontend (Button.svelte) uses:
 *   var(--consumer-primary, var(--brand-color))
 *
 * This means consumer chat uses app branding, while the rest of the platform
 * uses whitelabel branding - they don't interfere with each other.
 */

export interface BrandConfig {
  slug: string;
  name: string;
  description?: string;
  primaryColor: string;
  backgroundColor?: string;
  logoUrl: string;
  ogImageUrl?: string;
  updatedAt: string;
}

export interface Env {
  ASSETS: R2Bucket;
  BRAND_ASSETS?: R2Bucket; // Separate bucket for brand assets
  API_ORIGIN: string;
  R2_PUBLIC_URL?: string;
}

// Cache for brand configs (in-memory, per-isolate)
const brandCache = new Map<
  string,
  { config: BrandConfig | null; expires: number }
>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Extract app slug from consumer chat URL path
 * Apps are now determined by vanity subdomain, not URL path.
 * This function is kept for backwards compatibility but returns null.
 */
export function extractAppSlug(_pathname: string): string | null {
  // App slug now comes from subdomain, not URL path
  return null;
}

/**
 * Check if this request should have brand injection
 * Brand injection is now handled by vanity subdomain routing in the worker.
 */
export function shouldInjectBranding(_pathname: string): boolean {
  // Brand injection is determined by vanity subdomain in the worker
  // Not by URL path
  return false;
}

/**
 * Fetch brand config from R2 with caching
 */
export async function fetchBrandConfig(
  slug: string,
  env: Env
): Promise<BrandConfig | null> {
  // Check cache first
  const cached = brandCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return cached.config;
  }

  try {
    // Try BRAND_ASSETS bucket first, fall back to ASSETS
    const bucket = env.BRAND_ASSETS || env.ASSETS;
    const configKey = `brands/${slug}/config.json`;
    const object = await bucket.get(configKey);

    if (!object) {
      // Cache null result to avoid repeated lookups
      brandCache.set(slug, { config: null, expires: Date.now() + CACHE_TTL });
      return null;
    }

    const config = JSON.parse(await object.text()) as BrandConfig;
    brandCache.set(slug, { config, expires: Date.now() + CACHE_TTL });
    return config;
  } catch (error) {
    console.error(`[BrandInject] Failed to fetch config for ${slug}:`, error);
    return null;
  }
}

/**
 * Escape HTML special characters for safe injection
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Transform HTML with brand config
 */
export function transformHtml(html: string, config: BrandConfig): string {
  // 1. Inject brand config script (before </head>)
  const brandScript = `<script>window.__APP_BRAND__=${JSON.stringify({
    slug: config.slug,
    name: config.name,
    color: config.primaryColor,
    bg: config.backgroundColor || "#0a0a0a",
    logo: config.logoUrl,
  })}</script>`;

  // 2. Inject brand color CSS variables
  const brandStyle = `<style>:root{--app-brand-color:${config.primaryColor};--app-brand-bg:${config.backgroundColor || "#0a0a0a"}}</style>`;

  // 3. Inject OG meta tags for social sharing
  const ogTags = `
    <meta property="og:title" content="${escapeHtml(config.name)}" />
    <meta property="og:description" content="${escapeHtml(config.description || "")}" />
    ${config.ogImageUrl ? `<meta property="og:image" content="${config.ogImageUrl}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    ${config.ogImageUrl ? `<meta name="twitter:image" content="${config.ogImageUrl}" />` : ""}
  `;

  // 4. Update page title
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${escapeHtml(config.name)}</title>`
  );

  // 5. Inject brand script right after <head> so it runs BEFORE any other scripts
  // This ensures window.__APP_BRAND__ is available when the early script runs
  html = html.replace("<head>", `<head>\n${brandScript}`);

  // 6. Inject styles and OG tags before </head>
  html = html.replace("</head>", `${brandStyle}${ogTags}</head>`);

  // 7. Replace splash screen logo src
  // The index.html has: <img src="/assets/chippylogo.svg" alt="Loading" />
  html = html.replace(
    'src="/assets/chippylogo.svg"',
    `src="${config.logoUrl}"`
  );

  // Note: Background color is handled via CSS variables (--app-brand-bg)
  // injected in step 2, which index.html uses: background: var(--app-brand-bg)

  return html;
}

/**
 * Inject branding into HTML response for consumer chat
 */
export async function injectBrandingIfNeeded(
  request: Request,
  env: Env,
  html: string
): Promise<string> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if we should inject branding
  if (!shouldInjectBranding(pathname)) {
    return html;
  }

  // Extract app slug from URL
  const slug = extractAppSlug(pathname);
  if (!slug) {
    return html;
  }

  // Fetch brand config
  const config = await fetchBrandConfig(slug, env);
  if (!config) {
    // No custom branding, return default HTML
    return html;
  }

  // Transform HTML with brand config
  return transformHtml(html, config);
}

/**
 * Inject branding for vanity subdomain requests.
 * Used when the slug comes from the subdomain (e.g., merry-visiting-quasar-7nee.chipp.ai)
 * rather than the URL path.
 */
export async function injectBrandingForVanity(
  html: string,
  slug: string,
  env: Env
): Promise<string> {
  // Fetch brand config using the subdomain slug
  const config = await fetchBrandConfig(slug, env);
  if (!config) {
    // No custom branding found, return default HTML
    return html;
  }

  // Transform HTML with brand config
  return transformHtml(html, config);
}
