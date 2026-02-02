/**
 * Database Mock for Tests
 *
 * Provides a way to mock the database client for tests that don't need a real database.
 */

// Mock the database client to avoid connection errors during test imports
export function setupDbMock() {
  // Set a dummy database URL to prevent the client from throwing on import
  if (!Deno.env.get("DENO_DATABASE_URL") && !Deno.env.get("PG_DATABASE_URL")) {
    Deno.env.set("DENO_DATABASE_URL", "postgres://postgres:test@localhost:5432/chipp_test");
  }
}

