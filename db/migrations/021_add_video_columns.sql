ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_mime_type TEXT;
