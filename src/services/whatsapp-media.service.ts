/**
 * WhatsApp Media Handler Service
 *
 * Handles downloading and processing media from WhatsApp Cloud API webhooks.
 * Supports image, audio, video, document, and sticker message types.
 *
 * This mirrors the functionality in shared/utils-server/src/whatsapp/mediaHandler.ts
 */

import { whatsappService } from "./whatsapp.service.ts";
import { uploadImageToPublicBucket } from "./storage.service.ts";
import OpenAI from "npm:openai@4.52.0";
import * as Sentry from "@sentry/deno";

// ========================================
// Types
// ========================================

export type WhatsAppMediaType =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker";

export interface WhatsAppMediaObject {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

export interface MediaProcessingResult {
  success: boolean;
  messageContent: string;
  mediaType: WhatsAppMediaType;
  mimeType: string;
  error?: string;
  imageUrl?: string;
}

// ========================================
// Utility Functions
// ========================================

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/amr": ".amr",
    "audio/aac": ".aac",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "text/plain": ".txt",
  };

  return mimeToExt[mimeType] || "";
}

// ========================================
// Audio Transcription
// ========================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeAudio(
  buffer: Uint8Array,
  mimeType: string,
  correlationId?: string
): Promise<string> {
  const openai = getOpenAIClient();

  try {
    const extension = getExtensionFromMimeType(mimeType) || ".ogg";
    const filename = `audio${extension}`;

    // Create a File/Blob for the OpenAI SDK
    const file = new File([buffer as BlobPart], filename, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "text",
    });

    const transcriptionText = typeof transcription === "string" ? transcription : (transcription as { text: string }).text;

    console.log("[WhatsAppMedia] Audio transcribed successfully", {
      correlationId,
      transcriptionLength: transcriptionText.length,
    });

    return transcriptionText;
  } catch (error) {
    console.error("[WhatsAppMedia] Audio transcription failed", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ========================================
// Media Processing Functions
// ========================================

/**
 * Process an image message - upload to GCS for vision processing
 */
async function processImageMessage(
  media: WhatsAppMediaObject,
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult> {
  const downloaded = await whatsappService.downloadMedia(media.id, accessToken);

  if (!downloaded) {
    return {
      success: false,
      messageContent: "[Unable to process image]",
      mediaType: "image",
      mimeType: media.mime_type,
      error: "Failed to download image",
    };
  }

  try {
    // Upload to GCS public bucket
    const timestamp = Date.now();
    const extension = getExtensionFromMimeType(downloaded.mimeType) || ".jpg";
    const filename = `whatsapp-media/image-${timestamp}${extension}`;

    const imageUrl = await uploadImageToPublicBucket(
      downloaded.buffer,
      filename,
      downloaded.mimeType
    );

    // Format message with image URL for multimodal processing
    // Using markdown format that multimodal-message-converter recognizes
    const caption = media.caption ? `${media.caption}\n\n` : "";
    const messageContent = `${caption}![](${imageUrl})`;

    console.log("[WhatsAppMedia] Image processed successfully", {
      correlationId,
      imageUrl,
    });

    return {
      success: true,
      messageContent,
      mediaType: "image",
      mimeType: downloaded.mimeType,
      imageUrl,
    };
  } catch (error) {
    console.error("[WhatsAppMedia] Image processing failed", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { source: "whatsapp-media", feature: "image-processing" },
      extra: { correlationId, mediaId: media.id },
    });
    return {
      success: false,
      messageContent: "[Unable to process image]",
      mediaType: "image",
      mimeType: media.mime_type,
      error: error instanceof Error ? error.message : "Image processing failed",
    };
  }
}

/**
 * Process an audio message - transcribe using Whisper
 */
async function processAudioMessage(
  media: WhatsAppMediaObject,
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult> {
  const downloaded = await whatsappService.downloadMedia(media.id, accessToken);

  if (!downloaded) {
    return {
      success: false,
      messageContent: "[Unable to process audio message]",
      mediaType: "audio",
      mimeType: media.mime_type,
      error: "Failed to download audio",
    };
  }

  try {
    const transcription = await transcribeAudio(
      downloaded.buffer,
      downloaded.mimeType,
      correlationId
    );

    // Include context that this is a voice message
    const voiceContext = media.voice ? "[Voice message] " : "[Audio message] ";
    const messageContent = `${voiceContext}${transcription}`;

    return {
      success: true,
      messageContent,
      mediaType: "audio",
      mimeType: downloaded.mimeType,
    };
  } catch (error) {
    console.error("[WhatsAppMedia] Audio processing failed", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { source: "whatsapp-media", feature: "audio-processing" },
      extra: { correlationId, mediaId: media.id },
    });
    return {
      success: false,
      messageContent:
        "[Unable to transcribe audio message. Please send as text.]",
      mediaType: "audio",
      mimeType: media.mime_type,
      error:
        error instanceof Error ? error.message : "Audio transcription failed",
    };
  }
}

/**
 * Process a video message - acknowledge with caption
 */
async function processVideoMessage(
  media: WhatsAppMediaObject,
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult> {
  const downloaded = await whatsappService.downloadMedia(media.id, accessToken);

  if (!downloaded) {
    return {
      success: false,
      messageContent: "[Unable to process video]",
      mediaType: "video",
      mimeType: media.mime_type,
      error: "Failed to download video",
    };
  }

  // For now, just acknowledge the video with caption if present
  // Full video processing would require uploading to GCS and using analyzeVideo
  const caption = media.caption ? media.caption : "";
  const messageContent = `[User sent a video${caption ? `: "${caption}"` : ""}. Video content cannot be fully analyzed at this time.]`;

  console.log("[WhatsAppMedia] Video acknowledged", {
    correlationId,
    hasCaption: !!caption,
  });

  return {
    success: true,
    messageContent,
    mediaType: "video",
    mimeType: downloaded.mimeType,
  };
}

/**
 * Process a document message
 */
async function processDocumentMessage(
  media: WhatsAppMediaObject,
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult> {
  const downloaded = await whatsappService.downloadMedia(media.id, accessToken);

  if (!downloaded) {
    return {
      success: false,
      messageContent: "[Unable to process document]",
      mediaType: "document",
      mimeType: media.mime_type,
      error: "Failed to download document",
    };
  }

  // For text files, we can read the content directly
  if (downloaded.mimeType === "text/plain") {
    const textContent = new TextDecoder().decode(downloaded.buffer);
    const filename = media.filename || "document.txt";
    const messageContent = `[Document: ${filename}]\n\n${textContent}`;

    console.log("[WhatsAppMedia] Text document processed", {
      correlationId,
      filename,
      contentLength: textContent.length,
    });

    return {
      success: true,
      messageContent,
      mediaType: "document",
      mimeType: downloaded.mimeType,
    };
  }

  // For other documents, acknowledge receipt with filename
  const filename = media.filename || "document";
  const caption = media.caption ? ` - ${media.caption}` : "";
  const messageContent = `[User sent a document: "${filename}"${caption}. Document analysis is not yet fully supported for this file type.]`;

  console.log("[WhatsAppMedia] Document acknowledged", {
    correlationId,
    filename,
    mimeType: downloaded.mimeType,
  });

  return {
    success: true,
    messageContent,
    mediaType: "document",
    mimeType: downloaded.mimeType,
  };
}

/**
 * Process a sticker message - treat like an image
 */
async function processStickerMessage(
  media: WhatsAppMediaObject,
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult> {
  const downloaded = await whatsappService.downloadMedia(media.id, accessToken);

  if (!downloaded) {
    return {
      success: false,
      messageContent: "[Unable to process sticker]",
      mediaType: "sticker",
      mimeType: media.mime_type,
      error: "Failed to download sticker",
    };
  }

  try {
    // Upload to GCS public bucket
    const timestamp = Date.now();
    const extension = getExtensionFromMimeType(downloaded.mimeType) || ".webp";
    const filename = `whatsapp-media/sticker-${timestamp}${extension}`;

    const imageUrl = await uploadImageToPublicBucket(
      downloaded.buffer,
      filename,
      downloaded.mimeType
    );

    // Format message for vision processing
    const messageContent = `[User sent a sticker]\n\n![](${imageUrl})`;

    console.log("[WhatsAppMedia] Sticker processed successfully", {
      correlationId,
      imageUrl,
    });

    return {
      success: true,
      messageContent,
      mediaType: "sticker",
      mimeType: downloaded.mimeType,
      imageUrl,
    };
  } catch (error) {
    console.error("[WhatsAppMedia] Sticker processing failed", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { source: "whatsapp-media", feature: "sticker-processing" },
      extra: { correlationId, mediaId: media.id },
    });
    return {
      success: false,
      messageContent: "[Unable to process sticker]",
      mediaType: "sticker",
      mimeType: media.mime_type,
      error:
        error instanceof Error ? error.message : "Sticker processing failed",
    };
  }
}

// ========================================
// Main Export Functions
// ========================================

/**
 * Extract media type and object from WhatsApp message
 */
export function extractMediaFromMessage(message: {
  image?: WhatsAppMediaObject;
  audio?: WhatsAppMediaObject;
  video?: WhatsAppMediaObject;
  document?: WhatsAppMediaObject;
  sticker?: WhatsAppMediaObject;
}): {
  type: WhatsAppMediaType | null;
  media: WhatsAppMediaObject | null;
} {
  if (message.image) {
    return { type: "image", media: message.image };
  }
  if (message.audio) {
    return { type: "audio", media: message.audio };
  }
  if (message.video) {
    return { type: "video", media: message.video };
  }
  if (message.document) {
    return { type: "document", media: message.document };
  }
  if (message.sticker) {
    return { type: "sticker", media: message.sticker };
  }

  return { type: null, media: null };
}

/**
 * Process any media message type
 */
export async function processMediaMessage(
  message: {
    image?: WhatsAppMediaObject;
    audio?: WhatsAppMediaObject;
    video?: WhatsAppMediaObject;
    document?: WhatsAppMediaObject;
    sticker?: WhatsAppMediaObject;
  },
  accessToken: string,
  correlationId?: string
): Promise<MediaProcessingResult | null> {
  const { type, media } = extractMediaFromMessage(message);

  if (!type || !media) {
    return null;
  }

  console.log("[WhatsAppMedia] Processing media message", {
    correlationId,
    mediaType: type,
    mediaId: media.id,
    mimeType: media.mime_type,
  });

  switch (type) {
    case "image":
      return processImageMessage(media, accessToken, correlationId);
    case "audio":
      return processAudioMessage(media, accessToken, correlationId);
    case "video":
      return processVideoMessage(media, accessToken, correlationId);
    case "document":
      return processDocumentMessage(media, accessToken, correlationId);
    case "sticker":
      return processStickerMessage(media, accessToken, correlationId);
    default:
      return null;
  }
}

/**
 * Get unsupported media message in the app's language
 * Matches shared/utils-server/src/whatsapp/unsupportedMediaMessages.ts
 */
export function getUnsupportedMediaMessage(
  mediaType: string,
  language: string = "EN"
): string {
  const messages: Record<string, Record<string, string>> = {
    EN: {
      image:
        "[I received an image but couldn't process it. Please try sending it again or describe what you'd like me to see.]",
      audio:
        "[I received an audio message but couldn't transcribe it. Please send your message as text instead.]",
      video:
        "[I received a video but can't fully analyze video content yet. Please describe what you'd like me to know about it.]",
      document:
        "[I received a document but couldn't process this file type. Please share the content as text if possible.]",
      sticker:
        "[I received a sticker but couldn't process it. Please describe what you mean or send a text message.]",
      default:
        "[I received a media message but couldn't process it. Please try sending as text.]",
    },
    ES: {
      image:
        "[Recibí una imagen pero no pude procesarla. Por favor, intenta enviarla de nuevo o describe lo que quieres que vea.]",
      audio:
        "[Recibí un mensaje de audio pero no pude transcribirlo. Por favor, envía tu mensaje como texto.]",
      video:
        "[Recibí un video pero aún no puedo analizar completamente el contenido de video. Por favor, describe lo que quieres que sepa sobre él.]",
      document:
        "[Recibí un documento pero no pude procesar este tipo de archivo. Por favor, comparte el contenido como texto si es posible.]",
      sticker:
        "[Recibí un sticker pero no pude procesarlo. Por favor, describe lo que quieres decir o envía un mensaje de texto.]",
      default:
        "[Recibí un mensaje multimedia pero no pude procesarlo. Por favor, intenta enviarlo como texto.]",
    },
    PT: {
      image:
        "[Recebi uma imagem mas não consegui processá-la. Por favor, tente enviá-la novamente ou descreva o que você gostaria que eu visse.]",
      audio:
        "[Recebi uma mensagem de áudio mas não consegui transcrevê-la. Por favor, envie sua mensagem como texto.]",
      video:
        "[Recebi um vídeo mas ainda não consigo analisar completamente o conteúdo de vídeo. Por favor, descreva o que você gostaria que eu soubesse sobre ele.]",
      document:
        "[Recebi um documento mas não consegui processar este tipo de arquivo. Por favor, compartilhe o conteúdo como texto se possível.]",
      sticker:
        "[Recebi um sticker mas não consegui processá-lo. Por favor, descreva o que você quer dizer ou envie uma mensagem de texto.]",
      default:
        "[Recebi uma mensagem de mídia mas não consegui processá-la. Por favor, tente enviar como texto.]",
    },
  };

  const langMessages = messages[language.toUpperCase()] || messages.EN;
  return langMessages[mediaType] || langMessages.default;
}
