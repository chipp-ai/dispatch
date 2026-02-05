-- Make verify_token nullable - the code uses webhook_secret for verification instead.
-- verify_token is a legacy column from the original schema that the service layer never populates.
ALTER TABLE app.whatsapp_configs ALTER COLUMN verify_token DROP NOT NULL;
