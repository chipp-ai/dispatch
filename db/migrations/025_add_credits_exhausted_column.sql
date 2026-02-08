-- Migration: Add credits_exhausted column to organizations
-- Purpose: Track when an organization's usage-based billing credits are exhausted
-- Used by billing.alert.triggered webhook handler for $0 balance alerts

-- Add credits_exhausted flag
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS credits_exhausted BOOLEAN DEFAULT FALSE;

-- Comment on new column
COMMENT ON COLUMN app.organizations.credits_exhausted IS 'Whether the organization has exhausted their usage-based billing credits';
