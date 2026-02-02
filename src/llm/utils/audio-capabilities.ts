/**
 * Audio Capabilities
 *
 * Maps which models support native audio input.
 * Audio-capable models receive raw audio as input_audio content parts.
 * Non-audio models get Whisper transcription instead.
 */

const AUDIO_CAPABLE_MODELS = new Set([
  // GPT-5 family
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-chat-latest",
  // GPT-4.1 family
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  // GPT-4o family (audio preview)
  "gpt-4o-audio-preview",
  // Gemini 2.x family
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
]);

/**
 * Check if a model supports native audio input.
 * Uses exact match first, then falls back to prefix patterns for future-proofing.
 */
export function modelSupportsAudioInput(model: string): boolean {
  const normalized = model.toLowerCase().replace(/_/g, "-");

  if (AUDIO_CAPABLE_MODELS.has(normalized)) {
    return true;
  }

  // Pattern-based fallback for future model variants
  if (
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("gpt-4.1") ||
    normalized.startsWith("gemini-2")
  ) {
    return true;
  }

  return false;
}
