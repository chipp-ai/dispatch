-- Add voice audio columns to messages table for persistent audio playback
ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_duration_ms INTEGER;
