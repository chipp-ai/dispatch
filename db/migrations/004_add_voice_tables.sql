-- Migration: 004_add_voice_tables
-- Description: Add tables for voice agent phone numbers and call records
-- Created: 2025-01-XX

-- Phone Numbers (Twilio numbers assigned to applications)
CREATE TABLE IF NOT EXISTS app.phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL UNIQUE, -- E.164 format: +1234567890
  twilio_phone_number_sid VARCHAR(100),
  friendly_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  voice_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  status_callback_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_application ON app.phone_numbers(application_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_number ON app.phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_active ON app.phone_numbers(is_active) WHERE is_active = true;

-- Call Records (track all voice calls)
CREATE TABLE IF NOT EXISTS app.call_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES app.phone_numbers(id) ON DELETE SET NULL,
  
  -- Twilio identifiers
  twilio_call_sid VARCHAR(100) UNIQUE NOT NULL,
  twilio_account_sid VARCHAR(100),
  
  -- Call details
  from_number VARCHAR(20) NOT NULL,
  to_number VARCHAR(20) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound-api', 'outbound-dial')),
  status VARCHAR(50) NOT NULL DEFAULT 'initiated',
  duration_seconds INTEGER,
  
  -- OpenAI Realtime (if used)
  openai_call_id VARCHAR(255),
  
  -- Metadata
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  recording_url TEXT,
  transcription_text TEXT,
  metadata JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_records_application ON app.call_records(application_id);
CREATE INDEX IF NOT EXISTS idx_call_records_twilio_sid ON app.call_records(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_records_phone_number ON app.call_records(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_call_records_started ON app.call_records(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_status ON app.call_records(status);

