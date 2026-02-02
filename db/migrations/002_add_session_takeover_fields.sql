-- Migration: 002_add_session_takeover_fields
-- Description: Add mode and taken_over_by fields to chat.sessions for live takeover functionality
-- Created: 2025-01-XX

-- Add mode column (defaults to 'ai' for existing sessions)
ALTER TABLE chat.sessions
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'ai'
    CHECK (mode IN ('ai', 'human', 'hybrid'));

-- Add taken_over_by column (references app.users)
ALTER TABLE chat.sessions
  ADD COLUMN IF NOT EXISTS taken_over_by UUID REFERENCES app.users(id) ON DELETE SET NULL;

-- Add index for faster lookups by mode
CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON chat.sessions(mode) WHERE mode != 'ai';

-- Add index for taken_over_by lookups
CREATE INDEX IF NOT EXISTS idx_chat_sessions_taken_over ON chat.sessions(taken_over_by) WHERE taken_over_by IS NOT NULL;

