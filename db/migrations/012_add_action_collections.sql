-- Migration: 012_add_action_collections
-- Description: Extend action_collections with sharing/pro features, add contributions table
-- Note: action_collections already exists from 001_initial_schema.sql with columns:
--   id, name, description, developer_id, is_public, created_at, updated_at

-- Collection sharing scope enum
DO $$ BEGIN
  CREATE TYPE app.collection_sharing_scope AS ENUM ('PRIVATE', 'WORKSPACE', 'PUBLIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Pro action category enum
DO $$ BEGIN
  CREATE TYPE app.pro_action_category AS ENUM (
    'PRODUCTIVITY',
    'COMMUNICATION',
    'DATA',
    'AI_ML',
    'MARKETING',
    'DEVELOPER',
    'FINANCE',
    'HR',
    'CUSTOMER_SERVICE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Pro action review status enum
DO $$ BEGIN
  CREATE TYPE app.pro_action_review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Contribution status enum
DO $$ BEGIN
  CREATE TYPE app.contribution_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Extend existing action_collections table with new columns
-- Use ADD COLUMN IF NOT EXISTS to be idempotent
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS sharing_scope app.collection_sharing_scope NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES app.workspaces(id) ON DELETE SET NULL;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS category app.pro_action_category;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS review_status app.pro_action_review_status;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES app.users(id);
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0.0';
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS icon VARCHAR(100);
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS install_count INT DEFAULT 0;
ALTER TABLE app.action_collections ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Make description NOT NULL (it was nullable in 001)
ALTER TABLE app.action_collections ALTER COLUMN description SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_collections_workspace ON app.action_collections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_action_collections_slug ON app.action_collections(slug);
CREATE INDEX IF NOT EXISTS idx_action_collections_sharing ON app.action_collections(sharing_scope) WHERE is_active = true;

-- Action Collection Actions (many-to-many relationship)
CREATE TABLE IF NOT EXISTS app.action_collection_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,

  -- Action template data (serialized as JSON)
  action_data JSONB NOT NULL,

  -- Action ordering within collection
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_collection_actions_collection ON app.action_collection_actions(collection_id);

-- Action Contributions (PRs for action collections)
CREATE TABLE IF NOT EXISTS app.action_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,
  action_id UUID NOT NULL, -- Reference to the action in the collection

  contributor_id UUID NOT NULL REFERENCES app.users(id),
  contribution JSONB NOT NULL, -- The proposed changes
  description TEXT NOT NULL, -- Explanation of changes

  status app.contribution_status NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID REFERENCES app.users(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_contributions_collection ON app.action_contributions(collection_id);
CREATE INDEX IF NOT EXISTS idx_action_contributions_contributor ON app.action_contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_action_contributions_status ON app.action_contributions(status);

-- Add foreign key from user_defined_tools to action_collections if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_defined_tools_collection_id_fkey'
    AND table_name = 'user_defined_tools'
  ) THEN
    ALTER TABLE app.user_defined_tools
    ADD CONSTRAINT user_defined_tools_collection_id_fkey
    FOREIGN KEY (collection_id) REFERENCES app.action_collections(id) ON DELETE SET NULL;
  END IF;
END $$;
