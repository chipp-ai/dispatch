/**
 * MCP Integration Routes
 *
 * Endpoints for testing connections to MCP servers,
 * saving integrations, and listing existing integrations.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { log } from "@/lib/logger.ts";
import type { AuthContext } from "../../middleware/auth.ts";
import { mcpIntegrationService } from "../../../services/mcp-integration.service.ts";
import { testMcpConnection } from "../../../services/mcp-client.service.ts";
import { applicationService } from "../../../services/application.service.ts";
import { slackRoutes } from "./slack.ts";
import { whatsappRoutes } from "./whatsapp.ts";
import { emailRoutes } from "./email.ts";

const testConnectionSchema = z.object({
  applicationId: z.string().uuid(),
  serverUrl: z.string().url(),
  transport: z.enum(["http", "sse"]).optional().default("http"),
  authType: z.string().optional().default(""),
  authConfig: z.record(z.unknown()).optional().default({}),
});

const saveIntegrationSchema = z.object({
  applicationId: z.string().uuid(),
  integrationId: z.string().uuid().optional(),
  name: z.string().optional(),
  logo: z.string().optional(),
  serverUrl: z.string().url(),
  transport: z.enum(["http", "sse"]).optional().default("http"),
  authType: z.string().optional().default(""),
  authConfig: z.record(z.unknown()).optional().default({}),
  selectedTools: z
    .array(
      z.object({
        name: z.string(),
        schemaSnapshot: z.unknown().optional(),
      })
    )
    .optional()
    .default([]),
  isActive: z.boolean().optional().default(true),
});

const deleteIntegrationSchema = z.object({
  applicationId: z.string().uuid(),
  integrationId: z.string().uuid(),
});

const toggleIntegrationSchema = z.object({
  applicationId: z.string().uuid(),
  integrationId: z.string().uuid(),
  isActive: z.boolean(),
});

export const integrationRoutes = new Hono<AuthContext>();

/**
 * Slack integration routes - /integrations/slack
 * OAuth flow, credentials, and status management.
 */
integrationRoutes.route("/slack", slackRoutes);

/**
 * WhatsApp integration routes - /integrations/whatsapp
 * Credentials management, status, and disconnect.
 */
integrationRoutes.route("/whatsapp", whatsappRoutes);

/**
 * Email integration routes - /integrations/email
 * Postmark configuration, whitelist management, and disconnect.
 */
integrationRoutes.route("/email", emailRoutes);

/**
 * GET /integrations/mcp?applicationId=<uuid>
 * List MCP integrations for an app.
 */
integrationRoutes.get("/mcp", async (c) => {
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

  const integrations = await mcpIntegrationService.listForApp(applicationId);
  return c.json({ data: integrations });
});

/**
 * POST /integrations/mcp/test-connection
 * Test connection to an MCP server and list its tools.
 */
integrationRoutes.post(
  "/mcp/test-connection",
  zValidator("json", testConnectionSchema),
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
      const { tools, durationMs } = await testMcpConnection({
        serverUrl: body.serverUrl,
        transport: body.transport,
        authType: body.authType,
        authConfig: body.authConfig as Record<string, string>,
      });

      return c.json({
        ok: true,
        tools,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      return c.json({ ok: false, error: message }, 400);
    }
  }
);

/**
 * POST /integrations/mcp/save
 * Save (create or update) an MCP integration.
 */
integrationRoutes.post(
  "/mcp/save",
  zValidator("json", saveIntegrationSchema),
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
      const integration = await mcpIntegrationService.save({
        applicationId: body.applicationId,
        integrationId: body.integrationId,
        name: body.name,
        logo: body.logo,
        serverUrl: body.serverUrl,
        transport: body.transport,
        authType: body.authType,
        authConfig: body.authConfig,
        selectedTools: body.selectedTools,
        isActive: body.isActive,
      });

      return c.json({ ok: true, integration });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save integration";
      log.error("Failed to save MCP integration", { source: "integrations-api", feature: "mcp-save", applicationId: body.applicationId, integrationId: body.integrationId }, err);
      return c.json({ ok: false, error: message }, 500);
    }
  }
);

/**
 * POST /integrations/mcp/delete
 * Delete an MCP integration.
 */
integrationRoutes.post(
  "/mcp/delete",
  zValidator("json", deleteIntegrationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      await applicationService.get(body.applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    await mcpIntegrationService.delete(body.integrationId, body.applicationId);
    return c.json({ ok: true });
  }
);

/**
 * POST /integrations/mcp/toggle
 * Toggle an MCP integration active/inactive.
 */
integrationRoutes.post(
  "/mcp/toggle",
  zValidator("json", toggleIntegrationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      await applicationService.get(body.applicationId, user.id);
    } catch {
      return c.json({ error: "Not found" }, 404);
    }

    await mcpIntegrationService.toggle(
      body.integrationId,
      body.applicationId,
      body.isActive
    );
    return c.json({ ok: true });
  }
);
