-- Database initialization script
-- This runs when the PostgreSQL container first starts

-- Create schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS embeddings;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vector extension (only available in pgvector images, skip if not available)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available, skipping...';
END $$;

-- ===========================================
-- App Schema Tables
-- ===========================================

-- Organizations
CREATE TABLE IF NOT EXISTS app.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'FREE',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS app.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    picture TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    organization_id UUID NOT NULL REFERENCES app.organizations(id),
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON app.users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON app.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON app.users(oauth_provider, oauth_id);

-- Sessions
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

-- Workspaces
CREATE TABLE IF NOT EXISTS app.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    organization_id UUID NOT NULL REFERENCES app.organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applications
CREATE TABLE IF NOT EXISTS app.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    app_name_id VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    developer_id UUID NOT NULL REFERENCES app.users(id),
    organization_id UUID REFERENCES app.organizations(id),
    workspace_id UUID REFERENCES app.workspaces(id),
    system_prompt TEXT,
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    brand_styles JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apps_developer ON app.applications(developer_id);
CREATE INDEX IF NOT EXISTS idx_apps_org ON app.applications(organization_id);
CREATE INDEX IF NOT EXISTS idx_apps_active ON app.applications(is_active) WHERE is_deleted = FALSE;

-- API Credentials
CREATE TABLE IF NOT EXISTS app.api_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID NOT NULL REFERENCES app.users(id),
    application_id UUID REFERENCES app.applications(id),
    api_key VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_creds_key ON app.api_credentials(api_key);

-- Files
CREATE TABLE IF NOT EXISTS app.files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL,
    gcp_path TEXT NOT NULL,
    developer_id UUID NOT NULL REFERENCES app.users(id),
    application_id UUID REFERENCES app.applications(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Whitelabel Tenants
CREATE TABLE IF NOT EXISTS app.whitelabel_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    custom_domain VARCHAR(255),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    logo_url TEXT,
    favicon_url TEXT,
    google_client_id TEXT,
    google_client_secret TEXT,
    microsoft_tenant_id TEXT,
    microsoft_client_id TEXT,
    microsoft_client_secret TEXT,
    features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom Domains
CREATE TABLE IF NOT EXISTS app.custom_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hostname VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('chat', 'dashboard', 'api')),
    app_id UUID REFERENCES app.applications(id),
    tenant_id UUID REFERENCES app.whitelabel_tenants(id),
    cloudflare_id VARCHAR(255),
    ssl_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    dcv_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================================
-- Chat Schema Tables
-- ===========================================

-- Chat Sessions
CREATE TABLE IF NOT EXISTS chat.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES app.applications(id),
    consumer_id UUID,
    source VARCHAR(50) NOT NULL DEFAULT 'API',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_app ON chat.sessions(application_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_started ON chat.sessions(started_at);

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat.sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    token_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat.messages(session_id);

-- ===========================================
-- Embeddings Schema Tables
-- ===========================================

-- Text Chunks with Vector Embeddings
-- Note: embedding column uses vector type if pgvector is available
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS embeddings.text_chunks (
        id SERIAL PRIMARY KEY,
        application_id UUID NOT NULL REFERENCES app.applications(id),
        file_id UUID REFERENCES app.files(id),
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
EXCEPTION WHEN undefined_object THEN
    -- pgvector not available, create without vector column
    CREATE TABLE IF NOT EXISTS embeddings.text_chunks (
        id SERIAL PRIMARY KEY,
        application_id UUID NOT NULL REFERENCES app.applications(id),
        file_id UUID REFERENCES app.files(id),
        content TEXT NOT NULL,
        embedding TEXT,  -- fallback to TEXT when vector not available
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_text_chunks_app ON embeddings.text_chunks(application_id);

-- ===========================================
-- Seed Data (for development)
-- ===========================================

-- Create a test organization
INSERT INTO app.organizations (id, name, subscription_tier)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Organization', 'FREE')
ON CONFLICT DO NOTHING;

-- Create a test user
INSERT INTO app.users (id, email, name, role, organization_id, oauth_provider, oauth_id)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'test@example.com',
    'Test User',
    'owner',
    '00000000-0000-0000-0000-000000000001',
    'google',
    'test-oauth-id'
)
ON CONFLICT DO NOTHING;

-- ===========================================
-- Permission Grants
-- ===========================================
-- Ensure 'chipp_dev' user can run migrations if it exists.
-- This handles the case where the POSTGRES_USER is 'postgres' but
-- the developer connects as 'chipp_dev' (or vice versa).
DO $$
DECLARE
    dev_role TEXT;
    schemas TEXT[] := ARRAY['app', 'chat', 'embeddings', 'public'];
    s TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'chipp_dev') AND current_user != 'chipp_dev' THEN
        dev_role := 'chipp_dev';
    ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') AND current_user != 'postgres' THEN
        dev_role := 'postgres';
    ELSE
        RETURN;
    END IF;

    FOREACH s IN ARRAY schemas LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', s, dev_role);
        EXECUTE format('GRANT CREATE ON SCHEMA %I TO %I', s, dev_role);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO %I', s, dev_role);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO %I', s, dev_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL PRIVILEGES ON TABLES TO %I', s, dev_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL PRIVILEGES ON SEQUENCES TO %I', s, dev_role);
    END LOOP;

    RAISE NOTICE 'Granted schema permissions to %', dev_role;
END $$;
