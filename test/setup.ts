/**
 * Test Setup Module
 *
 * Provides test database connections, transaction isolation, and mock utilities.
 * Following the testing strategy from docs/deno-migration/testing.md
 */

import postgres from "postgres";
import { closeDatabase } from "../src/db/client.ts";

// Test database configuration
const TEST_DATABASE_URL =
  Deno.env.get("TEST_DATABASE_URL") ||
  "postgres://postgres:test@localhost:5432/chipp_test";

let testSql: ReturnType<typeof postgres> | null = null;

/**
 * Initialize test database connection
 */
export async function setupTestDb(): Promise<ReturnType<typeof postgres>> {
  if (testSql) {
    return testSql;
  }

  testSql = postgres(TEST_DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Verify connection
  try {
    await testSql`SELECT 1`;
  } catch (error) {
    console.error("Failed to connect to test database:", error);
    throw error;
  }

  return testSql;
}

/**
 * Clean up all test data (run between test suites)
 */
export async function cleanupTestDb(): Promise<void> {
  if (!testSql) {
    throw new Error("Test database not initialized");
  }

  await testSql`
    TRUNCATE TABLE
      app.applications,
      app.workspace_members,
      app.workspaces,
      app.users,
      app.organizations,
      chat.messages,
      chat.sessions
    CASCADE
  `;
}

/**
 * Tear down test database connection
 */
export async function teardownTestDb(): Promise<void> {
  // Close the main database connection pool used by services
  try {
    await closeDatabase();
  } catch (error) {
    // Ignore errors if already closed
    console.warn("Error closing main database:", error);
  }

  // Close the test database connection
  if (testSql) {
    await testSql.end({ timeout: 5 });
    testSql = null;
  }
}

/**
 * Get the test database connection
 */
export function getTestDb(): ReturnType<typeof postgres> {
  if (!testSql) {
    throw new Error("Test database not initialized. Call setupTestDb() first.");
  }
  return testSql;
}

/**
 * SQL template tag for fixtures - wraps getTestDb()
 * Use this in fixtures after setupTestDb() has been called
 */
export const sql = new Proxy({} as ReturnType<typeof postgres>, {
  apply: (_target, _thisArg, args) => getTestDb()(args[0], ...args.slice(1)),
  get: (_target, prop) => {
    const db = getTestDb();
    const value = db[prop as keyof typeof db];
    return typeof value === "function" ? value.bind(db) : value;
  },
});

// ========================================
// Test Data Factories
// ========================================

import { v4 as uuidv4 } from "npm:uuid";

let idCounter = 0;

function generateId(): string {
  idCounter++;
  // Generate a proper UUID for PostgreSQL
  return uuidv4();
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  organization_id: string;
}

export interface TestWorkspace {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
}

export interface TestApplication {
  id: string;
  name: string;
  slug: string;
  workspace_id: string;
  creator_id: string;
}

/**
 * Create a test organization
 */
export async function createTestOrganization(
  overrides: Partial<TestOrganization> = {}
): Promise<TestOrganization> {
  const sql = getTestDb();
  const id = overrides.id || generateId();
  const name = overrides.name || `Test Org ${id}`;
  const slug = overrides.slug || `test-org-${id}`;
  const tier = overrides.subscription_tier || "FREE";

  const result = await sql`
    INSERT INTO app.organizations (id, name, slug, subscription_tier)
    VALUES (${id}, ${name}, ${slug}, ${tier})
    RETURNING *
  `;

  return result[0] as TestOrganization;
}

/**
 * Create a test user
 */
export async function createTestUser(
  overrides: Partial<TestUser> & { organization_id: string }
): Promise<TestUser> {
  const sql = getTestDb();
  const id = overrides.id || generateId();
  const email = overrides.email || `test-${id}@example.com`;
  const name = overrides.name || `Test User ${id}`;

  const result = await sql`
    INSERT INTO app.users (id, email, name, organization_id)
    VALUES (${id}, ${email}, ${name}, ${overrides.organization_id})
    RETURNING *
  `;

  return result[0] as TestUser;
}

/**
 * Create a test workspace with the creator as owner
 */
export async function createTestWorkspace(
  overrides: Partial<TestWorkspace> & {
    organization_id: string;
    creator_id: string;
  }
): Promise<TestWorkspace> {
  const sql = getTestDb();
  const id = overrides.id || generateId();
  const name = overrides.name || `Test Workspace ${id}`;
  const slug = overrides.slug || `test-workspace-${id}`;

  // Workspaces table doesn't have slug column, only name
  const result = await sql`
    INSERT INTO app.workspaces (id, name, organization_id)
    VALUES (${id}, ${name}, ${overrides.organization_id})
    RETURNING *
  `;

  const workspace = result[0] as TestWorkspace;
  // Add slug to the returned object for test compatibility
  workspace.slug = slug;

  // Add creator as owner (workspace_role enum uses uppercase)
  await sql`
    INSERT INTO app.workspace_members (workspace_id, user_id, role)
    VALUES (${id}, ${overrides.creator_id}, 'OWNER')
  `;

  return workspace;
}

/**
 * Create a test application
 */
export async function createTestApplication(
  overrides: Partial<TestApplication> & {
    workspace_id: string;
    creator_id: string;
  }
): Promise<TestApplication> {
  const sql = getTestDb();
  const id = overrides.id || generateId();
  const name = overrides.name || `Test App ${id}`;
  const appNameId = overrides.slug || `test-app-${id}`;

  // Applications table uses app_name_id, not slug, and creator_id is developer_id
  const result = await sql`
    INSERT INTO app.applications (id, name, app_name_id, workspace_id, developer_id)
    VALUES (${id}, ${name}, ${appNameId}, ${overrides.workspace_id}, ${overrides.creator_id})
    RETURNING *
  `;

  const app = result[0] as TestApplication;
  // Add slug for test compatibility
  app.slug = appNameId;
  return app;
}

// ========================================
// Mock Utilities
// ========================================

/**
 * Create a mock JWT token for testing authenticated routes
 */
export function createMockAuthToken(user: TestUser): string {
  // For tests, we use a simple base64 encoded user ID
  // The auth middleware needs to be configured to accept test tokens
  return `test-token-${btoa(JSON.stringify({ userId: user.id, email: user.email }))}`;
}

/**
 * Create authorization headers for testing
 */
export function createAuthHeaders(user: TestUser): Record<string, string> {
  return {
    Authorization: `Bearer ${createMockAuthToken(user)}`,
    "Content-Type": "application/json",
  };
}

// ========================================
// Request Helpers
// ========================================

import { app } from "../app.ts";

/**
 * Make an authenticated request to the API
 */
export async function authRequest(
  path: string,
  user: TestUser,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...createAuthHeaders(user),
    ...(options.headers || {}),
  };

  return app.request(path, {
    method: options.method,
    body: options.body,
    headers,
  });
}

/**
 * Make a public request to the API
 */
export async function publicRequest(
  path: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  return app.request(path, {
    method: options.method,
    body: options.body,
    headers: options.headers,
  });
}
