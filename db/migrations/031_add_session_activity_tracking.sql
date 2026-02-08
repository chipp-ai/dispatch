-- Add last_activity_at column for live session tracking
ALTER TABLE chat.sessions ADD COLUMN last_activity_at TIMESTAMPTZ;

-- Partial index for efficient active session lookups
CREATE INDEX idx_sessions_last_activity ON chat.sessions (application_id, last_activity_at)
  WHERE last_activity_at IS NOT NULL AND ended_at IS NULL;
