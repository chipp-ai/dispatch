/**
 * URL Validation Service Unit Tests
 *
 * Tests for SSRF prevention and URL validation logic.
 */

import { assertEquals } from "@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { validateUrl } from "./url-validation.service.ts";

describe("URL Validation Service", () => {
  describe("validateUrl", () => {
    it("accepts valid HTTPS URLs", async () => {
      const result = await validateUrl("https://api.example.com/v1/endpoint");

      assertEquals(result.isValid, true);
      assertEquals(result.error, undefined);
    });

    it("rejects HTTP URLs (except localhost in dev)", async () => {
      const originalEnv = Deno.env.get("ENVIRONMENT");
      
      // Test in production mode
      Deno.env.set("ENVIRONMENT", "production");
      const result = await validateUrl("http://api.example.com/v1/endpoint");

      assertEquals(result.isValid, false);
      assertEquals(result.error?.includes("HTTPS"), true);

      // Restore environment
      if (originalEnv) {
        Deno.env.set("ENVIRONMENT", originalEnv);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    });

    it("allows localhost HTTP in development", async () => {
      const originalEnv = Deno.env.get("ENVIRONMENT");
      Deno.env.set("ENVIRONMENT", "development");

      const result = await validateUrl("http://localhost:3000/api/test");

      assertEquals(result.isValid, true);

      if (originalEnv) {
        Deno.env.set("ENVIRONMENT", originalEnv);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    });

    it("rejects localhost in production", async () => {
      // Save original environment
      const originalEnv = Deno.env.get("ENVIRONMENT");
      
      try {
        // Set production mode
        Deno.env.set("ENVIRONMENT", "production");
        
        // Verify environment is set
        const envCheck = Deno.env.get("ENVIRONMENT");
        if (envCheck !== "production") {
          throw new Error(`Environment not set correctly: ${envCheck}`);
        }

        const result = await validateUrl("http://localhost:3000/api/test");

        assertEquals(result.isValid, false);
        assertEquals(result.error?.includes("localhost") || result.error?.includes("Localhost"), true);
      } finally {
        // Restore original environment
        if (originalEnv) {
          Deno.env.set("ENVIRONMENT", originalEnv);
        } else {
          Deno.env.delete("ENVIRONMENT");
        }
      }
    });

    it("rejects private IP addresses in production", async () => {
      const originalEnv = Deno.env.get("ENVIRONMENT");
      Deno.env.set("ENVIRONMENT", "production");

      const privateIPs = [
        "http://10.0.0.1/api",
        "http://172.16.0.1/api",
        "http://192.168.1.1/api",
      ];

      for (const url of privateIPs) {
        const result = await validateUrl(url);
        assertEquals(result.isValid, false, `Should reject ${url}`);
      }

      if (originalEnv) {
        Deno.env.set("ENVIRONMENT", originalEnv);
      } else {
        Deno.env.delete("ENVIRONMENT");
      }
    });

    it("rejects invalid URL format", async () => {
      const result = await validateUrl("not-a-url");

      assertEquals(result.isValid, false);
      assertEquals(result.error?.includes("Invalid URL"), true);
    });

    it("rejects URLs with invalid protocol", async () => {
      const result = await validateUrl("ftp://example.com/file");

      assertEquals(result.isValid, false);
    });

    it("accepts URLs with query parameters", async () => {
      const result = await validateUrl(
        "https://api.example.com/v1/data?param1=value1&param2=value2"
      );

      assertEquals(result.isValid, true);
    });

    it("accepts URLs with fragments", async () => {
      const result = await validateUrl("https://example.com/page#section");

      assertEquals(result.isValid, true);
    });

    it("accepts URLs with ports", async () => {
      const result = await validateUrl("https://api.example.com:8443/v1/endpoint");

      assertEquals(result.isValid, true);
    });

    it("handles URLs with authentication", async () => {
      const result = await validateUrl(
        "https://user:pass@api.example.com/v1/endpoint"
      );

      // Should still validate (auth is part of URL)
      assertEquals(result.isValid, true);
    });
  });
});

