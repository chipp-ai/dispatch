-- Add active_workspace_id to users table
-- This tracks which workspace the user is currently viewing/working in

ALTER TABLE app.users
ADD COLUMN active_workspace_id UUID REFERENCES app.workspaces(id) ON DELETE SET NULL;

-- Create index for efficient lookup
CREATE INDEX idx_users_active_workspace ON app.users(active_workspace_id);

-- Set initial values: assign each user their first workspace membership
UPDATE app.users u
SET active_workspace_id = (
  SELECT wm.workspace_id
  FROM app.workspace_members wm
  WHERE wm.user_id = u.id
  ORDER BY wm.joined_at ASC
  LIMIT 1
);
