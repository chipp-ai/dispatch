-- Add follow_ups to agent runs for tracking related issues discovered during investigation.
-- Stored as JSONB array of follow-up objects with title, description, priority, source, feature,
-- and created_issue_id/created_issue_identifier for traceability.

DO $$ BEGIN
  ALTER TABLE dispatch_agent_runs ADD COLUMN follow_ups JSONB DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
