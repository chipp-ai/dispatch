-- Migration: Add subscription management columns to organizations
-- Purpose: Support downgrade scheduling, cancellation, and sandbox billing

-- Add columns for downgrade scheduling
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS pending_downgrade_tier VARCHAR(50),
ADD COLUMN IF NOT EXISTS downgrade_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS downgrade_effective_at TIMESTAMPTZ;

-- Add columns for cancellation tracking
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Add columns for trial tracking
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS subscription_trial_ends_at TIMESTAMPTZ;

-- Add columns for sandbox billing (for testing)
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS stripe_sandbox_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS use_sandbox_for_usage_billing BOOLEAN DEFAULT FALSE;

-- Add picture URL for organization branding
ALTER TABLE app.organizations
ADD COLUMN IF NOT EXISTS picture_url TEXT;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_organizations_pending_downgrade
ON app.organizations (pending_downgrade_tier)
WHERE pending_downgrade_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_subscription_cancelled
ON app.organizations (subscription_cancelled_at)
WHERE subscription_cancelled_at IS NOT NULL;

-- Comment on new columns
COMMENT ON COLUMN app.organizations.pending_downgrade_tier IS 'Target tier for scheduled downgrade (null if no downgrade pending)';
COMMENT ON COLUMN app.organizations.downgrade_scheduled_at IS 'When the downgrade was scheduled';
COMMENT ON COLUMN app.organizations.downgrade_effective_at IS 'When the downgrade takes effect (billing period end)';
COMMENT ON COLUMN app.organizations.subscription_cancelled_at IS 'When cancellation was scheduled';
COMMENT ON COLUMN app.organizations.subscription_ends_at IS 'When the subscription ends (billing period end after cancellation)';
COMMENT ON COLUMN app.organizations.subscription_trial_ends_at IS 'When the trial period ends';
COMMENT ON COLUMN app.organizations.stripe_sandbox_customer_id IS 'Stripe customer ID for sandbox/test environment';
COMMENT ON COLUMN app.organizations.use_sandbox_for_usage_billing IS 'Whether to use sandbox for usage-based billing';
COMMENT ON COLUMN app.organizations.picture_url IS 'Organization logo/picture URL';
