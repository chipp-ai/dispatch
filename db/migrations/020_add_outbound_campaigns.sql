-- Migration: 020_add_outbound_campaigns
-- Description: Add tables for outbound calling campaigns

-- Outbound Campaigns - stores campaign metadata and progress
CREATE TABLE IF NOT EXISTS app.outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  name VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, paused, completed, cancelled
  
  -- Progress tracking
  total_recipients INTEGER NOT NULL DEFAULT 0,
  calls_completed INTEGER NOT NULL DEFAULT 0,
  calls_failed INTEGER NOT NULL DEFAULT 0,
  calls_pending INTEGER NOT NULL DEFAULT 0,
  
  -- Configuration
  calls_per_minute INTEGER NOT NULL DEFAULT 5,
  metadata JSONB,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_app
  ON app.outbound_campaigns(application_id);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_status
  ON app.outbound_campaigns(application_id, status);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_created
  ON app.outbound_campaigns(created_at DESC);

-- Campaign Recipients - individual recipients in a campaign
CREATE TABLE IF NOT EXISTS app.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES app.outbound_campaigns(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, queued, calling, completed, failed, no-answer
  
  -- Call tracking
  call_id UUID,
  
  -- Optional metadata per recipient
  metadata JSONB,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
  ON app.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status
  ON app.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending
  ON app.campaign_recipients(campaign_id, scheduled_at) 
  WHERE status = 'pending';

-- Add outbound greeting to voice config (stored in application capabilities)
-- This is done via application update, not schema change

-- Update call_records to support LiveKit SIP call IDs
-- The existing twilio_call_sid column can store LiveKit SIP call IDs as well
COMMENT ON COLUMN app.call_records.twilio_call_sid IS 'Call SID from Twilio or LiveKit SIP';

-- Add room_name to call records metadata for LiveKit integration
-- Metadata column already exists and is JSONB, so we can store roomName there
