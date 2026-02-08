/**
 * WhatsApp Integration Routes
 *
 * Endpoints for managing WhatsApp Business API integration:
 * - Status check
 * - Get/save config (with credentials)
 * - Disconnect
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { log } from "@/lib/logger.ts";
import type { AuthContext } from "../../middleware/auth.ts";
import { whatsappService } from "../../../services/whatsapp.service.ts";
import { applicationService } from "../../../services/application.service.ts";

// ========================================
// Schemas
// ========================================

const saveConfigSchema = z.object({
  applicationId: z.string().uuid(),
  phoneNumberId: z.string().regex(/^\d{15}$/, "Phone Number ID must be exactly 15 digits"),
  businessAccountId: z.string().regex(/^\d{15,16}$/, "Business Account ID must be 15-16 digits"),
  accessToken: z.string().min(32, "Access Token must be at least 32 characters"),
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

// ========================================
// Routes
// ========================================

export const whatsappRoutes = new Hono<AuthContext>()
  /**
   * GET /integrations/whatsapp/status?applicationId=<uuid>
   * Check if WhatsApp is connected for this application
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

    const config =
      await whatsappService.getConfigByApplicationId(applicationId);

    if (!config) {
      return c.json({
        connected: false,
        hasCredentials: false,
      });
    }

    return c.json({
      connected: config.isActive,
      hasCredentials: true,
      webhookUrl: `${getApiBaseUrl()}/api/webhooks/whatsapp/${applicationId}`,
      webhookSecret: config.webhookSecret,
    });
  })

  /**
   * GET /integrations/whatsapp/config?applicationId=<uuid>
   * Get WhatsApp config for editing (returns masked credentials)
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

    const config =
      await whatsappService.getConfigByApplicationId(applicationId);

    if (!config) {
      return c.json({ error: "Config not found" }, 404);
    }

    // Return config with masked sensitive data for display
    return c.json({
      applicationId: config.applicationId,
      webhookUrl: `${getApiBaseUrl()}/api/webhooks/whatsapp/${applicationId}`,
      webhookSecret: config.webhookSecret,
      isActive: config.isActive,
      // Don't return actual credentials - just indicate they exist
      hasPhoneNumberId: true,
      hasBusinessAccountId: true,
      hasAccessToken: true,
    });
  })

  /**
   * POST /integrations/whatsapp/config
   * Save WhatsApp credentials (create or update)
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

    // Check for duplicate phone number across other apps
    const duplicate = await whatsappService.checkDuplicatePhoneNumber(
      body.phoneNumberId,
      body.applicationId
    );
    if (duplicate) {
      return c.json({
        error:
          "These WhatsApp credentials are already in use with another application. Each WhatsApp phone number can only be connected to one app.",
      }, 400);
    }

    try {
      const config = await whatsappService.upsertConfig({
        applicationId: body.applicationId,
        phoneNumberId: body.phoneNumberId,
        businessAccountId: body.businessAccountId,
        accessToken: body.accessToken,
      });

      return c.json({
        success: true,
        webhookUrl: `${getApiBaseUrl()}/api/webhooks/whatsapp/${body.applicationId}`,
        webhookSecret: config.webhookSecret,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save config";
      log.error("Failed to save WhatsApp config", { source: "whatsapp-api", feature: "save-config", appId: body.applicationId, phoneNumberId: body.phoneNumberId }, err);
      return c.json({ error: message }, 500);
    }
  })

  /**
   * DELETE /integrations/whatsapp/disconnect?applicationId=<uuid>
   * Disconnect WhatsApp integration (soft delete)
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
      await whatsappService.softDeleteConfig(applicationId);
      return c.json({ success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect";
      log.error("Failed to disconnect WhatsApp", { source: "whatsapp-api", feature: "disconnect", appId: applicationId }, err);
      return c.json({ error: message }, 500);
    }
  });
