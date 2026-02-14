-- Add files_changed to agent runs for tracking what the agent modified.
-- Stored as JSONB array of file path strings.

DO $$ BEGIN
  ALTER TABLE dispatch_agent_runs ADD COLUMN files_changed JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
