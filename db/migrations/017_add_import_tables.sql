-- Add tables for tracking data import from chipp-admin
-- These tables track import sessions, ID mappings, and progress

-- Import sessions track the overall import job
CREATE TABLE app.import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  source_developer_id INTEGER NOT NULL,
  source_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_phase INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up import sessions by user
CREATE INDEX idx_import_sessions_user_id ON app.import_sessions(user_id);
CREATE INDEX idx_import_sessions_status ON app.import_sessions(status);

-- ID mappings track old_id -> new_id for all migrated entities
CREATE TABLE app.import_id_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id UUID NOT NULL REFERENCES app.import_sessions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  old_id VARCHAR(255) NOT NULL,
  new_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(import_session_id, entity_type, old_id)
);

-- Index for efficient lookups during import
CREATE INDEX idx_import_id_mappings_lookup ON app.import_id_mappings(import_session_id, entity_type, old_id);
CREATE INDEX idx_import_id_mappings_new_id ON app.import_id_mappings(new_id);

-- Progress tracks per-entity-type import progress
CREATE TABLE app.import_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id UUID NOT NULL REFERENCES app.import_sessions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_processed_id VARCHAR(255),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(import_session_id, entity_type)
);

-- Index for progress lookups
CREATE INDEX idx_import_progress_session ON app.import_progress(import_session_id);

-- Add comment for documentation
COMMENT ON TABLE app.import_sessions IS 'Tracks user data import sessions from chipp-admin';
COMMENT ON TABLE app.import_id_mappings IS 'Maps old chipp-admin IDs to new chipp-deno UUIDs';
COMMENT ON TABLE app.import_progress IS 'Tracks per-entity progress during import';
