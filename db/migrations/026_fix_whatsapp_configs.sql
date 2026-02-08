-- Fix WhatsApp configs table: add missing is_deleted column, rename waba_id to match code
-- The TypeScript schema uses businessAccountId (CamelCasePlugin -> business_account_id)
-- but the DB column is waba_id. Also, every query filters on is_deleted which doesn't exist.

-- Add missing is_deleted column (matches pattern from applications, consumers, email_configs)
ALTER TABLE app.whatsapp_configs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Rename waba_id to business_account_id (code uses businessAccountId via CamelCasePlugin)
ALTER TABLE app.whatsapp_configs RENAME COLUMN waba_id TO business_account_id;
