-- Migration: 015_add_application_aliases
-- Description: Create application_aliases table for backward-compatible vanity URLs
-- Created: 2024-12-28
--
-- When an app is renamed, its vanity URL (appNameId) can change.
-- This table stores historical aliases so old URLs continue to work.

-- ============================================================
-- Application Aliases Table
-- ============================================================

CREATE TABLE app.application_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The slug (vanity URL identifier)
  slug VARCHAR(255) NOT NULL UNIQUE,

  -- Whether this is the current/primary alias
  is_primary BOOLEAN NOT NULL DEFAULT false,

  -- Reference to the application
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by slug (already unique, but explicit for clarity)
CREATE INDEX idx_application_aliases_slug ON app.application_aliases(slug);

-- Index for finding all aliases for an application
CREATE INDEX idx_application_aliases_application ON app.application_aliases(application_id);

-- Index for finding the primary alias for an application
CREATE INDEX idx_application_aliases_primary ON app.application_aliases(application_id, is_primary) WHERE is_primary = true;

-- ============================================================
-- Migrate existing appNameId values to aliases
-- ============================================================
-- Each existing app gets its current appNameId as its primary alias

INSERT INTO app.application_aliases (slug, is_primary, application_id, created_at, updated_at)
SELECT
  app_name_id,
  true,
  id,
  NOW(),
  NOW()
FROM app.applications
WHERE is_deleted = false
  AND app_name_id IS NOT NULL
  AND app_name_id != ''
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE app.application_aliases IS 'Stores historical and current vanity URL slugs for applications';
COMMENT ON COLUMN app.application_aliases.slug IS 'The URL-safe identifier (e.g., "my-app-a1b2c3d4")';
COMMENT ON COLUMN app.application_aliases.is_primary IS 'True if this is the current/active slug for the app';
