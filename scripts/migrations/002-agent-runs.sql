-- Agent Runs: First-class provenance records for every agent invocation.
-- Each run captures the prompt, transcript, report, cost, and explicit PR linkage.

CREATE TABLE IF NOT EXISTS dispatch_agent_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  issue_id TEXT NOT NULL REFERENCES dispatch_issue(id) ON DELETE CASCADE,
  github_run_id TEXT,
  github_run_url TEXT,
  workflow_type TEXT NOT NULL,  -- error_fix, prd_investigate, prd_implement, qa, deep_research
  status TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed, cancelled
  prompt_text TEXT,
  transcript TEXT,
  report_content TEXT,
  outcome TEXT,
  outcome_summary TEXT,
  cost_usd NUMERIC DEFAULT 0,
  num_turns INTEGER DEFAULT 0,
  model TEXT,
  tokens_used INTEGER,
  pr_number INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_issue ON dispatch_agent_runs(issue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON dispatch_agent_runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_agent_runs_github ON dispatch_agent_runs(github_run_id) WHERE github_run_id IS NOT NULL;

-- Link agent activity to a specific run (nullable FK, existing rows get NULL)
DO $$ BEGIN
  ALTER TABLE dispatch_agent_activity ADD COLUMN run_id TEXT REFERENCES dispatch_agent_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_activity_run ON dispatch_agent_activity(run_id) WHERE run_id IS NOT NULL;

-- Link PRs to a specific run (nullable FK, existing rows get NULL)
DO $$ BEGIN
  ALTER TABLE dispatch_issue_pr ADD COLUMN run_id TEXT REFERENCES dispatch_agent_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_issue_pr_run ON dispatch_issue_pr(run_id) WHERE run_id IS NOT NULL;
