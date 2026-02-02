-- Migration: Add password authentication fields
-- This adds password_hash and password reset fields to support email/password auth

-- Add password auth fields to users table
ALTER TABLE app.users
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS reset_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS magic_link_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS magic_link_expiry TIMESTAMPTZ;

-- Add OTP verification table for email signup
CREATE TABLE IF NOT EXISTS app.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, otp_code)
);

-- Index for OTP lookups
CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON app.otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires_at ON app.otp_verifications(expires_at);

-- Index for password reset token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON app.users(reset_token) WHERE reset_token IS NOT NULL;
