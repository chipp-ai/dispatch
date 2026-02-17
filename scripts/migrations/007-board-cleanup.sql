-- 007-board-cleanup.sql
-- Clean up the board to 7 columns: Backlog, Investigating, Needs Review, In Progress, In Review, Done, Canceled
-- Removes unused statuses: Triage, Waiting for agent, PR Open, Verify in Staging, Verify in Prod, Ready for prod, In Staging, In Production

BEGIN;

-- Step 1: Rename "Being Developed" → "In Progress" (must happen before any deletes)
UPDATE dispatch_status
SET name = 'In Progress', color = '#3B82F6', position = 3
WHERE LOWER(name) = 'being developed';

-- Step 2: Ensure all 7 target statuses exist (idempotent -- skip if already present)
-- This handles workspaces that may be missing some statuses.
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), w.id, s.name, s.color, s.position, s.is_triage, s.is_closed
FROM dispatch_workspace w
CROSS JOIN (VALUES
  ('Backlog',       '#6B7280', 0, false, false),
  ('Investigating', '#F59E0B', 1, false, false),
  ('Needs Review',  '#EAB308', 2, false, false),
  ('In Progress',   '#3B82F6', 3, false, false),
  ('In Review',     '#10B981', 4, false, false),
  ('Done',          '#22C55E', 5, false, true),
  ('Canceled',      '#EF4444', 6, false, true)
) AS s(name, color, position, is_triage, is_closed)
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = w.id AND LOWER(ds.name) = LOWER(s.name)
);

-- Step 3: Update positions and colors of the 7 target statuses
UPDATE dispatch_status SET position = 0, color = '#6B7280', is_triage = false, is_closed = false WHERE LOWER(name) = 'backlog';
UPDATE dispatch_status SET position = 1, color = '#F59E0B', is_triage = false, is_closed = false WHERE LOWER(name) = 'investigating';
UPDATE dispatch_status SET position = 2, color = '#EAB308', is_triage = false, is_closed = false WHERE LOWER(name) = 'needs review';
UPDATE dispatch_status SET position = 3, color = '#3B82F6', is_triage = false, is_closed = false WHERE LOWER(name) = 'in progress';
UPDATE dispatch_status SET position = 4, color = '#10B981', is_triage = false, is_closed = false WHERE LOWER(name) = 'in review';
UPDATE dispatch_status SET position = 5, color = '#22C55E', is_triage = false, is_closed = true  WHERE LOWER(name) = 'done';
UPDATE dispatch_status SET position = 6, color = '#EF4444', is_triage = false, is_closed = true  WHERE LOWER(name) = 'canceled';

-- Step 4: Move issues from deleted statuses to Backlog (must happen before status deletion)
-- Each status maps to the most logical target column:
--   Triage, Waiting for agent → Backlog (re-triage)
--   PR Open → In Review
--   Verify in Staging, In Staging → Done
--   Verify in Prod, Ready for prod, In Production → Done

UPDATE dispatch_issue
SET status_id = (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) = 'backlog' AND workspace_id = dispatch_issue.workspace_id
  LIMIT 1
)
WHERE status_id IN (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) IN ('triage', 'waiting for agent')
);

UPDATE dispatch_issue
SET status_id = (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) = 'in review' AND workspace_id = dispatch_issue.workspace_id
  LIMIT 1
)
WHERE status_id IN (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) = 'pr open'
);

UPDATE dispatch_issue
SET status_id = (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) = 'done' AND workspace_id = dispatch_issue.workspace_id
  LIMIT 1
)
WHERE status_id IN (
  SELECT id FROM dispatch_status
  WHERE LOWER(name) IN ('verify in staging', 'verify in prod', 'ready for prod', 'in staging', 'in production')
);

-- Step 5: Delete unused statuses (safe now -- no issues reference them)
DELETE FROM dispatch_status
WHERE LOWER(name) IN (
  'triage',
  'waiting for agent',
  'pr open',
  'verify in staging',
  'verify in prod',
  'ready for prod',
  'in staging',
  'in production'
);

COMMIT;
