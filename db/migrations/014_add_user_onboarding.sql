-- Migration: 014_add_user_onboarding
-- Description: Create user onboarding table for tracking onboarding progress
-- Created: 2024-12-23

-- ============================================================
-- User Onboarding Table
-- ============================================================

CREATE TABLE app.user_onboarding (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  question_slug VARCHAR(100) NOT NULL,
  question TEXT NOT NULL,
  options JSONB,
  answer JSONB,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only answer each question once
  UNIQUE(user_id, question_slug)
);

-- Indexes for common queries
CREATE INDEX idx_user_onboarding_user ON app.user_onboarding(user_id);
CREATE INDEX idx_user_onboarding_question ON app.user_onboarding(question_slug);
