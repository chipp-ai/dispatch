/**
 * Transactional Email Service Unit Tests
 *
 * Tests OTP template generation, from-email resolution fallback,
 * and send behavior when SMTP is not configured.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it, beforeEach } from "jsr:@std/testing/bdd";
import {
  sendOtpEmail,
  sendPasswordResetEmail,
  _testing,
  type EmailContext,
} from "./transactional-email.service.ts";

const defaultContext: EmailContext = {
  appName: "Test App",
  appId: "app-123",
  organizationId: "org-456",
  brandColor: "#FF5733",
};

// DB singleton leaks connections across tests; disable leak checks
describe("Transactional Email Service", { sanitizeResources: false, sanitizeOps: false }, () => {
  beforeEach(() => {
    // Reset transport singleton so each test starts fresh
    _testing.resetTransport();
  });

  describe("otpTemplate", () => {
    it("generates HTML with the OTP code", () => {
      const result = _testing.otpTemplate("123456", defaultContext);

      assertStringIncludes(result.html, "123456");
      assertStringIncludes(result.html, "Verify Your Email");
      assertStringIncludes(result.html, "10 minutes");
    });

    it("uses brand color for the OTP container border", () => {
      const result = _testing.otpTemplate("654321", defaultContext);

      assertStringIncludes(result.html, "border: 2px solid #FF5733");
    });

    it("falls back to black when no brand color provided", () => {
      const noBrandContext = { ...defaultContext, brandColor: "" };
      const result = _testing.otpTemplate("111111", noBrandContext);

      assertStringIncludes(result.html, "border: 2px solid #000000");
    });

    it("includes app name in footer", () => {
      const result = _testing.otpTemplate("222222", defaultContext);

      assertStringIncludes(result.html, "Test App");
      assertStringIncludes(result.text, "Test App");
    });

    it("generates plain text fallback with OTP code", () => {
      const result = _testing.otpTemplate("333333", defaultContext);

      assertStringIncludes(result.text, "Your verification code is: 333333");
      assertStringIncludes(result.text, "Verify Your Email");
      assertStringIncludes(result.text, "10 minutes");
    });

    it("includes text-shadow and overflow styles on OTP code", () => {
      const result = _testing.otpTemplate("444444", defaultContext);

      assertStringIncludes(result.html, "text-shadow: none");
      assertStringIncludes(result.html, "overflow: hidden");
      assertStringIncludes(result.html, "text-overflow: ellipsis");
    });

    it("includes timer emoji before expiry message", () => {
      const result = _testing.otpTemplate("555555", defaultContext);

      assertStringIncludes(result.html, "\u23F1\uFE0F This code expires in 10 minutes");
    });
  });

  describe("sendOtpEmail (no SMTP configured)", () => {
    it("returns true when SMTP is not configured (dev fallback)", async () => {
      // Ensure SMTP vars are not set
      const origHost = Deno.env.get("SMTP_HOST");
      const origUser = Deno.env.get("SMTP_USERNAME");
      const origPass = Deno.env.get("SMTP_PASSWORD");
      Deno.env.delete("SMTP_HOST");
      Deno.env.delete("SMTP_USERNAME");
      Deno.env.delete("SMTP_PASSWORD");

      try {
        const result = await sendOtpEmail({
          to: "user@example.com",
          otpCode: "999999",
          context: defaultContext,
        });

        // Should succeed (dev fallback logs to console)
        assertEquals(result, true);
      } finally {
        // Restore env vars
        if (origHost) Deno.env.set("SMTP_HOST", origHost);
        if (origUser) Deno.env.set("SMTP_USERNAME", origUser);
        if (origPass) Deno.env.set("SMTP_PASSWORD", origPass);
        _testing.resetTransport();
      }
    });

    it("formats subject with OTP code and app name", async () => {
      // Capture console.log output to verify subject
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      };

      // Ensure no SMTP and reset transport singleton
      const origHost = Deno.env.get("SMTP_HOST");
      const origUser = Deno.env.get("SMTP_USERNAME");
      const origPass = Deno.env.get("SMTP_PASSWORD");
      Deno.env.delete("SMTP_HOST");
      Deno.env.delete("SMTP_USERNAME");
      Deno.env.delete("SMTP_PASSWORD");
      _testing.resetTransport();

      try {
        await sendOtpEmail({
          to: "user@example.com",
          otpCode: "555555",
          context: defaultContext,
        });

        // Check that the log includes the subject format
        const subjectLog = logs.find((l) => l.includes("555555") && l.includes("Test App"));
        assertEquals(!!subjectLog, true, `Expected log with '555555' and 'Test App', got: ${logs.join(" | ")}`);
      } finally {
        console.log = origLog;
        if (origHost) Deno.env.set("SMTP_HOST", origHost);
        if (origUser) Deno.env.set("SMTP_USERNAME", origUser);
        if (origPass) Deno.env.set("SMTP_PASSWORD", origPass);
        _testing.resetTransport();
      }
    });
  });

  describe("passwordResetTemplate", () => {
    it("generates HTML with the reset URL as a button", () => {
      const result = _testing.passwordResetTemplate("https://example.com/reset?token=abc123", defaultContext);

      assertStringIncludes(result.html, "https://example.com/reset?token=abc123");
      assertStringIncludes(result.html, "Reset Your Password");
      assertStringIncludes(result.html, "Reset Password");
      assertStringIncludes(result.html, "1 hour");
    });

    it("uses brand color for the reset button", () => {
      const result = _testing.passwordResetTemplate("https://example.com/reset", defaultContext);

      assertStringIncludes(result.html, "background-color: #FF5733");
    });

    it("falls back to black when no brand color provided", () => {
      const noBrandContext = { ...defaultContext, brandColor: "" };
      const result = _testing.passwordResetTemplate("https://example.com/reset", noBrandContext);

      assertStringIncludes(result.html, "background-color: #000000");
    });

    it("includes app name in footer", () => {
      const result = _testing.passwordResetTemplate("https://example.com/reset", defaultContext);

      assertStringIncludes(result.html, "Test App");
      assertStringIncludes(result.text, "Test App");
    });

    it("generates plain text fallback with reset URL", () => {
      const result = _testing.passwordResetTemplate("https://example.com/reset?token=xyz", defaultContext);

      assertStringIncludes(result.text, "https://example.com/reset?token=xyz");
      assertStringIncludes(result.text, "Reset Your Password");
      assertStringIncludes(result.text, "1 hour");
    });

    it("includes timer emoji before expiry message", () => {
      const result = _testing.passwordResetTemplate("https://example.com/reset", defaultContext);

      assertStringIncludes(result.html, "\u23F1\uFE0F This link expires in 1 hour");
    });
  });

  describe("sendPasswordResetEmail (no SMTP configured)", () => {
    it("returns true when SMTP is not configured (dev fallback)", async () => {
      const origHost = Deno.env.get("SMTP_HOST");
      const origUser = Deno.env.get("SMTP_USERNAME");
      const origPass = Deno.env.get("SMTP_PASSWORD");
      Deno.env.delete("SMTP_HOST");
      Deno.env.delete("SMTP_USERNAME");
      Deno.env.delete("SMTP_PASSWORD");

      try {
        const result = await sendPasswordResetEmail({
          to: "user@example.com",
          resetUrl: "https://example.com/reset?token=test",
          context: defaultContext,
        });

        assertEquals(result, true);
      } finally {
        if (origHost) Deno.env.set("SMTP_HOST", origHost);
        if (origUser) Deno.env.set("SMTP_USERNAME", origUser);
        if (origPass) Deno.env.set("SMTP_PASSWORD", origPass);
        _testing.resetTransport();
      }
    });

    it("formats subject with app name", async () => {
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(JSON.stringify(args));
      };

      const origHost = Deno.env.get("SMTP_HOST");
      const origUser = Deno.env.get("SMTP_USERNAME");
      const origPass = Deno.env.get("SMTP_PASSWORD");
      Deno.env.delete("SMTP_HOST");
      Deno.env.delete("SMTP_USERNAME");
      Deno.env.delete("SMTP_PASSWORD");
      _testing.resetTransport();

      try {
        await sendPasswordResetEmail({
          to: "user@example.com",
          resetUrl: "https://example.com/reset?token=test",
          context: defaultContext,
        });

        const subjectLog = logs.find((l) => l.includes("Reset your Test App password"));
        assertEquals(!!subjectLog, true, `Expected log with 'Reset your Test App password', got: ${logs.join(" | ")}`);
      } finally {
        console.log = origLog;
        if (origHost) Deno.env.set("SMTP_HOST", origHost);
        if (origUser) Deno.env.set("SMTP_USERNAME", origUser);
        if (origPass) Deno.env.set("SMTP_PASSWORD", origPass);
        _testing.resetTransport();
      }
    });
  });

  describe("resolveFromAddress", () => {
    it("returns default from env vars when no tenant or domain", async () => {
      const origEmail = Deno.env.get("SMTP_FROM_EMAIL");
      const origName = Deno.env.get("SMTP_FROM_NAME");
      Deno.env.set("SMTP_FROM_EMAIL", "test@chipp.ai");
      Deno.env.set("SMTP_FROM_NAME", "Test Chipp");

      try {
        // This will fail the DB queries (no connection in test) and fall back to defaults
        const result = await _testing.resolveFromAddress(defaultContext);

        assertEquals(result.email, "test@chipp.ai");
        assertEquals(result.name, "Test Chipp");
      } finally {
        if (origEmail) Deno.env.set("SMTP_FROM_EMAIL", origEmail);
        else Deno.env.delete("SMTP_FROM_EMAIL");
        if (origName) Deno.env.set("SMTP_FROM_NAME", origName);
        else Deno.env.delete("SMTP_FROM_NAME");
      }
    });

    it("returns fallback defaults when env vars not set", async () => {
      const origEmail = Deno.env.get("SMTP_FROM_EMAIL");
      const origName = Deno.env.get("SMTP_FROM_NAME");
      Deno.env.delete("SMTP_FROM_EMAIL");
      Deno.env.delete("SMTP_FROM_NAME");

      try {
        const result = await _testing.resolveFromAddress(defaultContext);

        assertEquals(result.email, "noreply@chipp.ai");
        assertEquals(result.name, "Chipp");
      } finally {
        if (origEmail) Deno.env.set("SMTP_FROM_EMAIL", origEmail);
        if (origName) Deno.env.set("SMTP_FROM_NAME", origName);
      }
    });
  });
});
