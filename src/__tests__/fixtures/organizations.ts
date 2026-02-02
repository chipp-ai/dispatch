/**
 * Organization Test Fixtures
 *
 * Pre-defined test organizations with various configurations.
 * Used to test org management, billing, members, and whitelabel.
 *
 * FIXTURE CATEGORIES:
 * - Subscription states: Free, paid tiers, trial, expired
 * - Billing states: Active payment, failed payment, exhausted credits
 * - Member configurations: Single owner, teams with roles
 * - Whitelabel: Enterprise orgs with tenant configuration
 * - Usage states: Low usage, high usage, over limit
 *
 * USAGE:
 *   import { getOrgWithTeam, getOrgWithExhaustedCredits } from "../fixtures/organizations.ts";
 *   const org = await getOrgWithTeam();
 *   const res = await get("/api/organization/members", org.owner);
 *
 * TODO:
 * - [ ] Implement createOrgWithStripeCustomer() for billing tests
 * - [ ] Implement createOrgWithCredits() with specific credit balance
 * - [ ] Implement createOrgWithMembers() with various roles
 * - [ ] Implement createEnterpriseOrg() with tenant/whitelabel
 * - [ ] Implement createOrgWithFailedPayment() for payment failure tests
 * - [ ] Add usage tracking fixtures for usage-based billing tests
 */

import type { TestUser } from "../setup.ts";
import { sql } from "../setup.ts";

// ========================================
// Types
// ========================================

export interface TestOrganization {
  id: string; // UUID
  name: string;
  subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface TestOrgWithMembers extends TestOrganization {
  owner: TestUser;
  admins: TestUser[];
  members: TestUser[];
}

export interface TestOrgWithCredits extends TestOrganization {
  creditBalanceCents: number;
  creditGrantId?: string;
}

// ========================================
// Basic Organization Fixtures
// ========================================

/**
 * Create a basic free tier organization.
 * If a user is provided, links the org to that user.
 */
export async function createFreeOrg(
  user?: TestUser
): Promise<TestOrganization> {
  const timestamp = Date.now();
  const [org] = await sql`
    INSERT INTO app.organizations (
      name,
      subscription_tier
    )
    VALUES (
      ${`test_free_org_${timestamp}`},
      'FREE'::subscription_tier
    )
    RETURNING id, name, subscription_tier
  `;

  // If user provided, link them to this organization
  if (user) {
    // Create workspace in this org
    const [workspace] = await sql`
      INSERT INTO app.workspaces (organization_id, name)
      VALUES (${org.id}, ${`test_workspace_${timestamp}`})
      RETURNING id
    `;

    // Add user to workspace as owner
    await sql`
      INSERT INTO app.workspace_members (workspace_id, user_id, role)
      VALUES (${workspace.id}, ${user.id}, 'OWNER'::workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'OWNER'::workspace_role
    `;
  }

  return {
    id: org.id,
    name: org.name,
    subscriptionTier: org.subscription_tier,
  };
}

/**
 * Create a Pro tier organization with Stripe customer.
 * If a user is provided, links the org to that user.
 */
export async function createProOrg(user?: TestUser): Promise<TestOrganization> {
  const timestamp = Date.now();
  const [org] = await sql`
    INSERT INTO app.organizations (
      name,
      subscription_tier
    )
    VALUES (
      ${`test_pro_org_${timestamp}`},
      'PRO'::subscription_tier
    )
    RETURNING id, name, subscription_tier
  `;

  // If user provided, link them to this organization
  if (user) {
    // Create workspace in this org
    const [workspace] = await sql`
      INSERT INTO app.workspaces (organization_id, name)
      VALUES (${org.id}, ${`test_workspace_${timestamp}`})
      RETURNING id
    `;

    // Add user to workspace as owner
    await sql`
      INSERT INTO app.workspace_members (workspace_id, user_id, role)
      VALUES (${workspace.id}, ${user.id}, 'OWNER'::workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'OWNER'::workspace_role
    `;
  }

  // TODO: Create Stripe test customer
  // TODO: Create Stripe subscription
  // TODO: Update org with stripe_customer_id, stripe_subscription_id

  return {
    id: org.id,
    name: org.name,
    subscriptionTier: "PRO",
  };
}

// ========================================
// Billing State Fixtures
// ========================================

/**
 * Create an org with specific credit balance.
 * Used for testing credit exhaustion, topups, etc.
 */
export async function createOrgWithCredits(
  balanceCents: number
): Promise<TestOrgWithCredits> {
  const org = await createProOrg();

  // TODO: Create credit grant in Stripe v2 API
  // TODO: Set specific balance amount

  return {
    ...org,
    creditBalanceCents: balanceCents,
  };
}

/**
 * Create an org with exhausted credits (zero balance).
 */
export async function createOrgWithExhaustedCredits(): Promise<TestOrgWithCredits> {
  return createOrgWithCredits(0);
}

/**
 * Create an org with low credits (near threshold).
 * Used for testing low credit warnings.
 */
export async function createOrgWithLowCredits(): Promise<TestOrgWithCredits> {
  // Assuming 10% threshold, create org with 5% remaining
  const lowBalance = 500; // $5.00
  return createOrgWithCredits(lowBalance);
}

/**
 * Create an org with failed payment method.
 * Used for testing payment failure handling.
 */
export async function createOrgWithFailedPayment(): Promise<TestOrganization> {
  const org = await createProOrg();

  // TODO: Create Stripe customer with declined card
  // TODO: Set subscription to past_due or unpaid

  return org;
}

// ========================================
// Member Configuration Fixtures
// ========================================

/**
 * Create an org with multiple members in different roles.
 */
export async function createOrgWithMembers(
  memberConfig: {
    admins?: number;
    members?: number;
  } = { admins: 1, members: 2 }
): Promise<TestOrgWithMembers> {
  const org = await createProOrg();

  // TODO: Create owner user
  // TODO: Create admin users
  // TODO: Create member users
  // TODO: Link all to organization with appropriate roles

  return {
    ...org,
    owner: null as unknown as TestUser, // Placeholder
    admins: [],
    members: [],
  };
}

// ========================================
// Enterprise/Whitelabel Fixtures
// ========================================

/**
 * Create an enterprise org with whitelabel/tenant configuration.
 * If a user is provided, links the org to that user.
 */
export async function createEnterpriseOrg(
  user?: TestUser
): Promise<TestOrganization> {
  const timestamp = Date.now();
  const [org] = await sql`
    INSERT INTO app.organizations (
      name,
      subscription_tier
    )
    VALUES (
      ${`test_enterprise_org_${timestamp}`},
      'ENTERPRISE'::subscription_tier
    )
    RETURNING id, name, subscription_tier
  `;

  // If user provided, link them to this organization
  if (user) {
    // Create workspace in this org
    const [workspace] = await sql`
      INSERT INTO app.workspaces (organization_id, name)
      VALUES (${org.id}, ${`test_workspace_${timestamp}`})
      RETURNING id
    `;

    // Add user to workspace as owner
    await sql`
      INSERT INTO app.workspace_members (workspace_id, user_id, role)
      VALUES (${workspace.id}, ${user.id}, 'OWNER'::workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'OWNER'::workspace_role
    `;
  }

  // TODO: Create tenant record
  // TODO: Configure whitelabel settings (logo, colors, domain)

  return {
    id: org.id,
    name: org.name,
    subscriptionTier: "ENTERPRISE",
  };
}

/**
 * Create an enterprise org with custom domain.
 */
export async function createEnterpriseOrgWithDomain(
  domain: string
): Promise<TestOrganization> {
  const org = await createEnterpriseOrg();

  // TODO: Configure custom domain
  // TODO: Set DNS verification status

  return org;
}

// ========================================
// Usage State Fixtures
// ========================================

/**
 * Create an org with specific token usage history.
 * Used for testing usage analytics and billing.
 */
export async function createOrgWithUsage(
  tokenCount: number
): Promise<TestOrganization> {
  const org = await createProOrg();

  // TODO: Create token usage records
  // TODO: Report usage to Stripe meter

  return org;
}

// ========================================
// Cleanup
// ========================================

/**
 * Delete a test organization and all associated data.
 */
export async function cleanupOrg(orgId: number): Promise<void> {
  // Delete in order due to foreign keys
  await sql`DELETE FROM app.users WHERE organization_id = ${orgId}`;
  await sql`DELETE FROM app.workspaces WHERE organization_id = ${orgId}`;
  await sql`DELETE FROM app.organizations WHERE id = ${orgId}`;
}

/**
 * Delete all test organizations.
 */
export async function cleanupAllTestOrgs(): Promise<void> {
  await sql`
    DELETE FROM app.organizations
    WHERE name LIKE 'test_%'
  `;
}
