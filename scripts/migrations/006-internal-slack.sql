-- 006: Add internal Slack notification tracking column to dispatch_issue.
-- Also adds slack_message_ts which is referenced by notificationService.ts
-- but was never added in a prior migration.

DO $$ BEGIN
  ALTER TABLE dispatch_issue ADD COLUMN internal_slack_ts TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE dispatch_issue ADD COLUMN slack_message_ts TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
