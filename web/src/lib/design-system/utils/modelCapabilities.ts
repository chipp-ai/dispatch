/**
 * Frontend model capability detection.
 * Mirrors src/llm/utils/video-capabilities.ts for builder preview UI.
 */

const VIDEO_CAPABLE_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
]);

export function modelSupportsVideoInput(model: string): boolean {
  const normalized = model.toLowerCase().replace(/_/g, "-");
  if (VIDEO_CAPABLE_MODELS.has(normalized)) return true;
  if (normalized.startsWith("gemini-2") || normalized.startsWith("gemini-3"))
    return true;
  return false;
}
