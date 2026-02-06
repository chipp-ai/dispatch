-- Multiplayer Chat: session participants, sender tracking, share tokens

-- Session participants (many-to-many)
CREATE TABLE chat.session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
  consumer_id UUID REFERENCES app.consumers(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  anonymous_token TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, consumer_id)
);

CREATE INDEX idx_session_participants_session ON chat.session_participants(session_id)
  WHERE is_active = true;
CREATE INDEX idx_session_participants_anon_token ON chat.session_participants(anonymous_token)
  WHERE anonymous_token IS NOT NULL;

-- Sender tracking on messages
ALTER TABLE chat.messages ADD COLUMN sender_participant_id UUID
  REFERENCES chat.session_participants(id) ON DELETE SET NULL;

-- Multiplayer flag + share token on sessions
ALTER TABLE chat.sessions ADD COLUMN is_multiplayer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE chat.sessions ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX idx_sessions_share_token ON chat.sessions(share_token)
  WHERE share_token IS NOT NULL;
