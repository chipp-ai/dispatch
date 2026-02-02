-- Migration: 011_add_job_history
-- Description: Add job history table for tracking async job status
-- Created: 2025-01-XX

-- Job History Status enum
DO $$ BEGIN
  CREATE TYPE app.job_history_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETE', 'ERROR', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Job History Type enum
DO $$ BEGIN
  CREATE TYPE app.job_history_type AS ENUM (
    'FILE_UPLOAD',
    'URL_CRAWL',
    'YOUTUBE_UPLOAD',
    'TIKTOK_UPLOAD',
    'INSTAGRAM_UPLOAD',
    'FACEBOOK_UPLOAD',
    'NOTION_UPLOAD',
    'GOOGLE_DRIVE_UPLOAD',
    'SHAREPOINT_ONEDRIVE_UPLOAD',
    'AUDIO_UPLOAD',
    'PODCAST_UPLOAD',
    'API_UPLOAD',
    'CHAT_BATCH',
    'VIDEO_GENERATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Job History table
CREATE TABLE IF NOT EXISTS app.job_history (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
  workflow_id VARCHAR(255) UNIQUE NOT NULL, -- Temporal workflow ID
  job_type app.job_history_type NOT NULL,
  status app.job_history_status NOT NULL DEFAULT 'PENDING',

  -- Human-readable summary
  display_name TEXT, -- e.g., "example.pdf" or "https://example.com"

  -- Extra metadata (file size, URL count, etc.)
  metadata JSONB,

  -- Error tracking
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_history_app_created ON app.job_history(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_history_app_status ON app.job_history(application_id, status);
CREATE INDEX IF NOT EXISTS idx_job_history_workflow ON app.job_history(workflow_id);
