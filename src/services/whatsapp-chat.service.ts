/**
 * WhatsApp Chat Service
 *
 * Handles WhatsApp message events and connects them to the AI chat system.
 * Manages session creation, message handling, and response posting.
 *
 * This mirrors the functionality in:
 * apps/chipp-admin/app/api/whatsapp/webhook/[applicationId]/route.ts
 */

import { db } from "../db/client.ts";
import {
  whatsappService,
  type WhatsAppCredentials,
} from "./whatsapp.service.ts";
import { chatService } from "./chat.service.ts";
import {
  extractMediaFromMessage,
  processMediaMessage,
  getUnsupportedMediaMessage,
} from "./whatsapp-media.service.ts";
import { log } from "@/lib/logger.ts";

// Agent framework imports
import { DEFAULT_MODEL_ID } from "../config/models.ts";
import { createAdapterWithBilling } from "../llm/index.ts";
import {
  createRegistry,
  agentLoop,
  registerCoreTools,
  registerRAGTools,
} from "../agent/index.ts";
import { registerWebTools } from "../agent/tools/web.ts";
import { registerCustomTools } from "../agent/tools/custom.ts";
import { customActionService } from "./custom-action.service.ts";
import { ExecutionContext } from "./tool-execution.service.ts";
import { hasKnowledgeSources } from "./rag.service.ts";
import type { Message } from "../llm/types.ts";

// ========================================
// Types
// ========================================

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: WhatsAppMediaObject;
  audio?: WhatsAppMediaObject;
  video?: WhatsAppMediaObject;
  document?: WhatsAppMediaObject;
  sticker?: WhatsAppMediaObject;
}

export interface WhatsAppMediaObject {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
}

export interface HandleWhatsAppMessageParams {
  applicationId: string;
  message: WhatsAppMessage;
  credentials: WhatsAppCredentials;
  correlationId?: string;
}

// ========================================
// Language Map (matches shared-utils/src/i18n)
// ========================================

const LANGUAGE_MAP: Record<string, string> = {
  EN: "English",
  ES: "Spanish",
  PT: "Portuguese",
  FR: "French",
  DE: "German",
  IT: "Italian",
  NL: "Dutch",
  PL: "Polish",
  RU: "Russian",
  JA: "Japanese",
  KO: "Korean",
  ZH: "Chinese",
  AR: "Arabic",
  HI: "Hindi",
  TR: "Turkish",
  VI: "Vietnamese",
  TH: "Thai",
  ID: "Indonesian",
  MS: "Malay",
  FIL: "Filipino",
};

// ========================================
// Text Processing
// ========================================

/**
 * Truncates text to stay within WhatsApp's 4096 character limit
 * while preserving complete sentences.
 * Matches shared/utils-server behavior.
 */
function truncateWithSemanticMeaning(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const sentenceEndingPatterns = [". ", "! ", "? ", ".\n", "!\n", "?\n"];
  let truncatedText = text.slice(0, maxLength);

  // Find the last complete sentence
  let lastCompleteIndex = -1;

  for (const pattern of sentenceEndingPatterns) {
    const lastIndex = truncatedText.lastIndexOf(pattern);
    if (lastIndex > lastCompleteIndex) {
      lastCompleteIndex = lastIndex + pattern.length - 1;
    }
  }

  // If no sentence ending found, try to break at a paragraph
  if (lastCompleteIndex === -1) {
    lastCompleteIndex = truncatedText.lastIndexOf("\n");
  }

  // If still no natural break found, look for the last space
  if (lastCompleteIndex === -1) {
    lastCompleteIndex = truncatedText.lastIndexOf(" ");
  }

  // If we found a good breaking point, use it
  if (lastCompleteIndex !== -1) {
    return truncatedText.slice(0, lastCompleteIndex + 1);
  }

  // Last resort: just truncate at the maximum length
  return truncatedText;
}

// ========================================
// Session Management
// ========================================

/**
 * Check if we should start a new chat session based on time since last message
 * Returns true if last message is older than 90 days
 */
async function shouldStartNewSession(sessionId: string): Promise<boolean> {
  const SESSION_TIMEOUT_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  const messages = await chatService.getSessionMessages(sessionId);
  if (messages.length === 0) return false;

  const lastMessage = messages[0];
  const timeSinceLastMessage = Date.now() - lastMessage.createdAt.getTime();
  return timeSinceLastMessage > SESSION_TIMEOUT_MS;
}

/**
 * Get or create a chat session for a WhatsApp conversation
 * Session ID format matches chipp-admin: whatsapp-{from}-{applicationId}[-{timestamp}]
 */
async function getOrCreateSession(
  applicationId: string,
  phoneNumber: string
): Promise<string> {
  // Base session ID format (matches chipp-admin)
  const baseSessionId = `whatsapp-${phoneNumber}-${applicationId}`;

  // Try to find existing session by external ID
  const externalId = `whatsapp:${phoneNumber}:${applicationId}`;
  let session = await chatService.getSessionByExternalId(
    applicationId,
    externalId
  );

  if (session) {
    // Check if we should start a new session
    const shouldCreate = await shouldStartNewSession(session.id);
    if (!shouldCreate) {
      return session.id;
    }
    // Create new session with timestamp suffix
    const newSessionId = `${baseSessionId}-${Date.now()}`;
    session = await chatService.createSession({
      applicationId,
      source: "WHATSAPP",
      title: `WhatsApp: ${phoneNumber}`,
    });
    // Update with new externalId
    await db
      .updateTable("chat.sessions")
      .set({ externalId: `${externalId}:${Date.now()}` })
      .where("id", "=", session.id)
      .execute();
    return session.id;
  }

  // Create new session
  session = await chatService.createSession({
    applicationId,
    source: "WHATSAPP",
    title: `WhatsApp: ${phoneNumber}`,
  });

  // Update with externalId for future lookups
  await db
    .updateTable("chat.sessions")
    .set({ externalId })
    .where("id", "=", session.id)
    .execute();

  return session.id;
}

// ========================================
// Main Handler
// ========================================

/**
 * Handle incoming WhatsApp message and generate AI response
 */
export async function handleWhatsAppMessage(
  params: HandleWhatsAppMessageParams
): Promise<void> {
  const { applicationId, message, credentials, correlationId } = params;

  log.info("Processing message", {
    source: "whatsapp-chat",
    feature: "message-processing",
    correlationId,
    from: message.from,
    type: message.type,
    messageId: message.id,
  });

  try {
    // Get app config first (needed for language)
    const appConfig = await chatService.getAppConfig(applicationId);
    const language = "EN";

    // Check if this is a text message or media message
    const { type: mediaType, media: mediaObject } =
      extractMediaFromMessage(message);
    const isTextMessage = message.type === "text" && message.text?.body;
    const isMediaMessage = mediaType !== null && mediaObject !== null;

    log.info("Message classification", {
      source: "whatsapp-chat",
      feature: "message-processing",
      correlationId,
      isTextMessage,
      isMediaMessage,
      mediaType,
      messageType: message.type,
    });

    // Skip if neither text nor supported media
    if (!isTextMessage && !isMediaMessage) {
      log.warn("Unsupported message type, skipping", {
        source: "whatsapp-chat",
        feature: "message-processing",
        correlationId,
        messageType: message.type,
      });
      return;
    }

    // Determine the message content
    let userMessageContent: string;

    if (isTextMessage) {
      userMessageContent = message.text!.body;
    } else if (isMediaMessage) {
      // Process media message
      try {
        const mediaResult = await processMediaMessage(
          message,
          credentials.accessToken,
          correlationId
        );

        if (!mediaResult || !mediaResult.success) {
          log.error("Media processing failed", {
            source: "whatsapp-chat",
            feature: "media-processing",
            correlationId,
            applicationId,
            mediaType: mediaType || "unknown",
            mediaError: mediaResult?.error,
          }, new Error(`WhatsApp media processing failed: ${mediaResult?.error || "unknown error"}`));

          // Use localized fallback message
          userMessageContent = getUnsupportedMediaMessage(
            mediaType || message.type,
            language
          );
        } else {
          userMessageContent = mediaResult.messageContent;
          log.info("Media processed successfully", {
            source: "whatsapp-chat",
            feature: "media-processing",
            correlationId,
            mediaType,
            hasImageUrl: !!mediaResult.imageUrl,
            contentLength: userMessageContent.length,
          });
        }
      } catch (mediaError) {
        log.error("Unexpected error processing media", {
          source: "whatsapp-chat",
          feature: "media-processing",
          correlationId,
          applicationId,
          mediaType: mediaType || "unknown",
        }, mediaError);

        userMessageContent = getUnsupportedMediaMessage(
          mediaType || message.type,
          language
        );
      }
    } else {
      userMessageContent = "[Unsupported message type]";
    }

    if (!userMessageContent) {
      log.info("Empty message after processing", {
        source: "whatsapp-chat",
        feature: "message-processing",
        correlationId,
      });
      return;
    }

    // Get or create session
    const sessionId = await getOrCreateSession(applicationId, message.from);

    log.info("Processing user message", {
      source: "whatsapp-chat",
      feature: "message-processing",
      correlationId,
      sessionId,
      userMessage: userMessageContent.substring(0, 100),
    });

    // Get previous messages (last 10, like chipp-admin)
    const history = await chatService.getSessionMessages(sessionId);
    const hasKnowledge = await hasKnowledgeSources(applicationId);

    // Save user message
    await chatService.addMessage(sessionId, "user", userMessageContent);

    // Build system prompt with language instruction (matching chipp-admin)
    let systemPrompt = appConfig.systemPrompt || "";

    // Add language instruction
    const languageName = LANGUAGE_MAP[language.toUpperCase()] || "English";
    systemPrompt += `\n\nRespond in ${languageName} language.`;

    if (hasKnowledge) {
      systemPrompt +=
        "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
        "When the user asks questions that might be answered by uploaded documents or files, " +
        "use searchKnowledge to find relevant information before answering.";
    }

    // Add WhatsApp-specific context
    systemPrompt += `\n\nYou are chatting with a user on WhatsApp. Keep your responses concise and mobile-friendly.`;

    // Add current time
    const now = new Date();
    systemPrompt += `\n\nCurrent date and time: ${now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })}`;

    // Build messages from history (reverse order like chipp-admin)
    const messages: Message[] = [];
    const reversedHistory = [...history].reverse();
    for (const msg of reversedHistory) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        messages.push({ role: "assistant", content: msg.content });
      }
    }

    // Add current message
    messages.push({ role: "user", content: userMessageContent });

    // Get billing context
    const billingContext = await chatService.getBillingContext(
      appConfig.organizationId
    );

    // Create LLM adapter with billing
    const modelId = appConfig.model || DEFAULT_MODEL_ID;
    const adapter = await createAdapterWithBilling(modelId, billingContext);

    // Create tool registry
    const registry = createRegistry();

    // Register tools
    registerCoreTools(registry, { appId: applicationId });

    if (hasKnowledge) {
      registerRAGTools(registry, {
        appId: applicationId,
        searchKnowledge: async (
          appId: string,
          query: string,
          limit: number
        ) => {
          const { getRelevantChunks } = await import("./rag.service.ts");
          const chunks = await getRelevantChunks(appId, query);
          return chunks.slice(0, limit);
        },
      });
    }

    // Register custom actions
    const customActions = await customActionService.listForApp(applicationId);
    if (customActions.length > 0) {
      const execContext: ExecutionContext = {
        applicationId,
        sessionId,
        consumerId: undefined,
      };
      registerCustomTools(registry, customActions, execContext);
    }

    // Register web tools
    registerWebTools(registry);

    // Run agent loop
    log.info("Running agent loop", { source: "whatsapp-chat", feature: "agent-loop", correlationId });
    let responseText = "";
    for await (const chunk of agentLoop(messages, registry, adapter, {
      model: modelId,
      temperature: appConfig.temperature ?? 0.7,
      systemPrompt,
      maxIterations: 10,
    })) {
      if (chunk.type === "text") {
        responseText += chunk.delta;
      }
    }

    log.info("Got response", {
      source: "whatsapp-chat",
      feature: "agent-loop",
      correlationId,
      length: responseText.length,
    });

    // Save assistant message
    await chatService.addMessage(sessionId, "assistant", responseText);

    // Truncate response to fit within WhatsApp's 4096 character limit
    const truncatedText = truncateWithSemanticMeaning(responseText, 4096);

    // Send response via WhatsApp
    const sendResult = await whatsappService.sendTextMessage(
      credentials.phoneNumberId,
      credentials.accessToken,
      message.from,
      truncatedText
    );

    if (sendResult.error) {
      log.error("Failed to send message", {
        source: "whatsapp-chat",
        feature: "send-message",
        correlationId,
        applicationId,
        sendError: sendResult.error,
        recipientPhone: message.from,
      }, new Error(`WhatsApp API error: ${JSON.stringify(sendResult.error)}`));
    }

    // Mark original message as read
    await whatsappService.markAsRead(
      credentials.phoneNumberId,
      credentials.accessToken,
      message.id
    );
  } catch (error) {
    log.error("Error generating response", {
      source: "whatsapp-chat",
      feature: "message-processing",
      correlationId,
      applicationId,
      messageFrom: message.from,
    }, error);

    // Send error message to user
    try {
      await whatsappService.sendTextMessage(
        credentials.phoneNumberId,
        credentials.accessToken,
        message.from,
        "Sorry, I encountered an error processing your message. Please try again."
      );
    } catch (sendError) {
      log.error("Failed to send error message", {
        source: "whatsapp-chat",
        feature: "send-error-message",
        correlationId,
        applicationId,
        recipientPhone: message.from,
      }, sendError);
    }
  }
}
