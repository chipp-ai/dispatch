/**
 * Video Capabilities
 *
 * Maps which models support native video input.
 * Video-capable models receive video as content parts.
 * Non-video models should not be sent video content.
 */

const VIDEO_CAPABLE_MODELS = new Set([
  // Gemini 2.x family
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  // Gemini 3.x family
  "gemini-3-flash-preview",
]);

/**
 * Check if a model supports native video input.
 * Uses exact match first, then falls back to prefix patterns for future-proofing.
 */
export function modelSupportsVideoInput(model: string): boolean {
  const normalized = model.toLowerCase().replace(/_/g, "-");

  if (VIDEO_CAPABLE_MODELS.has(normalized)) {
    return true;
  }

  // Pattern-based fallback for future model variants
  if (normalized.startsWith("gemini-2") || normalized.startsWith("gemini-3")) {
    return true;
  }

  return false;
}
