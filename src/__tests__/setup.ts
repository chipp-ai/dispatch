/**
 * Test Setup and Utilities
 *
 * Provides database setup, auth helpers, and common utilities for API testing.
 * Uses Hono's app.request() for fast, no-network-overhead testing.
 */

import { sql } from "../db/client.ts";
import app from "../api/index.ts";

// ========================================
// Types
// ========================================

export interface TestUser {
  id: string; // UUID
  email: string;
  token: string;
  organizationId: string; // UUID
  workspaceId: string; // UUID
  subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

export interface TestApplication {
  id: string; // UUID
  name: string;
  appNameId: string;
  ownerId: string; // UUID
  workspaceId: string; // UUID
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

// ========================================
// Test Database Management
// ========================================

/**
 * Clean up test data created during tests.
 * Call this in afterAll() or afterEach() hooks.
 */
export async function cleanupTestData(prefix = "test_") {
  // Delete test applications first (references users)
  await sql`
    DELETE FROM app.applications
    WHERE name LIKE ${prefix + "%"}
  `;

  // Delete workspace members (references users and workspaces)
  await sql`
    DELETE FROM app.workspace_members
    WHERE workspace_id IN (
      SELECT id FROM app.workspaces WHERE name LIKE ${prefix + "%"}
    )
  `;

  // Delete workspaces (references organizations)
  await sql`
    DELETE FROM app.workspaces
    WHERE name LIKE ${prefix + "%"}
  `;

  // Delete test users
  await sql`
    DELETE FROM app.users
    WHERE email LIKE ${prefix + "%"}
  `;

  // Delete test organizations
  await sql`
    DELETE FROM app.organizations
    WHERE name LIKE ${prefix + "%"}
  `;
}

/**
 * Begin a transaction for test isolation.
 * Call ROLLBACK at the end to undo all changes.
 */
export async function beginTransaction() {
  await sql`BEGIN`;
}

export async function rollbackTransaction() {
  await sql`ROLLBACK`;
}

export async function commitTransaction() {
  await sql`COMMIT`;
}

// ========================================
// Auth Helpers
// ========================================

/**
 * Generate a test JWT token for a user.
 * Creates a JWT-like token that the auth middleware can decode.
 * The auth middleware only base64 decodes the payload, so we just need
 * a properly formatted token.
 */
export function generateTestToken(
  userId: string, // UUID
  options: {
    email?: string;
    name?: string;
    organizationId?: string; // UUID
    activeWorkspaceId?: string; // UUID
    role?: "owner" | "admin" | "member";
    expiresIn?: number; // seconds, defaults to 1 hour
  } = {}
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    userId: userId,
    email: options.email || `test_${userId}@example.com`,
    name: options.name || "Test User",
    organizationId:
      options.organizationId || "00000000-0000-0000-0000-000000000000",
    activeWorkspaceId: options.activeWorkspaceId || null,
    role: options.role || "owner",
    iat: now,
    exp: now + (options.expiresIn ?? 3600),
  };

  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  // For testing, we use a dummy signature - the middleware doesn't verify it
  const signature = "test-signature";

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Create authorization header for a test user.
 */
export function authHeader(user: TestUser): Record<string, string> {
  return {
    Authorization: `Bearer ${user.token}`,
  };
}

/**
 * Create headers for JSON requests with auth.
 */
export function jsonAuthHeaders(user: TestUser): Record<string, string> {
  return {
    ...authHeader(user),
    "Content-Type": "application/json",
  };
}

// ========================================
// Request Helpers
// ========================================

/**
 * Make an authenticated GET request.
 */
export async function get(path: string, user: TestUser) {
  return app.request(path, {
    method: "GET",
    headers: authHeader(user),
  });
}

/**
 * Make an authenticated POST request with JSON body.
 */
export async function post(
  path: string,
  user: TestUser | null,
  body: unknown,
  extraHeaders?: Record<string, string>
) {
  const headers = user
    ? { ...jsonAuthHeaders(user), ...extraHeaders }
    : { "Content-Type": "application/json", ...extraHeaders };

  return app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Make an authenticated PATCH request with JSON body.
 */
export async function patch(path: string, user: TestUser, body: unknown) {
  return app.request(path, {
    method: "PATCH",
    headers: jsonAuthHeaders(user),
    body: JSON.stringify(body),
  });
}

/**
 * Make an authenticated PUT request with JSON body.
 */
export async function put(path: string, user: TestUser, body: unknown) {
  return app.request(path, {
    method: "PUT",
    headers: jsonAuthHeaders(user),
    body: JSON.stringify(body),
  });
}

/**
 * Make an authenticated DELETE request.
 */
export async function del(path: string, user: TestUser) {
  return app.request(path, {
    method: "DELETE",
    headers: authHeader(user),
  });
}

/**
 * Make an unauthenticated request (for testing auth failures).
 */
export async function unauthenticated(
  path: string,
  options: RequestOptions = {}
) {
  const { method = "GET", body, headers = {} } = options;

  return app.request(path, {
    method,
    headers: body
      ? { ...headers, "Content-Type": "application/json" }
      : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ========================================
// Response Helpers
// ========================================

/**
 * Parse JSON response and return typed data.
 */
export async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * Assert response is successful (2xx) and parse JSON.
 */
export async function expectSuccess<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Expected success but got ${response.status}: ${error}`);
  }
  return parseJson<T>(response);
}

/**
 * Assert response has specific status code.
 */
export function expectStatus(response: Response, expected: number) {
  if (response.status !== expected) {
    throw new Error(`Expected status ${expected} but got ${response.status}`);
  }
}

/**
 * Consume and discard response body to prevent resource leaks.
 * Call this when you only care about the status code, not the body.
 */
export async function consumeResponse(response: Response): Promise<void> {
  // Try to consume body. If already consumed, this will error but that's ok
  try {
    await response.text();
  } catch {
    // Body already consumed or empty, that's fine
  }
}

/**
 * Assert response status and consume the body to prevent resource leaks.
 * Use this instead of bare assertEquals(res.status, X) checks.
 */
export async function expectStatusAndConsume(
  response: Response,
  expected: number | number[]
): Promise<void> {
  const expectedArr = Array.isArray(expected) ? expected : [expected];
  const isExpected = expectedArr.includes(response.status);

  if (!isExpected) {
    const body = await response.text();
    throw new Error(
      `Expected status ${expectedArr.join(" or ")} but got ${response.status}: ${body}`
    );
  }

  // Consume body to prevent resource leak
  await consumeResponse(response);
}

// ========================================
// Fixture Helpers
// ========================================

/**
 * Get or create a test user with organization and workspace.
 * If a user with the given email already exists, returns their info instead of creating.
 * This prevents duplicate key violations when tests are run multiple times.
 */
export async function getOrCreateTestUser(
  overrides: Partial<{
    email: string;
    name: string;
    subscriptionTier: TestUser["subscriptionTier"];
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }> = {}
): Promise<TestUser> {
  const timestamp = Date.now();
  const email = overrides.email || `test_${timestamp}@example.com`;
  const name = overrides.name || "Test User";
  const tier = overrides.subscriptionTier || "FREE";
  const isAdmin = overrides.isAdmin || false;
  const isSuperAdmin = overrides.isSuperAdmin || false;

  // Determine role (owner, admin, member, viewer)
  const tokenRole = isSuperAdmin ? "admin" : isAdmin ? "admin" : "owner";

  // Check if user already exists
  const existingUsers = await sql`
    SELECT u.id, u.email, u.name, u.organization_id, o.subscription_tier,
           wm.workspace_id
    FROM app.users u
    JOIN app.organizations o ON o.id = u.organization_id
    LEFT JOIN app.workspace_members wm ON wm.user_id = u.id
    WHERE u.email = ${email}
    LIMIT 1
  `;

  if (existingUsers.length > 0) {
    const existing = existingUsers[0];
    return {
      id: existing.id,
      email: existing.email,
      token: generateTestToken(existing.id, {
        email: existing.email,
        name: existing.name || name,
        organizationId: existing.organization_id,
        activeWorkspaceId: existing.workspace_id,
        role: tokenRole as "owner" | "admin" | "member",
      }),
      organizationId: existing.organization_id,
      workspaceId: existing.workspace_id,
      subscriptionTier: existing.subscription_tier || tier,
      isAdmin,
      isSuperAdmin,
    };
  }

  // Create new user if not exists
  return createTestUser(overrides);
}

/**
 * Create a test user with organization and workspace.
 * Use getOrCreateTestUser for fixture users that may already exist.
 */
export async function createTestUser(
  overrides: Partial<{
    email: string;
    name: string;
    subscriptionTier: TestUser["subscriptionTier"];
    isAdmin: boolean;
    isSuperAdmin: boolean;
  }> = {}
): Promise<TestUser> {
  const timestamp = Date.now();
  const email = overrides.email || `test_${timestamp}@example.com`;
  const name = overrides.name || "Test User";
  const tier = overrides.subscriptionTier || "FREE";
  const isAdmin = overrides.isAdmin || false;
  const isSuperAdmin = overrides.isSuperAdmin || false;

  // Determine role (owner, admin, member, viewer)
  const dbRole = isSuperAdmin || isAdmin ? "admin" : "owner";
  const tokenRole = isSuperAdmin ? "admin" : isAdmin ? "admin" : "owner";

  // Create organization
  const [org] = await sql`
    INSERT INTO app.organizations (name, subscription_tier)
    VALUES (${`test_org_${timestamp}`}, ${tier}::subscription_tier)
    RETURNING id
  `;

  // Create user in this organization
  const [user] = await sql`
    INSERT INTO app.users (email, name, role, organization_id)
    VALUES (${email}, ${name}, ${dbRole}::user_role, ${org.id})
    RETURNING id
  `;

  // Create workspace
  const [workspace] = await sql`
    INSERT INTO app.workspaces (organization_id, name)
    VALUES (${org.id}, ${`test_workspace_${timestamp}`})
    RETURNING id
  `;

  // Add user to workspace as owner
  await sql`
    INSERT INTO app.workspace_members (workspace_id, user_id, role)
    VALUES (${workspace.id}, ${user.id}, 'OWNER'::workspace_role)
  `;

  return {
    id: user.id,
    email,
    token: generateTestToken(user.id, {
      email,
      name,
      organizationId: org.id,
      activeWorkspaceId: workspace.id,
      role: tokenRole as "owner" | "admin" | "member",
    }),
    organizationId: org.id,
    workspaceId: workspace.id,
    subscriptionTier: tier,
    isAdmin,
    isSuperAdmin,
  };
}

/**
 * Create a test application for a user.
 */
export async function createTestApplication(
  user: TestUser,
  overrides: Partial<{
    name: string;
    appNameId: string;
    description: string;
    systemPrompt: string;
    model: string;
  }> = {}
): Promise<TestApplication> {
  const timestamp = Date.now();
  const name = overrides.name || `test_app_${timestamp}`;
  const appNameId = overrides.appNameId || `test-app-${timestamp}`;

  const [application] = await sql`
    INSERT INTO app.applications (
      name,
      app_name_id,
      description,
      system_prompt,
      model,
      developer_id,
      organization_id,
      workspace_id
    )
    VALUES (
      ${name},
      ${appNameId},
      ${overrides.description || "Test application"},
      ${overrides.systemPrompt || "You are a helpful assistant."},
      ${overrides.model || "gpt-4o"},
      ${user.id},
      ${user.organizationId},
      ${user.workspaceId}
    )
    RETURNING id, name, app_name_id
  `;

  return {
    id: application.id,
    name: application.name,
    appNameId: application.app_name_id,
    ownerId: user.id,
    workspaceId: user.workspaceId,
  };
}

// ========================================
// Test Lifecycle Helpers
// ========================================

/**
 * Setup function to run before all tests in a file.
 * Verifies database connection.
 */
export async function setupTests() {
  // Verify database connection
  const [result] = await sql`SELECT 1 as connected`;
  if (result.connected !== 1) {
    throw new Error("Database connection failed");
  }
  console.log("[test] Database connected");
}

/**
 * Teardown function to run after all tests in a file.
 * Closes the database connection to prevent resource leaks.
 */
export async function teardownTests() {
  // Cleanup is handled by individual tests or cleanupTestData()
  console.log("[test] Tests complete");
  // Close database connection to prevent resource leaks
  await sql.end();
}

// ========================================
// Exports
// ========================================

export { app, sql };
