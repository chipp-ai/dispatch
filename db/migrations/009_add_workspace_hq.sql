-- Migration: 009_add_workspace_hq
-- Description: Add workspace HQ table for public workspace pages
-- Created: 2024-12-21

-- ============================================================
-- Workspace HQ Access Mode Enum
-- ============================================================

CREATE TYPE hq_access_mode AS ENUM ('public', 'public_paid', 'private', 'paid');

-- ============================================================
-- Workspace HQ Table
-- ============================================================

CREATE TABLE app.workspace_hq (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,

  -- Basic info
  name VARCHAR(255),
  slug VARCHAR(255) UNIQUE,
  description TEXT,

  -- Media
  picture_url TEXT,
  banner_url TEXT,
  video_url TEXT,

  -- CTA
  cta_text VARCHAR(255),
  cta_url TEXT,

  -- Access settings
  access_mode hq_access_mode NOT NULL DEFAULT 'public',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_hq_public BOOLEAN NOT NULL DEFAULT true,
  allow_duplicate_apps BOOLEAN NOT NULL DEFAULT false,

  -- Featured apps (ordered array of app IDs)
  featured_application_ids JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workspace_id)
);

CREATE INDEX idx_workspace_hq_workspace ON app.workspace_hq(workspace_id);
CREATE INDEX idx_workspace_hq_slug ON app.workspace_hq(slug);
