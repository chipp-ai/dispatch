-- Combined Test Database Schema
-- This file applies all migrations in order for test environments
-- Vector operations are skipped (require pgvector extension)
-- Generated from migrations 001-018

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- pgvector not available in standard postgres test containers
-- Vector columns will be TEXT type for tests

-- ============================================================
-- Schemas
-- ============================================================
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS jobs;

-- ============================================================
-- Enums (from 001_initial_schema + later migrations)
-- ============================================================
DO $$ BEGIN CREATE TYPE subscription_tier AS ENUM ('FREE', 'PRO', 'TEAM', 'BUSINESS', 'ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE chat_source AS ENUM ('APP', 'API', 'WHATSAPP', 'SLACK', 'EMAIL', 'VOICE', 'WIDGET'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE knowledge_source_type AS ENUM ('file', 'url', 'google_drive', 'notion', 'text', 'qa', 'sitemap', 'youtube', 'confluence'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE knowledge_source_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'deleting'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE domain_type AS ENUM ('chat', 'dashboard', 'api'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE video_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE workspace_role AS ENUM ('OWNER', 'EDITOR', 'VIEWER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE hq_access_mode AS ENUM ('public', 'public_paid', 'private', 'paid'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE publish_state AS ENUM ('ONLY_ME', 'WITH_LINK', 'ECOSYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- App Schema Tables
-- ============================================================

-- Organizations (001)
CREATE TABLE IF NOT EXISTS app.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  subscription_tier subscription_tier NOT NULL DEFAULT 'FREE',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  trial_ends_at TIMESTAMPTZ,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON app.organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON app.organizations(slug);

-- Workspaces (001) - created before users for FK
CREATE TABLE IF NOT EXISTS app.workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_organization ON app.workspaces(organization_id);

-- Users (001 + 011_password_auth + 016_active_workspace)
CREATE TABLE IF NOT EXISTS app.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  picture TEXT,
  role user_role NOT NULL DEFAULT 'member',
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  -- 011_password_auth
  password_hash TEXT,
  reset_token TEXT UNIQUE,
  reset_token_expiry TIMESTAMPTZ,
  magic_link_token TEXT UNIQUE,
  magic_link_expiry TIMESTAMPTZ,
  -- 016_active_workspace
  active_workspace_id UUID REFERENCES app.workspaces(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_organization ON app.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON app.users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON app.users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON app.users(reset_token) WHERE reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_active_workspace ON app.users(active_workspace_id);

-- Sessions (001)
CREATE TABLE IF NOT EXISTS app.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON app.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON app.sessions(expires_at);

-- Workspace Members (001)
CREATE TABLE IF NOT EXISTS app.workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'EDITOR',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_via_public_invite BOOLEAN NOT NULL DEFAULT false,
  latest_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON app.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON app.workspace_members(user_id);

-- Action Collections (001) - before applications for FK
CREATE TABLE IF NOT EXISTS app.action_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_collections_developer ON app.action_collections(developer_id);

-- Application Version History (008) - before applications for FK
CREATE TABLE IF NOT EXISTS app.application_version_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL,
  user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  version UUID NOT NULL DEFAULT uuid_generate_v4(),
  data JSONB NOT NULL,
  tag VARCHAR(100),
  is_launched BOOLEAN NOT NULL DEFAULT FALSE,
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applications (001 + 005 + 006 + 007 + 008 + 015 + 016)
CREATE TABLE IF NOT EXISTS app.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  app_name_id VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES app.workspaces(id) ON DELETE SET NULL,
  system_prompt TEXT,
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
  temperature DECIMAL(3,2) NOT NULL DEFAULT 0.7,
  brand_styles JSONB,
  capabilities JSONB,
  welcome_messages JSONB,
  suggested_messages JSONB,
  lead_form_config JSONB,
  -- 005_custom_actions_column
  custom_actions JSONB DEFAULT '[]'::jsonb,
  -- 006_settings_column
  settings JSONB DEFAULT '{}'::jsonb,
  -- 007_embedding_provider_metadata
  embedding_config JSONB,
  -- 008_application_version_history
  launched_version_id UUID REFERENCES app.application_version_history(id) ON DELETE SET NULL,
  last_launched_at TIMESTAMPTZ,
  -- 015_publish_state
  publish_state publish_state NOT NULL DEFAULT 'WITH_LINK',
  -- 016_published_config
  published_config JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_developer ON app.applications(developer_id);
CREATE INDEX IF NOT EXISTS idx_applications_organization ON app.applications(organization_id);
CREATE INDEX IF NOT EXISTS idx_applications_workspace ON app.applications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_applications_app_name_id ON app.applications(app_name_id);
CREATE INDEX IF NOT EXISTS idx_applications_publish_state ON app.applications(publish_state);

-- Add FK constraint for version history now that applications exists
ALTER TABLE app.application_version_history
  ADD CONSTRAINT fk_version_history_application 
  FOREIGN KEY (application_id) REFERENCES app.applications(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_app_version_history_app_id_created ON app.application_version_history(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_version_history_launched ON app.application_version_history(application_id, is_launched) WHERE is_launched = TRUE;

-- Consumers (001 + 013_consumer_auth)
CREATE TABLE IF NOT EXISTS app.consumers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  email VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB,
  -- 013_consumer_auth (note: credits_balance renamed to credits)
  credits INTEGER NOT NULL DEFAULT 0,
  identifier VARCHAR(255),
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  subscription_active BOOLEAN NOT NULL DEFAULT false,
  mode VARCHAR(50) NOT NULL DEFAULT 'LIVE',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  magic_link_token TEXT UNIQUE,
  magic_link_expiry TIMESTAMPTZ,
  reset_token TEXT UNIQUE,
  reset_token_expiry TIMESTAMPTZ,
  picture_url TEXT,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consumers_application ON app.consumers(application_id);
CREATE INDEX IF NOT EXISTS idx_consumers_external_id ON app.consumers(application_id, external_id);
CREATE INDEX IF NOT EXISTS idx_consumers_email ON app.consumers(application_id, email);
CREATE INDEX IF NOT EXISTS idx_consumers_identifier ON app.consumers(application_id, identifier);
CREATE INDEX IF NOT EXISTS idx_consumers_magic_link ON app.consumers(magic_link_token) WHERE magic_link_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumers_reset_token ON app.consumers(reset_token) WHERE reset_token IS NOT NULL;

-- Consumer Sessions (013)
CREATE TABLE IF NOT EXISTS app.consumer_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID NOT NULL REFERENCES app.consumers(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consumer_sessions_consumer ON app.consumer_sessions(consumer_id);
CREATE INDEX IF NOT EXISTS idx_consumer_sessions_application ON app.consumer_sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_consumer_sessions_expires ON app.consumer_sessions(expires_at);

-- Consumer OTPs (013)
CREATE TABLE IF NOT EXISTS app.consumer_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  otp_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consumer_otps_lookup ON app.consumer_otps(application_id, email);
CREATE INDEX IF NOT EXISTS idx_consumer_otps_expires ON app.consumer_otps(expires_at);

-- API Credentials (001)
CREATE TABLE IF NOT EXISTS app.api_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES app.applications(id) ON DELETE CASCADE,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_credentials_developer ON app.api_credentials(developer_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_api_key ON app.api_credentials(api_key);

-- Files (001)
CREATE TABLE IF NOT EXISTS app.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,
  gcp_path TEXT NOT NULL,
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES app.applications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_files_developer ON app.files(developer_id);
CREATE INDEX IF NOT EXISTS idx_files_application ON app.files(application_id);

-- Whitelabel Tenants (001 + 007_organization)
CREATE TABLE IF NOT EXISTS app.whitelabel_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  custom_domain VARCHAR(255),
  primary_color VARCHAR(20),
  secondary_color VARCHAR(20),
  logo_url TEXT,
  favicon_url TEXT,
  google_client_id VARCHAR(255),
  google_client_secret VARCHAR(255),
  microsoft_tenant_id VARCHAR(255),
  microsoft_client_id VARCHAR(255),
  microsoft_client_secret VARCHAR(255),
  features JSONB NOT NULL DEFAULT '{}',
  -- 007_add_organization_to_whitelabel
  organization_id UUID REFERENCES app.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whitelabel_tenants_slug ON app.whitelabel_tenants(slug);
CREATE INDEX IF NOT EXISTS idx_whitelabel_tenants_custom_domain ON app.whitelabel_tenants(custom_domain);

-- Custom Domains (010)
CREATE TABLE IF NOT EXISTS app.custom_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hostname VARCHAR(255) NOT NULL UNIQUE,
  type domain_type NOT NULL,
  app_id UUID REFERENCES app.applications(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES app.whitelabel_tenants(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  cloudflare_id VARCHAR(255),
  ssl_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  dcv_token TEXT,
  brand_styles JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_domains_hostname ON app.custom_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_custom_domains_app ON app.custom_domains(app_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_org ON app.custom_domains(organization_id);

-- WhatsApp Configs (001)
CREATE TABLE IF NOT EXISTS app.whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  phone_number_id VARCHAR(100) NOT NULL,
  waba_id VARCHAR(100) NOT NULL,
  access_token TEXT NOT NULL,
  verify_token VARCHAR(255) NOT NULL,
  webhook_secret VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_application ON app.whatsapp_configs(application_id);

-- Slack Integrations (001)
CREATE TABLE IF NOT EXISTS app.slack_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  team_id VARCHAR(100) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  bot_token TEXT NOT NULL,
  bot_user_id VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slack_integrations_application ON app.slack_integrations(application_id);

-- Action Templates (001)
CREATE TABLE IF NOT EXISTS app.action_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  method VARCHAR(10) NOT NULL,
  url_template TEXT NOT NULL,
  headers JSONB,
  body_template JSONB,
  parameters_schema JSONB,
  response_mapping JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_templates_collection ON app.action_templates(collection_id);

-- App Action Collections (001)
CREATE TABLE IF NOT EXISTS app.app_action_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,
  credentials JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_app_action_collections_app ON app.app_action_collections(application_id);

-- User Defined Tools (003)
CREATE TABLE IF NOT EXISTS app.user_defined_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100),
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL,
  headers JSONB DEFAULT '[]'::jsonb,
  path_params JSONB DEFAULT '[]'::jsonb,
  query_params JSONB DEFAULT '[]'::jsonb,
  body_params JSONB DEFAULT '[]'::jsonb,
  variables JSONB,
  present_tense_verb VARCHAR(100),
  past_tense_verb VARCHAR(100),
  collection_id UUID REFERENCES app.action_collections(id) ON DELETE SET NULL,
  original_action_id UUID,
  is_client_side BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_defined_tools_app ON app.user_defined_tools(application_id);
CREATE INDEX IF NOT EXISTS idx_user_defined_tools_slug ON app.user_defined_tools(application_id, slug) WHERE slug IS NOT NULL;

-- Application Variables (003)
CREATE TABLE IF NOT EXISTS app.application_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  required BOOLEAN DEFAULT false,
  placeholder VARCHAR(255),
  value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, name)
);
CREATE INDEX IF NOT EXISTS idx_application_variables_app ON app.application_variables(application_id);

-- Connected Accounts (003)
CREATE TABLE IF NOT EXISTS app.connected_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON app.connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider ON app.connected_accounts(provider, user_id);

-- Phone Numbers (004)
CREATE TABLE IF NOT EXISTS app.phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  twilio_phone_number_sid VARCHAR(100),
  friendly_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  voice_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  status_callback_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_application ON app.phone_numbers(application_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_number ON app.phone_numbers(phone_number);

-- Call Records (004)
CREATE TABLE IF NOT EXISTS app.call_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES app.phone_numbers(id) ON DELETE SET NULL,
  twilio_call_sid VARCHAR(100) UNIQUE NOT NULL,
  twilio_account_sid VARCHAR(100),
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',
  duration_seconds INTEGER,
  openai_call_id VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  recording_url TEXT,
  transcription_text TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_records_application ON app.call_records(application_id);
CREATE INDEX IF NOT EXISTS idx_call_records_twilio_sid ON app.call_records(twilio_call_sid);

-- Workspace HQ (009)
CREATE TABLE IF NOT EXISTS app.workspace_hq (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES app.workspaces(id) ON DELETE CASCADE UNIQUE,
  name VARCHAR(255),
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  picture_url TEXT,
  banner_url TEXT,
  video_url TEXT,
  cta_text VARCHAR(255),
  cta_url TEXT,
  access_mode hq_access_mode NOT NULL DEFAULT 'public',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_hq_public BOOLEAN NOT NULL DEFAULT true,
  allow_duplicate_apps BOOLEAN NOT NULL DEFAULT false,
  featured_application_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workspace_hq_workspace ON app.workspace_hq(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_hq_slug ON app.workspace_hq(slug);

-- OTP Verifications (011)
CREATE TABLE IF NOT EXISTS app.otp_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, otp_code)
);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON app.otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires_at ON app.otp_verifications(expires_at);

-- User Onboarding (014)
CREATE TABLE IF NOT EXISTS app.user_onboarding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  question_slug VARCHAR(100) NOT NULL,
  question TEXT NOT NULL,
  options JSONB,
  answer JSONB,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_slug)
);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_user ON app.user_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_question ON app.user_onboarding(question_slug);

-- Application Aliases (015)
CREATE TABLE IF NOT EXISTS app.application_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(255) NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_application_aliases_slug ON app.application_aliases(slug);
CREATE INDEX IF NOT EXISTS idx_application_aliases_application ON app.application_aliases(application_id);

-- Import Sessions (017)
CREATE TABLE IF NOT EXISTS app.import_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  source_developer_id INTEGER NOT NULL,
  source_email VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_phase INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_sessions_user_id ON app.import_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_status ON app.import_sessions(status);

-- Import ID Mappings (017)
CREATE TABLE IF NOT EXISTS app.import_id_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_session_id UUID NOT NULL REFERENCES app.import_sessions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  old_id VARCHAR(255) NOT NULL,
  new_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(import_session_id, entity_type, old_id)
);
CREATE INDEX IF NOT EXISTS idx_import_id_mappings_lookup ON app.import_id_mappings(import_session_id, entity_type, old_id);

-- Import Progress (017)
CREATE TABLE IF NOT EXISTS app.import_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_session_id UUID NOT NULL REFERENCES app.import_sessions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  last_processed_id VARCHAR(255),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(import_session_id, entity_type)
);
CREATE INDEX IF NOT EXISTS idx_import_progress_session ON app.import_progress(import_session_id);

-- Application Email Whitelist (018)
CREATE TABLE IF NOT EXISTS app.application_email_whitelist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_email_per_app UNIQUE (application_id, email)
);
CREATE INDEX IF NOT EXISTS idx_email_whitelist_app ON app.application_email_whitelist(application_id);
CREATE INDEX IF NOT EXISTS idx_email_whitelist_email ON app.application_email_whitelist(email);

-- ============================================================
-- Chat Schema Tables
-- ============================================================

-- Chat Sessions (001 + 002_takeover)
CREATE TABLE IF NOT EXISTS chat.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  consumer_id UUID REFERENCES app.consumers(id) ON DELETE SET NULL,
  source chat_source NOT NULL DEFAULT 'APP',
  title VARCHAR(255),
  is_bookmarked BOOLEAN NOT NULL DEFAULT false,
  external_id VARCHAR(255),
  metadata JSONB,
  -- 002_session_takeover
  mode VARCHAR(20) NOT NULL DEFAULT 'ai',
  taken_over_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_application ON chat.sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_consumer ON chat.sessions(consumer_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_started ON chat.sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_external ON chat.sessions(application_id, external_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_mode ON chat.sessions(mode) WHERE mode != 'ai';
CREATE INDEX IF NOT EXISTS idx_chat_sessions_taken_over ON chat.sessions(taken_over_by) WHERE taken_over_by IS NOT NULL;

-- Messages (001 + 012_search)
CREATE TABLE IF NOT EXISTS chat.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  model VARCHAR(100),
  token_count INTEGER,
  latency_ms INTEGER,
  tags JSONB,
  -- 012_search
  search_vector tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON chat.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON chat.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON chat.messages USING GIN(search_vector);

-- Message Files (001)
CREATE TABLE IF NOT EXISTS chat.message_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES app.files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_files_message ON chat.message_files(message_id);

-- User Memories (001)
CREATE TABLE IF NOT EXISTS chat.user_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  consumer_id UUID REFERENCES app.consumers(id) ON DELETE CASCADE,
  external_user_id VARCHAR(255),
  memory_type VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  source_message_id UUID REFERENCES chat.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_memories_application ON chat.user_memories(application_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_consumer ON chat.user_memories(consumer_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_external ON chat.user_memories(application_id, external_user_id);

-- Viewed Sessions (012)
CREATE TABLE IF NOT EXISTS chat.viewed_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_viewed_sessions_user_id ON chat.viewed_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_viewed_sessions_session_id ON chat.viewed_sessions(session_id);

-- Tags (012)
CREATE TABLE IF NOT EXISTS chat.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#EF4444',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_application_id ON chat.tags(application_id);

-- Message Tags (012)
CREATE TABLE IF NOT EXISTS chat.message_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES chat.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_message_tags_message_id ON chat.message_tags(message_id);
CREATE INDEX IF NOT EXISTS idx_message_tags_tag_id ON chat.message_tags(tag_id);

-- ============================================================
-- RAG Schema (without vector columns - require pgvector)
-- ============================================================

-- Knowledge Sources (001)
CREATE TABLE IF NOT EXISTS rag.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  type knowledge_source_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT,
  file_path TEXT,
  status knowledge_source_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_application ON rag.knowledge_sources(application_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON rag.knowledge_sources(status);

-- Text Chunks (001 + 007 - without vector column)
CREATE TABLE IF NOT EXISTS rag.text_chunks (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  knowledge_source_id UUID REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding TEXT,  -- TEXT instead of vector for test environment
  sparse_embedding JSONB,
  token_count INTEGER,
  chunk_index INTEGER,
  metadata JSONB,
  -- 007_embedding_provider_metadata
  embedding_provider VARCHAR(50),
  embedding_model VARCHAR(100),
  embedding_dimensions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_text_chunks_application ON rag.text_chunks(application_id);
CREATE INDEX IF NOT EXISTS idx_text_chunks_knowledge_source ON rag.text_chunks(knowledge_source_id);

-- Document Summaries (001 + 007 - without vector column)
CREATE TABLE IF NOT EXISTS rag.document_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_topics JSONB,
  embedding TEXT,  -- TEXT instead of vector
  embedding_provider VARCHAR(50),
  embedding_model VARCHAR(100),
  embedding_dimensions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_summaries_source ON rag.document_summaries(knowledge_source_id);

-- Tag Utterances (001 + 007 - without vector column)
CREATE TABLE IF NOT EXISTS rag.tag_utterances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  utterance TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- TEXT instead of vector
  embedding_provider VARCHAR(50),
  embedding_model VARCHAR(100),
  embedding_dimensions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tag_utterances_application ON rag.tag_utterances(application_id);
CREATE INDEX IF NOT EXISTS idx_tag_utterances_tag ON rag.tag_utterances(application_id, tag_name);

-- ============================================================
-- Billing Schema
-- ============================================================

-- Token Usage (001)
CREATE TABLE IF NOT EXISTS billing.token_usage (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat.sessions(id) ON DELETE SET NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_usd DECIMAL(10, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_application ON billing.token_usage(application_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_organization ON billing.token_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created ON billing.token_usage(created_at DESC);

-- Credit Packages (001)
CREATE TABLE IF NOT EXISTS billing.credit_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_packages_application ON billing.credit_packages(application_id);

-- Purchases (001)
CREATE TABLE IF NOT EXISTS billing.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID NOT NULL REFERENCES app.consumers(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES billing.credit_packages(id) ON DELETE RESTRICT,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_consumer ON billing.purchases(consumer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe ON billing.purchases(stripe_payment_intent_id);

-- Transactions (001)
CREATE TABLE IF NOT EXISTS billing.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID NOT NULL REFERENCES app.consumers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  credits INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_consumer ON billing.transactions(consumer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON billing.transactions(created_at DESC);

-- ============================================================
-- Jobs Schema
-- ============================================================

-- Job History (011)
CREATE TABLE IF NOT EXISTS jobs.history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type VARCHAR(100) NOT NULL,
  application_id UUID REFERENCES app.applications(id) ON DELETE SET NULL,
  status job_status NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_job_history_application ON jobs.history(application_id);
CREATE INDEX IF NOT EXISTS idx_job_history_status ON jobs.history(status);
CREATE INDEX IF NOT EXISTS idx_job_history_type ON jobs.history(job_type);

-- Video Generation Jobs (001)
CREATE TABLE IF NOT EXISTS jobs.video_generation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat.sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat.messages(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  status video_generation_status NOT NULL DEFAULT 'pending',
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_video_generation_application ON jobs.video_generation(application_id);
CREATE INDEX IF NOT EXISTS idx_video_generation_status ON jobs.video_generation(status);

-- ============================================================
-- Functions & Triggers
-- ============================================================

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Search vector trigger for messages
CREATE OR REPLACE FUNCTION chat.update_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers (with IF NOT EXISTS logic)
DO $$ BEGIN CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON app.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON app.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON app.applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_consumers_updated_at BEFORE UPDATE ON app.consumers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_user_memories_updated_at BEFORE UPDATE ON chat.user_memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON rag.knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER message_search_vector_update BEFORE INSERT OR UPDATE OF content ON chat.messages FOR EACH ROW EXECUTE FUNCTION chat.update_message_search_vector(); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Verification
-- ============================================================
SELECT 'Test schema created successfully' AS status;
