-- Application Version History
-- Tracks changes to application settings for rollback functionality
-- Similar to git commits, with launch/release tags

CREATE TABLE IF NOT EXISTS app.application_version_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
    version UUID NOT NULL DEFAULT gen_random_uuid(),
    data JSONB NOT NULL,
    -- Launch/release tagging (like git tags)
    tag VARCHAR(100),  -- Optional release tag (e.g., "v1.0", "2024-01-release")
    is_launched BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether this version was launched to production
    launched_at TIMESTAMPTZ,  -- When this version was launched
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient querying by application
CREATE INDEX IF NOT EXISTS idx_app_version_history_app_id_created
    ON app.application_version_history(application_id, created_at DESC);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_app_version_history_user_id
    ON app.application_version_history(user_id);

-- Index for finding launched versions
CREATE INDEX IF NOT EXISTS idx_app_version_history_launched
    ON app.application_version_history(application_id, is_launched) WHERE is_launched = TRUE;

-- Add launched version tracking to applications table
ALTER TABLE app.applications
    ADD COLUMN IF NOT EXISTS launched_version_id UUID REFERENCES app.application_version_history(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_launched_at TIMESTAMPTZ;

-- Index for quick lookup of launched version
CREATE INDEX IF NOT EXISTS idx_applications_launched_version
    ON app.applications(launched_version_id) WHERE launched_version_id IS NOT NULL;

COMMENT ON TABLE app.application_version_history IS 'Tracks changes to application settings for version control, rollback, and release management';
COMMENT ON COLUMN app.application_version_history.data IS 'JSON snapshot of changed fields at time of save';
COMMENT ON COLUMN app.application_version_history.version IS 'Unique version identifier for this snapshot';
COMMENT ON COLUMN app.application_version_history.tag IS 'Optional release tag like v1.0 or 2024-01-release';
COMMENT ON COLUMN app.application_version_history.is_launched IS 'Whether this version was launched to end users';
COMMENT ON COLUMN app.application_version_history.launched_at IS 'When this version was launched';
COMMENT ON COLUMN app.applications.launched_version_id IS 'Currently live/launched version for end users';
COMMENT ON COLUMN app.applications.last_launched_at IS 'When the app was last launched';
