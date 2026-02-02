-- Email Integration Tables
-- Enables AI agents to converse over email via Postmark

-- Email configuration per application
CREATE TABLE IF NOT EXISTS app.email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,

  -- Postmark configuration (optional for shared infrastructure)
  postmark_server_token TEXT,
  postmark_message_stream VARCHAR(50) DEFAULT 'inbound',

  -- Webhook authentication (encrypted)
  webhook_username TEXT NOT NULL,
  webhook_password TEXT NOT NULL,

  -- Infrastructure mode
  use_shared_infrastructure BOOLEAN DEFAULT TRUE,

  -- Email addresses
  inbound_email_address VARCHAR(255) NOT NULL,
  from_email_address VARCHAR(255) NOT NULL,
  from_email_name VARCHAR(100) NOT NULL,

  -- Settings
  enable_whitelist BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(application_id)
);

-- Email thread tracking for conversation continuity
CREATE TABLE IF NOT EXISTS app.email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_config_id UUID NOT NULL REFERENCES app.email_configs(id) ON DELETE CASCADE,

  -- Thread identification
  thread_id VARCHAR(32) NOT NULL,
  subject TEXT NOT NULL,

  -- Chat session link
  chat_session_id UUID NOT NULL,

  -- Original message tracking for RFC 5322 threading
  first_message_id TEXT NOT NULL,

  -- Participants (JSON array of email addresses)
  participants JSONB DEFAULT '[]'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  message_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(email_config_id, thread_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_configs_application_id ON app.email_configs(application_id);
CREATE INDEX IF NOT EXISTS idx_email_configs_inbound_email ON app.email_configs(inbound_email_address) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_email_threads_config_id ON app.email_threads(email_config_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_chat_session ON app.email_threads(chat_session_id);
