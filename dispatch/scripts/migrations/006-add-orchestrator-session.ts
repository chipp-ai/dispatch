/**
 * Migration: Add orchestrator session table
 *
 * Stores conversation history for the orchestrator terminal.
 * Messages are stored in Anthropic's native format (array of {role, content}
 * including tool_use/tool_result blocks) for exact replay fidelity.
 *
 * Run with: npx tsx scripts/migrations/006-add-orchestrator-session.ts
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.PG_DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Creating chipp_orchestrator_session table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS chipp_orchestrator_session (
        id TEXT PRIMARY KEY,
        workspace_id TEXT REFERENCES chipp_workspace(id),
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_orchestrator_session_workspace
        ON chipp_orchestrator_session(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_orchestrator_session_updated
        ON chipp_orchestrator_session(updated_at);
    `);

    await client.query("COMMIT");
    console.log("\nMigration 006 completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
