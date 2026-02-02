/**
 * Domain Service
 *
 * Business logic for custom domain operations.
 * Handles Cloudflare for SaaS integration and domain mappings.
 */

import { db } from "../db/client.ts";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExternalServiceError,
  ValidationError,
} from "../utils/errors.ts";
import * as Sentry from "@sentry/deno";
import type { CustomDomainType, CustomDomainSslStatus } from "../db/schema.ts";

// ========================================
// Types
// ========================================

export interface CustomDomain {
  id: string;
  hostname: string;
  type: CustomDomainType;
  appId: string | null;
  tenantId: string | null;
  organizationId: string | null;
  cloudflareId: string | null;
  sslStatus: CustomDomainSslStatus;
  dcvToken: string | null;
  brandStyles: BrandStyles | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandStyles {
  primaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  companyName?: string;
}

export interface DomainMapping {
  type: CustomDomainType;
  appId?: string;
  appNameId?: string;
  tenantId?: string;
  tenantSlug?: string;
  brandStyles?: BrandStyles;
  features?: {
    isGoogleAuthDisabled?: boolean;
    isMicrosoftAuthDisabled?: boolean;
    isBillingDisabled?: boolean;
    isMarketplaceDisabled?: boolean;
  };
}

export interface RegisterDomainParams {
  hostname: string;
  type: CustomDomainType;
  appId?: string;
  tenantId?: string;
  organizationId: string;
}

export interface RegisterDomainResult {
  domain: CustomDomain;
  dnsRecords: Array<{
    type: string;
    name: string;
    value: string;
  }>;
}

interface CloudflareCustomHostnameResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result?: {
    id: string;
    hostname: string;
    ssl: {
      status: string;
      method: string;
      type: string;
      dcv_delegation_records?: Array<{
        cname_target: string;
      }>;
    };
  };
}

// ========================================
// Environment Config
// ========================================

function getCloudflareConfig() {
  const zoneId = Deno.env.get("CLOUDFLARE_ZONE_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const kvNamespaceId = Deno.env.get("CLOUDFLARE_KV_NAMESPACE_ID");

  if (!zoneId || !apiToken) {
    throw new Error(
      "Missing Cloudflare configuration: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are required"
    );
  }

  return { zoneId, apiToken, accountId, kvNamespaceId };
}

// ========================================
// Service
// ========================================

export const domainService = {
  /**
   * Register a new custom domain
   */
  async register(params: RegisterDomainParams): Promise<RegisterDomainResult> {
    const { hostname, type, appId, tenantId, organizationId } = params;

    // Check if hostname already exists
    const existing = await db
      .selectFrom("app.custom_domains")
      .select(["id"])
      .where("hostname", "=", hostname)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictError(`Domain "${hostname}" is already registered`);
    }

    // Validate type-specific requirements
    if (type === "chat" && !appId) {
      throw new ValidationError("appId is required for chat domains");
    }
    if (type === "dashboard" && !tenantId) {
      throw new ValidationError("tenantId is required for dashboard domains");
    }

    // Create custom hostname in Cloudflare
    const cfResult = await this.createCloudflareHostname(hostname);

    // Store in database
    const [domain] = await db
      .insertInto("app.custom_domains")
      .values({
        hostname,
        type,
        appId: appId ?? null,
        tenantId: tenantId ?? null,
        organizationId,
        cloudflareId: cfResult.id,
        sslStatus: "pending",
        dcvToken: cfResult.dcvToken ?? null,
        brandStyles: null,
      })
      .returningAll()
      .execute();

    // Build DNS records for customer
    const dnsRecords = [
      {
        type: "CNAME",
        name: hostname,
        value: "custom.chipp.ai",
      },
    ];

    if (cfResult.dcvToken) {
      dnsRecords.push({
        type: "CNAME",
        name: `_cf-custom-hostname.${hostname}`,
        value: cfResult.dcvToken,
      });
    }

    return {
      domain: this.mapToCustomDomain(domain),
      dnsRecords,
    };
  },

  /**
   * Get domain by hostname
   */
  async getByHostname(hostname: string): Promise<CustomDomain> {
    const domain = await db
      .selectFrom("app.custom_domains")
      .selectAll()
      .where("hostname", "=", hostname)
      .executeTakeFirst();

    if (!domain) {
      throw new NotFoundError("Domain", hostname);
    }

    return this.mapToCustomDomain(domain);
  },

  /**
   * Get domain by ID
   */
  async get(id: string): Promise<CustomDomain> {
    const domain = await db
      .selectFrom("app.custom_domains")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!domain) {
      throw new NotFoundError("Domain", id);
    }

    return this.mapToCustomDomain(domain);
  },

  /**
   * List domains for an organization
   */
  async listForOrganization(organizationId: string): Promise<CustomDomain[]> {
    const domains = await db
      .selectFrom("app.custom_domains")
      .selectAll()
      .where("organizationId", "=", organizationId)
      .orderBy("createdAt", "desc")
      .execute();

    return domains.map(this.mapToCustomDomain);
  },

  /**
   * List domains for an app
   */
  async listForApp(appId: string): Promise<CustomDomain[]> {
    const domains = await db
      .selectFrom("app.custom_domains")
      .selectAll()
      .where("appId", "=", appId)
      .orderBy("createdAt", "desc")
      .execute();

    return domains.map(this.mapToCustomDomain);
  },

  /**
   * Check and update SSL status from Cloudflare
   */
  async refreshSslStatus(hostname: string): Promise<CustomDomain> {
    const domain = await this.getByHostname(hostname);

    if (!domain.cloudflareId) {
      throw new ValidationError("Domain has no Cloudflare ID");
    }

    const cfStatus = await this.getCloudflareHostnameStatus(
      domain.cloudflareId
    );

    // Update local status if changed
    if (cfStatus !== domain.sslStatus) {
      await db
        .updateTable("app.custom_domains")
        .set({
          sslStatus: cfStatus,
          updatedAt: new Date(),
        })
        .where("hostname", "=", hostname)
        .execute();
    }

    return {
      ...domain,
      sslStatus: cfStatus,
    };
  },

  /**
   * Update brand styles for a domain
   */
  async updateBrandStyles(
    hostname: string,
    brandStyles: BrandStyles
  ): Promise<CustomDomain> {
    const domain = await this.getByHostname(hostname);

    await db
      .updateTable("app.custom_domains")
      .set({
        brandStyles,
        updatedAt: new Date(),
      })
      .where("hostname", "=", hostname)
      .execute();

    // Update KV cache
    await this.updateKvMapping(hostname);

    return {
      ...domain,
      brandStyles,
      updatedAt: new Date(),
    };
  },

  /**
   * Delete a custom domain
   */
  async delete(hostname: string): Promise<void> {
    const domain = await this.getByHostname(hostname);

    // Delete from Cloudflare first
    if (domain.cloudflareId) {
      await this.deleteCloudflareHostname(domain.cloudflareId);
    }

    // Delete from KV
    await this.deleteKvMapping(hostname);

    // Delete from database
    await db
      .deleteFrom("app.custom_domains")
      .where("hostname", "=", hostname)
      .execute();
  },

  /**
   * Look up domain mapping for Cloudflare Worker
   * This is the internal endpoint the Worker calls for unknown domains
   */
  async lookupForWorker(hostname: string): Promise<DomainMapping | null> {
    const domain = await db
      .selectFrom("app.custom_domains")
      .selectAll()
      .where("hostname", "=", hostname)
      .where("sslStatus", "=", "active")
      .executeTakeFirst();

    if (!domain) {
      return null;
    }

    const mapping: DomainMapping = {
      type: domain.type,
    };

    // Enrich with app data
    if (domain.type === "chat" && domain.appId) {
      const app = await db
        .selectFrom("app.applications")
        .select(["id", "appNameId", "brandStyles"])
        .where("id", "=", domain.appId)
        .executeTakeFirst();

      if (app) {
        mapping.appId = app.id;
        mapping.appNameId = app.appNameId;
        mapping.brandStyles = (app.brandStyles as BrandStyles) ?? undefined;
      }
    }

    // Enrich with tenant data (from WhitelabelSettings or similar)
    if (domain.type === "dashboard" && domain.tenantId) {
      // For now, use cached brandStyles from domain
      // In the future, could join with whitelabel_settings table
      mapping.tenantId = domain.tenantId;
      mapping.brandStyles = (domain.brandStyles as BrandStyles) ?? undefined;
    }

    return mapping;
  },

  /**
   * Verify user has permission to manage domain
   */
  async verifyOwnership(
    userId: string,
    hostname: string
  ): Promise<CustomDomain> {
    const domain = await this.getByHostname(hostname);

    // Get user's organization
    const user = await db
      .selectFrom("app.users")
      .select(["organizationId", "role"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new ForbiddenError("User not found");
    }

    // Check if domain belongs to user's organization
    if (domain.organizationId !== user.organizationId) {
      throw new ForbiddenError("Not authorized to manage this domain");
    }

    return domain;
  },

  // ========================================
  // Cloudflare API Helpers
  // ========================================

  async createCloudflareHostname(
    hostname: string
  ): Promise<{ id: string; dcvToken: string | null }> {
    const { zoneId, apiToken } = getCloudflareConfig();

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostname,
          ssl: {
            method: "cname",
            type: "dv",
          },
        }),
      }
    );

    const data: CloudflareCustomHostnameResponse = await response.json();

    if (!data.success || !data.result) {
      const errorMsg = data.errors?.[0]?.message ?? "Unknown Cloudflare error";
      throw new ExternalServiceError("Cloudflare", errorMsg);
    }

    return {
      id: data.result.id,
      dcvToken:
        data.result.ssl.dcv_delegation_records?.[0]?.cname_target ?? null,
    };
  },

  async getCloudflareHostnameStatus(
    cloudflareId: string
  ): Promise<CustomDomainSslStatus> {
    const { zoneId, apiToken } = getCloudflareConfig();

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${cloudflareId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    const data: CloudflareCustomHostnameResponse = await response.json();

    if (!data.success || !data.result) {
      return "failed";
    }

    const cfStatus = data.result.ssl.status;

    // Map Cloudflare status to our status
    switch (cfStatus) {
      case "active":
        return "active";
      case "pending_validation":
      case "pending_issuance":
      case "pending_deployment":
        return "pending";
      case "expired":
        return "expired";
      default:
        return "pending";
    }
  },

  async deleteCloudflareHostname(cloudflareId: string): Promise<void> {
    const { zoneId, apiToken } = getCloudflareConfig();

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/${cloudflareId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[domain] Failed to delete Cloudflare hostname:",
        errorText
      );
      Sentry.captureMessage("Failed to delete Cloudflare hostname", {
        level: "warning",
        tags: { source: "domain-service", feature: "cloudflare-delete" },
        extra: { cloudflareId, errorText, status: response.status },
      });
      // Don't throw - we still want to clean up locally
    }
  },

  // ========================================
  // KV Helpers
  // ========================================

  async updateKvMapping(hostname: string): Promise<void> {
    const { accountId, kvNamespaceId, apiToken } = getCloudflareConfig();

    if (!accountId || !kvNamespaceId) {
      console.warn("[domain] KV not configured, skipping update");
      return;
    }

    const mapping = await this.lookupForWorker(hostname);
    if (!mapping) {
      return;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${hostname}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mapping),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[domain] Failed to update KV:", errorText);
      Sentry.captureMessage("Failed to update KV mapping", {
        level: "warning",
        tags: { source: "domain-service", feature: "kv-update" },
        extra: { hostname, errorText, status: response.status },
      });
    }
  },

  async deleteKvMapping(hostname: string): Promise<void> {
    const { accountId, kvNamespaceId, apiToken } = getCloudflareConfig();

    if (!accountId || !kvNamespaceId) {
      return;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNamespaceId}/values/${hostname}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[domain] Failed to delete KV:", errorText);
      Sentry.captureMessage("Failed to delete KV mapping", {
        level: "warning",
        tags: { source: "domain-service", feature: "kv-delete" },
        extra: { hostname, errorText, status: response.status },
      });
    }
  },

  // ========================================
  // Helpers
  // ========================================

  mapToCustomDomain(row: Record<string, unknown>): CustomDomain {
    // With CamelCasePlugin, row keys are already camelCase
    return {
      id: row.id as string,
      hostname: row.hostname as string,
      type: row.type as CustomDomainType,
      appId: row.appId as string | null,
      tenantId: row.tenantId as string | null,
      organizationId: row.organizationId as string | null,
      cloudflareId: row.cloudflareId as string | null,
      sslStatus: row.sslStatus as CustomDomainSslStatus,
      dcvToken: row.dcvToken as string | null,
      brandStyles: row.brandStyles as BrandStyles | null,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  },
};
