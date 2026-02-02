-- Migration: 013_add_consumer_auth
-- Description: Add authentication columns to consumers table and create consumer auth tables
-- Created: 2024-12-23

-- ============================================================
-- Consumer Auth Columns
-- ============================================================

-- Add auth-related columns to app.consumers
ALTER TABLE app.consumers
ADD COLUMN IF NOT EXISTS identifier VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS mode VARCHAR(50) NOT NULL DEFAULT 'LIVE',
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS magic_link_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS magic_link_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reset_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS picture_url TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Rename credits_balance to credits for consistency with service
ALTER TABLE app.consumers
RENAME COLUMN credits_balance TO credits;

-- Set identifier from email where null
UPDATE app.consumers
SET identifier = LOWER(email)
WHERE identifier IS NULL AND email IS NOT NULL;

-- Create indexes for auth lookups
CREATE INDEX IF NOT EXISTS idx_consumers_identifier ON app.consumers(application_id, identifier);
CREATE INDEX IF NOT EXISTS idx_consumers_magic_link ON app.consumers(magic_link_token) WHERE magic_link_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumers_reset_token ON app.consumers(reset_token) WHERE reset_token IS NOT NULL;

-- ============================================================
-- Consumer Sessions Table
-- ============================================================

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

-- ============================================================
-- Consumer OTP Verification Table
-- ============================================================

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
