/**
 * Organization Service
 *
 * Business logic for organization operations.
 */

import { db } from "../db/client.ts";
import { NotFoundError, ForbiddenError } from "../utils/errors.ts";
import type { SubscriptionTier } from "../db/schema.ts";

// ========================================
// Types
// ========================================

export interface Organization {
  id: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  usageBasedBillingEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface UpdateOrganizationParams {
  name?: string;
}

// ========================================
// Service
// ========================================

export const organizationService = {
  /**
   * Get organization for user
   * Returns the organization the user belongs to
   */
  async getForUser(userId: string): Promise<Organization> {
    // Get user's organization
    const user = await db
      .selectFrom("app.users")
      .select(["organizationId"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new NotFoundError("User", userId);
    }

    return this.get(user.organizationId);
  },

  /**
   * Get organization by ID
   */
  async get(organizationId: string): Promise<Organization> {
    const org = await db
      .selectFrom("app.organizations")
      .select([
        "id",
        "name",
        "subscriptionTier",
        "usageBasedBillingEnabled",
        "createdAt",
        "updatedAt",
      ])
      .where("id", "=", organizationId)
      .executeTakeFirst();

    if (!org) {
      throw new NotFoundError("Organization", organizationId);
    }

    return {
      id: org.id,
      name: org.name,
      subscriptionTier: org.subscriptionTier,
      usageBasedBillingEnabled: org.usageBasedBillingEnabled,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  },

  /**
   * Update organization
   */
  async update(
    userId: string,
    params: UpdateOrganizationParams
  ): Promise<Organization> {
    // Get the organization for this user
    const org = await this.getForUser(userId);

    // Check if user is owner/admin of the organization
    const user = await db
      .selectFrom("app.users")
      .select(["role"])
      .where("id", "=", userId)
      .where("organizationId", "=", org.id)
      .executeTakeFirst();

    if (!user || !["owner", "admin"].includes(user.role)) {
      throw new ForbiddenError(
        "Only owners and admins can update organization details"
      );
    }

    // Update org
    if (params.name) {
      await db
        .updateTable("app.organizations")
        .set({
          name: params.name,
          updatedAt: new Date(),
        })
        .where("id", "=", org.id)
        .execute();
    }

    return this.get(org.id);
  },

  /**
   * List organization members
   */
  async listMembers(userId: string): Promise<OrganizationMember[]> {
    // Get the organization for this user
    const org = await this.getForUser(userId);

    const members = await db
      .selectFrom("app.users")
      .select(["id", "email", "name", "role"])
      .where("organizationId", "=", org.id)
      .orderBy("createdAt")
      .execute();

    return members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
    }));
  },
};
