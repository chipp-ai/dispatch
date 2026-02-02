-- Migration: 019_add_mcp_integrations
-- Description: Add MCP integration tables for connecting AI apps to MCP servers

-- Application Integrations - stores MCP server connections per application
CREATE TABLE IF NOT EXISTS app.application_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255),
  logo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,

  -- MCP server configuration
  mcp_server_url TEXT,
  mcp_transport VARCHAR(50) DEFAULT 'http',
  mcp_auth_type VARCHAR(50) DEFAULT '',
  mcp_auth_config TEXT, -- encrypted JSON string
  mcp_tool_cache JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_integrations_app
  ON app.application_integrations(application_id);

-- Integration Actions - individual MCP tools enabled for an integration
CREATE TABLE IF NOT EXISTS app.integration_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  integration_id UUID NOT NULL REFERENCES app.application_integrations(id) ON DELETE CASCADE,

  -- MCP tool reference
  remote_tool_name VARCHAR(255),
  schema_snapshot JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_actions_integration
  ON app.integration_actions(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_actions_active
  ON app.integration_actions(integration_id) WHERE is_active = true;
