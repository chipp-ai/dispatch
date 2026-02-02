-- Migration: 005_add_custom_actions_column
-- Description: Add custom_actions JSONB column to applications table for app builder state
-- Created: 2025-12-20

-- Add custom_actions column to store in-memory custom actions from app builder
-- This allows the builder to save/restore custom actions before they're committed to user_defined_tools
ALTER TABLE app.applications
ADD COLUMN IF NOT EXISTS custom_actions JSONB DEFAULT '[]'::jsonb;

-- Add index for querying applications with custom actions
CREATE INDEX IF NOT EXISTS idx_applications_custom_actions ON app.applications USING GIN (custom_actions) WHERE custom_actions IS NOT NULL;
