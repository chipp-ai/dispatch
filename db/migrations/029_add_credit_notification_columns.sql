-- Migration 029: Add credit notification columns and log table
--
-- Adds notification preference columns to organizations table
-- and creates a credit_notification_log table for email audit trail.

-- Add notification columns to organizations
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS credit_notification_thresholds JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS credit_notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS credit_notification_default_percentage INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS last_credit_warning_email_at TIMESTAMPTZ;

-- Ensure billing schema exists
CREATE SCHEMA IF NOT EXISTS billing;

-- Credit notification log table for email audit trail
CREATE TABLE IF NOT EXISTS billing.credit_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),
  notification_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  recipient_emails JSONB NOT NULL DEFAULT '[]',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  credit_balance_cents INTEGER NOT NULL DEFAULT 0,
  triggered_threshold_cents INTEGER,
  tracking_id VARCHAR(255) UNIQUE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  conversion_amount_cents INTEGER,
  upsell_source VARCHAR(100),
  email_subject VARCHAR(500),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_notification_log_org
  ON billing.credit_notification_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_notification_log_tracking
  ON billing.credit_notification_log(tracking_id);
CREATE INDEX IF NOT EXISTS idx_credit_notification_log_sent
  ON billing.credit_notification_log(sent_at DESC);
