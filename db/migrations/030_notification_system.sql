-- Notification system tables: preferences, log, sender domains
-- Supports white-labelable email notifications for builder/dashboard events

-- 1. Notification preferences per user (opt-out model)
CREATE TABLE IF NOT EXISTS app.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, notification_type, channel)
);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON app.notification_preferences(user_id);

-- 2. Notification log (generalized from credit-only to all notification types)
CREATE TABLE IF NOT EXISTS app.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),
  notification_type VARCHAR(100) NOT NULL,
  recipient_user_id UUID REFERENCES app.users(id),
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  tracking_id VARCHAR(255) UNIQUE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_log_org ON app.notification_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_tracking ON app.notification_log(tracking_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON app.notification_log(recipient_user_id);

-- 3. Sender domain verification (SMTP2GO)
CREATE TABLE IF NOT EXISTS app.sender_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id),
  domain VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  smtp2go_domain_id VARCHAR(255),
  dkim_record_name VARCHAR(255),
  dkim_record_value VARCHAR(500),
  return_path_record_name VARCHAR(255),
  return_path_record_value VARCHAR(500),
  tracking_record_name VARCHAR(255),
  tracking_record_value VARCHAR(500),
  dmarc_record_value VARCHAR(500),
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_sender_domains_org ON app.sender_domains(organization_id);
