/**
 * User Provisioning Service
 *
 * Handles automatic creation of organization, workspace, and membership
 * for new users signing up to chipp-deno (v2).
 *
 * On signup:
 * 1. Creates organization (FREE tier, usage-based billing enabled)
 * 2. Creates workspace
 * 3. Creates user as OWNER
 * 4. Creates Stripe customer and subscribes to FREE plan ($5 credit)
 */

import { db } from "../db/index.ts";
import type {
  SubscriptionTier,
  UserRole,
  WorkspaceMemberRole,
} from "../db/schema.ts";
import { billingService } from "./billing.service.ts";

export interface ProvisionUserInput {
  email: string;
  name?: string | null;
  picture?: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
  passwordHash?: string | null;
  emailVerified?: boolean;
}

export interface ProvisionedUser {
  userId: string;
  email: string;
  name: string | null;
  organizationId: string;
  workspaceId: string;
  role: UserRole;
}

class UserProvisioningService {
  /**
   * Provision a new user with organization and workspace.
   * This is called after successful authentication for first-time users.
   *
   * Flow:
   * 1. Create organization for the user
   * 2. Create workspace under the organization
   * 3. Create user linked to organization
   * 4. Add user as OWNER in workspace_members
   */
  async provisionNewUser(input: ProvisionUserInput): Promise<ProvisionedUser> {
    const { email, name, picture, oauthProvider, oauthId, passwordHash, emailVerified } = input;

    // Generate names based on user's name or email
    const displayName = name || email.split("@")[0];
    const orgName = name
      ? `${name.split(" ")[0]}'s Organization`
      : "Your Organization";
    const workspaceName = name
      ? `${name.split(" ")[0]}'s Workspace`
      : "Your Workspace";

    // Generate a unique slug for the organization
    const orgSlug = this.generateSlug(displayName);

    // Use a transaction to ensure all-or-nothing creation
    const result = await db.transaction().execute(async (trx) => {
      // 1. Create organization
      const organization = await trx
        .insertInto("app.organizations")
        .values({
          name: orgName,
          slug: orgSlug,
          subscriptionTier: "FREE" as SubscriptionTier,
          usageBasedBillingEnabled: true, // All new signups use v2 billing
          creditsBalance: 0,
        })
        .returning(["id", "name"])
        .executeTakeFirstOrThrow();

      // 2. Create workspace under the organization
      const workspace = await trx
        .insertInto("app.workspaces")
        .values({
          name: workspaceName,
          organizationId: organization.id,
        })
        .returning(["id", "name"])
        .executeTakeFirstOrThrow();

      // 3. Create user linked to organization
      const user = await trx
        .insertInto("app.users")
        .values({
          email,
          name: name || null,
          picture: picture || null,
          role: "owner" as UserRole,
          organizationId: organization.id,
          activeWorkspaceId: workspace.id,
          oauthProvider: oauthProvider || null,
          oauthId: oauthId || null,
          passwordHash: passwordHash || null,
          emailVerified: emailVerified ?? (oauthProvider !== null), // Explicit flag or default: OAuth users verified
        })
        .returning(["id", "email", "name", "role"])
        .executeTakeFirstOrThrow();

      // 4. Add user as OWNER in workspace_members
      await trx
        .insertInto("app.workspace_members")
        .values({
          workspaceId: workspace.id,
          userId: user.id,
          role: "OWNER" as WorkspaceMemberRole,
          joinedViaPublicInvite: false,
        })
        .execute();

      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        organizationId: organization.id,
        workspaceId: workspace.id,
        role: user.role as UserRole,
      };
    });

    // After successful provisioning, set up Stripe billing (non-blocking)
    // This creates a Stripe customer and subscribes to FREE plan with $5 credits
    try {
      await billingService.ensureFreeSubscriptionForOrganization({
        organizationId: result.organizationId,
        email: result.email,
        name: result.name,
      });
    } catch (e) {
      // Non-blocking - log and continue
      console.warn(
        "[user-provisioning] Failed to set up FREE subscription:",
        e
      );
    }

    return result;
  }

  /**
   * Find existing user by email
   */
  async findUserByEmail(email: string): Promise<ProvisionedUser | null> {
    const user = await db
      .selectFrom("app.users")
      .select([
        "id",
        "email",
        "name",
        "organizationId",
        "activeWorkspaceId",
        "role",
      ])
      .where("email", "=", email.toLowerCase())
      .executeTakeFirst();

    if (!user) return null;

    // If user has no active workspace, try to find one from memberships
    let workspaceId = user.activeWorkspaceId;
    if (!workspaceId) {
      const membership = await db
        .selectFrom("app.workspace_members")
        .select(["workspaceId"])
        .where("userId", "=", user.id)
        .orderBy("joinedAt", "desc")
        .executeTakeFirst();

      workspaceId = membership?.workspaceId || null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      workspaceId: workspaceId || "",
      role: user.role as UserRole,
    };
  }

  /**
   * Find or create user - main entry point for post-login flow
   */
  async findOrCreateUser(input: ProvisionUserInput): Promise<ProvisionedUser> {
    // Try to find existing user first
    const existingUser = await this.findUserByEmail(input.email);
    if (existingUser) {
      return existingUser;
    }

    // Create new user with organization and workspace
    return this.provisionNewUser(input);
  }

  /**
   * Ensure user has organization and workspace.
   * For edge cases like database restores or legacy users.
   */
  async ensureUserHasOrgAndWorkspace(userId: string): Promise<void> {
    const user = await db
      .selectFrom("app.users")
      .select(["id", "email", "name", "organizationId", "activeWorkspaceId"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check if user has organization
    const org = await db
      .selectFrom("app.organizations")
      .select(["id"])
      .where("id", "=", user.organizationId)
      .executeTakeFirst();

    if (!org) {
      // Create organization for user
      const displayName = user.name || user.email.split("@")[0];
      const orgName = user.name
        ? `${user.name.split(" ")[0]}'s Organization`
        : "Your Organization";

      const newOrg = await db
        .insertInto("app.organizations")
        .values({
          name: orgName,
          slug: this.generateSlug(displayName),
          subscriptionTier: "FREE" as SubscriptionTier,
          usageBasedBillingEnabled: true,
          creditsBalance: 0,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await db
        .updateTable("app.users")
        .set({ organizationId: newOrg.id })
        .where("id", "=", userId)
        .execute();

      // Set up FREE plan subscription with $5 credits
      try {
        await billingService.ensureFreeSubscriptionForOrganization({
          organizationId: newOrg.id,
          email: user.email,
          name: user.name,
        });
      } catch (e) {
        console.warn(
          "[user-provisioning] Failed to set up FREE subscription:",
          e
        );
      }
    }

    // Check if user has workspace
    const membership = await db
      .selectFrom("app.workspace_members")
      .select(["workspaceId"])
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (!membership) {
      // Get user's current organization
      const currentUser = await db
        .selectFrom("app.users")
        .select(["organizationId", "name", "email"])
        .where("id", "=", userId)
        .executeTakeFirstOrThrow();

      // Create workspace
      const workspaceName = currentUser.name
        ? `${currentUser.name.split(" ")[0]}'s Workspace`
        : "Your Workspace";

      const workspace = await db
        .insertInto("app.workspaces")
        .values({
          name: workspaceName,
          organizationId: currentUser.organizationId,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      // Add user as owner
      await db
        .insertInto("app.workspace_members")
        .values({
          workspaceId: workspace.id,
          userId: userId,
          role: "OWNER" as WorkspaceMemberRole,
          joinedViaPublicInvite: false,
        })
        .execute();

      // Update user's active workspace
      await db
        .updateTable("app.users")
        .set({ activeWorkspaceId: workspace.id })
        .where("id", "=", userId)
        .execute();
    }
  }

  /**
   * Generate a URL-safe slug from a name
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Add random suffix for uniqueness
    const suffix = crypto.randomUUID().slice(0, 8);
    return `${base}-${suffix}`;
  }
}

export const userProvisioningService = new UserProvisioningService();
