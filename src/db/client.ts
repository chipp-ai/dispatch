/**
 * Database Client
 *
 * Kysely-based type-safe query builder for PostgreSQL.
 * Uses the consolidated database schema.
 */

import { CamelCasePlugin, Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import type { Database } from "./schema.ts";

// Create postgres.js connection
// Priority: TEST_DATABASE_URL > DENO_DATABASE_URL > DATABASE_URL > PG_DATABASE_URL (shared PostgreSQL)
const connectionString =
  Deno.env.get("TEST_DATABASE_URL") ||
  Deno.env.get("DENO_DATABASE_URL") ||
  Deno.env.get("DATABASE_URL") ||
  Deno.env.get("PG_DATABASE_URL");

function createDatabaseClient(): {
  sql: ReturnType<typeof postgres>;
  db: Kysely<Database>;
  configured: boolean;
} {
  if (!connectionString) {
    console.warn(
      "[db] WARNING: TEST_DATABASE_URL, DENO_DATABASE_URL, or PG_DATABASE_URL not set. Database features disabled."
    );
    // Create a no-op proxy that throws on any operation
    const noOpHandler = {
      get: () => {
        return () => {
          throw new Error(
            "Database not configured. Set PG_DATABASE_URL environment variable."
          );
        };
      },
    };
    return {
      sql: new Proxy({}, noOpHandler) as ReturnType<typeof postgres>,
      db: new Proxy({}, noOpHandler) as Kysely<Database>,
      configured: false,
    };
  }

  // Set search_path via PostgreSQL connection options (applies to all connections)
  const connectionUrl = new URL(connectionString);
  const searchPathOption =
    "-c search_path=app,chat,rag,billing,jobs,embeddings,public";
  const existingOptions = connectionUrl.searchParams.get("options");
  const newOptions = existingOptions
    ? `${existingOptions} ${searchPathOption}`
    : searchPathOption;
  connectionUrl.searchParams.set("options", newOptions);

  // Raw SQL client for complex queries
  const sqlClient = postgres(connectionUrl.toString(), {
    max: 20, // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Create Kysely instance with postgres.js dialect
  const dialect = new PostgresJSDialect({
    postgres: sqlClient,
  });

  const dbClient = new Kysely<Database>({
    dialect,
    plugins: [new CamelCasePlugin()],
  });

  return { sql: sqlClient, db: dbClient, configured: true };
}

const { sql, db, configured: dbConfigured } = createDatabaseClient();

export { sql, db };
export const isDatabaseConfigured = () => dbConfigured;

/**
 * Helper for typed raw SQL queries
 * Usage: await rawQuery<User[]>`SELECT * FROM users WHERE id = ${id}`;
 */
export async function rawQuery<T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  // deno-lint-ignore no-explicit-any
  const result = await (sql as any)(strings, ...values);
  return result as T;
}

/**
 * Get SQL instance for raw queries
 */
export function getSql(): ReturnType<typeof postgres> {
  return sql;
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await db.destroy();
  await sql.end();
}
