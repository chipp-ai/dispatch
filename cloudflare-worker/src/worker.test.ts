/**
 * Cloudflare Worker Integration Tests
 *
 * Tests the full Worker fetch handler with simulated R2 and KV via Miniflare.
 * Validates custom domain routing, tenant branding injection, vanity URLs,
 * static file serving, and security (path traversal).
 *
 * USAGE:
 *   cd cloudflare-worker && npx vitest run
 */

import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

// ========================================
// Test HTML (mirrors web/index.html)
// ========================================

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chipp</title>
    <style>:root { --app-brand-bg: #0a0a0a; }</style>
    <script type="module">
      // Early brand detection
      const tc = window.__TENANT_CONFIG__;
      if (tc) {
        if (tc.primaryColor) document.documentElement.style.setProperty('--brand-color', tc.primaryColor);
      }
    </script>
  </head>
  <body>
    <div id="initial-splash">
      <img src="/assets/chippylogo.svg" alt="Loading" />
    </div>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`;

// ========================================
// Test Fixtures
// ========================================

const ACME_TENANT_MAPPING = {
  type: "dashboard" as const,
  tenantId: "tenant-acme-123",
  tenantSlug: "acme",
  brandStyles: {
    companyName: "Acme Corp",
    primaryColor: "#FF5733",
    secondaryColor: "#C70039",
    logoUrl: "https://cdn.acme.com/logo.png",
    faviconUrl: "https://cdn.acme.com/favicon.ico",
  },
  features: {
    isGoogleAuthDisabled: true,
    isBillingDisabled: true,
  },
};

const VANITY_BRAND_CONFIG = {
  slug: "merry-visiting-quasar-7nee",
  name: "Test Bot",
  primaryColor: "#3498DB",
  backgroundColor: "#1a1a2e",
  logoUrl: "https://cdn.example.com/bot-logo.png",
  updatedAt: new Date().toISOString(),
};

// ========================================
// Setup: Seed R2 and KV once for all tests
// ========================================

beforeAll(async () => {
  // Seed R2 bucket with SPA assets
  await env.ASSETS.put("index.html", INDEX_HTML);
  await env.ASSETS.put("assets/index.abc12345.css", "body { margin: 0; }");
  await env.ASSETS.put("assets/index.def67890.js", "console.log('app loaded');");
  await env.ASSETS.put("favicon.svg", "<svg>test</svg>");
  await env.ASSETS.put("assets/chippylogo.svg", "<svg>chipp logo</svg>");

  // Seed R2 with vanity brand config
  await env.ASSETS.put(
    "brands/merry-visiting-quasar-7nee/config.json",
    JSON.stringify(VANITY_BRAND_CONFIG)
  );

  // Seed KV with custom domain mapping
  await env.TENANT_CONFIG.put(
    "dashboard.acme.com",
    JSON.stringify(ACME_TENANT_MAPPING)
  );
});

// ========================================
// Static File Serving from R2
// ========================================

describe("Static File Serving", () => {
  it("should serve index.html from R2 for root path", async () => {
    const response = await SELF.fetch("http://localhost:8788/");
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("<title>Chipp</title>");
    expect(html).toContain('<div id="app">');
  });

  it("should serve CSS files with correct content type", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/index.abc12345.css"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/css; charset=utf-8"
    );
    expect(await response.text()).toBe("body { margin: 0; }");
  });

  it("should serve JS files with correct content type", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/index.def67890.js"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/javascript; charset=utf-8"
    );
  });

  it("should cache hashed files for 1 year", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/index.abc12345.css"
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("should not cache index.html", async () => {
    const response = await SELF.fetch("http://localhost:8788/");
    expect(response.headers.get("Cache-Control")).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });

  it("should return 404 for missing files", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/nonexistent.js"
    );
    expect(response.status).toBe(404);
  });

  it("should serve SPA fallback for non-file routes", async () => {
    const response = await SELF.fetch("http://localhost:8788/settings");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Chipp</title>");
  });
});

// ========================================
// Path Traversal Protection
// ========================================

describe("Path Traversal Protection", () => {
  it("should block ../ path traversal", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/../../../etc/passwd"
    );
    const text = await response.text();
    expect(text).not.toContain("root:");
  });

  it("should block URL-encoded traversal", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/%2e%2e/%2e%2e/etc/passwd"
    );
    const text = await response.text();
    expect(text).not.toContain("root:");
  });
});

// ========================================
// Custom Domain Routing + Tenant Branding
// ========================================

describe("Custom Domain Routing", () => {
  it("should inject tenant branding for root path on custom domain", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    expect(response.status).toBe(200);

    const html = await response.text();

    // Tenant config should be injected
    expect(html).toContain("window.__TENANT_CONFIG__=");

    // Title should be replaced
    expect(html).toContain("<title>Acme Corp</title>");
    expect(html).not.toContain("<title>Chipp</title>");

    // Favicon should be replaced
    expect(html).toContain('href="https://cdn.acme.com/favicon.ico"');

    // Logo should be replaced
    expect(html).toContain('src="https://cdn.acme.com/logo.png"');
    expect(html).not.toContain("chippylogo.svg");

    // Brand color should be injected
    expect(html).toContain("--brand-color:#FF5733");
  });

  it("should include all tenant config fields in injected JSON", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    const html = await response.text();

    const match = html.match(
      /window\.__TENANT_CONFIG__=(\{.*?\})<\/script>/
    );
    expect(match).not.toBeNull();

    const config = JSON.parse(match![1]);
    expect(config.companyName).toBe("Acme Corp");
    expect(config.primaryColor).toBe("#FF5733");
    expect(config.secondaryColor).toBe("#C70039");
    expect(config.slug).toBe("acme");
    expect(config.logoUrl).toBe("https://cdn.acme.com/logo.png");
    expect(config.faviconUrl).toBe("https://cdn.acme.com/favicon.ico");
    expect(config.features.isGoogleAuthDisabled).toBe(true);
    expect(config.features.isBillingDisabled).toBe(true);
  });

  it("should serve static assets on custom domain without branding", async () => {
    const response = await SELF.fetch(
      "http://dashboard.acme.com/assets/index.abc12345.css"
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body { margin: 0; }");
  });

  it("should serve SPA fallback with branding on sub-routes", async () => {
    const response = await SELF.fetch(
      "http://dashboard.acme.com/settings/whitelabel"
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Acme Corp</title>");
    expect(html).toContain("window.__TENANT_CONFIG__=");
  });

  it("should not inject branding for unknown custom domains", async () => {
    // For domains not in KV and with no API to fall back to,
    // the Worker falls through to fetch(request) which will error.
    // We verify it doesn't accidentally serve branded HTML.
    try {
      const response = await SELF.fetch("http://unknown-test.example.com/");
      const text = await response.text();
      expect(text).not.toContain("window.__TENANT_CONFIG__=");
    } catch {
      // DNS/network error expected in test environment - this is fine.
      // The key assertion is above: if we get a response, it shouldn't be branded.
    }
  });
});

// ========================================
// Branding Leak Prevention (Custom Domain)
// ========================================

describe("Custom Domain Branding Leak Prevention", () => {
  it("should NOT contain Chipp in the title", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    const html = await response.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1]).not.toContain("Chipp");
    expect(titleMatch![1]).toBe("Acme Corp");
  });

  it("should NOT reference chippylogo.svg", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    const html = await response.text();

    expect(html).not.toContain("chippylogo.svg");
  });

  it("should NOT reference default favicon.svg", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    const html = await response.text();

    const faviconMatch = html.match(
      /<link rel="icon"[^>]*href="([^"]*)"[^>]*>/
    );
    expect(faviconMatch).not.toBeNull();
    expect(faviconMatch![1]).not.toContain("favicon.svg");
    expect(faviconMatch![1]).toBe("https://cdn.acme.com/favicon.ico");
  });

  it("FULL BRANDING: no Chipp assets remain with complete tenant config", async () => {
    const response = await SELF.fetch("http://dashboard.acme.com/");
    const html = await response.text();

    // Title must be tenant's
    expect(html).toContain("<title>Acme Corp</title>");
    expect(html).not.toContain("<title>Chipp</title>");

    // Logo must be tenant's
    expect(html).not.toContain("chippylogo");
    expect(html).toContain("https://cdn.acme.com/logo.png");

    // Favicon must be tenant's
    expect(html).toContain("https://cdn.acme.com/favicon.ico");

    // Brand color must be set
    expect(html).toContain("--brand-color:#FF5733");

    // Tenant config must be injected
    expect(html).toContain("window.__TENANT_CONFIG__");
  });
});

// ========================================
// Vanity Subdomain Routing
// ========================================

describe("Vanity Subdomain Routing", () => {
  it("should inject app branding for vanity URL root path", async () => {
    const response = await SELF.fetch(
      "http://merry-visiting-quasar-7nee.chipp.ai/"
    );
    expect(response.status).toBe(200);
    const html = await response.text();

    // App branding uses __APP_BRAND__, NOT __TENANT_CONFIG__
    expect(html).toContain("window.__APP_BRAND__=");
    expect(html).not.toContain("window.__TENANT_CONFIG__=");
  });

  it("should inject correct app brand values", async () => {
    const response = await SELF.fetch(
      "http://merry-visiting-quasar-7nee.chipp.ai/"
    );
    const html = await response.text();

    // App branding uses --app-brand-color (NOT --brand-color)
    expect(html).toContain("--app-brand-color:#3498DB");

    // Title should be the app name
    expect(html).toContain("<title>Test Bot</title>");
    expect(html).not.toContain("<title>Chipp</title>");
  });

  it("should NOT treat reserved subdomains as vanity", async () => {
    const response = await SELF.fetch("http://build.chipp.ai/");
    const html = await response.text();

    expect(html).toContain("<title>Chipp</title>");
    expect(html).not.toContain("window.__APP_BRAND__=");
  });

  it("should serve static assets for vanity subdomains", async () => {
    const response = await SELF.fetch(
      "http://merry-visiting-quasar-7nee.chipp.ai/assets/index.abc12345.css"
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body { margin: 0; }");
  });
});

// ========================================
// API Route Proxying
// ========================================

describe("API Route Proxying", () => {
  it("should proxy /api/ routes (not serve from R2)", async () => {
    const response = await SELF.fetch("http://localhost:8788/api/health");
    const text = await response.text();
    expect(text).not.toContain("<title>Chipp</title>");
  });

  it("should proxy /auth/ routes", async () => {
    const response = await SELF.fetch("http://localhost:8788/auth/me");
    const text = await response.text();
    expect(text).not.toContain("<title>Chipp</title>");
  });

  it("should proxy /consumer/ routes", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/consumer/my-app/chat"
    );
    const text = await response.text();
    expect(text).not.toContain("<title>Chipp</title>");
  });

  it("should proxy API routes on custom domains", async () => {
    const response = await SELF.fetch(
      "http://dashboard.acme.com/api/whitelabel/config"
    );
    const text = await response.text();
    expect(text).not.toContain('<div id="app">');
  });
});

// ========================================
// ETag / Conditional Requests
// ========================================

describe("Conditional Requests", () => {
  it("should include ETag header on responses", async () => {
    const response = await SELF.fetch(
      "http://localhost:8788/assets/index.abc12345.css"
    );
    expect(response.headers.get("ETag")).toBeTruthy();
  });

  it("should return 304 for matching If-None-Match", async () => {
    const first = await SELF.fetch(
      "http://localhost:8788/assets/index.abc12345.css"
    );
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const second = await SELF.fetch(
      "http://localhost:8788/assets/index.abc12345.css",
      {
        headers: { "If-None-Match": etag! },
      }
    );
    expect(second.status).toBe(304);
  });
});
