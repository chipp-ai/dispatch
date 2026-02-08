-- Add language column to applications table
-- Used for i18n in consumer-facing emails and UI
ALTER TABLE app.applications ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT NULL;
