-- Migration: 015_add_publish_state
-- Description: Add publish_state enum and column for visibility control
-- Created: 2024-12-24

-- Create the publish_state enum
CREATE TYPE publish_state AS ENUM ('ONLY_ME', 'WITH_LINK', 'ECOSYSTEM');

-- Add publish_state column with default WITH_LINK (shareable via link)
ALTER TABLE app.applications
ADD COLUMN publish_state publish_state NOT NULL DEFAULT 'WITH_LINK';

-- Create index for filtering by publish state
CREATE INDEX idx_applications_publish_state ON app.applications(publish_state);

-- Migrate existing is_public data:
-- is_public = true -> ECOSYSTEM (published to marketplace)
-- is_public = false -> WITH_LINK (default, shareable via link)
UPDATE app.applications
SET publish_state = 'ECOSYSTEM'
WHERE is_public = true;

-- Note: is_public column is kept for backwards compatibility but
-- publish_state should be the source of truth going forward
