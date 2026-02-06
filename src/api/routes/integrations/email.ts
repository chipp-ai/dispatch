/**
 * Email Integration Routes
 *
 * Endpoints for managing Postmark email integration:
 * - Status check
 * - Get/save config
 * - Toggle whitelist
 * - Manage whitelisted emails
 * - Disconnect
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import { emailService } from "../../../services/email.service.ts";
import { applicationService } from "../../../services/application.service.ts";

// ========================================
// Schemas
// ========================================

const saveConfigSchema = z.object({
  applicationId: z.string().uuid(),
  inboundEmailAddress: z.string().email("Invalid inbound email address"),
  fromEmailAddress: z.string().email("Invalid from email address"),
  fromEmailName: z.string().min(1, "From name is required").max(100),
  postmarkServerToken: z.string().optional(),
  useSharedInfrastructure: z.boolean().optional().default(true),
  enableWhitelist: z.boolean().optional().default(true),
});

const toggleWhitelistSchema = z.object({
  applicationId: z.string().uuid(),
  enableWhitelist: z.boolean(),
});

const manageWhitelistSchema = z.object({
  applicationId: z.string().uuid(),
  email: z.string().email("Invalid email address"),
});

// ========================================
// Helper Functions
// ========================================

function getApiBaseUrl(): string {
  const env = Deno.env.get("ENVIRONMENT") || "development";
  if (env === "production") {
    return "https://dino-mullet.chipp.ai";
  } else if (env === "staging") {
    return "https://staging-dino-mullet.chipp.ai";
  }
  return "http://localhost:8000";
}

function getSharedDomain(): string {
  return Deno.env.get("POSTMARK_SHARED_DOMAIN") || "chipp.ai";
}

// ========================================
// Routes
// ========================================

export const emailRoutes = new Hono<AuthContext>()
  /**
   * GET /integrations/email/status?applicationId=<uuid>
   * Check if email integration is connected for this application
   */
  .get("/status", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json({ error: "applicationId is required" }, 400);
    }

    const user = c.get("user");

    // Verify user has access to this app
    try {
      await applicationService.get(applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    const config = await emailService.getConfigByApplicationId(applicationId);

    if (!config) {
      return c.json({
        connected: false,
        hasCredentials: false,
        sharedDomain: getSharedDomain(),
      });
    }

    // Get decrypted credentials to return webhook token
    const credentials =
      await emailService.getDecryptedCredentials(applicationId);

    return c.json({
      connected: config.isActive,
      hasCredentials: true,
      inboundEmailAddress: config.inboundEmailAddress,
      fromEmailAddress: config.fromEmailAddress,
      fromEmailName: config.fromEmailName,
      useSharedInfrastructure: config.useSharedInfrastructure,
      enableWhitelist: config.enableWhitelist,
      webhookUrl: config.useSharedInfrastructure
        ? null
        : `${getApiBaseUrl()}/api/webhooks/email/${applicationId}`,
      webhookToken: config.useSharedInfrastructure
        ? null
        : credentials?.webhookPassword || null,
      sharedDomain: getSharedDomain(),
    });
  })

  /**
   * GET /integrations/email/config?applicationId=<uuid>
   * Get email config for editing (returns masked credentials)
   */
  .get("/config", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json({ error: "applicationId is required" }, 400);
    }

    const user = c.get("user");

    // Verify user has access to this app
    try {
      await applicationService.get(applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    const config = await emailService.getConfigByApplicationId(applicationId);

    if (!config) {
      return c.json({ error: "Config not found" }, 404);
    }

    // Get decrypted credentials for webhook token
    const credentials =
      await emailService.getDecryptedCredentials(applicationId);

    // Return config (credentials are masked)
    return c.json({
      applicationId: config.applicationId,
      inboundEmailAddress: config.inboundEmailAddress,
      fromEmailAddress: config.fromEmailAddress,
      fromEmailName: config.fromEmailName,
      useSharedInfrastructure: config.useSharedInfrastructure,
      enableWhitelist: config.enableWhitelist,
      isActive: config.isActive,
      webhookUrl: config.useSharedInfrastructure
        ? null
        : `${getApiBaseUrl()}/api/webhooks/email/${applicationId}`,
      webhookToken: config.useSharedInfrastructure
        ? null
        : credentials?.webhookPassword || null,
      hasPostmarkToken: !!config.postmarkServerToken,
    });
  })

  /**
   * POST /integrations/email/config
   * Save email configuration (create or update)
   */
  .post("/config", zValidator("json", saveConfigSchema), async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Verify user has access to this app
    try {
      await applicationService.get(body.applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    try {
      const config = await emailService.upsertConfig({
        applicationId: body.applicationId,
        inboundEmailAddress: body.inboundEmailAddress,
        fromEmailAddress: body.fromEmailAddress,
        fromEmailName: body.fromEmailName,
        postmarkServerToken: body.postmarkServerToken,
        useSharedInfrastructure: body.useSharedInfrastructure,
        enableWhitelist: body.enableWhitelist,
      });

      // Get decrypted credentials for webhook token
      const credentials = await emailService.getDecryptedCredentials(
        body.applicationId
      );

      return c.json({
        success: true,
        inboundEmailAddress: config.inboundEmailAddress,
        webhookUrl: config.useSharedInfrastructure
          ? null
          : `${getApiBaseUrl()}/api/webhooks/email/${body.applicationId}`,
        webhookToken: config.useSharedInfrastructure
          ? null
          : credentials?.webhookPassword || null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save config";
      console.error("[Email] Save config error:", err);
      Sentry.captureException(err, {
        tags: { source: "email-api", feature: "save-config" },
        extra: { appId: body.applicationId },
      });
      return c.json({ error: message }, 500);
    }
  })

  /**
   * POST /integrations/email/toggle-whitelist
   * Toggle the whitelist setting
   */
  .post(
    "/toggle-whitelist",
    zValidator("json", toggleWhitelistSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");

      // Verify user has access to this app
      try {
        await applicationService.get(body.applicationId, user.id);
      } catch {
        return c.json({ error: "Not found" }, 404);
      }

      try {
        await emailService.toggleWhitelist(
          body.applicationId,
          body.enableWhitelist
        );
        return c.json({ success: true, enableWhitelist: body.enableWhitelist });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to toggle whitelist";
        console.error("[Email] Toggle whitelist error:", err);
        Sentry.captureException(err, {
          tags: { source: "email-api", feature: "toggle-whitelist" },
          extra: { appId: body.applicationId, enableWhitelist: body.enableWhitelist },
        });
        return c.json({ error: message }, 500);
      }
    }
  )

  /**
   * GET /integrations/email/whitelist?applicationId=<uuid>
   * Get all whitelisted emails
   */
  .get("/whitelist", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json({ error: "applicationId is required" }, 400);
    }

    const user = c.get("user");

    // Verify user has access to this app
    try {
      await applicationService.get(applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    const emails = await emailService.getWhitelistedEmails(applicationId);
    return c.json({ emails });
  })

  /**
   * POST /integrations/email/whitelist/add
   * Add an email to the whitelist
   */
  .post(
    "/whitelist/add",
    zValidator("json", manageWhitelistSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");

      // Verify user has access to this app
      try {
        await applicationService.get(body.applicationId, user.id);
      } catch {
        return c.json({ error: "Not found" }, 404);
      }

      try {
        await emailService.addToWhitelist(body.applicationId, body.email);
        return c.json({ success: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add to whitelist";
        console.error("[Email] Add to whitelist error:", err);
        Sentry.captureException(err, {
          tags: { source: "email-api", feature: "add-to-whitelist" },
          extra: { appId: body.applicationId, email: body.email },
        });
        return c.json({ error: message }, 500);
      }
    }
  )

  /**
   * POST /integrations/email/whitelist/remove
   * Remove an email from the whitelist
   */
  .post(
    "/whitelist/remove",
    zValidator("json", manageWhitelistSchema),
    async (c) => {
      const user = c.get("user");
      const body = c.req.valid("json");

      // Verify user has access to this app
      try {
        await applicationService.get(body.applicationId, user.id);
      } catch {
        return c.json({ error: "Not found" }, 404);
      }

      try {
        await emailService.removeFromWhitelist(body.applicationId, body.email);
        return c.json({ success: true });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to remove from whitelist";
        console.error("[Email] Remove from whitelist error:", err);
        Sentry.captureException(err, {
          tags: { source: "email-api", feature: "remove-from-whitelist" },
          extra: { appId: body.applicationId, email: body.email },
        });
        return c.json({ error: message }, 500);
      }
    }
  )

  /**
   * DELETE /integrations/email/disconnect?applicationId=<uuid>
   * Disconnect email integration (soft delete)
   */
  .delete("/disconnect", async (c) => {
    const applicationId = c.req.query("applicationId");
    if (!applicationId) {
      return c.json({ error: "applicationId is required" }, 400);
    }

    const user = c.get("user");

    // Verify user has access to this app
    try {
      await applicationService.get(applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    try {
      await emailService.softDeleteConfig(applicationId);
      return c.json({ success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect";
      console.error("[Email] Disconnect error:", err);
      Sentry.captureException(err, {
        tags: { source: "email-api", feature: "disconnect" },
        extra: { appId: applicationId },
      });
      return c.json({ error: message }, 500);
    }
  });
