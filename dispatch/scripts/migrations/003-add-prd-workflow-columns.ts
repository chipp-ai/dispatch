/**
 * Migration: Add PRD workflow columns
 *
 * Adds columns for the PRD-driven development flow:
 * 1. workflow_type (error_fix vs prd) on chipp_issue
 * 2. Plan lifecycle columns (status, content, feedback, approval)
 * 3. spawn_type and attempt tracking
 * 4. blocked_reason for agent blockers
 * 5. spawn_type on budget table for separate pools
 *
 * Run with: npx tsx scripts/migrations/003-add-prd-workflow-columns.ts
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

    // PRD workflow columns on chipp_issue
    console.log("Adding PRD workflow columns to chipp_issue...");
    await client.query(`
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS workflow_type TEXT DEFAULT 'error_fix';
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS plan_status TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS plan_content TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS plan_feedback TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMPTZ;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS plan_approved_by TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_type TEXT;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS spawn_attempt_count INT DEFAULT 0;
      ALTER TABLE chipp_issue ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
    `);

    // Add spawn_type to budget table for separate pools (error vs PRD)
    console.log("Adding spawn_type to chipp_spawn_budget...");
    await client.query(`
      ALTER TABLE chipp_spawn_budget ADD COLUMN IF NOT EXISTS spawn_type TEXT DEFAULT 'error_fix';
    `);

    // Replace the unique constraint on date with date+spawn_type
    console.log("Updating chipp_spawn_budget unique constraint...");
    await client.query(`
      ALTER TABLE chipp_spawn_budget DROP CONSTRAINT IF EXISTS chipp_spawn_budget_date_key;
      ALTER TABLE chipp_spawn_budget DROP CONSTRAINT IF EXISTS chipp_spawn_budget_date_type_key;
      ALTER TABLE chipp_spawn_budget ADD CONSTRAINT chipp_spawn_budget_date_type_key UNIQUE (date, spawn_type);
    `);

    // Index for workflow_type lookups
    console.log("Creating indexes...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_issue_workflow_type
        ON chipp_issue(workflow_type)
        WHERE workflow_type IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_issue_plan_status
        ON chipp_issue(plan_status)
        WHERE plan_status IS NOT NULL;
    `);

    await client.query("COMMIT");
    console.log("\nMigration 003 completed successfully!");
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
