/**
 * Migration: Add run outcome tracking columns
 *
 * Adds columns to track the declared outcome of each autonomous run:
 * 1. run_outcome (TEXT) - enum: completed, no_changes_needed, blocked, needs_human_decision, investigation_complete, failed
 * 2. outcome_summary (TEXT) - human-readable explanation of the outcome
 *
 * Run with: npx tsx scripts/migrations/005-add-run-outcome.ts
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

    console.log("Adding run outcome columns to chipp_issue...");
    await client.query(`
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS run_outcome TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS outcome_summary TEXT;
    `);

    await client.query("COMMIT");
    console.log("\nMigration 005 completed successfully!");
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
