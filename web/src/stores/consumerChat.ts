/**
 * Consumer Chat Session Store
 *
 * Manages chat session state for consumer chat, including:
 * - Message list management
 * - Session creation/resumption
 * - SSE streaming handler
 * - File/image staging
 * - Error handling with retry
 * - Credits tracking
 * - Frozen conversation tracking
 */

import { writable, derived, get } from "svelte/store";
import type {
  ChatMessage,
  MessagePart,
  ToolInvocation,
  SSEEvent,
  StagedFile,
} from "$lib/design-system/components/chat/types";
import { modelOverride } from "./modelOverride";
import { getAnonymousToken } from "./consumerWebSocket";
import { captureException } from "$lib/sentry";

// Re-export StagedFile so existing imports from this module continue to work
export type { StagedFile } from "$lib/design-system/components/chat/types";

// App suggestion
export interface Suggestion {
  id?: number;
  content: string;
  iconUrl?: string | null;
  title?: string;
  description?: string;
}

// CTA (Call to Action) configuration
export interface CTAConfig {
  id?: number;
  isActive: boolean;
  text?: string;
  link?: string;
  imgUrl?: string;
}

interface ConsumerChatState {
  // Chat session
  sessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  responseGenerating: boolean;
  error: string | null;
  lastError: string | null;

  // Credits
  userCredits: number | string;
  subscriptionActive: boolean;

  // File staging
  stagedFiles: StagedFile[];
  stagedImages: string[];

  // Frozen conversation state
  conversationFrozen: boolean;
  freezeTagId: string | null;

  // App context
  currentAppId: string | null;
  currentAppNameId: string | null;

  // App configuration (from API)
  suggestions: Suggestion[];
  cta: CTAConfig | null;
  disclaimerText: string | null;
  inputPlaceholder: string | null;
  customInstructions: string | null;

  // Human takeover state
  isHumanTakeover: boolean;
  takeoverOperatorName: string | null;
}

const initialState: ConsumerChatState = {
  sessionId: null,
  messages: [],
  isStreaming: false,
  responseGenerating: false,
  error: null,
  lastError: null,
  userCredits: 0,
  subscriptionActive: false,
  stagedFiles: [],
  stagedImages: [],
  conversationFrozen: false,
  freezeTagId: null,
  currentAppId: null,
  currentAppNameId: null,
  suggestions: [],
  cta: null,
  disclaimerText: null,
  inputPlaceholder: null,
  customInstructions: null,
  isHumanTakeover: false,
  takeoverOperatorName: null,
};

// Abort controller for canceling streams
let abortController: AbortController | null = null;

/**
 * Check if an error message indicates credit exhaustion.
 * Used to show the CreditExhaustedModal instead of inline errors.
 */
function isCreditExhaustionError(errorMsg: string): boolean {
  const errorLower = errorMsg.toLowerCase();
  return (
    (errorLower.includes("credits") && errorLower.includes("exhausted")) ||
    errorLower.includes("credit balance") ||
    errorLower.includes("ai credits balance is exhausted") ||
    errorLower.includes("usage quota") ||
    errorLower.includes("no available balance")
  );
}

// ============ Anonymous Chat Persistence ============
// For anonymous users, we store chat history in localStorage so they can
// continue their conversation after page refresh and access past sessions.

interface StoredAnonymousSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface StoredAnonymousChatHistory {
  sessions: StoredAnonymousSession[];
  currentSessionId: string | null;
}

const ANON_CHAT_KEY_PREFIX = "anon-chat-history-";
const ANON_CHAT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ANON_SESSIONS = 20; // Limit to prevent localStorage bloat

function getAnonChatKey(appId: string): string {
  return `${ANON_CHAT_KEY_PREFIX}${appId}`;
}

/**
 * Load all anonymous chat sessions for an app
 */
function loadAnonChatHistory(appId: string): StoredAnonymousChatHistory {
  if (typeof window === "undefined") {
    return { sessions: [], currentSessionId: null };
  }

  try {
    const stored = localStorage.getItem(getAnonChatKey(appId));
    if (!stored) return { sessions: [], currentSessionId: null };

    const data = JSON.parse(stored);

    // Handle migration from old format (single session) to new format (multi-session)
    // Old format: { sessionId, messages, updatedAt }
    // New format: { sessions: [...], currentSessionId }
    if (!Array.isArray(data.sessions)) {
      // Check if this is old format
      if (data.sessionId && Array.isArray(data.messages)) {
        // Migrate old format to new format
        const migratedSession: StoredAnonymousSession = {
          id: data.sessionId,
          title: generateSessionTitle(data.messages),
          messages: data.messages,
          createdAt: data.updatedAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        };
        return {
          sessions: [migratedSession],
          currentSessionId: data.sessionId,
        };
      }
      // Invalid data format
      return { sessions: [], currentSessionId: null };
    }

    const now = Date.now();

    // Filter out expired sessions (older than 7 days)
    const validSessions = (data.sessions || []).filter(
      (s: StoredAnonymousSession) =>
        s && s.updatedAt && now - s.updatedAt < ANON_CHAT_MAX_AGE_MS
    );

    // If current session was removed, clear it
    const currentSessionId =
      data.currentSessionId &&
      validSessions.find(
        (s: StoredAnonymousSession) => s.id === data.currentSessionId
      )
        ? data.currentSessionId
        : null;

    return { sessions: validSessions, currentSessionId };
  } catch {
    return { sessions: [], currentSessionId: null };
  }
}

/**
 * Save anonymous chat history to localStorage
 */
function saveAnonChatHistory(
  appId: string,
  history: StoredAnonymousChatHistory
): void {
  if (typeof window === "undefined") return;

  try {
    // Limit number of sessions to prevent localStorage bloat
    if (history.sessions.length > MAX_ANON_SESSIONS) {
      // Sort by updatedAt and keep most recent
      history.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      history.sessions = history.sessions.slice(0, MAX_ANON_SESSIONS);
    }

    localStorage.setItem(getAnonChatKey(appId), JSON.stringify(history));
  } catch {
    // localStorage might be full or disabled, ignore
  }
}

/**
 * Generate a title for a session based on the first user message
 */
function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage || !firstUserMessage.parts) return "New Chat";

  // Get first text part
  const textPart = firstUserMessage.parts.find((p) => p.type === "text");
  if (!textPart || textPart.type !== "text") return "New Chat";

  // Truncate to ~50 chars
  const text = textPart.text.trim();
  if (text.length <= 50) return text;
  return text.substring(0, 47) + "...";
}

/**
 * Save or update an anonymous session
 */
function saveAnonSession(
  appId: string,
  sessionId: string,
  messages: ChatMessage[],
  setAsCurrent: boolean = true
): void {
  const history = loadAnonChatHistory(appId);
  const now = Date.now();

  // Find existing session or create new one
  const existingIndex = history.sessions.findIndex((s) => s.id === sessionId);

  const session: StoredAnonymousSession = {
    id: sessionId,
    title: generateSessionTitle(messages),
    messages,
    createdAt:
      existingIndex >= 0 ? history.sessions[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    history.sessions[existingIndex] = session;
  } else {
    history.sessions.unshift(session); // Add at beginning (most recent)
  }

  if (setAsCurrent) {
    history.currentSessionId = sessionId;
  }

  saveAnonChatHistory(appId, history);
}

/**
 * Load a specific anonymous session
 */
function loadAnonSession(
  appId: string,
  sessionId: string
): StoredAnonymousSession | null {
  const history = loadAnonChatHistory(appId);
  return history.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Delete an anonymous session
 */
function deleteAnonSession(appId: string, sessionId: string): void {
  const history = loadAnonChatHistory(appId);
  history.sessions = history.sessions.filter((s) => s.id !== sessionId);
  if (history.currentSessionId === sessionId) {
    history.currentSessionId = null;
  }
  saveAnonChatHistory(appId, history);
}

/**
 * Get list of anonymous sessions (for history view)
 */
function getAnonSessions(appId: string): StoredAnonymousSession[] {
  const history = loadAnonChatHistory(appId);
  // Sort by updatedAt descending (most recent first)
  return history.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Clear all anonymous chat history for an app
 */
function clearAnonChatHistory(appId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getAnonChatKey(appId));
}

function createConsumerChatStore() {
  const { subscribe, set, update } = writable<ConsumerChatState>(initialState);

  // Track pending tool calls during streaming
  let pendingToolCalls = new Map<
    string,
    { id: string; name: string; input: unknown }
  >();
  let currentTextContent = "";

  // Batching configuration for smooth streaming
  const TEXT_BATCH_INTERVAL_MS = 50; // Batch updates every 50ms
  let textBuffer = "";
  let batchTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentAssistantId: string | null = null;

  // Track which text part in the parts array is being actively updated.
  // When a new tool arrives, we "seal" the current text part (set to -1)
  // so the next text creates a new part AFTER the tool, enabling hasTextAfterIndex() collapsing.
  let activeTextPartIndex = -1;
  let activePartText = "";

  return {
    subscribe,

    /**
     * Initialize store for a specific app
     * @param isAnonymous - Whether the user is not authenticated (anonymous chat)
     */
    initForApp(appId: string, appNameId: string, isAnonymous = false): void {
      if (typeof window === "undefined") {
        update((s) => ({
          ...s,
          currentAppId: appId,
          currentAppNameId: appNameId,
        }));
        return;
      }

      // Restore frozen state from sessionStorage
      const isFrozen =
        sessionStorage.getItem(`chat-frozen-${appId}`) === "true";
      const tagId = sessionStorage.getItem(`chat-frozen-tag-${appId}`);

      // Restore custom instructions
      const savedInstructions = localStorage.getItem(
        `custom-instructions-${appId}`
      );

      // Always start fresh - users can load a specific session from history if needed
      // Session history is still preserved in localStorage for anonymous users,
      // but we don't auto-restore it on navigation to the chat page.
      update((s) => ({
        ...s,
        currentAppId: appId,
        currentAppNameId: appNameId,
        sessionId: null,
        messages: [],
        conversationFrozen: isFrozen,
        freezeTagId: isFrozen ? tagId : null,
        customInstructions: savedInstructions,
      }));
    },

    /**
     * Set app configuration (suggestions, CTA, etc.)
     */
    setAppConfig(config: {
      suggestions?: Suggestion[];
      cta?: CTAConfig | null;
      disclaimerText?: string | null;
      inputPlaceholder?: string | null;
    }): void {
      update((s) => ({
        ...s,
        suggestions: config.suggestions || s.suggestions,
        cta: config.cta !== undefined ? config.cta : s.cta,
        disclaimerText:
          config.disclaimerText !== undefined
            ? config.disclaimerText
            : s.disclaimerText,
        inputPlaceholder:
          config.inputPlaceholder !== undefined
            ? config.inputPlaceholder
            : s.inputPlaceholder,
      }));
    },

    /**
     * Set user credits
     */
    setCredits(credits: number | string, subscriptionActive: boolean): void {
      update((s) => ({
        ...s,
        userCredits: credits,
        subscriptionActive,
      }));
    },

    /**
     * Create a new chat session
     */
    async createSession(): Promise<string | null> {
      const state = get({ subscribe });
      if (!state.currentAppNameId) return null;

      try {
        const response = await fetch(
          `/consumer/${state.currentAppNameId}/chat/session`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create session");
        }

        const data = await response.json();
        update((s) => ({
          ...s,
          sessionId: data.sessionId,
          messages: [],
          error: null,
        }));

        return data.sessionId;
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : "Failed to create session";
        update((s) => ({ ...s, error: errorMsg }));
        return null;
      }
    },

    /**
     * Load an existing chat session
     */
    async loadSession(sessionId: string): Promise<boolean> {
      const state = get({ subscribe });
      if (!state.currentAppNameId) return false;

      try {
        const response = await fetch(
          `/consumer/${state.currentAppNameId}/chat/sessions/${sessionId}`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load session");
        }

        const data = await response.json();

        // Convert messages to ChatMessage format
        const messages: ChatMessage[] = (data.messages || []).map(
          (msg: {
            id: string;
            role?: string;
            senderType?: string;
            content: string;
            createdAt?: string;
            audioUrl?: string;
            audioDurationMs?: number;
            videoUrl?: string;
            videoMimeType?: string;
          }) => ({
            id: msg.id,
            role:
              msg.role === "user" || msg.senderType === "USER"
                ? "user"
                : "assistant",
            content: msg.content || "",
            createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
            audioUrl: msg.audioUrl || undefined,
            audioDurationMs: msg.audioDurationMs || undefined,
            videoUrl: msg.videoUrl || undefined,
            videoMimeType: msg.videoMimeType || undefined,
          })
        );

        update((s) => ({
          ...s,
          sessionId,
          messages,
          error: null,
        }));

        return true;
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : "Failed to load session";
        update((s) => ({ ...s, error: errorMsg }));
        return false;
      }
    },

    /**
     * Send a message and handle streaming response
     * @param isRetry - If true, skips adding the user message (for retry flow)
     */
    async sendMessage(
      message: string,
      isRetry: boolean = false
    ): Promise<void> {
      const state = get({ subscribe });
      if (!state.currentAppNameId || state.responseGenerating) return;

      // Clear previous error
      update((s) => ({
        ...s,
        error: null,
        responseGenerating: true,
        isStreaming: true,
      }));

      // Reset tracking for new message
      pendingToolCalls.clear();
      currentTextContent = "";
      activeTextPartIndex = -1;
      activePartText = "";

      // Add empty assistant message for streaming
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
      };

      if (isRetry) {
        // For retry, only add the assistant message placeholder
        update((s) => ({
          ...s,
          messages: [...s.messages, assistantMsg],
        }));
      } else {
        // For new messages, add both user message and assistant placeholder
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: message,
        };

        update((s) => ({
          ...s,
          messages: [...s.messages, userMsg, assistantMsg],
        }));
      }

      // Create abort controller
      abortController = new AbortController();

      try {
        const anonToken = getAnonymousToken();
        const response = await fetch(
          `/consumer/${state.currentAppNameId}/chat/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...modelOverride.getHeader(),
              ...(anonToken && { "X-Anonymous-Token": anonToken }),
            },
            credentials: "include",
            signal: abortController.signal,
            body: JSON.stringify({
              message,
              ...(state.sessionId && { sessionId: state.sessionId }),
              ...(state.customInstructions && {
                customInstructions: state.customInstructions,
              }),
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Request failed: ${response.status}`
          );
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              if (dataStr === "[DONE]") continue;

              try {
                const event = JSON.parse(dataStr);

                // Handle session ID
                if ("sessionId" in event && event.sessionId) {
                  update((s) => ({
                    ...s,
                    sessionId: s.sessionId || event.sessionId,
                  }));
                }

                // Handle errors
                if ("error" in event && event.error) {
                  const errorMsg =
                    typeof event.error === "string"
                      ? event.error
                      : "Something went wrong. Please try again.";
                  // Set error on the store (for modal detection)
                  update((s) => ({
                    ...s,
                    error: errorMsg,
                    lastError: errorMsg,
                  }));

                  // For credit exhaustion errors, remove the empty assistant message
                  // (the modal will show instead). For other errors, show inline error.
                  if (isCreditExhaustionError(errorMsg)) {
                    update((s) => ({
                      ...s,
                      messages: s.messages.filter((m) => m.id !== assistantId),
                    }));
                  } else {
                    this.setMessageError(assistantId, errorMsg);
                  }
                  continue;
                }

                // Handle event types
                if ("type" in event) {
                  this.handleSSEEvent(event as SSEEvent, assistantId);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Flush any remaining buffered text
        if (batchTimeout) {
          clearTimeout(batchTimeout);
          batchTimeout = null;
        }
        if (textBuffer) {
          currentTextContent += textBuffer;
          activePartText += textBuffer;
          textBuffer = "";
        }

        // Finalize message content
        if (currentTextContent) {
          this.updateAssistantMessage(assistantId, currentTextContent);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          // User stopped the response
          update((s) => ({ ...s, error: null }));
        } else {
          const errorMsg =
            e instanceof Error ? e.message : "Failed to send message";
          update((s) => ({ ...s, error: errorMsg, lastError: errorMsg }));
          this.setMessageError(assistantId, errorMsg);
        }
      } finally {
        update((s) => {
          const newState = {
            ...s,
            isStreaming: false,
            responseGenerating: false,
          };

          // Save to localStorage for anonymous chat persistence
          // (only save if we have a sessionId and messages)
          if (
            newState.sessionId &&
            newState.currentAppId &&
            newState.messages.length > 0
          ) {
            saveAnonSession(
              newState.currentAppId,
              newState.sessionId,
              newState.messages
            );
          }

          return newState;
        });
        abortController = null;
      }
    },

    /**
     * Flush any buffered text to the UI
     */
    flushTextBuffer(assistantId: string): void {
      if (textBuffer) {
        currentTextContent += textBuffer;
        activePartText += textBuffer;
        textBuffer = "";
        this.updateAssistantMessage(assistantId, currentTextContent);
      }
      batchTimeout = null;
    },

    /**
     * Handle SSE event
     */
    handleSSEEvent(event: SSEEvent, assistantId: string): void {
      switch (event.type) {
        case "text-delta": {
          const delta = (event as { type: "text-delta"; delta: string }).delta;
          currentAssistantId = assistantId;

          // Accumulate text in buffer
          textBuffer += delta;

          // Schedule flush if not already scheduled
          if (!batchTimeout) {
            batchTimeout = setTimeout(() => {
              this.flushTextBuffer(assistantId);
            }, TEXT_BATCH_INTERVAL_MS);
          }
          break;
        }

        case "tool-input-start": {
          const e = event as {
            type: "tool-input-start";
            toolCallId: string;
            toolName: string;
          };
          // Finalize pending text before adding tool (maintains chronological order).
          // This ensures text appears BEFORE the tool in the parts array,
          // so hasTextAfterIndex() can detect text AFTER tools for collapsing.
          this.flushTextBuffer(assistantId);
          activeTextPartIndex = -1;
          activePartText = "";

          pendingToolCalls.set(e.toolCallId, {
            id: e.toolCallId,
            name: e.toolName,
            input: null,
          });
          this.addOrUpdateToolPart(assistantId, {
            id: e.toolCallId,
            name: e.toolName,
            state: "partial-call",
            input: null,
          });
          break;
        }

        case "tool-input-available": {
          const e = event as {
            type: "tool-input-available";
            toolCallId: string;
            toolName: string;
            input: unknown;
          };
          const toolCall = pendingToolCalls.get(e.toolCallId);
          if (toolCall) {
            toolCall.input = e.input;
          }
          this.addOrUpdateToolPart(assistantId, {
            id: e.toolCallId,
            name: e.toolName,
            state: "call",
            input: e.input,
          });
          break;
        }

        case "tool-output-available": {
          const e = event as {
            type: "tool-output-available";
            toolCallId: string;
            output: unknown;
          };
          const toolCall = pendingToolCalls.get(e.toolCallId);
          this.addOrUpdateToolPart(assistantId, {
            id: e.toolCallId,
            name: toolCall?.name || "unknown",
            state: "result",
            input: toolCall?.input,
            output: e.output,
          });
          break;
        }

        // Ignore other events
        default:
          break;
      }
    },

    /**
     * Update assistant message content
     */
    updateAssistantMessage(assistantId: string, text: string): void {
      update((s) => {
        const messages = [...s.messages];
        const msgIndex = messages.findIndex((m) => m.id === assistantId);
        if (msgIndex === -1) return s;

        const msg = { ...messages[msgIndex] };
        const parts = [...(msg.parts || [])];

        if (
          activeTextPartIndex >= 0 &&
          activeTextPartIndex < parts.length &&
          parts[activeTextPartIndex].type === "text"
        ) {
          // Update the active text part in place
          parts[activeTextPartIndex] = { type: "text", text: activePartText };
        } else {
          // Create new text part at the end (after any tool parts)
          parts.push({ type: "text", text: activePartText });
          activeTextPartIndex = parts.length - 1;
        }

        msg.parts = parts;
        msg.content = text;
        messages[msgIndex] = msg;

        return { ...s, messages };
      });
    },

    /**
     * Set error state on a message (shows error card with retry button)
     */
    setMessageError(assistantId: string, errorMessage: string): void {
      update((s) => {
        const messages = [...s.messages];
        const msgIndex = messages.findIndex((m) => m.id === assistantId);
        if (msgIndex === -1) return s;

        messages[msgIndex] = {
          ...messages[msgIndex],
          content: "",
          parts: [],
          error: true,
          errorMessage,
        };

        return { ...s, messages };
      });
    },

    /**
     * Add or update tool invocation part
     */
    addOrUpdateToolPart(assistantId: string, tool: ToolInvocation): void {
      update((s) => {
        const messages = [...s.messages];
        const msgIndex = messages.findIndex((m) => m.id === assistantId);
        if (msgIndex === -1) return s;

        const msg = { ...messages[msgIndex] };
        const parts: MessagePart[] = [...(msg.parts || [])];

        const toolPartIndex = parts.findIndex(
          (p) => p.type === "tool-invocation" && p.toolInvocation.id === tool.id
        );

        if (toolPartIndex >= 0) {
          parts[toolPartIndex] = {
            type: "tool-invocation",
            toolInvocation: tool,
          };
        } else {
          parts.push({ type: "tool-invocation", toolInvocation: tool });
        }

        msg.parts = parts;
        messages[msgIndex] = msg;

        return { ...s, messages };
      });
    },

    /**
     * Stop the current streaming response
     */
    stop(): void {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      // Clear any pending batch timeout
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      // Flush remaining buffer before stopping
      if (textBuffer && currentAssistantId) {
        currentTextContent += textBuffer;
        activePartText += textBuffer;
        textBuffer = "";
        this.updateAssistantMessage(currentAssistantId, currentTextContent);
      }
      update((s) => ({
        ...s,
        isStreaming: false,
        responseGenerating: false,
      }));
    },

    /**
     * Retry last failed message
     */
    retry(): void {
      const state = get({ subscribe });
      if (state.messages.length < 1) return;

      // Find the last user message
      const lastUserMsgIndex = [...state.messages]
        .reverse()
        .findIndex((m) => m.role === "user");
      if (lastUserMsgIndex === -1) return;

      const realIndex = state.messages.length - 1 - lastUserMsgIndex;
      const lastUserMessage = state.messages[realIndex];

      // Remove the last assistant message (error response) if present
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg.role === "assistant" && lastMsg.error) {
        update((s) => ({
          ...s,
          messages: s.messages.slice(0, -1),
          error: null,
        }));
      } else {
        // Just clear the error state
        update((s) => ({ ...s, error: null }));
      }

      // Resend without adding the user message again
      this.sendMessage(lastUserMessage.content, true);
    },

    /**
     * Send an audio message (voice recording).
     * Same flow as sendMessage but includes audio payload.
     */
    async sendAudioMessage(
      audioBase64: string,
      mimeType: string,
      durationMs: number,
      audioUrl?: string
    ): Promise<void> {
      const state = get({ subscribe });
      if (!state.currentAppNameId || state.responseGenerating) return;

      // Clear previous error
      update((s) => ({
        ...s,
        error: null,
        responseGenerating: true,
        isStreaming: true,
      }));

      // Reset tracking
      pendingToolCalls.clear();
      currentTextContent = "";
      activeTextPartIndex = -1;
      activePartText = "";

      // Add user message with playable audio
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "[Voice message]",
        audioUrl,
        audioDurationMs: durationMs,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
      };

      update((s) => ({
        ...s,
        messages: [...s.messages, userMsg, assistantMsg],
      }));

      abortController = new AbortController();

      try {
        const anonTokenAudio = getAnonymousToken();
        const response = await fetch(
          `/consumer/${state.currentAppNameId}/chat/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...modelOverride.getHeader(),
              ...(anonTokenAudio && { "X-Anonymous-Token": anonTokenAudio }),
            },
            credentials: "include",
            signal: abortController.signal,
            body: JSON.stringify({
              message: "",
              ...(state.sessionId && { sessionId: state.sessionId }),
              ...(state.customInstructions && {
                customInstructions: state.customInstructions,
              }),
              audio: {
                data: audioBase64,
                mimeType,
                durationMs,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Request failed: ${response.status}`
          );
        }

        // Reuse the same SSE parsing as sendMessage
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              if (dataStr === "[DONE]") continue;

              try {
                const event = JSON.parse(dataStr);

                // Handle session ID from start event
                if ("sessionId" in event && event.sessionId) {
                  update((s) => ({
                    ...s,
                    sessionId: s.sessionId || event.sessionId,
                  }));
                }

                // Handle errors
                if ("error" in event && event.error) {
                  const errorMsg =
                    typeof event.error === "string"
                      ? event.error
                      : "Something went wrong. Please try again.";
                  update((s) => ({
                    ...s,
                    error: errorMsg,
                    lastError: errorMsg,
                  }));

                  // For credit exhaustion errors, remove the empty assistant message
                  if (isCreditExhaustionError(errorMsg)) {
                    update((s) => ({
                      ...s,
                      messages: s.messages.filter((m) => m.id !== assistantId),
                    }));
                  } else {
                    this.setMessageError(assistantId, errorMsg);
                  }
                  continue;
                }

                // Handle audio URL from GCS upload (native audio sent to LLM)
                if (event.type === "audio-url" && event.audioUrl) {
                  update((s) => {
                    const messages = [...s.messages];
                    // Find the most recent user message with a blob: audioUrl
                    for (let i = messages.length - 1; i >= 0; i--) {
                      if (
                        messages[i].role === "user" &&
                        messages[i].audioUrl?.startsWith("blob:")
                      ) {
                        messages[i] = {
                          ...messages[i],
                          audioUrl: event.audioUrl,
                        };
                        break;
                      }
                    }
                    return { ...s, messages };
                  });
                  continue;
                }

                // Handle Whisper transcription — replace audio player with transcript text
                if (event.type === "audio-transcribed" && event.text) {
                  update((s) => {
                    const messages = [...s.messages];
                    for (let i = messages.length - 1; i >= 0; i--) {
                      if (messages[i].role === "user" && messages[i].audioUrl) {
                        messages[i] = {
                          ...messages[i],
                          content: event.text,
                          audioUrl: undefined,
                          audioDurationMs: undefined,
                        };
                        break;
                      }
                    }
                    return { ...s, messages };
                  });
                  continue;
                }

                this.handleSSEEvent(event, assistantId);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Flush remaining buffered text
        if (batchTimeout) {
          clearTimeout(batchTimeout);
          batchTimeout = null;
        }
        if (textBuffer) {
          currentTextContent += textBuffer;
          activePartText += textBuffer;
          textBuffer = "";
        }
        if (currentTextContent) {
          this.updateAssistantMessage(assistantId, currentTextContent);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          update((s) => ({ ...s, error: null }));
        } else {
          const errorMsg =
            e instanceof Error ? e.message : "Failed to send audio message";
          captureException(e, { tags: { source: "consumer-chat-store" }, extra: { action: "sendAudioMessage", errorMsg } });
          update((s) => ({ ...s, error: errorMsg, lastError: errorMsg }));
          this.setMessageError(assistantId, errorMsg);
        }
      } finally {
        update((s) => {
          const newState = {
            ...s,
            isStreaming: false,
            responseGenerating: false,
          };
          if (
            newState.sessionId &&
            newState.currentAppId &&
            newState.messages.length > 0
          ) {
            saveAnonSession(
              newState.currentAppId,
              newState.sessionId,
              newState.messages
            );
          }
          return newState;
        });
        abortController = null;
      }
    },

    /**
     * Send a video message (recorded or uploaded).
     * The video has already been uploaded to GCS; we send the URL to the API.
     */
    async sendVideoMessage(videoUrl: string, mimeType: string): Promise<void> {
      const state = get({ subscribe });
      if (!state.currentAppNameId || state.responseGenerating) return;

      // Clear previous error
      update((s) => ({
        ...s,
        error: null,
        responseGenerating: true,
        isStreaming: true,
      }));

      // Reset tracking
      pendingToolCalls.clear();
      currentTextContent = "";
      activeTextPartIndex = -1;
      activePartText = "";

      // Add user message with video
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "[Video message]",
        videoUrl,
        videoMimeType: mimeType,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
      };

      update((s) => ({
        ...s,
        messages: [...s.messages, userMsg, assistantMsg],
      }));

      abortController = new AbortController();

      try {
        const anonTokenVideo = getAnonymousToken();
        const response = await fetch(
          `/consumer/${state.currentAppNameId}/chat/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...modelOverride.getHeader(),
              ...(anonTokenVideo && { "X-Anonymous-Token": anonTokenVideo }),
            },
            credentials: "include",
            signal: abortController.signal,
            body: JSON.stringify({
              message: "",
              ...(state.sessionId && { sessionId: state.sessionId }),
              ...(state.customInstructions && {
                customInstructions: state.customInstructions,
              }),
              video: {
                url: videoUrl,
                mimeType,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Request failed: ${response.status}`
          );
        }

        // Reuse the same SSE parsing as sendMessage
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              if (dataStr === "[DONE]") continue;

              try {
                const event = JSON.parse(dataStr);

                if ("sessionId" in event && event.sessionId) {
                  update((s) => ({
                    ...s,
                    sessionId: s.sessionId || event.sessionId,
                  }));
                }

                // Handle errors
                if ("error" in event && event.error) {
                  const errorMsg =
                    typeof event.error === "string"
                      ? event.error
                      : "Something went wrong. Please try again.";
                  update((s) => ({
                    ...s,
                    error: errorMsg,
                    lastError: errorMsg,
                  }));

                  // For credit exhaustion errors, remove the empty assistant message
                  if (isCreditExhaustionError(errorMsg)) {
                    update((s) => ({
                      ...s,
                      messages: s.messages.filter((m) => m.id !== assistantId),
                    }));
                  } else {
                    this.setMessageError(assistantId, errorMsg);
                  }
                  continue;
                }

                this.handleSSEEvent(event, assistantId);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Flush remaining buffered text
        if (batchTimeout) {
          clearTimeout(batchTimeout);
          batchTimeout = null;
        }
        if (textBuffer) {
          currentTextContent += textBuffer;
          activePartText += textBuffer;
          textBuffer = "";
        }
        if (currentTextContent) {
          this.updateAssistantMessage(assistantId, currentTextContent);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          update((s) => ({ ...s, error: null }));
        } else {
          const errorMsg =
            e instanceof Error ? e.message : "Failed to send video message";
          captureException(e, { tags: { source: "consumer-chat-store" }, extra: { action: "sendVideoMessage", errorMsg } });
          update((s) => ({ ...s, error: errorMsg, lastError: errorMsg }));
          this.setMessageError(assistantId, errorMsg);
        }
      } finally {
        update((s) => {
          const newState = {
            ...s,
            isStreaming: false,
            responseGenerating: false,
          };
          if (
            newState.sessionId &&
            newState.currentAppId &&
            newState.messages.length > 0
          ) {
            saveAnonSession(
              newState.currentAppId,
              newState.sessionId,
              newState.messages
            );
          }
          return newState;
        });
        abortController = null;
      }
    },

    /**
     * Clear error and optionally remove the failed assistant message
     */
    clearError(removeErrorMessage: boolean = false): void {
      update((s) => {
        if (removeErrorMessage) {
          // Remove the last message if it has an error
          const messages = [...s.messages];
          if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === "assistant" && lastMsg.error) {
              messages.pop();
            }
          }
          return { ...s, error: null, messages };
        }
        return { ...s, error: null };
      });
    },

    /**
     * Clear all messages and start fresh
     */
    clearChat(): void {
      const state = get({ subscribe });

      update((s) => ({
        ...s,
        sessionId: null,
        messages: [],
        error: null,
        conversationFrozen: false,
        freezeTagId: null,
      }));

      if (state.currentAppId && typeof window !== "undefined") {
        sessionStorage.removeItem(`chat-frozen-${state.currentAppId}`);
        sessionStorage.removeItem(`chat-frozen-tag-${state.currentAppId}`);
        // Note: We don't clear localStorage history here - user may want to access old sessions
        // The old session remains in history, we just start a new one
      }
    },

    // ============ Anonymous Session Management ============

    /**
     * Get list of anonymous sessions for history view
     */
    getAnonymousSessions(): Array<{
      id: string;
      title: string;
      updatedAt: string;
      messageCount: number;
    }> {
      const state = get({ subscribe });
      if (!state.currentAppId) return [];

      const sessions = getAnonSessions(state.currentAppId);
      return sessions.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: new Date(s.updatedAt).toISOString(),
        messageCount: s.messages.length,
      }));
    },

    /**
     * Load a specific anonymous session
     */
    loadAnonymousSession(sessionId: string): boolean {
      const state = get({ subscribe });
      if (!state.currentAppId) return false;

      const session = loadAnonSession(state.currentAppId, sessionId);
      if (!session) return false;

      // Update the current session in history
      const history = loadAnonChatHistory(state.currentAppId);
      history.currentSessionId = sessionId;
      saveAnonChatHistory(state.currentAppId, history);

      update((s) => ({
        ...s,
        sessionId: session.id,
        messages: session.messages,
        error: null,
        conversationFrozen: false,
        freezeTagId: null,
      }));

      return true;
    },

    /**
     * Delete an anonymous session
     */
    deleteAnonymousSession(sessionId: string): void {
      const state = get({ subscribe });
      if (!state.currentAppId) return;

      deleteAnonSession(state.currentAppId, sessionId);

      // If we deleted the current session, clear it
      if (state.sessionId === sessionId) {
        update((s) => ({
          ...s,
          sessionId: null,
          messages: [],
        }));
      }
    },

    // ============ File Staging ============

    /**
     * Add staged file
     */
    addStagedFile(file: StagedFile): void {
      update((s) => ({
        ...s,
        stagedFiles: [...s.stagedFiles, file],
      }));
    },

    /**
     * Update staged file
     */
    updateStagedFile(fileId: string, updates: Partial<StagedFile>): void {
      update((s) => ({
        ...s,
        stagedFiles: s.stagedFiles.map((f) =>
          f.id === fileId ? { ...f, ...updates } : f
        ),
      }));
    },

    /**
     * Remove staged file
     */
    removeStagedFile(fileId: string): void {
      update((s) => ({
        ...s,
        stagedFiles: s.stagedFiles.filter((f) => f.id !== fileId),
      }));
    },

    /**
     * Clear all staged files
     */
    clearStagedFiles(): void {
      update((s) => ({ ...s, stagedFiles: [] }));
    },

    /**
     * Add staged image
     */
    addStagedImage(imageUrl: string): void {
      update((s) => ({
        ...s,
        stagedImages: [...s.stagedImages, imageUrl],
      }));
    },

    /**
     * Remove staged image
     */
    removeStagedImage(imageUrl: string): void {
      update((s) => ({
        ...s,
        stagedImages: s.stagedImages.filter((url) => url !== imageUrl),
      }));
    },

    /**
     * Clear all staged images
     */
    clearStagedImages(): void {
      update((s) => ({ ...s, stagedImages: [] }));
    },

    /**
     * Build message with file metadata
     */
    buildMessageWithFiles(message: string): string {
      const state = get({ subscribe });
      let result = message;

      // Add file metadata
      for (const file of state.stagedFiles) {
        if (file.uploadedFileDetails) {
          result += `\n[Uploaded File: ${file.uploadedFileDetails.name}](${file.uploadedFileDetails.url})`;
        }
      }

      // Add image URLs
      for (const imageUrl of state.stagedImages) {
        result += `\n![Uploaded Image](${imageUrl})`;
      }

      return result;
    },

    // ============ Custom Instructions ============

    /**
     * Set custom instructions
     */
    setCustomInstructions(instructions: string | null): void {
      const state = get({ subscribe });

      if (state.currentAppId && typeof window !== "undefined") {
        if (instructions) {
          localStorage.setItem(
            `custom-instructions-${state.currentAppId}`,
            instructions
          );
        } else {
          localStorage.removeItem(`custom-instructions-${state.currentAppId}`);
        }
      }

      update((s) => ({ ...s, customInstructions: instructions }));
    },

    // ============ Frozen State ============

    /**
     * Set conversation as frozen
     */
    setFrozen(frozen: boolean, tagId?: string | null): void {
      const state = get({ subscribe });
      const appId = state.currentAppId;

      if (appId && typeof window !== "undefined") {
        if (frozen) {
          sessionStorage.setItem(`chat-frozen-${appId}`, "true");
          sessionStorage.setItem(`chat-frozen-tag-${appId}`, tagId || "");
        } else {
          sessionStorage.removeItem(`chat-frozen-${appId}`);
          sessionStorage.removeItem(`chat-frozen-tag-${appId}`);
        }
      }

      update((s) => ({
        ...s,
        conversationFrozen: frozen,
        freezeTagId: frozen ? tagId || null : null,
      }));
    },

    /**
     * Clear frozen state
     */
    clearFrozen(): void {
      const state = get({ subscribe });
      const appId = state.currentAppId;

      if (appId && typeof window !== "undefined") {
        sessionStorage.removeItem(`chat-frozen-${appId}`);
        sessionStorage.removeItem(`chat-frozen-tag-${appId}`);
      }

      update((s) => ({
        ...s,
        conversationFrozen: false,
        freezeTagId: null,
      }));
    },

    // ============ Takeover Helpers ============

    /**
     * Handle takeover:entered event from builder
     */
    handleTakeoverEntered(operatorName: string): void {
      update((s) => ({
        ...s,
        isHumanTakeover: true,
        takeoverOperatorName: operatorName,
        messages: [
          ...s.messages,
          {
            id: `system-${Date.now()}`,
            role: "system" as const,
            content: `**${operatorName} has entered the chat**`,
          },
        ],
      }));
    },

    /**
     * Handle takeover:left event from builder
     */
    handleTakeoverLeft(operatorName: string): void {
      update((s) => ({
        ...s,
        isHumanTakeover: false,
        takeoverOperatorName: null,
        messages: [
          ...s.messages,
          {
            id: `system-${Date.now()}`,
            role: "system" as const,
            content: `**${operatorName} has left the chat. AI has resumed.**`,
          },
        ],
      }));
    },

    /**
     * Handle takeover:message event from builder (human support message)
     */
    handleTakeoverMessage(
      content: string,
      operatorName: string,
      messageId: string
    ): void {
      update((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: messageId,
            role: "assistant" as const,
            content,
            operatorName,
          },
        ],
      }));
    },

    // ============ Multiplayer Helpers ============

    /**
     * Add an external message (from another participant via WebSocket).
     * Used by the multiplayer store to inject messages without triggering SSE.
     */
    addExternalMessage(msg: ChatMessage): void {
      update((s) => ({
        ...s,
        messages: [...s.messages, msg],
      }));
    },

    /**
     * Add an empty observer assistant message (for WS AI chunk assembly).
     */
    addObserverMessage(assistantId: string): void {
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
      };
      update((s) => ({
        ...s,
        messages: [...s.messages, assistantMsg],
        responseGenerating: true,
        isStreaming: true,
      }));
    },

    /**
     * Load messages for a multiplayer session (called after join).
     */
    loadMultiplayerMessages(sessionId: string, messages: ChatMessage[]): void {
      update((s) => ({
        ...s,
        sessionId,
        messages,
        error: null,
      }));
    },

    /**
     * Reset entire store
     */
    reset(): void {
      set(initialState);
      pendingToolCalls.clear();
      currentTextContent = "";
      textBuffer = "";
      currentAssistantId = null;
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    },
  };
}

export const consumerChat = createConsumerChatStore();

// ============ Derived Stores ============

export const chatSessionId = derived(
  consumerChat,
  ($store) => $store.sessionId
);

export const chatMessages = derived(consumerChat, ($store) => $store.messages);

export const isStreaming = derived(
  consumerChat,
  ($store) => $store.isStreaming
);

export const responseGenerating = derived(
  consumerChat,
  ($store) => $store.responseGenerating
);

export const chatError = derived(consumerChat, ($store) => $store.error);

export const userCredits = derived(
  consumerChat,
  ($store) => $store.userCredits
);

export const subscriptionActive = derived(
  consumerChat,
  ($store) => $store.subscriptionActive
);

export const stagedFiles = derived(
  consumerChat,
  ($store) => $store.stagedFiles
);

export const stagedImages = derived(
  consumerChat,
  ($store) => $store.stagedImages
);

export const isConversationFrozen = derived(
  consumerChat,
  ($store) => $store.conversationFrozen
);

export const freezeTagId = derived(
  consumerChat,
  ($store) => $store.freezeTagId
);

export const chatSuggestions = derived(
  consumerChat,
  ($store) => $store.suggestions
);

export const chatCTA = derived(consumerChat, ($store) => $store.cta);

export const disclaimerText = derived(
  consumerChat,
  ($store) => $store.disclaimerText
);

export const inputPlaceholder = derived(
  consumerChat,
  ($store) => $store.inputPlaceholder
);

export const customInstructions = derived(
  consumerChat,
  ($store) => $store.customInstructions
);

export const isHumanTakeover = derived(
  consumerChat,
  ($store) => $store.isHumanTakeover
);

export const takeoverOperatorName = derived(
  consumerChat,
  ($store) => $store.takeoverOperatorName
);
