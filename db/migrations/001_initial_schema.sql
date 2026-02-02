-- Migration: 001_initial_schema
-- Description: Create all schemas and tables for Chipp Deno
-- Created: 2024-12-18

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- Schemas
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS jobs;

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE subscription_tier AS ENUM ('FREE', 'PRO', 'TEAM', 'BUSINESS', 'ENTERPRISE');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE chat_source AS ENUM ('APP', 'API', 'WHATSAPP', 'SLACK', 'EMAIL', 'VOICE', 'WIDGET');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE knowledge_source_type AS ENUM ('file', 'url', 'google_drive', 'notion', 'text', 'qa', 'sitemap', 'youtube', 'confluence');
CREATE TYPE knowledge_source_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'deleting');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE domain_type AS ENUM ('chat', 'dashboard', 'api');
CREATE TYPE video_generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================
-- App Schema
-- ============================================================

-- Organizations
CREATE TABLE app.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  subscription_tier subscription_tier NOT NULL DEFAULT 'FREE',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  usage_based_billing_enabled BOOLEAN NOT NULL DEFAULT false,
  trial_ends_at TIMESTAMPTZ,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_stripe_customer ON app.organizations(stripe_customer_id);
CREATE INDEX idx_organizations_slug ON app.organizations(slug);

-- Users (developers/team members)
CREATE TABLE app.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  picture TEXT,
  role user_role NOT NULL DEFAULT 'member',
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  oauth_provider VARCHAR(50),
  oauth_id VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(email)
);

CREATE INDEX idx_users_organization ON app.users(organization_id);
CREATE INDEX idx_users_email ON app.users(email);
CREATE INDEX idx_users_oauth ON app.users(oauth_provider, oauth_id);

-- Sessions
CREATE TABLE app.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON app.sessions(user_id);
CREATE INDEX idx_sessions_expires ON app.sessions(expires_at);

-- Workspaces
CREATE TABLE app.workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_organization ON app.workspaces(organization_id);

-- Workspace Members
CREATE TYPE workspace_role AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

CREATE TABLE app.workspace_members (
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

CREATE INDEX idx_workspace_members_workspace ON app.workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON app.workspace_members(user_id);

-- Applications
CREATE TABLE app.applications (
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
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_developer ON app.applications(developer_id);
CREATE INDEX idx_applications_organization ON app.applications(organization_id);
CREATE INDEX idx_applications_workspace ON app.applications(workspace_id);
CREATE INDEX idx_applications_app_name_id ON app.applications(app_name_id);
CREATE INDEX idx_applications_active ON app.applications(is_active) WHERE is_active = true AND is_deleted = false;

-- Consumers (end users)
CREATE TABLE app.consumers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  email VARCHAR(255),
  name VARCHAR(255),
  metadata JSONB,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consumers_application ON app.consumers(application_id);
CREATE INDEX idx_consumers_external_id ON app.consumers(application_id, external_id);
CREATE INDEX idx_consumers_email ON app.consumers(application_id, email);

-- API Credentials
CREATE TABLE app.api_credentials (
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

CREATE INDEX idx_api_credentials_developer ON app.api_credentials(developer_id);
CREATE INDEX idx_api_credentials_api_key ON app.api_credentials(api_key);

-- Files
CREATE TABLE app.files (
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

CREATE INDEX idx_files_developer ON app.files(developer_id);
CREATE INDEX idx_files_application ON app.files(application_id);

-- Whitelabel Tenants
CREATE TABLE app.whitelabel_tenants (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whitelabel_tenants_slug ON app.whitelabel_tenants(slug);
CREATE INDEX idx_whitelabel_tenants_custom_domain ON app.whitelabel_tenants(custom_domain);

-- Custom Domains
CREATE TABLE app.custom_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hostname VARCHAR(255) NOT NULL UNIQUE,
  type domain_type NOT NULL,
  app_id UUID REFERENCES app.applications(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES app.whitelabel_tenants(id) ON DELETE CASCADE,
  cloudflare_id VARCHAR(255),
  ssl_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  dcv_token VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_domains_hostname ON app.custom_domains(hostname);
CREATE INDEX idx_custom_domains_app ON app.custom_domains(app_id);

-- WhatsApp Configs
CREATE TABLE app.whatsapp_configs (
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

CREATE INDEX idx_whatsapp_configs_application ON app.whatsapp_configs(application_id);
CREATE UNIQUE INDEX idx_whatsapp_configs_phone ON app.whatsapp_configs(phone_number_id);

-- Slack Integrations
CREATE TABLE app.slack_integrations (
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

CREATE INDEX idx_slack_integrations_application ON app.slack_integrations(application_id);
CREATE UNIQUE INDEX idx_slack_integrations_team ON app.slack_integrations(team_id);

-- Action Collections
CREATE TABLE app.action_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  developer_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_collections_developer ON app.action_collections(developer_id);

-- Action Templates
CREATE TABLE app.action_templates (
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

CREATE INDEX idx_action_templates_collection ON app.action_templates(collection_id);

-- App Action Collections (junction table)
CREATE TABLE app.app_action_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES app.action_collections(id) ON DELETE CASCADE,
  credentials JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, collection_id)
);

CREATE INDEX idx_app_action_collections_app ON app.app_action_collections(application_id);

-- ============================================================
-- Chat Schema
-- ============================================================

-- Chat Sessions
CREATE TABLE chat.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  consumer_id UUID REFERENCES app.consumers(id) ON DELETE SET NULL,
  source chat_source NOT NULL DEFAULT 'APP',
  title VARCHAR(255),
  is_bookmarked BOOLEAN NOT NULL DEFAULT false,
  external_id VARCHAR(255),
  metadata JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_chat_sessions_application ON chat.sessions(application_id);
CREATE INDEX idx_chat_sessions_consumer ON chat.sessions(consumer_id);
CREATE INDEX idx_chat_sessions_started ON chat.sessions(started_at DESC);
CREATE INDEX idx_chat_sessions_external ON chat.sessions(application_id, external_id);

-- Messages
CREATE TABLE chat.messages (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON chat.messages(session_id);
CREATE INDEX idx_messages_created ON chat.messages(created_at DESC);

-- Message Files
CREATE TABLE chat.message_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES app.files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_files_message ON chat.message_files(message_id);

-- User Memories
CREATE TABLE chat.user_memories (
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

CREATE INDEX idx_user_memories_application ON chat.user_memories(application_id);
CREATE INDEX idx_user_memories_consumer ON chat.user_memories(consumer_id);
CREATE INDEX idx_user_memories_external ON chat.user_memories(application_id, external_user_id);

-- ============================================================
-- RAG Schema
-- ============================================================

-- Knowledge Sources
CREATE TABLE rag.knowledge_sources (
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

CREATE INDEX idx_knowledge_sources_application ON rag.knowledge_sources(application_id);
CREATE INDEX idx_knowledge_sources_status ON rag.knowledge_sources(status);

-- Text Chunks (with vector embeddings)
CREATE TABLE rag.text_chunks (
  id BIGSERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  knowledge_source_id UUID REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 dimensions
  sparse_embedding JSONB,
  token_count INTEGER,
  chunk_index INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_text_chunks_application ON rag.text_chunks(application_id);
CREATE INDEX idx_text_chunks_knowledge_source ON rag.text_chunks(knowledge_source_id);

-- Vector similarity search index (HNSW for fast approximate search)
CREATE INDEX idx_text_chunks_embedding ON rag.text_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Document Summaries
CREATE TABLE rag.document_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_topics JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_summaries_source ON rag.document_summaries(knowledge_source_id);

-- Tag Utterances
CREATE TABLE rag.tag_utterances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  tag_name VARCHAR(100) NOT NULL,
  utterance TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tag_utterances_application ON rag.tag_utterances(application_id);
CREATE INDEX idx_tag_utterances_tag ON rag.tag_utterances(application_id, tag_name);

-- ============================================================
-- Billing Schema
-- ============================================================

-- Token Usage
CREATE TABLE billing.token_usage (
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

CREATE INDEX idx_token_usage_application ON billing.token_usage(application_id);
CREATE INDEX idx_token_usage_organization ON billing.token_usage(organization_id);
CREATE INDEX idx_token_usage_created ON billing.token_usage(created_at DESC);
-- Partition-friendly index for time-range queries
CREATE INDEX idx_token_usage_app_created ON billing.token_usage(application_id, created_at DESC);

-- Credit Packages
CREATE TABLE billing.credit_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_packages_application ON billing.credit_packages(application_id);

-- Purchases
CREATE TABLE billing.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID NOT NULL REFERENCES app.consumers(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES billing.credit_packages(id) ON DELETE RESTRICT,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_consumer ON billing.purchases(consumer_id);
CREATE INDEX idx_purchases_stripe ON billing.purchases(stripe_payment_intent_id);

-- Transactions
CREATE TABLE billing.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumer_id UUID NOT NULL REFERENCES app.consumers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  credits INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  reference_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_consumer ON billing.transactions(consumer_id);
CREATE INDEX idx_transactions_created ON billing.transactions(created_at DESC);

-- ============================================================
-- Jobs Schema
-- ============================================================

-- Job History
CREATE TABLE jobs.history (
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

CREATE INDEX idx_job_history_application ON jobs.history(application_id);
CREATE INDEX idx_job_history_status ON jobs.history(status);
CREATE INDEX idx_job_history_type ON jobs.history(job_type);

-- Video Generation Jobs
CREATE TABLE jobs.video_generation (
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

CREATE INDEX idx_video_generation_application ON jobs.video_generation(application_id);
CREATE INDEX idx_video_generation_status ON jobs.video_generation(status);

-- ============================================================
-- Updated At Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON app.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON app.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON app.applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_consumers_updated_at BEFORE UPDATE ON app.consumers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whitelabel_tenants_updated_at BEFORE UPDATE ON app.whitelabel_tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_custom_domains_updated_at BEFORE UPDATE ON app.custom_domains FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_configs_updated_at BEFORE UPDATE ON app.whatsapp_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_slack_integrations_updated_at BEFORE UPDATE ON app.slack_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_collections_updated_at BEFORE UPDATE ON app.action_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_action_templates_updated_at BEFORE UPDATE ON app.action_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_memories_updated_at BEFORE UPDATE ON chat.user_memories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_sources_updated_at BEFORE UPDATE ON rag.knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
