-- Migration: 018_add_email_whitelist
-- Description: Add email whitelist table for email gating functionality
-- Created: 2025-01-18

-- ============================================================
-- Application Email Whitelist Table
-- ============================================================
-- Stores whitelisted emails for applications with email gating enabled.
-- When emailGatingEnabled is true for an app, only users with emails
-- in this table can sign up.

CREATE TABLE IF NOT EXISTS app.application_email_whitelist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one email per application
  CONSTRAINT unique_email_per_app UNIQUE (application_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_whitelist_app ON app.application_email_whitelist(application_id);
CREATE INDEX IF NOT EXISTS idx_email_whitelist_email ON app.application_email_whitelist(email);

-- ============================================================
-- Application Settings Additions
-- ============================================================
-- Note: The settings JSONB column already exists from migration 006.
-- Email gating and other signup settings will be stored in the settings JSON:
--
-- settings = {
--   emailGatingEnabled: boolean,       -- If true, check whitelist before signup
--   signupsRestrictedToDomain: string, -- Domain restriction (e.g., "company.com")
--   startingFreeTrialTokens: number,   -- Starting credits for new users
--   redirectAfterSignupUrl: string,    -- Custom redirect URL after signup
--   language: string,                  -- App language (EN, ES, etc.)
--   requireAuth: boolean,              -- Existing setting - require auth to chat
-- }

-- No ALTER TABLE needed since settings is already JSONB
