/**
 * Migration: Add cost tracking columns
 *
 * Adds columns to track Claude Code API costs per issue:
 * 1. cost_usd (NUMERIC) - accumulated cost across all spawns
 * 2. model (TEXT) - which model was used in the last spawn
 * 3. num_turns (INT) - total turns across all spawns
 *
 * Run with: npx tsx scripts/migrations/004-add-cost-tracking.ts
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

    console.log("Adding cost tracking columns to chipp_issue...");
    await client.query(`
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS cost_usd NUMERIC DEFAULT 0;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS model TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS num_turns INT DEFAULT 0;
    `);

    await client.query("COMMIT");
    console.log("\nMigration 004 completed successfully!");
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
