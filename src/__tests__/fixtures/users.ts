/**
 * User Test Fixtures
 *
 * Pre-defined test users at various subscription tiers and states.
 * These fixtures should be used across all route and scenario tests
 * to ensure consistent test data.
 *
 * FIXTURE CATEGORIES:
 * - Subscription tiers: FREE, PRO, TEAM, BUSINESS, ENTERPRISE users
 * - Billing states: Active, exhausted credits, payment failed, trial
 * - Org roles: Owner, Admin, Member, Viewer
 * - Special states: New user (onboarding), banned, suspended
 *
 * USAGE:
 *   import { freeUser, proUser } from "../fixtures/users.ts";
 *   const res = await get("/api/organization", freeUser);
 *
 * TODO:
 * - [ ] Implement createFreeUser() with real DB seeding
 * - [ ] Implement createProUser() with Stripe customer/subscription
 * - [ ] Implement createExhaustedCreditsUser() with zero balance
 * - [ ] Implement createTeamOwner() with team members
 * - [ ] Add user state helpers (suspend, ban, etc.)
 */

import type { TestUser } from "../setup.ts";
import {
  createTestUser,
  getOrCreateTestUser,
  generateTestToken,
} from "../setup.ts";

// Re-export TestUser type for convenience
export type { TestUser };

// ========================================
// Pre-defined Test Users (Lazy-loaded)
// ========================================

let _freeUser: TestUser | null = null;
let _proUser: TestUser | null = null;
let _teamUser: TestUser | null = null;
let _businessUser: TestUser | null = null;
let _enterpriseUser: TestUser | null = null;
let _exhaustedCreditsUser: TestUser | null = null;
let _adminUser: TestUser | null = null;
let _superAdminUser: TestUser | null = null;

/**
 * Free tier user with no payment method.
 * Has limited credits from signup bonus.
 */
export async function getFreeUser(): Promise<TestUser> {
  if (!_freeUser) {
    _freeUser = await getOrCreateTestUser({
      email: "test_free@example.com",
      name: "Free Tier User",
      subscriptionTier: "FREE",
    });
  }
  return _freeUser;
}

/**
 * Pro tier user with active subscription.
 * Has payment method and monthly credit allowance.
 */
export async function getProUser(): Promise<TestUser> {
  if (!_proUser) {
    _proUser = await getOrCreateTestUser({
      email: "test_pro@example.com",
      name: "Pro Tier User",
      subscriptionTier: "PRO",
    });
    // TODO: Create Stripe customer and subscription
  }
  return _proUser;
}

/**
 * Team tier user with multiple team members.
 * Organization has additional members with various roles.
 */
export async function getTeamUser(): Promise<TestUser> {
  if (!_teamUser) {
    _teamUser = await getOrCreateTestUser({
      email: "test_team@example.com",
      name: "Team Tier Owner",
      subscriptionTier: "TEAM",
    });
    // TODO: Add team members with ADMIN, MEMBER roles
  }
  return _teamUser;
}

/**
 * Business tier user with advanced features.
 */
export async function getBusinessUser(): Promise<TestUser> {
  if (!_businessUser) {
    _businessUser = await getOrCreateTestUser({
      email: "test_business@example.com",
      name: "Business Tier User",
      subscriptionTier: "BUSINESS",
    });
  }
  return _businessUser;
}

/**
 * Enterprise tier user with whitelabel features.
 */
export async function getEnterpriseUser(): Promise<TestUser> {
  if (!_enterpriseUser) {
    _enterpriseUser = await getOrCreateTestUser({
      email: "test_enterprise@example.com",
      name: "Enterprise Tier User",
      subscriptionTier: "ENTERPRISE",
    });
    // TODO: Create tenant record for whitelabel
  }
  return _enterpriseUser;
}

/**
 * User with exhausted credits (zero balance).
 * Used to test credit enforcement and upsells.
 */
export async function getExhaustedCreditsUser(): Promise<TestUser> {
  if (!_exhaustedCreditsUser) {
    _exhaustedCreditsUser = await getOrCreateTestUser({
      email: "test_exhausted@example.com",
      name: "Exhausted Credits User",
      subscriptionTier: "PRO",
    });
    // TODO: Set credit balance to 0 in Stripe
  }
  return _exhaustedCreditsUser;
}

/**
 * Admin user for HQ/internal admin endpoints.
 * Has elevated privileges for platform management.
 */
export async function getAdminUser(): Promise<TestUser> {
  if (!_adminUser) {
    _adminUser = await getOrCreateTestUser({
      email: "test_admin@chipp.ai",
      name: "Admin User",
      subscriptionTier: "ENTERPRISE",
      isAdmin: true,
    });
  }
  return _adminUser;
}

/**
 * Super admin user with highest privileges.
 * Can impersonate other users and manage other admins.
 */
export async function getSuperAdminUser(): Promise<TestUser> {
  if (!_superAdminUser) {
    _superAdminUser = await getOrCreateTestUser({
      email: "test_superadmin@chipp.ai",
      name: "Super Admin User",
      subscriptionTier: "ENTERPRISE",
      isAdmin: true,
      isSuperAdmin: true,
    });
  }
  return _superAdminUser;
}

// ========================================
// Factory Functions
// ========================================

/**
 * Create a fresh user for tests that need isolation.
 * Use this when tests modify user state.
 */
export async function createIsolatedUser(
  tier: TestUser["subscriptionTier"] = "FREE"
): Promise<TestUser> {
  return createTestUser({
    email: `test_isolated_${Date.now()}@example.com`,
    name: "Isolated Test User",
    subscriptionTier: tier,
  });
}

/**
 * Create a team with owner and members.
 * Returns the owner user; members are created in the same org.
 */
export async function createTeamWithMembers(
  memberCount: number = 2
): Promise<{ owner: TestUser; members: TestUser[] }> {
  const owner = await createTestUser({
    email: `test_team_owner_${Date.now()}@example.com`,
    name: "Team Owner",
    subscriptionTier: "TEAM",
  });

  const members: TestUser[] = [];
  for (let i = 0; i < memberCount; i++) {
    // TODO: Create members in same organization with MEMBER role
    // For now, create separate users as placeholder
    const member = await createTestUser({
      email: `test_team_member_${i}_${Date.now()}@example.com`,
      name: `Team Member ${i + 1}`,
      subscriptionTier: "TEAM",
    });
    members.push(member);
  }

  return { owner, members };
}

// ========================================
// Cleanup
// ========================================

/**
 * Reset cached users. Call this if tests modify user state.
 */
export function resetUserCache() {
  _freeUser = null;
  _proUser = null;
  _teamUser = null;
  _businessUser = null;
  _enterpriseUser = null;
  _exhaustedCreditsUser = null;
  _adminUser = null;
  _superAdminUser = null;
}
