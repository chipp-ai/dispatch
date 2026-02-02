/**
 * Database Migration Runner
 *
 * Simple migration runner for PostgreSQL.
 * Uses postgres.js for database access.
 * Tracks applied migrations in a migrations table.
 */

import postgres from "postgres";

const MIGRATIONS_DIR = new URL("./migrations", import.meta.url).pathname;

interface Migration {
  name: string;
}

async function getMigrationFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

async function main() {
  const connectionString =
    Deno.env.get("DENO_DATABASE_URL") ||
    Deno.env.get("DATABASE_URL") ||
    Deno.env.get("PG_DATABASE_URL");
  if (!connectionString) {
    console.error(
      "Database URL not found. Set DENO_DATABASE_URL, DATABASE_URL, or PG_DATABASE_URL."
    );
    Deno.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    // Create migrations tracking table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // Get applied migrations
    const applied = await sql<Migration[]>`
      SELECT name FROM _migrations ORDER BY id
    `;
    const appliedNames = new Set(applied.map((m) => m.name));

    // Get migration files
    const files = await getMigrationFiles();
    const pending = files.filter((f) => !appliedNames.has(f));

    if (pending.length === 0) {
      console.log("✓ No pending migrations");
      await sql.end();
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):\n`);

    for (const file of pending) {
      console.log(`→ Applying: ${file}`);

      const filePath = `${MIGRATIONS_DIR}/${file}`;
      const content = await Deno.readTextFile(filePath);

      // Execute the migration (supports multiple statements)
      await sql.unsafe(content);

      // Record the migration
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;

      console.log(`✓ Applied: ${file}\n`);
    }

    console.log("✓ All migrations applied successfully");
  } catch (error) {
    // Detect PostgreSQL permission errors and provide actionable fix
    const isPermissionError =
      error instanceof Error &&
      (error.message.includes("permission denied") ||
        error.message.includes("must be owner of"));

    if (isPermissionError) {
      console.error("\nMigration failed: insufficient database permissions.\n");
      console.error(
        "Your database user does not have permission to modify the 'app' schema."
      );
      console.error(
        "This happens when the schema was created by a different user.\n"
      );
      console.error(
        "Fix: Run this once to grant your user superuser privileges:\n"
      );
      console.error(
        '  PGPASSWORD=supersecret psql -h localhost -p 5433 -U postgres -d chipp -c "ALTER ROLE chipp_dev SUPERUSER;"'
      );
      console.error("\nOr recreate the Docker volume (loses local data):\n");
      console.error(
        "  docker compose down -v postgres && docker compose up -d postgres"
      );
      console.error("\nThen re-run: deno task db:migrate\n");
    } else {
      console.error("Migration failed:", error);
    }
    Deno.exit(1);
  } finally {
    await sql.end();
  }
}

main();
