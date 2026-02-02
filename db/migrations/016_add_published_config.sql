-- Add publishedConfig column to applications table
-- This stores a denormalized snapshot of the published app configuration
-- for efficient consumer reads without requiring a JOIN to version history.

ALTER TABLE app.applications
ADD COLUMN IF NOT EXISTS published_config JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN app.applications.published_config IS
  'Denormalized snapshot of published app config (JSONB). Populated by launchVersion() when publishing. Contains name, brandStyles, capabilities, settings, etc. Allows resolveApp() to read published config without JOIN to version history.';

-- Create index for any queries that might filter on published status
CREATE INDEX IF NOT EXISTS idx_applications_has_published_config
  ON app.applications ((published_config IS NOT NULL))
  WHERE published_config IS NOT NULL;
