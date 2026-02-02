/**
 * Test Helpers
 *
 * Utilities for creating test data and making authenticated requests.
 */

import { app } from "../app.ts";

// ========================================
// Test Token Generation
// ========================================

export interface TestUserPayload {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  activeWorkspaceId?: string;
  role?: "owner" | "admin" | "member";
}

/**
 * Create a valid test JWT token
 * This creates a token that the auth middleware can verify
 */
export function createTestToken(user: TestUserPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organizationId,
    activeWorkspaceId: user.activeWorkspaceId || null,
    role: user.role || "member",
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  // Note: In tests, we don't verify the signature, just the payload structure
  const signature = "test-signature";

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Create a test user with sensible defaults
 */
export function createTestUserPayload(
  overrides: Partial<TestUserPayload> = {}
): TestUserPayload {
  return {
    id: overrides.id || `user-${Date.now()}`,
    email: overrides.email || `test-${Date.now()}@example.com`,
    name: overrides.name || "Test User",
    organizationId: overrides.organizationId || `org-${Date.now()}`,
    activeWorkspaceId: overrides.activeWorkspaceId,
    role: overrides.role || "member",
  };
}

// ========================================
// Request Helpers
// ========================================

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Make an authenticated API request
 */
export async function authRequest(
  path: string,
  user: TestUserPayload,
  options: RequestOptions = {}
): Promise<Response> {
  const token = createTestToken(user);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const init: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined && options.body !== null) {
    init.body = JSON.stringify(options.body);
  }

  return app.request(path, init);
}

/**
 * Make a public (unauthenticated) API request
 */
export async function publicRequest(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const init: RequestInit = {
    method: options.method || "GET",
    headers,
  };

  if (options.body !== undefined && options.body !== null) {
    init.body = JSON.stringify(options.body);
  }

  return app.request(path, init);
}

/**
 * Parse JSON response with type assertion
 */
export async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// ========================================
// Assertion Helpers
// ========================================

import { assertEquals } from "@std/assert";

/**
 * Assert response has specific status
 */
export function assertStatus(response: Response, expected: number) {
  assertEquals(
    response.status,
    expected,
    `Expected status ${expected}, got ${response.status}`
  );
}

/**
 * Assert response is JSON with expected structure
 */
export async function assertJsonResponse<T>(
  response: Response,
  expectedStatus: number
): Promise<T> {
  assertStatus(response, expectedStatus);
  assertEquals(
    response.headers.get("content-type")?.includes("application/json"),
    true,
    "Expected JSON response"
  );
  return parseJson<T>(response);
}
