/**
 * Consumer Chat Routes
 *
 * Chat endpoints for consumer (end-user) chat experience.
 * Uses consumer auth - separate from developer chat routes.
 *
 * ## Authentication Model
 *
 * Apps can be configured with or without required authentication:
 *
 * - `settings.requireAuth = false` (default): Anonymous chat allowed.
 *   Users can chat without logging in. Sessions are created without a consumerId.
 *
 * - `settings.requireAuth = true`: Authentication required.
 *   Users must log in before chatting. Unauthenticated requests return 401.
 *
 * This is controlled by the "User signup" toggle in the app builder UI,
 * which sets `settings.requireAuth` in the Application record.
 *
 * ## Session Ownership
 *
 * - Authenticated users: Sessions have a consumerId, can be listed/managed
 * - Anonymous users: Sessions have null consumerId, cannot be listed/managed
 * - Authenticated users cannot access anonymous sessions (and vice versa)
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as Sentry from "@sentry/deno";

import {
  optionalConsumerAuthMiddleware,
  type AppOnlyContext,
} from "../../middleware/consumerAuth.ts";
import { UnauthorizedError } from "../../../utils/errors.ts";
import { chatService } from "../../../services/chat.service.ts";
import {
  hasKnowledgeSources,
  getRelevantChunks,
} from "../../../services/rag.service.ts";

// Agent framework imports
import { DEFAULT_MODEL_ID } from "../../../config/models.ts";
import { createAdapterWithBilling } from "../../../llm/index.ts";
import type { BillingContext } from "../../../llm/index.ts";
import {
  createRegistry,
  agentLoop,
  registerCoreTools,
  registerRAGTools,
  withOnComplete,
} from "../../../agent/index.ts";
import { registerWebTools } from "../../../agent/tools/web.ts";
import { registerCustomTools } from "../../../agent/tools/custom.ts";
import { customActionService } from "../../../services/custom-action.service.ts";
import type {
  Message,
  AudioContentPart,
  VideoContentPart,
  ContentPart,
} from "../../../llm/types.ts";
import { modelSupportsAudioInput } from "../../../llm/utils/audio-capabilities.ts";
import { modelSupportsVideoInput } from "../../../llm/utils/video-capabilities.ts";
import { normalizeHistoryForModel } from "../../../llm/utils/normalize-history.ts";
import { reconstructHistory } from "../../../llm/utils/reconstruct-history.ts";
import { transcribeAudio } from "../../../services/transcription.service.ts";

// ========================================
// Live Chat Notification Helpers
// ========================================

import { db } from "../../../db/client.ts";
import { notificationService } from "../../../services/notifications/notification.service.ts";
import { publishToUsers, publishToSession, publishToUser } from "../../../websocket/pubsub.ts";
import type { ConversationActivityEvent } from "../../../websocket/types.ts";
import { multiplayerService } from "../../../services/multiplayer.service.ts";

/**
 * Get unique user IDs for all members in an organization.
 * Cached in-memory for 30s to avoid hammering DB on every message.
 */
const orgMemberCache = new Map<string, { userIds: string[]; expiresAt: number }>();

async function getOrgMemberUserIds(organizationId: string): Promise<string[]> {
  const cached = orgMemberCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userIds;
  }

  try {
    const members = await db
      .selectFrom("app.workspace_members as wm")
      .innerJoin("app.workspaces as w", "w.id", "wm.workspaceId")
      .select("wm.userId")
      .where("w.organizationId", "=", organizationId)
      .distinct()
      .execute();

    const userIds = members.map((m) => m.userId);
    orgMemberCache.set(organizationId, {
      userIds,
      expiresAt: Date.now() + 30_000,
    });
    return userIds;
  } catch (err) {
    console.error("[consumer-chat] Failed to get org members:", err);
    Sentry.captureException(err, {
      tags: { source: "consumer-chat", feature: "org-members" },
      extra: { organizationId },
    });
    return [];
  }
}

/**
 * Fire a conversation activity event to all org members (fire-and-forget).
 */
function fireConversationEvent(
  organizationId: string | null,
  event: ConversationActivityEvent
): void {
  if (!organizationId) return;

  getOrgMemberUserIds(organizationId)
    .then((userIds) => {
      if (userIds.length > 0) {
        publishToUsers(userIds, event).catch(() => {});
      }
    })
    .catch(() => {});
}

/**
 * Fire a notification:push toast to all org members (fire-and-forget).
 */
function fireNotificationPush(
  organizationId: string | null,
  opts: {
    title: string;
    body: string;
    actionUrl?: string;
    actionLabel?: string;
    notificationType?: string;
  }
): void {
  if (!organizationId) return;

  getOrgMemberUserIds(organizationId)
    .then((userIds) => {
      if (userIds.length > 0) {
        publishToUsers(userIds, {
          type: "notification:push",
          notificationType: opts.notificationType || "live_chat_started",
          category: "engagement",
          title: opts.title,
          body: opts.body,
          data: {},
          actionUrl: opts.actionUrl,
          actionLabel: opts.actionLabel,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    })
    .catch(() => {});
}

// ========================================
// Title Generation
// ========================================

const DEFAULT_CHAT_TITLE = "New Chat";

/**
 * Generate a title for a chat session based on its first messages.
 * This is called as a background task after the first assistant response.
 * Uses a fast, cheap model (gpt-4o-mini) to generate a short descriptive title.
 */
async function generateTitleIfNeeded(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  billingContext: BillingContext
): Promise<void> {
  try {
    // Check if session still has default title
    const session = await chatService.getSession(sessionId);
    if (!session || session.title !== DEFAULT_CHAT_TITLE) {
      return; // Already has a custom title or session doesn't exist
    }

    // Generate title using a fast model with the org's billing context
    const adapter = createAdapterWithBilling("gpt-4o-mini", billingContext);
    const systemPrompt =
      "Create a 3-6 word title for this conversation. Be concise and descriptive. Output only the title, no quotes or punctuation.";

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage.slice(0, 500) }, // Truncate for efficiency
    ];

    let title = "";
    for await (const chunk of adapter.chat(messages, {
      model: "gpt-4o-mini",
      maxOutputTokens: 30,
      temperature: 0.7,
    })) {
      if (chunk.type === "text") {
        title += chunk.delta;
      }
    }

    // Clean up title
    title = title
      .trim()
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/\.$/, "") // Remove trailing period
      .slice(0, 100); // Max 100 chars

    if (title) {
      await chatService.updateSessionTitle(sessionId, title);
      console.log("[chat] Generated title for session", { sessionId, title });
    }
  } catch (err) {
    // Non-critical - log but don't fail the request
    console.error("[chat] Failed to generate title:", err);
    Sentry.captureException(err, {
      tags: { source: "consumer-chat", feature: "title-generation" },
      extra: { sessionId },
    });
  }
}

// ========================================
// Validation Schemas
// ========================================

const createSessionSchema = z.object({
  title: z.string().max(255).optional(),
});

const audioInputSchema = z.object({
  data: z.string().min(1).max(10_000_000),
  mimeType: z.string().regex(/^audio\/(webm|wav|mp3|mp4|ogg|mpeg)(;.*)?$/),
  durationMs: z.number().int().min(0).max(300_000).optional(),
});

const videoInputSchema = z.object({
  url: z.string().url().max(2000),
  mimeType: z.string().regex(/^video\/(mp4|webm|quicktime|x-msvideo|mpeg)$/),
});

const sendMessageSchema = z
  .object({
    message: z.string().max(100000),
    sessionId: z.string().uuid().optional(),
    audio: audioInputSchema.optional(),
    video: videoInputSchema.optional(),
  })
  .refine(
    (data) => data.message.trim().length > 0 || data.audio || data.video,
    {
      message: "Either message, audio, or video is required",
      path: ["message"],
    }
  );

const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ========================================
// Router Setup
// ========================================

export const consumerChatRoutes = new Hono<AppOnlyContext>();

// IMPORTANT: We use optionalConsumerAuthMiddleware (not consumerAuthMiddleware)
// to support anonymous chat for apps that don't require authentication.
// Each endpoint then checks app.settings.requireAuth to decide if auth is needed.
consumerChatRoutes.use("*", optionalConsumerAuthMiddleware);

/**
 * Check if app requires authentication based on settings.requireAuth
 * This corresponds to the "User signup" toggle in the app builder UI.
 */
function appRequiresAuth(app: AppOnlyContext["Variables"]["app"]): boolean {
  const settings = app.settings as Record<string, unknown> | null;
  return settings?.requireAuth === true;
}

/**
 * Throws UnauthorizedError if app requires auth but consumer is not authenticated.
 * Call this at the start of endpoints that should respect the requireAuth setting.
 */
function requireConsumerIfNeeded(
  app: AppOnlyContext["Variables"]["app"],
  consumer: AppOnlyContext["Variables"]["consumer"]
): void {
  if (appRequiresAuth(app) && !consumer) {
    throw new UnauthorizedError("Authentication required for this app");
  }
}

// ========================================
// Session Management
// ========================================

/**
 * GET /sessions
 * List chat sessions for the authenticated consumer
 * Always requires auth - anonymous users don't have sessions to list
 */
consumerChatRoutes.get(
  "/sessions",
  zValidator("query", listSessionsQuerySchema),
  async (c) => {
    const consumer = c.get("consumer");
    const app = c.get("app");
    const query = c.req.valid("query");

    // Session listing always requires auth
    if (!consumer) {
      throw new UnauthorizedError("Authentication required to list sessions");
    }

    const result = await chatService.listSessions({
      applicationId: app.id,
      consumerId: consumer.id,
      limit: query.limit,
      cursor: query.cursor,
    });

    // Transform for consumer view (simplified response)
    const sessions = result.sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.startedAt,
      lastMessageAt: session.messages[0]?.createdAt || session.startedAt,
      messageCount: session.messages.length,
    }));

    return c.json({
      data: sessions,
      pagination: result.pagination,
    });
  }
);

/**
 * POST /sessions
 * Create a new chat session
 * Requires auth for apps with requireAuth, allows anonymous otherwise
 */
consumerChatRoutes.post(
  "/sessions",
  zValidator("json", createSessionSchema),
  async (c) => {
    const consumer = c.get("consumer");
    const app = c.get("app");
    const body = c.req.valid("json");

    requireConsumerIfNeeded(app, consumer);

    const session = await chatService.createSession({
      applicationId: app.id,
      consumerId: consumer?.id,
      title: body.title,
      source: "APP",
    });

    return c.json({ data: session }, 201);
  }
);

/**
 * GET /sessions/:sessionId
 * Get a specific session with messages
 * Auth required - anonymous sessions can't be retrieved by ID
 */
consumerChatRoutes.get("/sessions/:sessionId", async (c) => {
  const consumer = c.get("consumer");
  const app = c.get("app");
  const { sessionId } = c.req.param();

  const session = await chatService.getSession(sessionId);

  // Verify the session belongs to this app
  if (session.applicationId !== app.id) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (session.isMultiplayer) {
    // Multiplayer: verify requester is an active participant
    const anonymousToken = c.req.header("X-Anonymous-Token");
    const participant = await multiplayerService.isSessionParticipant(
      sessionId,
      consumer?.id,
      anonymousToken
    );
    if (!participant) {
      return c.json({ error: "Session not found" }, 404);
    }
  } else {
    // Single-player: require auth and ownership
    if (!consumer) {
      throw new UnauthorizedError("Authentication required to view sessions");
    }
    if (session.consumerId !== consumer.id) {
      return c.json({ error: "Session not found" }, 404);
    }
  }

  // Transform for consumer view
  const transformedSession = {
    id: session.id,
    title: session.title,
    isMultiplayer: session.isMultiplayer,
    createdAt: session.startedAt,
    messages: session.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      senderParticipantId: msg.senderParticipantId,
      createdAt: msg.createdAt,
      audioUrl: msg.audioUrl,
      audioDurationMs: msg.audioDurationMs,
      videoUrl: msg.videoUrl,
      videoMimeType: msg.videoMimeType,
    })),
  };

  return c.json({ data: transformedSession });
});

/**
 * DELETE /sessions/:sessionId
 * Delete a chat session
 * Auth required - only authenticated users can delete sessions
 */
consumerChatRoutes.delete("/sessions/:sessionId", async (c) => {
  const consumer = c.get("consumer");
  const app = c.get("app");
  const { sessionId } = c.req.param();

  if (!consumer) {
    throw new UnauthorizedError("Authentication required to delete sessions");
  }

  const session = await chatService.getSession(sessionId);

  // Verify ownership
  if (session.applicationId !== app.id || session.consumerId !== consumer.id) {
    return c.json({ error: "Session not found" }, 404);
  }

  await chatService.deleteSession(sessionId);

  return c.json({ success: true });
});

// ========================================
// Streaming Chat
// ========================================

/**
 * POST /stream
 * SSE streaming chat endpoint for consumers
 * Supports anonymous chat for apps without requireAuth
 */
consumerChatRoutes.post(
  "/stream",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const consumer = c.get("consumer");
    const app = c.get("app");
    const body = c.req.valid("json");
    const requestId = c.get("requestId") ?? crypto.randomUUID();

    // Check if app requires authentication
    requireConsumerIfNeeded(app, consumer);

    try {
      // Get app config
      const appConfig = await chatService.getAppConfig(app.id);

      // Session handling
      let sessionId = body.sessionId;
      let session = null;
      let isNewSession = false;

      // Track multiplayer participant for broadcasting
      let senderParticipantId: string | undefined;

      if (sessionId) {
        session = await chatService.validateSession(sessionId, app.id);

        if (session.isMultiplayer) {
          // Multiplayer: verify sender is an active participant
          const anonymousToken = c.req.header("X-Anonymous-Token");
          const participant = await multiplayerService.isSessionParticipant(
            sessionId,
            consumer?.id,
            anonymousToken
          );
          if (!participant) {
            return c.json({ error: "Not a participant in this session" }, 403);
          }
          senderParticipantId = participant.id;
        } else {
          // Single-player ownership checks
          // SECURITY: Prevent unauthenticated users from accessing authenticated sessions
          if (!consumer && session.consumerId) {
            return c.json({ error: "Session not found" }, 404);
          }
          // Verify consumer owns this session (if they're authenticated)
          // Anonymous sessions have null consumerId, so only validate if consumer exists
          if (
            consumer &&
            session.consumerId &&
            session.consumerId !== consumer.id
          ) {
            return c.json({ error: "Session not found" }, 404);
          }
          // Don't allow authenticated user to use anonymous session
          if (consumer && !session.consumerId) {
            return c.json({ error: "Session not found" }, 404);
          }
        }
      } else {
        session = await chatService.createSession({
          applicationId: app.id,
          consumerId: consumer?.id,
          source: "APP",
        });
        sessionId = session.id;
        isNewSession = true;

        // Fire live chat notifications to all org members
        chatService.updateSessionActivity(sessionId).catch(() => {});
        fireConversationEvent(appConfig.organizationId, {
          type: "conversation:started",
          sessionId,
          applicationId: app.id,
          consumerEmail: consumer?.email ?? undefined,
          consumerName: consumer?.name ?? undefined,
          timestamp: new Date().toISOString(),
        });
        fireNotificationPush(appConfig.organizationId, {
          title: "New Chat Started",
          body: consumer?.name || consumer?.email || "Anonymous user",
          actionUrl: `/#/apps/${app.id}/chats`,
          actionLabel: "View Chat",
        });

        // Send email notification (fire-and-forget)
        if (appConfig.organizationId) {
          notificationService.send({
            type: "new_chat",
            organizationId: appConfig.organizationId,
            data: {
              appName: appConfig.name || "your app",
              appId: app.id,
              sessionId,
              consumerName: consumer?.name ?? undefined,
              consumerEmail: consumer?.email ?? undefined,
              messagePreview: body.message?.slice(0, 200),
              source: "APP",
              timestamp: new Date().toISOString(),
            },
          }).catch(() => {});
        }
      }

      // Parallel context gathering (including billing context for Stripe Token Billing)
      const [hasKnowledge, history, memories, billingContext] =
        await Promise.all([
          hasKnowledgeSources(app.id),
          !isNewSession
            ? chatService.getSessionMessages(sessionId)
            : Promise.resolve([]),
          consumer
            ? chatService.getUserMemories(app.id, { consumerId: consumer.id })
            : Promise.resolve([]),
          chatService.getBillingContext(appConfig.organizationId),
        ]);

      // Check consumer credits if app requires them (only for authenticated users)
      const capabilities = appConfig.capabilities || {};
      if (
        consumer &&
        capabilities.requireCredits &&
        consumer.credits <= 0 &&
        !consumer.subscriptionActive
      ) {
        return c.json(
          {
            error: "INSUFFICIENT_CREDITS",
            message:
              "You have run out of credits. Please purchase more to continue.",
          },
          402
        );
      }

      // Determine model to use - check for dev override header first
      const devModelOverride = c.req.header("X-Dev-Model-Override");
      const environment = Deno.env.get("ENVIRONMENT") || "development";
      const isDevOrStaging = ["development", "local", "staging"].includes(
        environment
      );

      let modelId = appConfig.model ?? DEFAULT_MODEL_ID;
      if (isDevOrStaging && devModelOverride) {
        console.log(
          `[consumer-chat] Using dev model override: ${devModelOverride} (app default: ${modelId})`
        );
        modelId = devModelOverride;
      }

      // Handle audio input: send natively to audio-capable models, else transcribe via Whisper
      let messageText = body.message;
      let audioContentPart: AudioContentPart | null = null;
      let audioWasTranscribed = false;

      if (body.audio) {
        // Gemini models accept any audio format via their native inlineData API
        // (the Stripe proxy is bypassed for Gemini + audio, routing through GoogleProvider).
        // OpenAI models only accept wav/mp3 in the input_audio.format field.
        // For unsupported combos, fall back to Whisper transcription.
        const audioFormat = body.audio.mimeType.split(";")[0].split("/")[1];
        const isGemini = modelId.startsWith("gemini");
        const openAiNativeFormats = new Set(["wav", "mp3"]);
        const canUseNativeAudio =
          modelSupportsAudioInput(modelId) &&
          (isGemini || openAiNativeFormats.has(audioFormat));

        if (canUseNativeAudio) {
          // Model supports native audio — format is passed as-is
          audioContentPart = {
            type: "input_audio",
            input_audio: {
              data: body.audio.data,
              format: audioFormat as "webm" | "wav" | "mp3" | "mp4" | "ogg",
            },
          };
          // Use text message or placeholder for DB storage
          if (!messageText.trim()) {
            messageText = "[Voice message]";
          }
          console.log(
            "[consumer-chat] Audio: native input_audio for",
            modelId,
            "format:",
            audioFormat
          );
        } else {
          // Transcribe via Whisper (model doesn't support audio, or format not compatible)
          audioWasTranscribed = true;
          console.log(
            "[consumer-chat] Audio: transcribing via Whisper for",
            modelId,
            "format:",
            audioFormat
          );
          const { text } = await transcribeAudio(
            body.audio.data,
            body.audio.mimeType
          );
          if (text.trim()) {
            messageText = text;
          } else {
            messageText =
              messageText.trim() || "[Voice message - no speech detected]";
          }
          console.log(
            "[consumer-chat] Whisper transcript:",
            messageText.slice(0, 100)
          );
        }
      }

      // Handle video input: build video content part if model supports it
      let videoContentPart: VideoContentPart | null = null;

      if (body.video) {
        if (modelSupportsVideoInput(modelId)) {
          videoContentPart = {
            type: "input_video",
            input_video: {
              url: body.video.url,
              mimeType: body.video.mimeType,
            },
          };
          if (!messageText.trim()) {
            messageText = "Please watch and respond to this video.";
          }
          console.log("[consumer-chat] Video: native input_video for", modelId);
        } else {
          // Model doesn't support video - add text placeholder
          if (!messageText.trim()) {
            messageText = "[User attached a video]";
          }
          console.log(
            "[consumer-chat] Video: model",
            modelId,
            "does not support video input, using text placeholder"
          );
        }
      }

      // Start audio upload to GCS in the background (non-blocking)
      // Only upload when audio was sent natively to the LLM (consumers see the audio player).
      // When transcribed via Whisper, consumers see the transcript text instead.
      let audioUploadPromise: Promise<string | null> | null = null;
      if (body.audio && !audioWasTranscribed) {
        audioUploadPromise = (async () => {
          try {
            const { uploadImageToPublicBucket } = await import(
              "../../../services/storage.service.ts"
            );
            const audioBuffer = new Uint8Array(
              atob(body.audio!.data)
                .split("")
                .map((c) => c.charCodeAt(0))
            );
            const ext =
              body.audio!.mimeType.split(";")[0].split("/")[1] || "webm";
            const audioId = crypto.randomUUID();
            const storagePath = `chat-audio/${sessionId}/${audioId}.${ext}`;
            const url = await uploadImageToPublicBucket(
              audioBuffer,
              storagePath,
              body.audio!.mimeType.split(";")[0]
            );
            console.log("[consumer-chat] Audio uploaded to GCS:", url);
            return url;
          } catch (err) {
            console.error(
              "[consumer-chat] Failed to upload audio to GCS:",
              err
            );
            Sentry.captureException(err, {
              tags: { source: "consumer-chat", feature: "audio-upload" },
              extra: { sessionId, appId: app.id },
            });
            return null;
          }
        })();
      }

      // Save user message immediately (audio URL patched in after upload completes for native audio)
      const userMessage = await chatService.addMessage(
        sessionId,
        "user",
        messageText,
        {
          audioDurationMs: !audioWasTranscribed
            ? body.audio?.durationMs
            : undefined,
          videoUrl: body.video?.url,
          videoMimeType: body.video?.mimeType,
          senderParticipantId,
        }
      );

      // Broadcast user message to other multiplayer participants
      if (session.isMultiplayer && senderParticipantId) {
        publishToSession(
          sessionId,
          {
            type: "multiplayer:user_message",
            sessionId,
            message: {
              id: userMessage.id,
              role: "user",
              content: messageText,
              senderParticipantId,
              createdAt: userMessage.createdAt,
            },
          },
          senderParticipantId
        ).catch(() => {});
      }

      // Fire activity event for user message (fire-and-forget)
      chatService.updateSessionActivity(sessionId).catch(() => {});
      fireConversationEvent(appConfig.organizationId, {
        type: "conversation:activity",
        sessionId,
        applicationId: app.id,
        consumerEmail: consumer?.email ?? undefined,
        consumerName: consumer?.name ?? undefined,
        messagePreview: messageText.slice(0, 120),
        timestamp: new Date().toISOString(),
      });

      // Check if session is in human takeover mode -- skip AI
      if (session && session.mode === "human") {
        // Notify the builder who took over about the new consumer message
        if (session.takenOverBy) {
          publishToUser(session.takenOverBy, {
            type: "consumer:message",
            sessionId,
            content: messageText,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }

        // Return minimal SSE response (no AI invocation)
        return streamSSE(c, async (stream) => {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "start",
              messageId: crypto.randomUUID().slice(0, 16),
              sessionId,
            }),
          });
          await stream.writeSSE({
            data: JSON.stringify({
              type: "done",
              finishReason: "human_takeover",
            }),
          });
        });
      }

      // Build system prompt with knowledge base hint and current time
      let systemPrompt = appConfig.systemPrompt || "";
      if (hasKnowledge) {
        systemPrompt +=
          "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
          "When the user asks questions that might be answered by uploaded documents or files, " +
          "use searchKnowledge to find relevant information before answering. " +
          "You can search multiple times with different queries.";
      }
      // Add current time to system prompt (avoids unnecessary tool calls)
      const now = new Date();
      systemPrompt += `\n\nCurrent date and time: ${now.toLocaleString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }
      )}`;

      // Build messages array from history with tool call reconstruction
      const historyMessages = reconstructHistory(history, {
        logPrefix: "[consumer-chat]",
      });
      const previousModel =
        history
          .filter((msg) => msg.role === "assistant" && msg.model)
          .map((msg) => msg.model)
          .pop() || null;
      const normalizedHistory = normalizeHistoryForModel(
        historyMessages,
        modelId,
        previousModel
      );

      const messages: Message[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push(...normalizedHistory);

      // Build the user message - multimodal if audio/video content part, text otherwise
      if (audioContentPart || videoContentPart) {
        const parts: ContentPart[] = [];
        // Always include a text part - models like Gemini require non-empty input
        parts.push({ type: "text", text: body.message.trim() || messageText });
        if (audioContentPart) parts.push(audioContentPart);
        if (videoContentPart) parts.push(videoContentPart);
        messages.push({ role: "user", content: parts });
      } else {
        messages.push({ role: "user", content: messageText });
      }

      // Create adapter with billing context for Stripe Token Billing
      const adapter = createAdapterWithBilling(modelId, billingContext);
      const registry = createRegistry();
      registerCoreTools(registry, { appId: app.id });

      // Register web tools (browseWeb, retrieveUrl)
      registerWebTools(registry);

      // Register RAG tools only if app has knowledge sources
      if (hasKnowledge) {
        registerRAGTools(registry, {
          appId: app.id,
          searchKnowledge: async (
            appId: string,
            query: string,
            limit: number
          ) => {
            const chunks = await getRelevantChunks(appId, query);
            return chunks.slice(0, limit);
          },
        });
      }

      // Register custom tools (user-defined actions) for this app
      try {
        // Note: customActionService.list requires userId, but for consumer chat
        // we load all tools for the app (they're already filtered by applicationId)
        const customTools = await customActionService.listForApp(app.id);
        if (customTools.length > 0) {
          registerCustomTools(registry, customTools, {
            applicationId: app.id,
            sessionId: sessionId!,
            consumerId: consumer?.id,
          });
        }
      } catch (err) {
        // Log but don't fail - custom tools are optional
        console.warn("[consumer-chat] Failed to load custom tools:", err);
      }

      // Create abort controller for stopping the stream
      const abortController = new AbortController();

      // Register abort controller for multiplayer stop/interrupt
      if (session.isMultiplayer) {
        multiplayerService.registerActiveStream(sessionId, abortController);
      }

      // Wrap agent stream with onComplete callback for centralized persistence
      // This fires ONCE when the stream fully completes, avoiding duplicate saves
      const agentStream = withOnComplete(
        agentLoop(messages, registry, adapter, {
          model: modelId,
          temperature: appConfig.temperature ?? 0.7,
          abortSignal: abortController.signal,
        }),
        {
          abortSignal: abortController.signal,
          onComplete: async (result) => {
            // Unregister multiplayer stream
            if (session!.isMultiplayer) {
              multiplayerService.unregisterActiveStream(sessionId);
            }

            // Skip if nothing to save or aborted
            if (!result.text || result.aborted) {
              if (result.aborted) {
                console.log(
                  "[consumer-chat] onComplete: Stream aborted, skipping persistence"
                );
              }
              return;
            }

            console.log(
              `[consumer-chat] onComplete: Persisting message - ${result.text.length} chars`
            );

            // Save bot response with tool calls/results if present
            await chatService.addMessage(sessionId, "assistant", result.text, {
              model: modelId,
              toolCalls:
                result.toolCalls.length > 0 ? result.toolCalls : undefined,
              toolResults:
                result.toolResults.length > 0 ? result.toolResults : undefined,
            });

            // Generate title in background (fire-and-forget)
            // Only triggers if session still has default "New Chat" title
            generateTitleIfNeeded(
              sessionId,
              messageText,
              result.text,
              billingContext
            ).catch((err) => {
              console.error("[consumer-chat] Title generation error:", err);
              Sentry.captureException(err, {
                tags: { source: "consumer-chat", feature: "title-generation" },
                extra: { sessionId, appId: app.id },
              });
            });

            // Record token usage
            const { inputTokens, outputTokens } = result.usage;
            if (app.organizationId && (inputTokens > 0 || outputTokens > 0)) {
              chatService
                .recordTokenUsage({
                  applicationId: app.id,
                  organizationId: app.organizationId,
                  sessionId,
                  model: modelId,
                  inputTokens,
                  outputTokens,
                })
                .catch((err) => {
                  console.error(
                    "[consumer-chat] Failed to record token usage:",
                    err
                  );
                  Sentry.captureException(err, {
                    tags: { source: "consumer-chat", feature: "token-usage" },
                    extra: { appId: app.id, sessionId, model: modelId, consumerId: consumer?.id },
                  });
                });
            }

            // Deduct consumer credit if applicable
            if (
              consumer &&
              capabilities.requireCredits &&
              !consumer.subscriptionActive
            ) {
              // Deduct 1 credit per message (simple model)
              // In production, this would be more sophisticated based on tokens
            }
          },
        }
      );

      // Stream response
      return streamSSE(c, async (stream) => {
        // Handle client disconnect - abort the agent loop
        stream.onAbort(() => {
          console.log("[consumer-chat] Client disconnected, aborting stream");
          abortController.abort();
        });

        const messageId = crypto.randomUUID().slice(0, 16);

        // Send start event
        await stream.writeSSE({
          data: JSON.stringify({ type: "start", messageId, sessionId }),
        });

        // Broadcast AI start to other multiplayer participants
        if (session.isMultiplayer && senderParticipantId) {
          publishToSession(
            sessionId,
            { type: "multiplayer:ai_start", sessionId },
            senderParticipantId
          ).catch(() => {});
        }

        // When audio was transcribed via Whisper, tell the frontend to show
        // the transcript text instead of the audio player
        if (audioWasTranscribed) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "audio-transcribed",
              text: messageText,
            }),
          });
        }

        // When audio upload completes, send URL via SSE and patch the DB record
        if (audioUploadPromise) {
          audioUploadPromise.then(async (audioGcsUrl) => {
            if (!audioGcsUrl) return;
            try {
              // Send audio URL to frontend so it can replace the blob URL
              await stream.writeSSE({
                data: JSON.stringify({
                  type: "audio-url",
                  audioUrl: audioGcsUrl,
                }),
              });
              // Patch the user message with the GCS URL
              const { db } = await import("../../../db/client.ts");
              await db
                .updateTable("chat.messages")
                .set({ audioUrl: audioGcsUrl })
                .where("id", "=", userMessage.id)
                .execute();
            } catch (err) {
              console.error(
                "[consumer-chat] Failed to send/patch audio URL:",
                err
              );
              Sentry.captureException(err, {
                tags: { source: "consumer-chat", feature: "audio-url-patch" },
                extra: { sessionId, messageId: userMessage.id, appId: app.id },
              });
            }
          });
        }

        let responseContent = ""; // For SSE display

        // Track pending tool calls for SSE formatting (name lookup for results)
        const pendingToolCalls = new Map<
          string,
          { name: string; input: unknown }
        >();

        try {
          for await (const chunk of agentStream) {
            switch (chunk.type) {
              case "text": {
                responseContent += chunk.delta;
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "text-delta",
                    delta: chunk.delta,
                  }),
                });
                // Broadcast AI text chunk to other multiplayer participants
                if (session.isMultiplayer && senderParticipantId) {
                  publishToSession(
                    sessionId,
                    {
                      type: "multiplayer:ai_chunk",
                      sessionId,
                      delta: chunk.delta,
                    },
                    senderParticipantId
                  ).catch(() => {});
                }
                break;
              }

              case "tool_call": {
                const call = chunk.call;

                // Track for SSE name lookup when we get result
                pendingToolCalls.set(call.id, {
                  name: call.name,
                  input: call.arguments,
                });

                // Send tool-input-start
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-input-start",
                    toolCallId: call.id,
                    toolName: call.name,
                  }),
                });

                // Send tool-input-available with full input
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-input-available",
                    toolCallId: call.id,
                    toolName: call.name,
                    input: call.arguments,
                  }),
                });

                // Broadcast tool call to other multiplayer participants
                if (session.isMultiplayer && senderParticipantId) {
                  publishToSession(
                    sessionId,
                    {
                      type: "multiplayer:ai_tool_call",
                      sessionId,
                      toolCallId: call.id,
                      toolName: call.name,
                      input: call.arguments,
                    },
                    senderParticipantId
                  ).catch(() => {});
                }
                break;
              }

              case "tool_result": {
                const toolCall = pendingToolCalls.get(chunk.callId);
                const toolName = toolCall?.name || "unknown";

                // Send tool-output-available with result
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-output-available",
                    toolCallId: chunk.callId,
                    toolName,
                    output: chunk.result,
                  }),
                });

                // Broadcast tool result to other multiplayer participants
                if (session.isMultiplayer && senderParticipantId) {
                  publishToSession(
                    sessionId,
                    {
                      type: "multiplayer:ai_tool_result",
                      sessionId,
                      toolCallId: chunk.callId,
                      toolName,
                      output: chunk.result,
                    },
                    senderParticipantId
                  ).catch(() => {});
                }

                pendingToolCalls.delete(chunk.callId);
                break;
              }

              case "tool_error": {
                const toolCall = pendingToolCalls.get(chunk.callId);
                const toolName = toolCall?.name || "unknown";

                // Send tool-output-available with error
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-output-available",
                    toolCallId: chunk.callId,
                    toolName,
                    output: { error: chunk.error },
                  }),
                });

                // Broadcast tool error to other multiplayer participants
                if (session.isMultiplayer && senderParticipantId) {
                  publishToSession(
                    sessionId,
                    {
                      type: "multiplayer:ai_tool_result",
                      sessionId,
                      toolCallId: chunk.callId,
                      toolName,
                      output: { error: chunk.error },
                    },
                    senderParticipantId
                  ).catch(() => {});
                }

                pendingToolCalls.delete(chunk.callId);
                break;
              }

              case "done": {
                // Token usage is tracked by withOnComplete wrapper
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "finish",
                    finishReason: chunk.finishReason || "stop",
                  }),
                });
                // Broadcast AI finish to other multiplayer participants
                if (session.isMultiplayer && senderParticipantId) {
                  publishToSession(
                    sessionId,
                    {
                      type: "multiplayer:ai_finish",
                      sessionId,
                      finishReason: chunk.finishReason || "stop",
                    },
                    senderParticipantId
                  ).catch(() => {});
                }
                break;
              }
            }
          }

          // Persistence is handled by withOnComplete callback

          await stream.writeSSE({ data: "[DONE]" });
        } catch (error) {
          console.error("[consumer-chat] Stream error:", error);
          Sentry.captureException(error, {
            tags: { source: "consumer-chat", feature: "stream" },
            extra: {
              requestId,
              appId: app.id,
              sessionId,
              consumerId: consumer?.id,
              model: modelId,
            },
          });

          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Stream error",
            }),
          });
        }
      });
    } catch (error) {
      console.error("[consumer-chat] Setup error:", error);
      Sentry.captureException(error, {
        tags: { source: "consumer-chat", feature: "setup" },
        extra: { requestId, appId: app.id, consumerId: consumer?.id },
      });
      throw error;
    }
  }
);

/**
 * POST /send
 * Non-streaming chat endpoint (for simpler integrations)
 * Supports anonymous chat for apps without requireAuth
 */
consumerChatRoutes.post(
  "/send",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const consumer = c.get("consumer");
    const app = c.get("app");
    const body = c.req.valid("json");

    // Check if app requires authentication
    requireConsumerIfNeeded(app, consumer);

    try {
      const appConfig = await chatService.getAppConfig(app.id);

      // Session handling
      let sessionId = body.sessionId;
      let session = null;
      let isNewSession = false;

      // Track multiplayer participant
      let sendParticipantId: string | undefined;

      if (sessionId) {
        session = await chatService.validateSession(sessionId, app.id);

        if (session.isMultiplayer) {
          // Multiplayer: verify sender is an active participant
          const anonymousToken = c.req.header("X-Anonymous-Token");
          const participant = await multiplayerService.isSessionParticipant(
            sessionId,
            consumer?.id,
            anonymousToken
          );
          if (!participant) {
            return c.json({ error: "Not a participant in this session" }, 403);
          }
          sendParticipantId = participant.id;
        } else {
          // Single-player ownership checks
          // SECURITY: Prevent unauthenticated users from accessing authenticated sessions
          if (!consumer && session.consumerId) {
            return c.json({ error: "Session not found" }, 404);
          }
          // Verify consumer owns this session (if they're authenticated)
          if (
            consumer &&
            session.consumerId &&
            session.consumerId !== consumer.id
          ) {
            return c.json({ error: "Session not found" }, 404);
          }
          // Don't allow authenticated user to use anonymous session
          if (consumer && !session.consumerId) {
            return c.json({ error: "Session not found" }, 404);
          }
        }
      } else {
        session = await chatService.createSession({
          applicationId: app.id,
          consumerId: consumer?.id,
          source: "APP",
        });
        sessionId = session.id;
        isNewSession = true;

        // Fire live chat notifications to all org members
        chatService.updateSessionActivity(sessionId).catch(() => {});
        fireConversationEvent(appConfig.organizationId, {
          type: "conversation:started",
          sessionId,
          applicationId: app.id,
          consumerEmail: consumer?.email ?? undefined,
          consumerName: consumer?.name ?? undefined,
          timestamp: new Date().toISOString(),
        });
        fireNotificationPush(appConfig.organizationId, {
          title: "New Chat Started",
          body: consumer?.name || consumer?.email || "Anonymous user",
          actionUrl: `/#/apps/${app.id}/chats`,
          actionLabel: "View Chat",
        });

        // Send email notification (fire-and-forget)
        if (appConfig.organizationId) {
          notificationService.send({
            type: "new_chat",
            organizationId: appConfig.organizationId,
            data: {
              appName: appConfig.name || "your app",
              appId: app.id,
              sessionId,
              consumerName: consumer?.name ?? undefined,
              consumerEmail: consumer?.email ?? undefined,
              messagePreview: body.message?.slice(0, 200),
              source: "APP",
              timestamp: new Date().toISOString(),
            },
          }).catch(() => {});
        }
      }

      // Context gathering (including billing context for Stripe Token Billing)
      const [hasKnowledge, history, billingContext] = await Promise.all([
        hasKnowledgeSources(app.id),
        !isNewSession
          ? chatService.getSessionMessages(sessionId)
          : Promise.resolve([]),
        chatService.getBillingContext(appConfig.organizationId),
      ]);

      // Save user message
      await chatService.addMessage(sessionId, "user", body.message, {
        senderParticipantId: sendParticipantId,
      });

      // Fire activity event for user message (fire-and-forget)
      chatService.updateSessionActivity(sessionId).catch(() => {});
      fireConversationEvent(appConfig.organizationId, {
        type: "conversation:activity",
        sessionId,
        applicationId: app.id,
        consumerEmail: consumer?.email ?? undefined,
        consumerName: consumer?.name ?? undefined,
        messagePreview: body.message.slice(0, 120),
        timestamp: new Date().toISOString(),
      });

      // Determine model to use - check for dev override header first
      const devModelOverride = c.req.header("X-Dev-Model-Override");
      const environment = Deno.env.get("ENVIRONMENT") || "development";
      const isDevOrStaging = ["development", "local", "staging"].includes(
        environment
      );

      let modelId = appConfig.model ?? DEFAULT_MODEL_ID;
      if (isDevOrStaging && devModelOverride) {
        console.log(
          `[consumer-chat-nonstream] Using dev model override: ${devModelOverride} (app default: ${modelId})`
        );
        modelId = devModelOverride;
      }

      // Build system prompt with knowledge base hint and current time
      let systemPrompt = appConfig.systemPrompt || "";
      if (hasKnowledge) {
        systemPrompt +=
          "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
          "When the user asks questions that might be answered by uploaded documents or files, " +
          "use searchKnowledge to find relevant information before answering. " +
          "You can search multiple times with different queries.";
      }
      // Add current time to system prompt (avoids unnecessary tool calls)
      const now = new Date();
      systemPrompt += `\n\nCurrent date and time: ${now.toLocaleString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }
      )}`;

      // Build messages with tool call reconstruction
      const historyMessages = reconstructHistory(history, {
        logPrefix: "[consumer-chat-nonstream]",
      });
      const previousModel =
        history
          .filter((msg) => msg.role === "assistant" && msg.model)
          .map((msg) => msg.model)
          .pop() || null;
      const normalizedHistory = normalizeHistoryForModel(
        historyMessages,
        modelId,
        previousModel
      );

      const messages: Message[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push(...normalizedHistory);
      messages.push({ role: "user", content: body.message });

      // Create adapter with billing context for Stripe Token Billing
      const adapter = createAdapterWithBilling(modelId, billingContext);
      const registry = createRegistry();
      registerCoreTools(registry, { appId: app.id });

      // Register web tools (browseWeb, retrieveUrl)
      registerWebTools(registry);

      // Register RAG tools only if app has knowledge sources
      if (hasKnowledge) {
        registerRAGTools(registry, {
          appId: app.id,
          searchKnowledge: async (
            appId: string,
            query: string,
            limit: number
          ) => {
            const chunks = await getRelevantChunks(appId, query);
            return chunks.slice(0, limit);
          },
        });
      }

      // Register custom tools (user-defined actions) for this app
      try {
        const customTools = await customActionService.listForApp(app.id);
        if (customTools.length > 0) {
          registerCustomTools(registry, customTools, {
            applicationId: app.id,
            sessionId: sessionId!,
            consumerId: consumer?.id,
          });
        }
      } catch (err) {
        console.warn("[consumer-chat] Failed to load custom tools:", err);
      }

      let responseContent = "";
      const agentStream = agentLoop(messages, registry, adapter, {
        model: modelId,
        temperature: appConfig.temperature ?? 0.7,
      });

      for await (const chunk of agentStream) {
        if (chunk.type === "text") {
          responseContent += chunk.delta;
        }
      }

      // Save bot response
      await chatService.addMessage(sessionId, "assistant", responseContent, {
        model: modelId,
      });

      // Generate title in background (fire-and-forget)
      generateTitleIfNeeded(
        sessionId,
        body.message,
        responseContent,
        billingContext
      ).catch((err) => {
        console.error("[consumer-chat] Title generation error:", err);
        Sentry.captureException(err, {
          tags: { source: "consumer-chat", feature: "title-generation" },
          extra: { sessionId, appId: app.id },
        });
      });

      return c.json({
        sessionId,
        message: responseContent,
      });
    } catch (error) {
      console.error("[consumer-chat] Error:", error);
      Sentry.captureException(error, {
        tags: { source: "consumer-chat", feature: "non-streaming" },
        extra: { appId: app.id, consumerId: consumer?.id, sessionId: body.sessionId },
      });
      throw error;
    }
  }
);

// ========================================
// Session End (Beacon)
// ========================================

/**
 * POST /session-end
 * Called via navigator.sendBeacon() when the consumer leaves the page.
 * Marks the session as ended and notifies builders.
 */
consumerChatRoutes.post(
  "/session-end",
  zValidator(
    "json",
    z.object({
      sessionId: z.string().uuid(),
    })
  ),
  async (c) => {
    const app = c.get("app");
    const body = c.req.valid("json");

    try {
      const appConfig = await chatService.getAppConfig(app.id);

      await chatService.endSession(body.sessionId);

      fireConversationEvent(appConfig.organizationId, {
        type: "conversation:ended",
        sessionId: body.sessionId,
        applicationId: app.id,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[consumer-chat] Session end error:", err);
      Sentry.captureException(err, {
        tags: { source: "consumer-chat", feature: "session-end" },
        extra: { sessionId: body.sessionId, appId: app.id },
      });
    }

    return c.json({ ok: true });
  }
);
