-- Migration: Add viewed sessions and message tags tables
-- These support the chats experience with unread indicators and tagging

-- ========================================
-- Viewed Sessions (tracks which sessions a developer has viewed)
-- ========================================
CREATE TABLE IF NOT EXISTS chat.viewed_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_viewed_sessions_user_id ON chat.viewed_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_viewed_sessions_session_id ON chat.viewed_sessions(session_id);

-- ========================================
-- Message Tags (tags that can be applied to messages)
-- ========================================
CREATE TABLE IF NOT EXISTS chat.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#EF4444', -- Hex color
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(application_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_application_id ON chat.tags(application_id);

-- ========================================
-- Message Tag Instances (junction table for messages and tags)
-- ========================================
CREATE TABLE IF NOT EXISTS chat.message_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES chat.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_message_tags_message_id ON chat.message_tags(message_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag_id ON chat.message_tags(tag_id);

-- ========================================
-- Full-text search support for message content
-- ========================================
-- Add tsvector column for efficient text search
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast text search
CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON chat.messages USING GIN(search_vector);

-- Create trigger to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION chat.update_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_search_vector_update ON chat.messages;
CREATE TRIGGER message_search_vector_update
  BEFORE INSERT OR UPDATE OF content ON chat.messages
  FOR EACH ROW
  EXECUTE FUNCTION chat.update_message_search_vector();

-- Backfill existing messages
UPDATE chat.messages SET search_vector = to_tsvector('english', COALESCE(content, ''))
WHERE search_vector IS NULL;
