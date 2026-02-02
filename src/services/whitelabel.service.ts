/**
 * Whitelabel Service
 *
 * Business logic for whitelabel tenant operations.
 * Only accessible to Enterprise tier organizations.
 */

import { db } from "../db/client.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import { organizationService } from "./organization.service.ts";
import type { WhitelabelTenant as WhitelabelTenantRow } from "../db/schema.ts";

// ========================================
// Types
// ========================================

export interface WhitelabelTenant {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  features: WhitelabelFeatures;
  organizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhitelabelFeatures {
  isGoogleAuthDisabled?: boolean;
  isMicrosoftAuthDisabled?: boolean;
  isLocalAuthDisabled?: boolean;
  isBillingDisabled?: boolean;
  isHelpCenterDisabled?: boolean;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
}

export interface UpdateWhitelabelParams {
  name?: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  isGoogleAuthDisabled?: boolean;
  isMicrosoftAuthDisabled?: boolean;
  isLocalAuthDisabled?: boolean;
  isBillingDisabled?: boolean;
  isHelpCenterDisabled?: boolean;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
}

// ========================================
// Service
// ========================================

export const whitelabelService = {
  /**
   * Get whitelabel tenant for the user's organization
   * Returns null if organization doesn't have a tenant
   */
  async getForUser(userId: string): Promise<{
    tenant: WhitelabelTenant | null;
    organization: { id: string; name: string; subscriptionTier: string };
  }> {
    const org = await organizationService.getForUser(userId);

    // Check if org is Enterprise tier
    if (org.subscriptionTier !== "ENTERPRISE") {
      throw new ForbiddenError(
        "Enterprise tier required for whitelabel settings"
      );
    }

    // Find tenant for this organization
    const tenant = await db
      .selectFrom("app.whitelabel_tenants")
      .select([
        "id",
        "slug",
        "name",
        "customDomain",
        "primaryColor",
        "secondaryColor",
        "logoUrl",
        "faviconUrl",
        "features",
        "organizationId",
        "createdAt",
        "updatedAt",
      ])
      .where("organizationId", "=", org.id)
      .executeTakeFirst();

    return {
      tenant: tenant ? this.mapTenant(tenant) : null,
      organization: {
        id: org.id,
        name: org.name,
        subscriptionTier: org.subscriptionTier,
      },
    };
  },

  /**
   * Update whitelabel settings
   * Creates a new tenant if one doesn't exist
   */
  async update(
    userId: string,
    params: UpdateWhitelabelParams
  ): Promise<WhitelabelTenant> {
    const org = await organizationService.getForUser(userId);

    // Check if org is Enterprise tier
    if (org.subscriptionTier !== "ENTERPRISE") {
      throw new ForbiddenError(
        "Enterprise tier required for whitelabel settings"
      );
    }

    // Check if user is owner/admin
    const user = await db
      .selectFrom("app.users")
      .select(["role"])
      .where("id", "=", userId)
      .where("organizationId", "=", org.id)
      .executeTakeFirst();

    if (!user || !["owner", "admin"].includes(user.role)) {
      throw new ForbiddenError(
        "Only owners and admins can update whitelabel settings"
      );
    }

    // Find existing tenant
    const existingTenant = await db
      .selectFrom("app.whitelabel_tenants")
      .select(["id", "features"])
      .where("organizationId", "=", org.id)
      .executeTakeFirst();

    // Build features JSON
    const existingFeatures =
      (existingTenant?.features as WhitelabelFeatures) || {};
    const newFeatures: WhitelabelFeatures = {
      ...existingFeatures,
      ...(params.isGoogleAuthDisabled !== undefined && {
        isGoogleAuthDisabled: params.isGoogleAuthDisabled,
      }),
      ...(params.isMicrosoftAuthDisabled !== undefined && {
        isMicrosoftAuthDisabled: params.isMicrosoftAuthDisabled,
      }),
      ...(params.isLocalAuthDisabled !== undefined && {
        isLocalAuthDisabled: params.isLocalAuthDisabled,
      }),
      ...(params.isBillingDisabled !== undefined && {
        isBillingDisabled: params.isBillingDisabled,
      }),
      ...(params.isHelpCenterDisabled !== undefined && {
        isHelpCenterDisabled: params.isHelpCenterDisabled,
      }),
      ...(params.smtpFromEmail !== undefined && {
        smtpFromEmail: params.smtpFromEmail,
      }),
      ...(params.smtpFromName !== undefined && {
        smtpFromName: params.smtpFromName,
      }),
    };

    let tenantId: string;

    if (existingTenant) {
      // Update existing tenant
      await db
        .updateTable("app.whitelabel_tenants")
        .set({
          ...(params.name !== undefined && { name: params.name }),
          ...(params.primaryColor !== undefined && {
            primaryColor: params.primaryColor,
          }),
          ...(params.secondaryColor !== undefined && {
            secondaryColor: params.secondaryColor,
          }),
          ...(params.logoUrl !== undefined && { logoUrl: params.logoUrl }),
          ...(params.faviconUrl !== undefined && {
            faviconUrl: params.faviconUrl,
          }),
          features: JSON.stringify(newFeatures),
          updatedAt: new Date(),
        })
        .where("id", "=", existingTenant.id)
        .execute();

      tenantId = existingTenant.id;
    } else {
      // Create new tenant
      if (!params.name) {
        throw new ForbiddenError(
          "Company name is required to create whitelabel tenant"
        );
      }

      // Generate slug from org name
      const baseSlug = params.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for uniqueness
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const existing = await db
          .selectFrom("app.whitelabel_tenants")
          .select(["id"])
          .where("slug", "=", slug)
          .executeTakeFirst();
        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const result = await db
        .insertInto("app.whitelabel_tenants")
        .values({
          slug,
          name: params.name,
          organizationId: org.id,
          primaryColor: params.primaryColor || null,
          secondaryColor: params.secondaryColor || null,
          logoUrl: params.logoUrl || null,
          faviconUrl: params.faviconUrl || null,
          features: JSON.stringify(newFeatures),
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      tenantId = result.id;
    }

    // Return updated tenant
    const tenant = await db
      .selectFrom("app.whitelabel_tenants")
      .select([
        "id",
        "slug",
        "name",
        "customDomain",
        "primaryColor",
        "secondaryColor",
        "logoUrl",
        "faviconUrl",
        "features",
        "organizationId",
        "createdAt",
        "updatedAt",
      ])
      .where("id", "=", tenantId)
      .executeTakeFirstOrThrow();

    return this.mapTenant(tenant);
  },

  /**
   * Map database row to WhitelabelTenant type
   */
  mapTenant(row: WhitelabelTenantRow): WhitelabelTenant {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      customDomain: row.customDomain,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      logoUrl: row.logoUrl,
      faviconUrl: row.faviconUrl,
      features: (row.features as WhitelabelFeatures) || {},
      organizationId: row.organizationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
};
