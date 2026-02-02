-- Migration: 012_add_action_collections
-- Description: Add action collections and contributions for shared actions
-- Created: 2025-01-XX

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

-- Action Collections table
CREATE TABLE IF NOT EXISTS app.action_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,

  sharing_scope app.collection_sharing_scope NOT NULL DEFAULT 'PRIVATE',

  -- Owner information
  created_by UUID NOT NULL REFERENCES app.users(id),
  workspace_id UUID REFERENCES app.workspaces(id) ON DELETE SET NULL,

  -- Pro action fields (only used when sharing_scope = PUBLIC)
  category app.pro_action_category,
  is_premium BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  review_status app.pro_action_review_status,
  review_notes TEXT,
  reviewed_by UUID REFERENCES app.users(id),
  reviewed_at TIMESTAMPTZ,

  -- Common fields
  is_active BOOLEAN DEFAULT true,
  version VARCHAR(20) DEFAULT '1.0.0',

  -- Metadata
  cover_image TEXT,
  icon VARCHAR(100),
  tags JSONB DEFAULT '[]'::jsonb,

  -- Usage tracking
  install_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_collections_creator ON app.action_collections(created_by);
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
-- (Note: This assumes the user_defined_tools table already exists)
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
