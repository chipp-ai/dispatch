/**
 * Chat Routes
 *
 * Endpoints for chat sessions and streaming chat with LLM/agent support.
 * Optimized for speed with parallel queries.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import {
  getTrustedAppId,
  type WorkerContext,
} from "../../middleware/workerTrust.ts";
type AppContext = {
  Variables: AuthContext["Variables"] & { workerContext: WorkerContext };
};
import {
  chatService,
  type UserMemory,
} from "../../../services/chat.service.ts";
import { db } from "../../../db/client.ts";
import { hasKnowledgeSources } from "../../../services/rag.service.ts";
import {
  createSessionSchema,
  listSessionsQuerySchema,
  streamChatSchema,
} from "../../validators/chat.ts";

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
import { registerAITools } from "../../../agent/tools/ai.ts";
import { registerFileTools } from "../../../agent/tools/file.ts";
import { registerCustomTools } from "../../../agent/tools/custom.ts";
import { customActionService } from "../../../services/custom-action.service.ts";
import { ExecutionContext } from "../../../services/tool-execution.service.ts";
import { getRelevantChunks } from "../../../services/rag.service.ts";
import type {
  Message,
  ContentPart,
  AudioContentPart,
  VideoContentPart,
  ToolUseContentPart,
} from "../../../llm/types.ts";
import { modelSupportsAudioInput } from "../../../llm/utils/audio-capabilities.ts";
import { modelSupportsVideoInput } from "../../../llm/utils/video-capabilities.ts";
import { transcribeAudio } from "../../../services/transcription.service.ts";

// Multimodal support
import {
  convertMessagesToMultimodal,
  hasEmbeddedImages,
} from "../../../utils/multimodal-message-converter.ts";

// History normalization (for model switching)
import {
  normalizeHistoryForModel,
  historyHasToolCalls,
} from "../../../llm/utils/normalize-history.ts";

// ========================================
// Performance Timing (Dev Only)
// ========================================

// Enable perf logging if ENVIRONMENT=development OR if not in production
const isDev =
  Deno.env.get("ENVIRONMENT") === "development" ||
  Deno.env.get("ENVIRONMENT") !== "production";

class PerfTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();
  private readonly requestId: string;

  constructor(requestId: string) {
    this.startTime = performance.now();
    this.requestId = requestId;
  }

  mark(label: string) {
    if (!isDev) return;
    this.marks.set(label, performance.now());
  }

  elapsed(label: string): number {
    const markTime = this.marks.get(label);
    if (!markTime) return 0;
    return markTime - this.startTime;
  }

  sinceLast(label: string, previousLabel: string): number {
    const current = this.marks.get(label);
    const previous = this.marks.get(previousLabel);
    if (!current || !previous) return 0;
    return current - previous;
  }

  log(message: string) {
    if (!isDev) return;
    const elapsed = (performance.now() - this.startTime).toFixed(1);
    console.log(
      `[perf:${this.requestId.slice(0, 8)}] ${elapsed}ms - ${message}`
    );
  }

  summary() {
    if (!isDev) return;
    console.log(
      `\n[perf:${this.requestId.slice(0, 8)}] === TIMING SUMMARY ===`
    );
    let lastTime = this.startTime;
    const sortedMarks = [...this.marks.entries()].sort((a, b) => a[1] - b[1]);
    for (const [label, time] of sortedMarks) {
      const total = (time - this.startTime).toFixed(1);
      const delta = (time - lastTime).toFixed(1);
      console.log(`  ${label}: ${total}ms total (+${delta}ms)`);
      lastTime = time;
    }
    const totalTime = (performance.now() - this.startTime).toFixed(1);
    console.log(`  TOTAL: ${totalTime}ms`);
    console.log(
      `[perf:${this.requestId.slice(0, 8)}] ======================\n`
    );
  }
}

/**
 * Format user memories into context for system prompt
 */
function formatMemoriesContext(memories: UserMemory[]): string {
  if (memories.length === 0) return "";

  // Group memories by type
  const byType: Record<string, string[]> = {};
  for (const m of memories) {
    const type = m.memoryType || "general";
    if (!byType[type]) byType[type] = [];
    byType[type].push(m.content);
  }

  const formatted = Object.entries(byType)
    .map(([type, contents]) => {
      const label = type.replace(/_/g, " ").toLowerCase();
      return `${label}:\n${contents.map((c) => `- ${c}`).join("\n")}`;
    })
    .join("\n\n");

  return `\n\n### User context from previous conversations:\n${formatted}\n\nUse this context to personalize your responses when relevant, but don't explicitly mention that you remember these details unless directly asked.`;
}

export const chatRoutes = new Hono<AppContext>();

// ========================================
// Session Management
// ========================================

/**
 * GET /:appId/sessions
 * List chat sessions for an application with filtering and pagination
 *
 * Supported filters:
 * - source: APP, API, WHATSAPP, SLACK, EMAIL
 * - search: Search in title, message content, user info
 * - status: all, unread
 * - tag: Filter by tag ID
 * - phoneNumber: Filter WhatsApp sessions by phone number
 * - page: Page number (1-based)
 * - limit: Results per page (max 100)
 */
chatRoutes.get(
  "/:appId/sessions",
  zValidator("query", listSessionsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("appId");
    const query = c.req.valid("query");

    // Verify user has access to the app
    await chatService.verifyAppAccess(appId, user.id);

    const result = await chatService.listSessions({
      applicationId: appId,
      userId: user.id,
      source: query.source,
      search: query.search,
      status: query.status,
      tag: query.tag,
      phoneNumber: query.phoneNumber,
      page: query.page,
      limit: query.limit,
      cursor: query.cursor,
    });

    // Sessions are already in camelCase from Kysely CamelCasePlugin
    // Just map startedAt -> createdAt for frontend compatibility
    const transformedSessions = result.sessions.map((session) => ({
      id: session.id,
      applicationId: session.applicationId,
      consumerId: session.consumerId,
      source: session.source,
      title: session.title,
      mode: session.mode,
      takenOverBy: session.takenOverBy,
      isBookmarked: session.isBookmarked,
      externalId: session.externalId,
      metadata: session.metadata,
      createdAt: session.startedAt, // Map startedAt to createdAt for frontend
      endedAt: session.endedAt,
      user: session.user,
      tags: session.tags,
      messages: session.messages.map((msg) => ({
        id: msg.id,
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        senderType: msg.role === "user" ? "USER" : "BOT",
        createdAt: msg.createdAt,
        tags: msg.tags,
      })),
    }));

    return c.json({
      data: transformedSessions,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /:appId/viewed
 * Get list of viewed session IDs for the current user
 */
chatRoutes.get("/:appId/viewed", async (c) => {
  const user = c.get("user");
  const appId = c.req.param("appId");

  // Verify user has access to the app
  await chatService.verifyAppAccess(appId, user.id);

  const viewedIds = await chatService.getViewedSessionIds(appId, user.id);

  return c.json({ data: viewedIds });
});

/**
 * POST /:appId/viewed
 * Mark a session as viewed
 */
chatRoutes.post("/:appId/viewed", async (c) => {
  const user = c.get("user");
  const appId = c.req.param("appId");
  const body = await c.req.json();

  if (!body.sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  // Verify user has access to the app
  await chatService.verifyAppAccess(appId, user.id);

  await chatService.markSessionViewed(body.sessionId, user.id);

  return c.json({ success: true });
});

/**
 * GET /sessions/:sessionId
 * Get a single chat session with messages
 */
chatRoutes.get("/sessions/:sessionId", async (c) => {
  const user = c.get("user");
  const { sessionId } = c.req.param();

  const session = await chatService.getSession(sessionId);

  // Verify user has access to the app this session belongs to
  await chatService.verifyAppAccess(session.applicationId, user.id);

  // Session is already in camelCase from Kysely CamelCasePlugin
  // Just map startedAt -> createdAt for frontend compatibility
  const transformedSession = {
    id: session.id,
    applicationId: session.applicationId,
    consumerId: session.consumerId,
    source: session.source,
    title: session.title,
    mode: session.mode,
    takenOverBy: session.takenOverBy,
    isBookmarked: session.isBookmarked,
    externalId: session.externalId,
    metadata: session.metadata,
    createdAt: session.startedAt,
    endedAt: session.endedAt,
    messages: session.messages.map((msg) => ({
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role,
      content: msg.content,
      senderType: msg.role === "user" ? "USER" : "BOT",
      createdAt: msg.createdAt,
      toolCalls: msg.toolCalls,
      toolResults: msg.toolResults,
      model: msg.model,
      tokenCount: msg.tokenCount,
      latencyMs: msg.latencyMs,
      tags: msg.tags,
      audioUrl: msg.audioUrl,
      audioDurationMs: msg.audioDurationMs,
      videoUrl: msg.videoUrl,
      videoMimeType: msg.videoMimeType,
    })),
  };

  return c.json({ data: transformedSession });
});

/**
 * POST /:appId/sessions
 * Create a new chat session
 */
chatRoutes.post(
  "/:appId/sessions",
  zValidator("json", createSessionSchema),
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("appId");
    const body = c.req.valid("json");

    // Verify user has access to the app
    await chatService.verifyAppAccess(appId, user.id);

    const session = await chatService.createSession({
      applicationId: appId,
      title: body.title,
      source: body.source,
    });

    return c.json({ data: session }, 201);
  }
);

/**
 * DELETE /sessions/:sessionId
 * Delete a chat session
 */
chatRoutes.delete("/sessions/:sessionId", async (c) => {
  const user = c.get("user");
  const { sessionId } = c.req.param();

  // First get the session to verify app access
  const session = await chatService.getSession(sessionId);
  await chatService.verifyAppAccess(session.applicationId, user.id);

  await chatService.deleteSession(sessionId);

  return c.json({ success: true });
});

// ========================================
// Streaming Chat
// ========================================

/**
 * POST /:appId/stream
 * SSE streaming chat endpoint
 *
 * Streams chat completions using the agent framework with tool support.
 * Optimized for speed with parallel queries for:
 * - App access verification + config
 * - Session validation/creation + history + memories + RAG
 * - Credit checking
 */
chatRoutes.post(
  "/:appId/stream",
  zValidator("json", streamChatSchema),
  async (c) => {
    const user = c.get("user");
    const workerContext = c.get("workerContext");
    const body = c.req.valid("json");
    const requestId = c.get("requestId") ?? crypto.randomUUID();

    // Get app ID from trusted Worker context or URL param
    // Worker context takes precedence - it's derived from domain lookup
    const appId = getTrustedAppId(workerContext, c.req.param("appId"));

    if (!appId) {
      return c.json({ error: "App ID is required" }, 400);
    }

    // Performance timing (only logs in dev)
    const perf = new PerfTimer(requestId);
    perf.mark("start");
    perf.log("Request received");

    try {
      // ============================================================
      // Phase 1: App verification + config
      // - If request came via Worker, domain ownership proves access (skip verifyAppAccess)
      // - If direct request, verify user has access to this app
      // ============================================================
      let appAccess;
      let appConfig;

      if (workerContext?.isFromWorker && workerContext.appId) {
        // Trusted request from Worker - domain ownership proves access
        // Just get the config, skip access verification
        appConfig = await chatService.getAppConfig(appId);
        appAccess = { organizationId: appConfig.organizationId };
        perf.log(
          "Phase 1 complete: App config (worker-trusted, skipped access check)"
        );
      } else {
        // Direct API request - verify user has access to this app
        [appAccess, appConfig] = await Promise.all([
          chatService.verifyAppAccess(appId, user.id),
          chatService.getAppConfig(appId),
        ]);
        perf.log("Phase 1 complete: App access verified + config");
      }
      perf.mark("phase1_app_config");

      const organizationId = appAccess.organizationId;

      // ============================================================
      // Phase 2: Session handling + parallel context gathering
      // ============================================================
      let sessionId = body.sessionId;
      let session = null;
      let isNewSession = false;

      if (sessionId) {
        // Existing session - validate it belongs to this app
        session = await chatService.validateSession(sessionId, appId);
      } else {
        // New session - create it
        session = await chatService.createSession({ applicationId: appId });
        sessionId = session.id;
        isNewSession = true;
      }
      perf.mark("phase2_session");
      perf.log(
        `Phase 2 complete: Session ${isNewSession ? "created" : "validated"}`
      );

      // Parallel queries for context (only run what we need)
      // Wrap each in timing to identify bottlenecks
      const hasKnowledgePromise = (async () => {
        const start = performance.now();
        const result = await hasKnowledgeSources(appId);
        perf.log(
          `  [parallel] Knowledge check: ${(performance.now() - start).toFixed(0)}ms (has=${result})`
        );
        return result;
      })();

      const historyPromise = (async () => {
        const start = performance.now();
        const result = !isNewSession
          ? await chatService.getSessionMessages(sessionId)
          : [];
        perf.log(
          `  [parallel] History query: ${(performance.now() - start).toFixed(0)}ms (${result.length} msgs)`
        );
        return result;
      })();

      const memoriesPromise = (async () => {
        const start = performance.now();
        const result = await chatService.getUserMemories(appId, {
          consumerId: session.consumerId,
          externalUserId: user.id,
        });
        perf.log(
          `  [parallel] Memories query: ${(performance.now() - start).toFixed(0)}ms (${result.length} memories)`
        );
        return result;
      })();

      const creditsPromise = (async () => {
        const start = performance.now();
        const result = await chatService.checkCredits(organizationId);
        perf.log(
          `  [parallel] Credits check: ${(performance.now() - start).toFixed(0)}ms`
        );
        return result;
      })();

      const billingContextPromise = (async () => {
        const start = performance.now();
        const result = await chatService.getBillingContext(organizationId);
        perf.log(
          `  [parallel] Billing context: ${(performance.now() - start).toFixed(0)}ms`
        );
        return result;
      })();

      // Run all context queries in parallel
      const [hasKnowledge, history, memories, credits, billingContext] =
        await Promise.all([
          hasKnowledgePromise,
          historyPromise,
          memoriesPromise,
          creditsPromise,
          billingContextPromise,
        ]);
      perf.mark("phase2_context");
      perf.log(
        `Phase 2 complete: Context gathered (Knowledge: ${hasKnowledge}, History: ${history.length} msgs, Memories: ${memories.length})`
      );

      // ============================================================
      // Phase 3: Credit check (fail fast if no credits)
      // ============================================================
      if (credits && !credits.hasCredits) {
        return c.json(
          {
            error: "INSUFFICIENT_CREDITS",
            message:
              "Your organization has run out of credits. Please add more credits to continue.",
          },
          402
        );
      }

      // ============================================================
      // Phase 4: Build messages with all context
      // ============================================================

      const modelId = body.model ?? appConfig.model ?? DEFAULT_MODEL_ID;

      // Handle audio input: transcribe or build audio content part
      let messageText = body.message;
      let audioContentPart: AudioContentPart | null = null;

      if (body.audio) {
        // Native audio input (input_audio content part) only accepts wav and mp3.
        // Browsers record webm/ogg, so we must fall back to Whisper for those formats.
        const audioFormat = body.audio.mimeType.split(";")[0].split("/")[1];
        const nativeAudioFormats = new Set(["wav", "mp3"]);
        const canUseNativeAudio =
          modelSupportsAudioInput(modelId) &&
          nativeAudioFormats.has(audioFormat);

        if (canUseNativeAudio) {
          audioContentPart = {
            type: "input_audio",
            input_audio: {
              data: body.audio.data,
              format: audioFormat as "wav" | "mp3",
            },
          };
          if (!messageText.trim()) {
            messageText = "[Voice message]";
          }
          console.log(
            "[chat] Audio: native input_audio for",
            modelId,
            "format:",
            audioFormat
          );
        } else {
          console.log(
            "[chat] Audio: transcribing via Whisper for",
            modelId,
            "format:",
            audioFormat
          );
          const { text } = await transcribeAudio(
            body.audio.data,
            body.audio.mimeType
          );
          messageText =
            text.trim() ||
            messageText.trim() ||
            "[Voice message - no speech detected]";
          console.log("[chat] Whisper transcript:", messageText.slice(0, 100));
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
          console.log("[chat] Video: native input_video for", modelId);
        } else {
          if (!messageText.trim()) {
            messageText = "[User attached a video]";
          }
          console.log(
            "[chat] Video: model",
            modelId,
            "does not support video input"
          );
        }
      }

      // Start audio upload to GCS in the background (non-blocking)
      let audioUploadPromise: Promise<string | null> | null = null;
      if (body.audio) {
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
            console.log("[chat] Audio uploaded to GCS:", url);
            return url;
          } catch (err) {
            console.error("[chat] Failed to upload audio to GCS:", err);
            return null;
          }
        })();
      }

      // Save user message first
      const userMessage = await chatService.addMessage(
        sessionId,
        "user",
        messageText,
        {
          audioDurationMs: body.audio?.durationMs,
          videoUrl: body.video?.url,
          videoMimeType: body.video?.mimeType,
        }
      );
      perf.mark("phase4_save_user_msg");
      perf.log("Phase 4: User message saved");

      // Patch audio URL into DB when upload completes (fire-and-forget)
      if (audioUploadPromise) {
        audioUploadPromise.then(async (audioGcsUrl) => {
          if (!audioGcsUrl) return;
          try {
            await db
              .updateTable("chat.messages")
              .set({ audioUrl: audioGcsUrl })
              .where("id", "=", userMessage.id)
              .execute();
          } catch (err) {
            console.error("[chat] Failed to patch audio URL:", err);
          }
        });
      }

      // Detect if model has changed (for tool call compatibility)
      const previousModel =
        history
          .filter((msg) => msg.role === "assistant" && msg.model)
          .map((msg) => msg.model)
          .pop() || null;

      // Build enhanced system prompt with memories and RAG context
      let systemPrompt = appConfig.systemPrompt || "";

      // Add user memories context
      const memoriesContext = formatMemoriesContext(memories);
      if (memoriesContext) {
        systemPrompt += memoriesContext;
      }

      // Add knowledge base hint (model will use searchKnowledge tool to retrieve)
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

      // Build messages array from history
      const historyMessages: Message[] = [];
      for (const msg of history) {
        if (msg.role === "user") {
          historyMessages.push({ role: "user", content: msg.content });
        } else {
          // Assistant message - check for tool calls
          // IMPORTANT: toolCalls/toolResults are stored as JSON strings in DB, must parse
          const rawToolCalls = msg.toolCalls;
          const rawToolResults = msg.toolResults;

          const toolCalls: Array<{
            id: string;
            name: string;
            input: unknown;
          }> | null = rawToolCalls
            ? typeof rawToolCalls === "string"
              ? JSON.parse(rawToolCalls)
              : rawToolCalls
            : null;
          const toolResults: Array<{
            callId: string;
            name: string;
            result: unknown;
            success: boolean;
          }> | null = rawToolResults
            ? typeof rawToolResults === "string"
              ? JSON.parse(rawToolResults)
              : rawToolResults
            : null;

          if (toolCalls && toolCalls.length > 0) {
            // Build content array with text and tool_use blocks
            const contentParts: ContentPart[] = [];
            if (msg.content) {
              contentParts.push({ type: "text", text: msg.content });
            }
            for (const call of toolCalls) {
              contentParts.push({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: call.input as Record<string, unknown>,
              });
            }
            historyMessages.push({ role: "assistant", content: contentParts });

            // Add tool result messages (with safeguard against corrupted data)
            if (toolResults && toolResults.length > 0) {
              // Safeguard: HARD LIMIT of 50 tool results per message to prevent corrupted data from crashing the API
              // Normal conversations rarely have more than 10 tool calls per turn
              const HARD_LIMIT = 50;
              const effectiveToolCalls = Math.min(toolCalls.length, HARD_LIMIT);
              const maxToolResults = Math.min(
                toolResults.length,
                effectiveToolCalls,
                HARD_LIMIT
              );

              if (
                toolResults.length > maxToolResults ||
                toolCalls.length > HARD_LIMIT
              ) {
                console.error(
                  `[chat] CORRUPTED DATA: ${toolResults.length} toolResults, ${toolCalls.length} toolCalls in msg ${msg.id?.slice(0, 8)}. Limiting to ${maxToolResults}. This indicates a data storage bug!`
                );
              }

              for (let i = 0; i < maxToolResults; i++) {
                const result = toolResults[i];
                // Skip results without callId - they can't be correlated
                if (!result.callId) {
                  console.warn(
                    `[chat] Skipping tool result without callId: ${result.name}`
                  );
                  continue;
                }
                historyMessages.push({
                  role: "tool",
                  content: JSON.stringify(result.result),
                  toolCallId: result.callId,
                  name: result.name,
                });
              }
            }
          } else {
            // No tool calls, just text content (ensure content is never null)
            historyMessages.push({
              role: "assistant",
              content: msg.content || "",
            });
          }
        }
      }

      console.log(
        `[chat] Built historyMessages: ${historyMessages.length} from ${history.length} history records`
      );
      const toolMessagesCount = historyMessages.filter(
        (m) => m.role === "tool"
      ).length;
      console.log(
        `[chat] Tool messages in historyMessages: ${toolMessagesCount}`
      );

      // Debug: Log tool message IDs to trace where they get lost
      for (const msg of historyMessages) {
        if (msg.role === "tool") {
          console.log(
            `[chat] Tool msg: toolCallId=${msg.toolCallId || "MISSING"}, name=${msg.name || "MISSING"}`
          );
        }
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          const toolUses = msg.content.filter(
            (p): p is ToolUseContentPart => p.type === "tool_use"
          );
          for (const tu of toolUses) {
            console.log(
              `[chat] Tool call: id=${tu.id || "MISSING"}, name=${tu.name}`
            );
          }
        }
      }

      // Normalize history if model provider changed (tool calls may be incompatible)
      const normalizedHistory = normalizeHistoryForModel(
        historyMessages,
        modelId,
        previousModel
      );

      console.log(
        `[chat] After normalization: ${normalizedHistory.length} messages`
      );

      // Debug: Log tool message IDs after normalization
      for (const msg of normalizedHistory) {
        if (msg.role === "tool") {
          console.log(
            `[chat] After norm - Tool msg: toolCallId=${msg.toolCallId || "MISSING"}, name=${msg.name || "MISSING"}`
          );
        }
      }

      // Build final messages array
      const messages: Message[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push(...normalizedHistory);

      // Build user message - multimodal if audio/video content part present
      if (audioContentPart || videoContentPart) {
        const parts: ContentPart[] = [];
        // Always include a text part for multimodal messages - models like
        // Gemini require non-empty input even when sending media
        parts.push({ type: "text", text: body.message.trim() || messageText });
        if (audioContentPart) parts.push(audioContentPart);
        if (videoContentPart) parts.push(videoContentPart);
        messages.push({ role: "user", content: parts });
      } else {
        messages.push({ role: "user", content: messageText });
      }

      // Convert messages to multimodal format if they contain embedded images
      // This enables vision-capable models to actually "see" uploaded images
      let finalMessages: Message[] = messages;
      if (hasEmbeddedImages(messages)) {
        perf.log("Detected embedded images, converting to multimodal format");
        finalMessages = convertMessagesToMultimodal(
          messages,
          modelId
        ) as Message[];
      }

      perf.mark("phase4_build_messages");
      perf.log(
        `Phase 4 complete: Messages built (${finalMessages.length} total, system prompt: ${systemPrompt.length} chars)`
      );

      // ============================================================
      // Phase 5: Stream response
      // ============================================================

      // Create LLM adapter with billing context for Stripe Token Billing
      const adapter = createAdapterWithBilling(modelId, billingContext);
      perf.mark("phase5_adapter");
      perf.log(
        `Phase 5: Adapter created for ${modelId} (customerId: ${billingContext.stripeCustomerId ? "org" : "internal"})`
      );

      // Create tool registry with core tools
      const registry = createRegistry();
      registerCoreTools(registry, { appId });
      registerWebTools(registry);
      registerAITools(registry, {
        skipVideoTool: modelSupportsVideoInput(modelId),
      });
      registerFileTools(registry);

      // Register RAG tools only if app has knowledge sources
      if (hasKnowledge) {
        registerRAGTools(registry, {
          appId,
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

      // Register custom tools (user-defined actions)
      const customTools = await customActionService.list(appId, user.id);
      if (customTools.length > 0) {
        const executionContext: ExecutionContext = {
          sessionId,
          userId: user.id,
          applicationId: appId,
          messageHistory: finalMessages,
        };
        registerCustomTools(registry, customTools, executionContext);
      }

      perf.mark("phase5_registry");
      const toolNames = registry.getForLLM().map((t) => t.name);
      console.log(
        `[chat] Tools registered (${toolNames.length}):`,
        toolNames.join(", ")
      );
      perf.log("Phase 5: Tool registry created");

      // Create agent stream generator (using finalMessages which may be multimodal)
      // Validate temperature is a valid number (nullish coalescing doesn't catch empty strings)
      const rawTemperature = body.temperature ?? appConfig.temperature ?? 0.7;
      const temperature =
        typeof rawTemperature === "number" && !isNaN(rawTemperature)
          ? rawTemperature
          : typeof rawTemperature === "string" &&
              rawTemperature !== "" &&
              !isNaN(Number(rawTemperature))
            ? Number(rawTemperature)
            : 0.7;

      // Create abort controller for stopping the stream
      const abortController = new AbortController();

      // Wrap agent stream with onComplete callback for centralized persistence
      // This fires ONCE when the stream fully completes, avoiding duplicate saves
      const agentStream = withOnComplete(
        agentLoop(finalMessages, registry, adapter, {
          model: modelId,
          temperature,
          systemPrompt: undefined, // Already included in messages
          abortSignal: abortController.signal,
        }),
        {
          abortSignal: abortController.signal,
          onComplete: async (result) => {
            // Skip persistence if nothing to save
            if (!result.text && result.toolCalls.length === 0) {
              console.log("[chat] onComplete: Nothing to persist, skipping");
              return;
            }

            // Skip if aborted
            if (result.aborted) {
              console.log(
                "[chat] onComplete: Stream aborted, skipping persistence"
              );
              return;
            }

            console.log(
              `[chat] onComplete: Persisting message - ${result.text.length} chars, ${result.toolCalls.length} toolCalls, ${result.toolResults.length} toolResults`
            );

            // Safeguard against corrupted data - HARD LIMIT to prevent storage bloat
            const STORAGE_LIMIT = 50;
            let toolCallsToStore = result.toolCalls;
            let toolResultsToStore = result.toolResults;

            if (
              result.toolCalls.length > STORAGE_LIMIT ||
              result.toolResults.length > STORAGE_LIMIT
            ) {
              console.error(
                `[chat] STORAGE CORRUPTION PREVENTION: Limiting ${result.toolCalls.length} toolCalls and ${result.toolResults.length} toolResults to ${STORAGE_LIMIT} each`
              );
              toolCallsToStore = result.toolCalls.slice(0, STORAGE_LIMIT);
              toolResultsToStore = result.toolResults.slice(0, STORAGE_LIMIT);
            }

            // Save the bot response with tool data (using limited arrays)
            await chatService.addMessage(sessionId, "assistant", result.text, {
              model: modelId,
              toolCalls:
                toolCallsToStore.length > 0 ? toolCallsToStore : undefined,
              toolResults:
                toolResultsToStore.length > 0 ? toolResultsToStore : undefined,
            });

            perf.mark("response_saved");
            perf.log("Response saved to database");

            // Record token usage for billing (non-blocking)
            const { inputTokens, outputTokens } = result.usage;
            if (organizationId && (inputTokens > 0 || outputTokens > 0)) {
              chatService
                .recordTokenUsage({
                  applicationId: appId,
                  organizationId,
                  sessionId,
                  model: modelId,
                  inputTokens,
                  outputTokens,
                })
                .catch((err) => {
                  console.error("[chat] Failed to record token usage:", err);
                  Sentry.captureException(err, {
                    extra: { appId, sessionId, model: modelId },
                  });
                });
            }
          },
        }
      );
      perf.mark("phase5_agent_ready");
      perf.log("Phase 5: Agent loop ready, starting stream...");

      // Wrap in SSE response with AI SDK-compatible event format
      return streamSSE(c, async (stream) => {
        // Handle client disconnect - abort the agent loop
        stream.onAbort(() => {
          console.log("[chat] Client disconnected, aborting stream");
          abortController.abort();
        });

        const messageId = crypto.randomUUID().slice(0, 16);

        // Send start event with messageId and sessionId
        await stream.writeSSE({
          data: JSON.stringify({ type: "start", messageId, sessionId }),
        });

        let responseContent = ""; // For SSE text-delta display
        let firstTokenReceived = false;
        let chunkCount = 0;
        let stepNumber = 0;
        let inTextStep = false;
        let textContentId = "0";
        const toolAnnotations: unknown[] = [];
        // Track pending tool calls by ID for SSE formatting (name lookup for results)
        const pendingToolCalls = new Map<
          string,
          { id: string; name: string; input: unknown; step: number }
        >();

        try {
          // Stream agent output with AI SDK event format
          for await (const chunk of agentStream) {
            chunkCount++;

            // Handle different chunk types from agent loop
            switch (chunk.type) {
              case "text": {
                // Start a new text step if we're not in one
                if (!inTextStep) {
                  // End any previous tool step first
                  if (stepNumber > 0) {
                    await stream.writeSSE({
                      data: JSON.stringify({ type: "finish-step" }),
                    });
                  }
                  stepNumber++;
                  inTextStep = true;
                  await stream.writeSSE({
                    data: JSON.stringify({ type: "start-step" }),
                  });
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "text-start",
                      id: textContentId,
                    }),
                  });
                }

                // Track time to first token
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  perf.mark("first_token");
                  perf.log(
                    `FIRST TOKEN received after ${perf.elapsed("first_token").toFixed(0)}ms total`
                  );
                }

                responseContent += chunk.delta;
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "text-delta",
                    id: textContentId,
                    delta: chunk.delta,
                  }),
                });
                break;
              }

              case "tool_call": {
                // End any previous text step
                if (inTextStep) {
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "text-end",
                      id: textContentId,
                    }),
                  });
                  await stream.writeSSE({
                    data: JSON.stringify({ type: "finish-step" }),
                  });
                  inTextStep = false;
                  textContentId = String(Number(textContentId) + 1);
                }

                // Start a new tool step
                stepNumber++;
                await stream.writeSSE({
                  data: JSON.stringify({ type: "start-step" }),
                });

                const call = chunk.call;
                // Track this tool call by ID for SSE name lookup when we get the result
                pendingToolCalls.set(call.id, {
                  id: call.id,
                  name: call.name,
                  input: call.arguments,
                  step: stepNumber,
                });

                // Send tool-input-start
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-input-start",
                    toolCallId: call.id,
                    toolName: call.name,
                  }),
                });

                // Send tool-input-available (we get full input at once, not streamed)
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "tool-input-available",
                    toolCallId: call.id,
                    toolName: call.name,
                    input: call.arguments,
                  }),
                });
                break;
              }

              case "tool_result": {
                const toolCall = pendingToolCalls.get(chunk.callId);
                if (toolCall) {
                  // Send tool-output-available
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "tool-output-available",
                      toolCallId: chunk.callId,
                      toolName: toolCall.name,
                      output: chunk.result,
                    }),
                  });

                  // Build tool annotation for message-metadata
                  toolAnnotations.push({
                    toolDebugInfo: {
                      toolName: toolCall.name,
                      error: false,
                      message: `Tool ${toolCall.name} executed successfully`,
                      debugInfo: {
                        toolInputs: toolCall.input,
                        response: {
                          status: "success",
                          statusText: "Tool Execution Successful",
                          result: chunk.result,
                        },
                      },
                      success: true,
                      step: toolCall.step,
                    },
                  });

                  // Send message-metadata with tool annotation
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "message-metadata",
                      messageMetadata: {
                        annotations: toolAnnotations,
                      },
                    }),
                  });

                  pendingToolCalls.delete(chunk.callId);
                }

                // Finish the tool step
                await stream.writeSSE({
                  data: JSON.stringify({ type: "finish-step" }),
                });
                break;
              }

              case "tool_error": {
                const toolCall = pendingToolCalls.get(chunk.callId);
                if (toolCall) {
                  // Send tool-output-available with error
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "tool-output-available",
                      toolCallId: chunk.callId,
                      toolName: toolCall.name,
                      output: { error: chunk.error },
                    }),
                  });

                  // Build error annotation
                  toolAnnotations.push({
                    toolDebugInfo: {
                      toolName: toolCall.name,
                      error: true,
                      message: `Tool ${toolCall.name} failed: ${chunk.error}`,
                      debugInfo: {
                        toolInputs: toolCall.input,
                        response: {
                          status: "error",
                          statusText: chunk.error,
                        },
                      },
                      success: false,
                      step: toolCall.step,
                    },
                  });

                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "message-metadata",
                      messageMetadata: {
                        annotations: toolAnnotations,
                      },
                    }),
                  });

                  pendingToolCalls.delete(chunk.callId);
                }

                await stream.writeSSE({
                  data: JSON.stringify({ type: "finish-step" }),
                });
                break;
              }

              case "done": {
                // End any open text step
                if (inTextStep) {
                  await stream.writeSSE({
                    data: JSON.stringify({
                      type: "text-end",
                      id: textContentId,
                    }),
                  });
                  await stream.writeSSE({
                    data: JSON.stringify({ type: "finish-step" }),
                  });
                  inTextStep = false;
                }

                // Token usage is tracked by withOnComplete wrapper

                // Send finish event
                await stream.writeSSE({
                  data: JSON.stringify({
                    type: "finish",
                    finishReason: chunk.finishReason || "stop",
                  }),
                });
                break;
              }
            }
          }

          perf.mark("stream_complete");
          perf.log(
            `Stream complete: ${chunkCount} chunks, ${responseContent.length} chars`
          );

          // Persistence is handled by withOnComplete callback after stream exhaustion

          // Send final message-metadata with model info and persisted message ID
          await stream.writeSSE({
            data: JSON.stringify({
              type: "message-metadata",
              messageMetadata: {
                annotations: [
                  ...toolAnnotations,
                  { modelUsed: modelId },
                  { persistedMessageId: messageId },
                ],
              },
            }),
          });

          // Send [DONE] marker (AI SDK convention)
          await stream.writeSSE({
            data: "[DONE]",
          });

          // Print timing summary
          perf.mark("complete");
          perf.summary();
        } catch (error) {
          console.error("[chat] Stream error:", error);

          // Report to Sentry
          Sentry.captureException(error, {
            extra: {
              requestId,
              appId,
              sessionId,
              model: modelId,
              userId: user.id,
            },
          });

          await stream.writeSSE({
            data: JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Stream error",
            }),
          });

          perf.mark("error");
          perf.summary();
        }
      });
    } catch (error) {
      // Catch any errors during setup (before streaming)
      console.error("[chat] Setup error:", error);

      Sentry.captureException(error, {
        extra: {
          requestId,
          appId,
          userId: user.id,
          sessionId: body.sessionId,
        },
      });

      throw error; // Re-throw to let error middleware handle it
    }
  }
);

/**
 * POST /:appId/chat
 * Non-streaming chat endpoint for simple use cases
 * Returns the complete response without streaming
 */
chatRoutes.post(
  "/:appId/chat",
  zValidator("json", streamChatSchema),
  async (c) => {
    const user = c.get("user");
    const appId = c.req.param("appId");
    const body = c.req.valid("json");
    const requestId = c.get("requestId") ?? crypto.randomUUID();

    try {
      // Phase 1: Parallel app verification + config
      const [appAccess, appConfig] = await Promise.all([
        chatService.verifyAppAccess(appId, user.id),
        chatService.getAppConfig(appId),
      ]);

      const organizationId = appAccess.organizationId;

      // Phase 2: Session handling
      let sessionId = body.sessionId;
      let session = null;
      let isNewSession = false;

      if (sessionId) {
        session = await chatService.validateSession(sessionId, appId);
      } else {
        session = await chatService.createSession({ applicationId: appId });
        sessionId = session.id;
        isNewSession = true;
      }

      // Phase 3: Parallel context gathering + credit check + billing context
      const [hasKnowledge, history, memories, credits, billingContext] =
        await Promise.all([
          hasKnowledgeSources(appId),
          !isNewSession
            ? chatService.getSessionMessages(sessionId)
            : Promise.resolve([]),
          chatService.getUserMemories(appId, {
            consumerId: session.consumerId,
            externalUserId: user.id,
          }),
          chatService.checkCredits(organizationId),
          chatService.getBillingContext(organizationId),
        ]);

      // Credit check
      if (credits && !credits.hasCredits) {
        return c.json(
          {
            error: "INSUFFICIENT_CREDITS",
            message: "Your organization has run out of credits.",
          },
          402
        );
      }

      const modelId = body.model ?? appConfig.model ?? DEFAULT_MODEL_ID;

      // Handle audio input
      let messageText2 = body.message;
      let audioContentPart2: AudioContentPart | null = null;

      if (body.audio) {
        const audioFormat = body.audio.mimeType.split(";")[0].split("/")[1];
        const nativeAudioFormats = new Set(["wav", "mp3"]);
        const canUseNativeAudio =
          modelSupportsAudioInput(modelId) &&
          nativeAudioFormats.has(audioFormat);

        if (canUseNativeAudio) {
          audioContentPart2 = {
            type: "input_audio",
            input_audio: {
              data: body.audio.data,
              format: audioFormat as "wav" | "mp3",
            },
          };
          if (!messageText2.trim()) {
            messageText2 = "[Voice message]";
          }
        } else {
          const { text } = await transcribeAudio(
            body.audio.data,
            body.audio.mimeType
          );
          messageText2 =
            text.trim() ||
            messageText2.trim() ||
            "[Voice message - no speech detected]";
        }
      }

      // Handle video input
      let videoContentPart2: VideoContentPart | null = null;

      if (body.video) {
        if (modelSupportsVideoInput(modelId)) {
          videoContentPart2 = {
            type: "input_video",
            input_video: {
              url: body.video.url,
              mimeType: body.video.mimeType,
            },
          };
          if (!messageText2.trim()) {
            messageText2 = "Please watch and respond to this video.";
          }
        } else {
          if (!messageText2.trim()) {
            messageText2 = "[User attached a video]";
          }
        }
      }

      // Start audio upload to GCS in the background (non-blocking)
      let audioUploadPromise2: Promise<string | null> | null = null;
      if (body.audio) {
        audioUploadPromise2 = (async () => {
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
            console.log("[chat] Audio uploaded to GCS:", url);
            return url;
          } catch (err) {
            console.error("[chat] Failed to upload audio to GCS:", err);
            return null;
          }
        })();
      }

      // Save user message
      const userMessage2 = await chatService.addMessage(
        sessionId,
        "user",
        messageText2,
        {
          audioDurationMs: body.audio?.durationMs,
          videoUrl: body.video?.url,
          videoMimeType: body.video?.mimeType,
        }
      );

      // Patch audio URL into DB when upload completes (fire-and-forget)
      if (audioUploadPromise2) {
        audioUploadPromise2.then(async (audioGcsUrl) => {
          if (!audioGcsUrl) return;
          try {
            await db
              .updateTable("chat.messages")
              .set({ audioUrl: audioGcsUrl })
              .where("id", "=", userMessage2.id)
              .execute();
          } catch (err) {
            console.error("[chat] Failed to patch audio URL:", err);
          }
        });
      }

      // Detect if model has changed (for tool call compatibility)
      const previousModel =
        history
          .filter((msg) => msg.role === "assistant" && msg.model)
          .map((msg) => msg.model)
          .pop() || null;

      // Build enhanced system prompt
      let systemPrompt = appConfig.systemPrompt || "";
      const memoriesContext = formatMemoriesContext(memories);
      if (memoriesContext) {
        systemPrompt += memoriesContext;
      }
      // Add knowledge base hint (model will use searchKnowledge tool to retrieve)
      if (hasKnowledge) {
        systemPrompt +=
          "\n\nYou have access to a knowledge base through the searchKnowledge tool. " +
          "When the user asks questions that might be answered by uploaded documents or files, " +
          "use searchKnowledge to find relevant information before answering. " +
          "You can search multiple times with different queries.";
      }

      // Add current time to system prompt (avoids unnecessary tool calls)
      const now2 = new Date();
      systemPrompt += `\n\nCurrent date and time: ${now2.toLocaleString(
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

      // Build history messages
      const historyMessages: Message[] = [];
      for (const msg of history) {
        if (msg.role === "user") {
          historyMessages.push({ role: "user", content: msg.content });
        } else {
          // Assistant message - check for tool calls
          // IMPORTANT: toolCalls/toolResults are stored as JSON strings in DB, must parse
          const rawToolCalls = msg.toolCalls;
          const rawToolResults = msg.toolResults;

          const toolCalls: Array<{
            id: string;
            name: string;
            input: unknown;
          }> | null = rawToolCalls
            ? typeof rawToolCalls === "string"
              ? JSON.parse(rawToolCalls)
              : rawToolCalls
            : null;
          const toolResults: Array<{
            callId: string;
            name: string;
            result: unknown;
            success: boolean;
          }> | null = rawToolResults
            ? typeof rawToolResults === "string"
              ? JSON.parse(rawToolResults)
              : rawToolResults
            : null;

          if (toolCalls && toolCalls.length > 0) {
            // Build content array with text and tool_use blocks
            const contentParts: ContentPart[] = [];
            if (msg.content) {
              contentParts.push({ type: "text", text: msg.content });
            }
            for (const call of toolCalls) {
              contentParts.push({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: call.input as Record<string, unknown>,
              });
            }
            historyMessages.push({ role: "assistant", content: contentParts });

            // Add tool result messages (with safeguard against corrupted data)
            if (toolResults && toolResults.length > 0) {
              // Safeguard: HARD LIMIT of 50 tool results per message to prevent corrupted data from crashing the API
              // Normal conversations rarely have more than 10 tool calls per turn
              const HARD_LIMIT = 50;
              const effectiveToolCalls = Math.min(toolCalls.length, HARD_LIMIT);
              const maxToolResults = Math.min(
                toolResults.length,
                effectiveToolCalls,
                HARD_LIMIT
              );

              if (
                toolResults.length > maxToolResults ||
                toolCalls.length > HARD_LIMIT
              ) {
                console.error(
                  `[chat] CORRUPTED DATA: ${toolResults.length} toolResults, ${toolCalls.length} toolCalls in msg ${msg.id?.slice(0, 8)}. Limiting to ${maxToolResults}. This indicates a data storage bug!`
                );
              }

              for (let i = 0; i < maxToolResults; i++) {
                const result = toolResults[i];
                // Skip results without callId - they can't be correlated
                if (!result.callId) {
                  console.warn(
                    `[chat] Skipping tool result without callId: ${result.name}`
                  );
                  continue;
                }
                historyMessages.push({
                  role: "tool",
                  content: JSON.stringify(result.result),
                  toolCallId: result.callId,
                  name: result.name,
                });
              }
            }
          } else {
            // No tool calls, just text content (ensure content is never null)
            historyMessages.push({
              role: "assistant",
              content: msg.content || "",
            });
          }
        }
      }

      // Normalize history if model provider changed (tool calls may be incompatible)
      const normalizedHistory = normalizeHistoryForModel(
        historyMessages,
        modelId,
        previousModel
      );

      // Build final messages
      const messages: Message[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push(...normalizedHistory);

      // Build user message - multimodal if audio/video content part present
      if (audioContentPart2 || videoContentPart2) {
        const parts: ContentPart[] = [];
        parts.push({ type: "text", text: body.message.trim() || messageText2 });
        if (audioContentPart2) parts.push(audioContentPart2);
        if (videoContentPart2) parts.push(videoContentPart2);
        messages.push({ role: "user", content: parts });
      } else {
        messages.push({ role: "user", content: messageText2 });
      }

      // Convert messages to multimodal format if they contain embedded images
      let finalMessages: Message[] = messages;
      if (hasEmbeddedImages(messages)) {
        finalMessages = convertMessagesToMultimodal(
          messages,
          modelId
        ) as Message[];
      }

      // Create adapter with billing context for Stripe Token Billing
      const adapter = createAdapterWithBilling(modelId, billingContext);
      const registry = createRegistry();
      registerCoreTools(registry, { appId });
      registerWebTools(registry);
      registerAITools(registry, {
        skipVideoTool: modelSupportsVideoInput(modelId),
      });
      registerFileTools(registry);

      // Register RAG tools only if app has knowledge sources
      if (hasKnowledge) {
        registerRAGTools(registry, {
          appId,
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

      // Register custom tools (user-defined actions)
      const customTools = await customActionService.list(appId, user.id);
      if (customTools.length > 0) {
        const executionContext: ExecutionContext = {
          sessionId,
          userId: user.id,
          applicationId: appId,
          messageHistory: finalMessages,
        };
        registerCustomTools(registry, customTools, executionContext);
      }

      // Accumulate the full response
      let responseContent = "";
      let inputTokens = 0;
      let outputTokens = 0;
      const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
      const toolResults: Array<{
        callId: string;
        name: string;
        result: unknown;
        success: boolean;
      }> = [];

      const agentStream = agentLoop(finalMessages, registry, adapter, {
        model: modelId,
        temperature: body.temperature ?? appConfig.temperature ?? 0.7,
      });

      for await (const chunk of agentStream) {
        if (chunk.type === "text") {
          responseContent += chunk.delta;
        }
        if (chunk.type === "tool_call") {
          toolCalls.push({
            id: chunk.call.id,
            name: chunk.call.name,
            input: chunk.call.arguments,
          });
        }
        if (chunk.type === "tool_result") {
          toolResults.push({
            callId: chunk.callId,
            name: toolCalls.find((t) => t.id === chunk.callId)?.name ?? "",
            result: chunk.result,
            success: true,
          });
        }
        if (chunk.type === "tool_error") {
          toolResults.push({
            callId: chunk.callId,
            name: toolCalls.find((t) => t.id === chunk.callId)?.name ?? "",
            result: { error: chunk.error },
            success: false,
          });
        }
        if (chunk.type === "done" && "usage" in chunk && chunk.usage) {
          inputTokens = chunk.usage.inputTokens ?? 0;
          outputTokens = chunk.usage.outputTokens ?? 0;
        }
      }

      // Save the bot response with tool data
      await chatService.addMessage(sessionId, "assistant", responseContent, {
        model: modelId,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      });

      // Record token usage (non-blocking)
      if (organizationId && (inputTokens > 0 || outputTokens > 0)) {
        chatService
          .recordTokenUsage({
            applicationId: appId,
            organizationId,
            sessionId,
            model: modelId,
            inputTokens,
            outputTokens,
          })
          .catch((err) => {
            console.error("[chat] Failed to record token usage:", err);
            Sentry.captureException(err);
          });
      }

      return c.json({
        sessionId,
        message: responseContent,
        model: modelId,
      });
    } catch (error) {
      console.error("[chat] Error:", error);
      Sentry.captureException(error, {
        extra: { requestId, appId, userId: user.id },
      });
      throw error;
    }
  }
);
