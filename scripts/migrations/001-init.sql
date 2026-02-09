-- Dispatch: Complete database schema
-- Run with: psql $PG_DATABASE_URL -f scripts/migrations/001-init.sql
--
-- This creates the full schema from scratch. For existing deployments,
-- see the incremental migration files in git history.

-- =============================================================================
-- Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Enums
-- =============================================================================

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
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE history_actor_type AS ENUM (
    'user',
    'system',
    'agent',
    'github_webhook',
    'reconciliation'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pr_status AS ENUM (
    'open',
    'merged',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE reconciliation_status AS ENUM (
    'running',
    'completed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- Tables
-- =============================================================================

-- 1. Workspace (top-level container)
CREATE TABLE IF NOT EXISTS dispatch_workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  issue_prefix TEXT NOT NULL,
  next_issue_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Status (workflow states for issues)
CREATE TABLE IF NOT EXISTS dispatch_status (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_triage BOOLEAN NOT NULL DEFAULT false,
  is_closed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_status_workspace ON dispatch_status(workspace_id);

-- 3. Label (tags for issues)
CREATE TABLE IF NOT EXISTS dispatch_label (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_label_workspace ON dispatch_label(workspace_id);

-- 4. Agent (autonomous agents assigned to work)
CREATE TABLE IF NOT EXISTS dispatch_agent (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_workspace ON dispatch_agent(workspace_id);

-- 5. Customer (external orgs who report issues)
CREATE TABLE IF NOT EXISTS dispatch_customer (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  slack_channel_id TEXT UNIQUE,
  portal_token TEXT UNIQUE NOT NULL,
  brand_color TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_slug ON dispatch_customer(workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_customer_workspace ON dispatch_customer(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customer_slack_channel ON dispatch_customer(slack_channel_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_token ON dispatch_customer(portal_token);

-- 6. Customer User (individuals within a customer org)
CREATE TABLE IF NOT EXISTS dispatch_customer_user (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL REFERENCES dispatch_customer(id) ON DELETE CASCADE,
  slack_user_id TEXT NOT NULL,
  slack_display_name TEXT NOT NULL,
  slack_avatar_url TEXT,
  email TEXT,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, slack_user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_user_customer ON dispatch_customer_user(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_user_slack ON dispatch_customer_user(slack_user_id);

-- 7. Issue (main entity)
CREATE TABLE IF NOT EXISTS dispatch_issue (
  id TEXT PRIMARY KEY,
  identifier TEXT UNIQUE NOT NULL,
  issue_number INTEGER NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status_id TEXT NOT NULL REFERENCES dispatch_status(id),
  priority TEXT NOT NULL DEFAULT 'P3',
  assignee_id TEXT REFERENCES dispatch_agent(id) ON DELETE SET NULL,

  -- Customer / reporter
  customer_id TEXT REFERENCES dispatch_customer(id) ON DELETE SET NULL,
  reporter_id TEXT REFERENCES dispatch_customer_user(id) ON DELETE SET NULL,
  slack_channel_id TEXT,
  slack_thread_ts TEXT,

  -- Semantic search (pgvector)
  embedding vector(1536),
  embedding_provider TEXT,
  embedding_model TEXT,

  -- Agent execution
  agent_status TEXT NOT NULL DEFAULT 'idle',
  agent_output JSONB,
  agent_confidence NUMERIC,
  agent_tokens_used INTEGER,
  agent_started_at TIMESTAMPTZ,
  agent_completed_at TIMESTAMPTZ,

  -- Spawn tracking
  spawn_status TEXT,
  spawn_run_id TEXT,
  spawn_started_at TIMESTAMPTZ,
  spawn_completed_at TIMESTAMPTZ,

  -- PRD workflow
  workflow_type TEXT DEFAULT 'error_fix',
  plan_status TEXT,
  plan_content TEXT,
  plan_feedback TEXT,
  plan_approved_at TIMESTAMPTZ,
  plan_approved_by TEXT,
  spawn_type TEXT,
  spawn_attempt_count INTEGER DEFAULT 0,
  blocked_reason TEXT,

  -- Cost tracking
  cost_usd NUMERIC DEFAULT 0,
  model TEXT,
  num_turns INTEGER DEFAULT 0,

  -- Run outcome
  run_outcome TEXT,
  outcome_summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_workspace ON dispatch_issue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_issue_identifier ON dispatch_issue(identifier);
CREATE INDEX IF NOT EXISTS idx_issue_status ON dispatch_issue(status_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignee ON dispatch_issue(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issue_customer ON dispatch_issue(customer_id);
CREATE INDEX IF NOT EXISTS idx_issue_spawn_status ON dispatch_issue(spawn_status) WHERE spawn_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_workflow_type ON dispatch_issue(workflow_type) WHERE workflow_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_plan_status ON dispatch_issue(plan_status) WHERE plan_status IS NOT NULL;

-- 8. Issue Label (many-to-many)
CREATE TABLE IF NOT EXISTS dispatch_issue_label (
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES dispatch_label(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_label_issue ON dispatch_issue_label(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_label_label ON dispatch_issue_label(label_id);

-- 9. Issue Watcher (which customers watch which issues)
CREATE TABLE IF NOT EXISTS dispatch_issue_watcher (
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES dispatch_customer(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_watcher_issue ON dispatch_issue_watcher(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_watcher_customer ON dispatch_issue_watcher(customer_id);

-- 10. Comment
CREATE TABLE IF NOT EXISTS dispatch_comment (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES dispatch_agent(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  embedding vector(1536),
  embedding_provider TEXT,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_issue ON dispatch_comment(issue_id);
CREATE INDEX IF NOT EXISTS idx_comment_author ON dispatch_comment(author_id);

-- 11. Agent Activity (real-time activity log)
CREATE TABLE IF NOT EXISTS dispatch_agent_activity (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_issue ON dispatch_agent_activity(issue_id, created_at);

-- 12. External Issue (links to Sentry, GitHub, Linear, Loki)
CREATE TABLE IF NOT EXISTS dispatch_external_issue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_url TEXT,
  metadata JSONB,
  cooldown_until TIMESTAMPTZ,
  event_count INTEGER DEFAULT 1,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_issue_issue ON dispatch_external_issue(issue_id);
CREATE INDEX IF NOT EXISTS idx_external_issue_source_id ON dispatch_external_issue(source, external_id);

-- 13. Sentry Event Log (for fix verification)
CREATE TABLE IF NOT EXISTS dispatch_sentry_event_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  external_issue_id TEXT NOT NULL REFERENCES dispatch_external_issue(id) ON DELETE CASCADE,
  sentry_issue_id TEXT NOT NULL,
  sentry_short_id TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  user_count INTEGER,
  release_sha TEXT,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentry_event_log_external_issue ON dispatch_sentry_event_log(external_issue_id, created_at DESC);

-- 14. Issue History (audit trail)
CREATE TABLE IF NOT EXISTS dispatch_issue_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  action history_action_type NOT NULL,
  old_value JSONB,
  new_value JSONB,
  actor_type history_actor_type NOT NULL,
  actor_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issue_history_issue_id ON dispatch_issue_history(issue_id, created_at DESC);

-- 15. Issue PR (linked pull requests)
CREATE TABLE IF NOT EXISTS dispatch_issue_pr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_issue_pr_issue_id ON dispatch_issue_pr(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_pr_pr_number ON dispatch_issue_pr(pr_number);

-- 16. Fix Attempt (PR fix verification tracking)
CREATE TABLE IF NOT EXISTS dispatch_fix_attempt (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  pr_title TEXT NOT NULL,
  pr_body TEXT,
  merged_at TIMESTAMPTZ NOT NULL,
  merged_sha TEXT NOT NULL,
  deployed_sha TEXT,
  deployed_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'awaiting_deploy',
  verification_deadline TIMESTAMPTZ,
  verification_checked_at TIMESTAMPTZ,
  failure_reason TEXT,
  sentry_events_post_deploy INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fix_attempt_issue ON dispatch_fix_attempt(issue_id);
CREATE INDEX IF NOT EXISTS idx_fix_attempt_status ON dispatch_fix_attempt(verification_status);

-- 17. Reconciliation (GitHub PR sync runs)
CREATE TABLE IF NOT EXISTS dispatch_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  prs_processed INTEGER DEFAULT 0,
  issues_updated INTEGER DEFAULT 0,
  status reconciliation_status NOT NULL DEFAULT 'running',
  error TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_workspace ON dispatch_reconciliation(workspace_id, started_at DESC);

-- 18. Spawn Budget (daily agent spawn limits)
CREATE TABLE IF NOT EXISTS dispatch_spawn_budget (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  spawn_count INTEGER DEFAULT 0,
  max_spawns INTEGER DEFAULT 10,
  spawn_type TEXT DEFAULT 'error_fix',
  CONSTRAINT dispatch_spawn_budget_date_type_key UNIQUE (date, spawn_type)
);

-- 19. Webhook (configured webhook endpoints)
CREATE TABLE IF NOT EXISTS dispatch_webhook (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id TEXT NOT NULL REFERENCES dispatch_workspace(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_workspace ON dispatch_webhook(workspace_id);

-- 20. Webhook Delivery (delivery log)
CREATE TABLE IF NOT EXISTS dispatch_webhook_delivery (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webhook_id TEXT NOT NULL REFERENCES dispatch_webhook(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  successful BOOLEAN NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_webhook ON dispatch_webhook_delivery(webhook_id, delivered_at DESC);

-- 21. Orchestrator Session (terminal conversation history)
CREATE TABLE IF NOT EXISTS dispatch_orchestrator_session (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES dispatch_workspace(id),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_session_workspace ON dispatch_orchestrator_session(workspace_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_session_updated ON dispatch_orchestrator_session(updated_at);
