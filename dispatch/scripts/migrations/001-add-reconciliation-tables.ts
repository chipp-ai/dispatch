/**
 * Migration: Add reconciliation tables and new statuses
 *
 * This migration adds:
 * 1. chipp_issue_history - Audit trail for all issue changes
 * 2. chipp_issue_pr - Linked PRs to issues
 * 3. chipp_reconciliation - Track reconciliation runs
 * 4. New statuses: "In Staging" and "In Production"
 *
 * Run with: npx tsx scripts/migrations/001-add-reconciliation-tables.ts
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

    console.log("Creating history_action_type enum...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE history_action_type AS ENUM (
          'created',
          'status_changed',
          'pr_linked',
          'pr_unlinked',
          'pr_status_changed',
          'edited',
          'priority_changed',
          'assignee_changed',
          'label_added',
          'label_removed',
          'agent_started',
          'agent_completed',
          'comment_added',
          'reconciled'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Creating history_actor_type enum...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE history_actor_type AS ENUM (
          'user',
          'system',
          'agent',
          'github_webhook',
          'reconciliation'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Creating pr_status enum...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE pr_status AS ENUM (
          'open',
          'merged',
          'closed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Creating reconciliation_status enum...");
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE reconciliation_status AS ENUM (
          'running',
          'completed',
          'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Creating chipp_issue_history table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS chipp_issue_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id TEXT NOT NULL REFERENCES chipp_issue(id) ON DELETE CASCADE,
        action history_action_type NOT NULL,
        old_value JSONB,
        new_value JSONB,
        actor_type history_actor_type NOT NULL,
        actor_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_issue_history_issue_id
        ON chipp_issue_history(issue_id, created_at DESC);
    `);

    console.log("Creating chipp_issue_pr table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS chipp_issue_pr (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        issue_id TEXT NOT NULL REFERENCES chipp_issue(id) ON DELETE CASCADE,
        pr_number INTEGER NOT NULL,
        pr_url VARCHAR(500) NOT NULL,
        pr_title VARCHAR(500) NOT NULL,
        pr_status pr_status NOT NULL DEFAULT 'open',
        branch_name VARCHAR(255),
        author VARCHAR(255),
        base_branch VARCHAR(100),
        head_branch VARCHAR(100),
        ai_summary TEXT,
        match_confidence FLOAT,
        merged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(issue_id, pr_number)
      );

      CREATE INDEX IF NOT EXISTS idx_issue_pr_issue_id
        ON chipp_issue_pr(issue_id);
      CREATE INDEX IF NOT EXISTS idx_issue_pr_pr_number
        ON chipp_issue_pr(pr_number);
    `);

    console.log("Creating chipp_reconciliation table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS chipp_reconciliation (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id TEXT NOT NULL REFERENCES chipp_workspace(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        prs_processed INTEGER DEFAULT 0,
        issues_updated INTEGER DEFAULT 0,
        status reconciliation_status NOT NULL DEFAULT 'running',
        error TEXT,
        metadata JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_reconciliation_workspace
        ON chipp_reconciliation(workspace_id, started_at DESC);
    `);

    // Add new statuses to existing workspaces
    console.log("Adding new statuses to existing workspaces...");
    const workspaces = await client.query("SELECT id FROM chipp_workspace");

    for (const workspace of workspaces.rows) {
      // Check if "In Staging" already exists
      const inStagingExists = await client.query(
        `SELECT id FROM chipp_status WHERE workspace_id = $1 AND name = 'In Staging'`,
        [workspace.id]
      );

      if (inStagingExists.rows.length === 0) {
        // Get current max position
        const maxPos = await client.query(
          `SELECT COALESCE(MAX(position), 0) as max_pos FROM chipp_status WHERE workspace_id = $1`,
          [workspace.id]
        );

        // Shift Done and Canceled positions up to make room
        await client.query(
          `UPDATE chipp_status
           SET position = position + 2
           WHERE workspace_id = $1 AND name IN ('Done', 'Canceled')`,
          [workspace.id]
        );

        // Insert "In Staging" after "In Review"
        await client.query(
          `INSERT INTO chipp_status (id, workspace_id, name, color, position, is_triage, is_closed)
           VALUES (gen_random_uuid(), $1, 'In Staging', '#8B5CF6', 5, false, false)`,
          [workspace.id]
        );

        // Insert "In Production" after "In Staging"
        await client.query(
          `INSERT INTO chipp_status (id, workspace_id, name, color, position, is_triage, is_closed)
           VALUES (gen_random_uuid(), $1, 'In Production', '#06B6D4', 6, false, false)`,
          [workspace.id]
        );

        console.log(`  Added statuses to workspace ${workspace.id}`);
      } else {
        console.log(`  Statuses already exist in workspace ${workspace.id}`);
      }
    }

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
