/**
 * MCP Integration Service
 *
 * CRUD operations for application_integrations records (MCP servers).
 * Uses Kysely for type-safe PostgreSQL queries.
 * Handles encryption of auth credentials.
 */

import { db } from "../db/client.ts";
import { encrypt } from "./crypto.service.ts";

export interface McpIntegration {
  id: string;
  name: string | null;
  logo: string | null;
  isActive: boolean;
  applicationId: string;
  mcpServerUrl: string;
  mcpTransport: string;
  mcpAuthType: string;
  mcpToolCache: unknown | null;
  actions: McpIntegrationAction[];
}

export interface McpIntegrationAction {
  id: string;
  name: string | null;
  isActive: boolean;
  remoteToolName: string | null;
  schemaSnapshot: unknown | null;
}

export interface SaveMcpIntegrationParams {
  applicationId: string;
  integrationId?: string;
  name?: string;
  logo?: string;
  serverUrl: string;
  transport?: string;
  authType?: string;
  authConfig?: Record<string, unknown>;
  selectedTools?: Array<{
    name: string;
    schemaSnapshot?: unknown;
  }>;
  isActive?: boolean;
}

export const mcpIntegrationService = {
  /**
   * List all MCP integrations for an application.
   */
  async listForApp(applicationId: string): Promise<McpIntegration[]> {
    const integrations = await db
      .selectFrom("app.application_integrations")
      .select([
        "id",
        "name",
        "logo",
        "isActive",
        "applicationId",
        "mcpServerUrl",
        "mcpTransport",
        "mcpAuthType",
        "mcpToolCache",
      ])
      .where("applicationId", "=", applicationId)
      .where("mcpServerUrl", "is not", null)
      .orderBy("createdAt", "desc")
      .execute();

    const results: McpIntegration[] = [];

    for (const row of integrations) {
      const actions = await db
        .selectFrom("app.integration_actions")
        .select(["id", "name", "isActive", "remoteToolName", "schemaSnapshot"])
        .where("integrationId", "=", row.id)
        .where("isActive", "=", true)
        .execute();

      results.push({
        id: row.id,
        name: row.name,
        logo: row.logo,
        isActive: row.isActive ?? false,
        applicationId: row.applicationId,
        mcpServerUrl: row.mcpServerUrl || "",
        mcpTransport: row.mcpTransport || "http",
        mcpAuthType: row.mcpAuthType || "",
        mcpToolCache: row.mcpToolCache
          ? tryParseJson(row.mcpToolCache as string)
          : null,
        actions: actions.map((a) => ({
          id: a.id,
          name: a.name,
          isActive: a.isActive ?? false,
          remoteToolName: a.remoteToolName,
          schemaSnapshot: a.schemaSnapshot
            ? tryParseJson(a.schemaSnapshot as string)
            : null,
        })),
      });
    }

    return results;
  },

  /**
   * Save (create or update) an MCP integration.
   */
  async save(params: SaveMcpIntegrationParams): Promise<McpIntegration> {
    const {
      applicationId,
      integrationId,
      name = "MCP Integration",
      logo,
      serverUrl,
      transport = "http",
      authType = "",
      authConfig = {},
      selectedTools = [],
      isActive = true,
    } = params;

    // Encrypt auth config
    const encryptedAuth =
      Object.keys(authConfig).length > 0
        ? await encrypt(JSON.stringify(authConfig))
        : null;

    let id: string;

    if (integrationId) {
      // Update existing
      await db
        .updateTable("app.application_integrations")
        .set({
          name,
          logo: logo ?? null,
          isActive,
          mcpServerUrl: serverUrl,
          mcpTransport: transport,
          mcpAuthType: authType,
          mcpAuthConfig: encryptedAuth,
          updatedAt: new Date(),
        })
        .where("id", "=", integrationId)
        .where("applicationId", "=", applicationId)
        .execute();
      id = integrationId;
    } else {
      // Create new
      const result = await db
        .insertInto("app.application_integrations")
        .values({
          name,
          logo: logo ?? null,
          isActive,
          applicationId,
          mcpServerUrl: serverUrl,
          mcpTransport: transport,
          mcpAuthType: authType,
          mcpAuthConfig: encryptedAuth,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      id = result.id;
    }

    // Sync tools
    if (selectedTools.length > 0) {
      // Deactivate all existing actions for this integration
      await db
        .updateTable("app.integration_actions")
        .set({ isActive: false, updatedAt: new Date() })
        .where("integrationId", "=", id)
        .execute();

      // Upsert selected tools
      for (const tool of selectedTools) {
        const existing = await db
          .selectFrom("app.integration_actions")
          .select("id")
          .where("integrationId", "=", id)
          .where("remoteToolName", "=", tool.name)
          .executeTakeFirst();

        const schemaJson = tool.schemaSnapshot
          ? JSON.stringify(tool.schemaSnapshot)
          : null;

        if (existing) {
          await db
            .updateTable("app.integration_actions")
            .set({
              name: tool.name,
              isActive: true,
              schemaSnapshot: schemaJson,
              updatedAt: new Date(),
            })
            .where("id", "=", existing.id)
            .execute();
        } else {
          await db
            .insertInto("app.integration_actions")
            .values({
              name: tool.name,
              isActive: true,
              integrationId: id,
              remoteToolName: tool.name,
              schemaSnapshot: schemaJson,
            })
            .execute();
        }
      }
    }

    // Return the saved integration
    const saved = await db
      .selectFrom("app.application_integrations")
      .select([
        "id",
        "name",
        "logo",
        "isActive",
        "applicationId",
        "mcpServerUrl",
        "mcpTransport",
        "mcpAuthType",
        "mcpToolCache",
      ])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();

    const actions = await db
      .selectFrom("app.integration_actions")
      .select(["id", "name", "isActive", "remoteToolName", "schemaSnapshot"])
      .where("integrationId", "=", id)
      .where("isActive", "=", true)
      .execute();

    return {
      id: saved.id,
      name: saved.name,
      logo: saved.logo,
      isActive: saved.isActive ?? false,
      applicationId: saved.applicationId,
      mcpServerUrl: saved.mcpServerUrl || "",
      mcpTransport: saved.mcpTransport || "http",
      mcpAuthType: saved.mcpAuthType || "",
      mcpToolCache: saved.mcpToolCache
        ? tryParseJson(saved.mcpToolCache as string)
        : null,
      actions: actions.map((a) => ({
        id: a.id,
        name: a.name,
        isActive: a.isActive ?? false,
        remoteToolName: a.remoteToolName,
        schemaSnapshot: a.schemaSnapshot
          ? tryParseJson(a.schemaSnapshot as string)
          : null,
      })),
    };
  },

  /**
   * Delete an MCP integration and its actions.
   * Actions cascade-delete via FK constraint.
   */
  async delete(integrationId: string, applicationId: string): Promise<void> {
    await db
      .deleteFrom("app.application_integrations")
      .where("id", "=", integrationId)
      .where("applicationId", "=", applicationId)
      .execute();
  },

  /**
   * Toggle integration active state.
   */
  async toggle(
    integrationId: string,
    applicationId: string,
    isActive: boolean
  ): Promise<void> {
    await db
      .updateTable("app.application_integrations")
      .set({ isActive, updatedAt: new Date() })
      .where("id", "=", integrationId)
      .where("applicationId", "=", applicationId)
      .execute();
  },
};

function tryParseJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
