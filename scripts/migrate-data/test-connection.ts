/**
 * Test Connection Script
 *
 * Verifies the target database connection and migration tables work.
 * Run this before attempting the full migration.
 *
 * Usage:
 *   deno task migrate:test-connection
 */

import postgres from "postgres";

async function main(): Promise<void> {
  console.log("\n🔌 Testing database connection...\n");

  const connectionUrl = Deno.env.get("DATABASE_URL");
  if (!connectionUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    Deno.exit(1);
  }

  const sql = postgres(connectionUrl);

  try {
    // Test basic connection
    const result = await sql`SELECT version()`;
    console.log("✅ Connected to PostgreSQL");
    console.log(`   Version: ${result[0].version.split(",")[0]}`);

    // Test pgvector extension
    const vectorCheck =
      await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    if (vectorCheck.length > 0) {
      console.log("✅ pgvector extension is installed");
    } else {
      console.log("⚠️  pgvector extension not found - embeddings may not work");
    }

    // Test schemas exist
    const schemas = await sql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('app', 'chat', 'rag', 'billing', 'jobs')
    `;
    console.log(`✅ Found ${schemas.length}/5 migration schemas`);

    // Test migration tables
    await sql`
      CREATE TABLE IF NOT EXISTS _migration_test (
        id SERIAL PRIMARY KEY,
        test_value TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    const testValue = `test-${Date.now()}`;
    await sql`INSERT INTO _migration_test (test_value) VALUES (${testValue})`;
    const testRows =
      await sql`SELECT COUNT(*)::int as count FROM _migration_test`;
    console.log(
      `✅ Write test passed (${testRows[0].count} rows in test table)`
    );

    // Cleanup
    await sql`DROP TABLE _migration_test`;
    console.log("✅ Cleanup successful");

    console.log("\n🎉 All connection tests passed!\n");
    console.log("You can now run the migration with:");
    console.log("  deno task migrate:data:test  (10 records per phase)");
    console.log("  deno task migrate:data       (full migration)\n");
  } catch (error) {
    console.error("\n❌ Connection test failed:", error);
    Deno.exit(1);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main();
}
