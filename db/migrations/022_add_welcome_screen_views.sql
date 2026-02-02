-- Migration: Add welcome_screen_views table
-- Purpose: Track which emails have seen the welcome back screen (once per developer)

CREATE TABLE IF NOT EXISTS app.welcome_screen_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welcome_screen_views_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_welcome_screen_views_email ON app.welcome_screen_views(email);
CREATE INDEX IF NOT EXISTS idx_welcome_screen_views_user_id ON app.welcome_screen_views(user_id);
