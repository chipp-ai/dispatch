-- Migration: 003_add_custom_actions_tables
-- Description: Add tables for custom actions (user-defined tools, variables, OAuth)
-- Created: 2025-01-XX

-- User Defined Tools (per-application custom actions)
CREATE TABLE IF NOT EXISTS app.user_defined_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  
  -- Definition
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100),
  description TEXT NOT NULL,
  
  -- API Configuration
  url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  
  -- Parameters (JSONB arrays)
  headers JSONB DEFAULT '[]'::jsonb,
  path_params JSONB DEFAULT '[]'::jsonb,
  query_params JSONB DEFAULT '[]'::jsonb,
  body_params JSONB DEFAULT '[]'::jsonb,
  variables JSONB, -- Variable mappings
  
  -- Display
  present_tense_verb VARCHAR(100),
  past_tense_verb VARCHAR(100),
  
  -- Collection tracking
  collection_id UUID REFERENCES app.action_collections(id) ON DELETE SET NULL,
  original_action_id UUID,
  
  is_client_side BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_defined_tools_app ON app.user_defined_tools(application_id);
CREATE INDEX IF NOT EXISTS idx_user_defined_tools_slug ON app.user_defined_tools(application_id, slug) WHERE slug IS NOT NULL;

-- Application Variables (for credential storage)
CREATE TABLE IF NOT EXISTS app.application_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  
  name VARCHAR(100) NOT NULL, -- e.g., "API_KEY"
  label VARCHAR(255) NOT NULL, -- Display name
  type VARCHAR(50) NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'secret', 'url')),
  description TEXT,
  required BOOLEAN DEFAULT false,
  placeholder VARCHAR(255),
  
  -- Value (encrypted for secrets)
  value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(application_id, name)
);

CREATE INDEX IF NOT EXISTS idx_application_variables_app ON app.application_variables(application_id);

-- Connected Accounts (OAuth tokens)
CREATE TABLE IF NOT EXISTS app.connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  provider VARCHAR(50) NOT NULL, -- GOOGLE_DRIVE, GOOGLE_SHEETS, MICROSOFT, etc.
  provider_account_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Encrypted tokens
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT, -- Unix timestamp
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(provider, provider_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON app.connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON app.connected_accounts(provider, user_id);

