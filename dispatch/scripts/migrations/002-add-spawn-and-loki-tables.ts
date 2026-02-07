/**
 * Migration: Add spawn tracking and Loki integration columns
 *
 * This migration adds:
 * 1. Spawn tracking columns on chipp_issue (spawn_status, spawn_run_id, spawn_started_at, spawn_completed_at)
 * 2. chipp_spawn_budget table for daily budget tracking
 * 3. Cooldown and event tracking columns on chipp_external_issue
 *
 * Run with: npx tsx scripts/migrations/002-add-spawn-and-loki-tables.ts
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

    // Spawn tracking columns on chipp_issue
    console.log("Adding spawn tracking columns to chipp_issue...");
    await client.query(`
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_status TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_run_id TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_started_at TIMESTAMP;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_completed_at TIMESTAMP;
    `);

    // Daily budget tracking table
    console.log("Creating chipp_spawn_budget table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS chipp_spawn_budget (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        spawn_count INT DEFAULT 0,
        max_spawns INT DEFAULT 10
      );
    `);

    // Cooldown and event tracking on external issues
    console.log("Adding cooldown and event tracking columns to chipp_external_issue...");
    await client.query(`
      ALTER TABLE chipp_external_issue ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMP;
      ALTER TABLE chipp_external_issue ADD COLUMN IF NOT EXISTS event_count INT DEFAULT 1;
      ALTER TABLE chipp_external_issue ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NOW();
    `);

    // Index for efficient spawn status lookups
    console.log("Creating index on spawn_status...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_spawn_status
        ON chipp_issue(spawn_status)
        WHERE spawn_status IS NOT NULL;
    `);

    await client.query("COMMIT");
    console.log("\nMigration completed successfully!");
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
