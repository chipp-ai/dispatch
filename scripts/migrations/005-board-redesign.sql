-- 005-board-redesign.sql
-- Redesign board columns to match agent lifecycle:
-- Triage(0) -> Backlog(1) -> Investigating(2) -> Needs Review(3) -> In Progress(4) -> In Review(5) -> Done(6) -> Canceled(7)
--
-- Handles two starting schemas:
--   A) Seed layout: Backlog, Triage, Todo, In Progress, In Review, Done, Canceled
--   B) Minimal layout: Open, In Progress, Done
-- In both cases, result is the 8-column layout above.

BEGIN;

-- Step 1: Rename "Open" to "Triage" if it exists (minimal layout case)
-- "Open" was the default landing column, Triage serves the same purpose
UPDATE dispatch_status SET name = 'Triage', color = '#8B5CF6', is_triage = true
WHERE LOWER(name) = 'open';

-- Step 2: Create all missing statuses for each workspace
-- Triage (if not created by Open rename above)
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'Triage', '#8B5CF6', 99, true, false
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'triage'
);

-- Backlog
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'Backlog', '#6B7280', 99, false, false
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'backlog'
);

-- Investigating
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'Investigating', '#F59E0B', 99, false, false
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'investigating'
);

-- Needs Review
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'Needs Review', '#EAB308', 99, false, false
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'needs review'
);

-- In Review
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'In Review', '#10B981', 99, false, false
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'in review'
);

-- Canceled
INSERT INTO dispatch_status (id, workspace_id, name, color, position, is_triage, is_closed)
SELECT gen_random_uuid(), ws.id, 'Canceled', '#EF4444', 99, false, true
FROM dispatch_workspace ws
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_status ds
  WHERE ds.workspace_id = ws.id AND LOWER(ds.name) = 'canceled'
);

-- Step 3: Move all "Todo" issues to "Backlog" before deleting Todo (seed layout case)
UPDATE dispatch_issue
SET status_id = backlog.id
FROM (
  SELECT ds.id, ds.workspace_id
  FROM dispatch_status ds
  WHERE LOWER(ds.name) = 'backlog'
) backlog
WHERE dispatch_issue.status_id IN (
  SELECT ds2.id FROM dispatch_status ds2
  WHERE LOWER(ds2.name) = 'todo' AND ds2.workspace_id = backlog.workspace_id
)
AND dispatch_issue.workspace_id = backlog.workspace_id;

-- Step 4: Delete "Todo" status (seed layout case)
DELETE FROM dispatch_status WHERE LOWER(name) = 'todo';

-- Step 5: Set correct positions and colors for all statuses
UPDATE dispatch_status SET position = 0, color = '#8B5CF6', is_triage = true
WHERE LOWER(name) = 'triage';

UPDATE dispatch_status SET position = 1, color = '#6B7280', is_triage = false
WHERE LOWER(name) = 'backlog';

UPDATE dispatch_status SET position = 2, color = '#F59E0B'
WHERE LOWER(name) = 'investigating';

UPDATE dispatch_status SET position = 3, color = '#EAB308'
WHERE LOWER(name) = 'needs review';

UPDATE dispatch_status SET position = 4, color = '#3B82F6'
WHERE LOWER(name) = 'in progress';

UPDATE dispatch_status SET position = 5, color = '#10B981'
WHERE LOWER(name) = 'in review';

UPDATE dispatch_status SET position = 6, color = '#22C55E'
WHERE LOWER(name) = 'done';

UPDATE dispatch_status SET position = 7, color = '#EF4444'
WHERE LOWER(name) = 'canceled';

COMMIT;
