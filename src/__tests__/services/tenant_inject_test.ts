/**
 * Tenant Brand Injection Tests
 *
 * Regression tests for cloudflare-worker/src/tenant-inject.ts to ensure
 * whitelabel branding correctly replaces all Chipp assets.
 *
 * CRITICAL INVARIANT: When a tenant config is provided with full branding,
 * NO Chipp-specific assets (logo, title, favicon, colors) should remain
 * in the output HTML.
 *
 * USAGE:
 *   deno test src/__tests__/services/tenant_inject_test.ts --allow-all
 */

import { describe, it } from "jsr:@std/testing/bdd";
import { assertEquals, assert, assertStringIncludes } from "jsr:@std/assert";
import {
  injectTenantBranding,
  type TenantConfig,
} from "../../../cloudflare-worker/src/tenant-inject.ts";

// ========================================
// Test HTML (mirrors web/index.html structure)
// ========================================

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chipp</title>
    <style>:root { --app-brand-bg: #0a0a0a; }</style>
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
// Fixtures
// ========================================

function fullTenantConfig(
  overrides: Partial<TenantConfig> = {}
): TenantConfig {
  return {
    companyName: "Acme Corp",
    logoUrl: "https://cdn.acme.com/logo.png",
    faviconUrl: "https://cdn.acme.com/favicon.ico",
    primaryColor: "#FF5733",
    secondaryColor: "#C70039",
    slug: "acme",
    features: {},
    ...overrides,
  };
}

function minimalTenantConfig(
  overrides: Partial<TenantConfig> = {}
): TenantConfig {
  return {
    companyName: "Minimal Inc",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: null,
    secondaryColor: null,
    slug: "minimal",
    features: {},
    ...overrides,
  };
}

// ========================================
// Core Injection Tests
// ========================================

describe("injectTenantBranding", () => {
  describe("window.__TENANT_CONFIG__ injection", () => {
    it("should inject tenant config as script tag", () => {
      const config = fullTenantConfig();
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, "window.__TENANT_CONFIG__=");
    });

    it("should inject config immediately after <head>", () => {
      const config = fullTenantConfig();
      const result = injectTenantBranding(SAMPLE_HTML, config);

      const headIdx = result.indexOf("<head>");
      const scriptIdx = result.indexOf("window.__TENANT_CONFIG__=");
      assert(
        scriptIdx > headIdx && scriptIdx < headIdx + 100,
        "Config script should be near the top of <head>"
      );
    });

    it("should contain all config fields as valid JSON", () => {
      const config = fullTenantConfig();
      const result = injectTenantBranding(SAMPLE_HTML, config);

      const match = result.match(
        /window\.__TENANT_CONFIG__=(\{.*?\})<\/script>/
      );
      assert(match !== null, "Should find config JSON in script tag");

      const parsed = JSON.parse(match![1]);
      assertEquals(parsed.companyName, "Acme Corp");
      assertEquals(parsed.primaryColor, "#FF5733");
      assertEquals(parsed.slug, "acme");
      assertEquals(parsed.logoUrl, "https://cdn.acme.com/logo.png");
      assertEquals(parsed.faviconUrl, "https://cdn.acme.com/favicon.ico");
    });
  });

  describe("title replacement", () => {
    it("should replace Chipp title with tenant company name", () => {
      const config = fullTenantConfig({ companyName: "Acme Corp" });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, "<title>Acme Corp</title>");
      assert(
        !result.includes("<title>Chipp</title>"),
        "Original Chipp title should be gone"
      );
    });

    it("should escape HTML in company name", () => {
      const config = fullTenantConfig({
        companyName: 'Acme <script>alert("xss")</script>',
      });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assert(
        !result.includes('<title>Acme <script>alert("xss")</script></title>'),
        "Should not contain raw script injection in title"
      );
      assertStringIncludes(result, "&lt;script&gt;");
    });
  });

  describe("favicon replacement", () => {
    it("should replace default favicon with tenant favicon", () => {
      const config = fullTenantConfig({
        faviconUrl: "https://cdn.acme.com/favicon.ico",
      });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, 'href="https://cdn.acme.com/favicon.ico"');
    });

    it("should keep default favicon when tenant has none", () => {
      const config = minimalTenantConfig({ faviconUrl: null });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, 'href="/favicon.svg"');
    });
  });

  describe("CSS variable injection", () => {
    it("should inject --brand-color when primaryColor is set", () => {
      const config = fullTenantConfig({ primaryColor: "#FF5733" });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, "--brand-color:#FF5733");
    });

    it("should not inject brand style when primaryColor is null", () => {
      const config = minimalTenantConfig({ primaryColor: null });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assert(
        !result.includes("--brand-color:"),
        "Should not inject --brand-color when no primaryColor"
      );
    });

    it("should inject CSS before </head>", () => {
      const config = fullTenantConfig({ primaryColor: "#FF5733" });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      const brandIdx = result.indexOf("--brand-color:#FF5733");
      const headEndIdx = result.indexOf("</head>");
      assert(brandIdx < headEndIdx, "CSS variable should be before </head>");
    });
  });

  describe("splash logo replacement", () => {
    it("should replace Chipp logo with tenant logo", () => {
      const config = fullTenantConfig({
        logoUrl: "https://cdn.acme.com/logo.png",
      });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, 'src="https://cdn.acme.com/logo.png"');
      assert(
        !result.includes('src="/assets/chippylogo.svg"'),
        "Chipp logo reference should be replaced"
      );
    });

    it("should keep Chipp logo when tenant has no custom logo", () => {
      const config = minimalTenantConfig({ logoUrl: null });
      const result = injectTenantBranding(SAMPLE_HTML, config);

      assertStringIncludes(result, 'src="/assets/chippylogo.svg"');
    });
  });
});

// ========================================
// CRITICAL: Branding Leak Prevention
// ========================================

describe("Branding Leak Prevention (Regression)", () => {
  it("should not contain 'Chipp' in title when tenant has company name", () => {
    const config = fullTenantConfig({ companyName: "Acme Corp" });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    const titleMatch = result.match(/<title>(.*?)<\/title>/);
    assert(titleMatch !== null, "Should have a title tag");
    assert(
      !titleMatch![1].includes("Chipp"),
      `Title should not contain "Chipp", got: "${titleMatch![1]}"`
    );
  });

  it("should not reference chippylogo.svg when tenant has logo", () => {
    const config = fullTenantConfig({
      logoUrl: "https://cdn.acme.com/logo.png",
    });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    assert(
      !result.includes("chippylogo.svg"),
      "Should not reference chippylogo.svg when tenant logo is provided"
    );
  });

  it("should not reference default favicon when tenant has favicon", () => {
    const config = fullTenantConfig({
      faviconUrl: "https://cdn.acme.com/favicon.ico",
    });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    const faviconMatch = result.match(
      /<link rel="icon"[^>]*href="([^"]*)"[^>]*>/
    );
    if (faviconMatch) {
      assert(
        !faviconMatch[1].includes("favicon.svg"),
        `Favicon should not be default, got: "${faviconMatch[1]}"`
      );
    }
  });

  it("FULL BRANDING: no Chipp assets remain with complete tenant config", () => {
    const config = fullTenantConfig({
      companyName: "Acme Corp",
      logoUrl: "https://cdn.acme.com/logo.png",
      faviconUrl: "https://cdn.acme.com/favicon.ico",
      primaryColor: "#FF5733",
    });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    // Title must be tenant's
    assertStringIncludes(result, "<title>Acme Corp</title>");
    assert(!result.includes("<title>Chipp</title>"), "Chipp title should be gone");

    // Logo must be tenant's
    assert(!result.includes("chippylogo"), "No reference to chippylogo should remain");

    // Favicon must be tenant's
    assertStringIncludes(result, "https://cdn.acme.com/favicon.ico");

    // Brand color must be set
    assertStringIncludes(result, "--brand-color:#FF5733");

    // Tenant config must be injected
    assertStringIncludes(result, "window.__TENANT_CONFIG__");
  });

  it("should handle multiple Chipp references in complex HTML", () => {
    const complexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Chipp</title>
  </head>
  <body>
    <div id="initial-splash">
      <img src="/assets/chippylogo.svg" alt="Loading" />
    </div>
    <div id="app"></div>
  </body>
</html>`;

    const config = fullTenantConfig();
    const result = injectTenantBranding(complexHtml, config);

    assert(!result.includes("<title>Chipp</title>"), "Chipp title should be replaced");
    assert(!result.includes("chippylogo.svg"), "Chipp logo should be replaced");
  });
});

// ========================================
// Edge Cases
// ========================================

describe("Tenant Inject Edge Cases", () => {
  it("should handle empty company name gracefully", () => {
    const config = fullTenantConfig({ companyName: "" });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    // Empty string is falsy, so title should remain as Chipp
    assertStringIncludes(result, "<title>Chipp</title>");
  });

  it("should handle special characters in logo URL", () => {
    const config = fullTenantConfig({
      logoUrl: "https://cdn.example.com/logos/acme+corp%20logo.png?v=2&size=lg",
    });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    assertStringIncludes(result, "acme+corp%20logo.png?v=2&size=lg");
  });

  it("should not break when HTML has no title tag", () => {
    const noTitleHtml = `<html><head></head><body><img src="/assets/chippylogo.svg" /></body></html>`;
    const config = fullTenantConfig();

    const result = injectTenantBranding(noTitleHtml, config);
    assertStringIncludes(result, "window.__TENANT_CONFIG__");
  });

  it("should not break when HTML has no favicon link", () => {
    const noFaviconHtml = `<html><head><title>Chipp</title></head><body></body></html>`;
    const config = fullTenantConfig();

    const result = injectTenantBranding(noFaviconHtml, config);
    assertStringIncludes(result, "<title>Acme Corp</title>");
  });

  it("should preserve other HTML content unchanged", () => {
    const config = fullTenantConfig();
    const result = injectTenantBranding(SAMPLE_HTML, config);

    assertStringIncludes(result, '<div id="app"></div>');
    assertStringIncludes(result, '<script type="module" src="/src/main.ts">');
    assertStringIncludes(result, "<!DOCTYPE html>");
  });

  it("should handle tenant features in the config JSON", () => {
    const config = fullTenantConfig({
      features: {
        isGoogleAuthDisabled: true,
        isBillingDisabled: true,
      },
    });
    const result = injectTenantBranding(SAMPLE_HTML, config);

    const match = result.match(
      /window\.__TENANT_CONFIG__=(\{.*?\})<\/script>/
    );
    assert(match !== null, "Should find config JSON");
    const parsed = JSON.parse(match![1]);
    assertEquals(parsed.features.isGoogleAuthDisabled, true);
    assertEquals(parsed.features.isBillingDisabled, true);
  });
});
