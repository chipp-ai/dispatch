-- Fix Slack integration tables.
-- The original migration (001) created app.slack_integrations with wrong columns.
-- The service layer expects app.slack_installations with different columns,
-- plus 4 additional tables that were never created.

-- Drop the old table (empty, never used) and recreate with correct schema
DROP TABLE IF EXISTS app.slack_integrations CASCADE;

-- 1. slack_installations - Core installation record per workspace
CREATE TABLE app.slack_installations (
  id SERIAL PRIMARY KEY,
  workspace_team_id VARCHAR(100) NOT NULL,
  slack_app_id VARCHAR(100) NOT NULL,
  slack_client_id VARCHAR(255),
  slack_client_secret TEXT,          -- Encrypted
  workspace_name VARCHAR(255),
  bot_token TEXT NOT NULL,           -- Encrypted
  signing_secret TEXT,               -- Encrypted
  installed_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_team_id, slack_app_id)
);

CREATE INDEX idx_slack_installations_team ON app.slack_installations(workspace_team_id);

-- 2. slack_chat_mappings - Links Slack installations to Chipp applications
CREATE TABLE app.slack_chat_mappings (
  id SERIAL PRIMARY KEY,
  slack_installation_id INTEGER NOT NULL REFERENCES app.slack_installations(id) ON DELETE CASCADE,
  chat_name VARCHAR(255) NOT NULL,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slack_installation_id, chat_name)
);

CREATE INDEX idx_slack_chat_mappings_installation ON app.slack_chat_mappings(slack_installation_id);
CREATE INDEX idx_slack_chat_mappings_application ON app.slack_chat_mappings(application_id);

-- 3. slack_oauth_states - CSRF protection for OAuth flow (15-min expiry)
CREATE TABLE app.slack_oauth_states (
  id SERIAL PRIMARY KEY,
  state VARCHAR(255) NOT NULL UNIQUE,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slack_oauth_states_state ON app.slack_oauth_states(state);

-- 4. slack_thread_contexts - Track conversation threads
CREATE TABLE app.slack_thread_contexts (
  thread_ts VARCHAR(100) PRIMARY KEY,
  channel_id VARCHAR(100),
  workspace_team_id VARCHAR(100) NOT NULL,
  slack_app_id VARCHAR(100) NOT NULL,
  chat_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slack_thread_contexts_workspace ON app.slack_thread_contexts(workspace_team_id, slack_app_id);

-- 5. slack_users - Cache Slack user info (24-hour TTL managed in code)
CREATE TABLE app.slack_users (
  id SERIAL PRIMARY KEY,
  slack_user_id VARCHAR(100) NOT NULL,
  workspace_team_id VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  real_name VARCHAR(255),
  display_name VARCHAR(255),
  avatar TEXT,
  title VARCHAR(255),
  timezone VARCHAR(100),
  status_text VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slack_user_id, workspace_team_id)
);

CREATE INDEX idx_slack_users_lookup ON app.slack_users(slack_user_id, workspace_team_id);
