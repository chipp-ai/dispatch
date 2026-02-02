-- Migration: 006_add_settings_column
-- Description: Add settings JSONB column to applications table for app builder advanced settings
-- Created: 2025-12-20

-- Add settings column to store temperature, maxTokens, streamResponses, etc.
ALTER TABLE app.applications
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
