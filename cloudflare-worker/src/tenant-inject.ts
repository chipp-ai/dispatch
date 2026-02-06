/**
 * Tenant Brand Injection for Custom Domains
 *
 * Injects platform-level whitelabel branding (window.__TENANT_CONFIG__)
 * for custom domain dashboard deployments. This is SEPARATE from
 * app-level branding (window.__APP_BRAND__) used for consumer chat.
 *
 * ## Branding Separation
 *
 * 1. **Platform Whitelabeling** (`--brand-color`, `window.__TENANT_CONFIG__`)
 *    - For agencies/resellers to skin the entire builder dashboard
 *    - Injected HERE for custom domain requests
 *    - Sets --brand-color (platform level)
 *
 * 2. **App Branding** (`--consumer-primary`, `window.__APP_BRAND__`)
 *    - For individual AI apps in consumer chat
 *    - Injected by brand-inject.ts
 *    - Sets --consumer-primary (app level)
 */

export interface TenantConfig {
  companyName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  slug: string;
  features: {
    isGoogleAuthDisabled?: boolean;
    isMicrosoftAuthDisabled?: boolean;
    isBillingDisabled?: boolean;
    isHelpCenterDisabled?: boolean;
  };
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
 * Inject tenant branding into HTML for custom domain dashboard requests.
 * Sets window.__TENANT_CONFIG__ and --brand-color CSS variable.
 */
export function injectTenantBranding(
  html: string,
  config: TenantConfig
): string {
  // 1. Inject tenant config script (after <head> so it runs before app JS)
  const tenantScript = `<script>window.__TENANT_CONFIG__=${JSON.stringify(config)}</script>`;

  // 2. Inject platform-level CSS variable overrides
  const brandStyle = config.primaryColor
    ? `<style>:root{--brand-color:${config.primaryColor}}</style>`
    : "";

  // 3. Update page title
  if (config.companyName) {
    html = html.replace(
      /<title>.*?<\/title>/,
      `<title>${escapeHtml(config.companyName)}</title>`
    );
  }

  // 4. Update favicon if custom one provided
  if (config.faviconUrl) {
    html = html.replace(
      /(<link rel="icon"[^>]*href=")[^"]*(")/,
      `$1${config.faviconUrl}$2`
    );
  }

  // 5. Inject tenant script right after <head> (before other scripts)
  html = html.replace("<head>", `<head>\n${tenantScript}`);

  // 6. Inject brand CSS before </head>
  if (brandStyle) {
    html = html.replace("</head>", `${brandStyle}</head>`);
  }

  // 7. Replace splash logo if custom logo provided
  if (config.logoUrl) {
    html = html.replace(
      'src="/assets/chippylogo.svg"',
      `src="${config.logoUrl}"`
    );
  }

  return html;
}
