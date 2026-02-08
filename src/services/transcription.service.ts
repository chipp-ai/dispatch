/**
 * Transcription Service
 *
 * OpenAI Whisper API client for speech-to-text transcription.
 * Used as fallback for models that don't support native audio input.
 */

import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { log } from "@/lib/logger.ts";

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";

/** Map MIME types to file extensions for the Whisper API */
function mimeToExtension(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    default:
      return "webm";
  }
}

/**
 * Transcribe base64-encoded audio using OpenAI Whisper API.
 *
 * @param audioBase64 - Base64-encoded audio data
 * @param mimeType - MIME type of the audio (e.g., "audio/webm;codecs=opus")
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<{ text: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY not configured. Cannot transcribe audio for non-audio-capable models."
    );
  }

  // Decode base64 to binary
  const audioBytes = decodeBase64(audioBase64);
  const extension = mimeToExtension(mimeType);
  const blob = new Blob([audioBytes], { type: mimeType });

  // Build FormData for Whisper API
  const formData = new FormData();
  formData.append("file", blob, `recording.${extension}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");

  const response = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const whisperError = new Error(`Whisper transcription failed: ${response.status}`);
    log.error("Whisper API error", {
      source: "transcription",
      feature: "whisper-api",
      fileName: `recording.${extension}`,
      mimeType,
      status: response.status,
      errorText,
    }, whisperError);
    throw whisperError;
  }

  const result = await response.json();
  log.info("Whisper transcription complete", {
    source: "transcription",
    feature: "whisper-api",
    textLength: result.text?.length || 0,
  });

  return { text: result.text || "" };
}
