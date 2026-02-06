/**
 * Multiplayer Chat Store
 *
 * Manages multiplayer chat state:
 * - Session creation/joining via share tokens
 * - Participant list (names, avatars, online status)
 * - AI responding state (disables input for everyone)
 * - Typing indicators
 * - WebSocket event integration
 *
 * Works alongside the existing consumerChat store.
 * consumerChat handles messages/streaming, this store handles multiplayer-specific state.
 */

import { writable, derived, get } from "svelte/store";
import {
  connect as wsConnect,
  disconnect as wsDisconnect,
  subscribe as wsSubscribe,
  sendStop as wsSendStop,
  sendTyping as wsSendTyping,
  getAnonymousToken,
  type ConsumerWsEvent,
} from "./consumerWebSocket";
import { consumerChat } from "./consumerChat";
import type { ChatMessage } from "$lib/design-system/components/chat/types";

// ========================================
// Types
// ========================================

export interface Participant {
  id: string;
  displayName: string;
  avatarColor: string;
  isAnonymous: boolean;
  isActive: boolean;
  joinedAt: string;
  leftAt: string | null;
  lastSeenAt: string;
}

interface MultiplayerState {
  isMultiplayer: boolean;
  shareToken: string | null;
  sessionId: string | null;
  participants: Participant[];
  myParticipantId: string | null;
  aiResponding: boolean;
  typingParticipants: Map<string, { displayName: string; timeout: ReturnType<typeof setTimeout> }>;
  wsConnected: boolean;
  joining: boolean;
  error: string | null;
}

// ========================================
// Store
// ========================================

const initialState: MultiplayerState = {
  isMultiplayer: false,
  shareToken: null,
  sessionId: null,
  participants: [],
  myParticipantId: null,
  aiResponding: false,
  typingParticipants: new Map(),
  wsConnected: false,
  joining: false,
  error: null,
};

// Typing indicator auto-clear timeout
const TYPING_TIMEOUT_MS = 3000;

// WebSocket event unsubscribers
let unsubscribers: (() => void)[] = [];

function createMultiplayerStore() {
  const { subscribe, set, update } = writable<MultiplayerState>(initialState);

  return {
    subscribe,

    /**
     * Create a new multiplayer session.
     */
    async createSession(appNameId: string): Promise<{ shareToken: string; sessionId: string } | null> {
      update((s) => ({ ...s, joining: true, error: null }));

      try {
        const anonymousToken = getAnonymousToken();
        const response = await fetch(
          `/consumer/${appNameId}/chat/multiplayer/create`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ anonymousToken }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create session");
        }

        const { data } = await response.json();

        update((s) => ({
          ...s,
          isMultiplayer: true,
          shareToken: data.shareToken,
          sessionId: data.sessionId,
          myParticipantId: data.participant.id,
          participants: [
            {
              id: data.participant.id,
              displayName: data.participant.displayName,
              avatarColor: data.participant.avatarColor,
              isAnonymous: data.participant.isAnonymous,
              isActive: true,
              joinedAt: new Date().toISOString(),
              leftAt: null,
              lastSeenAt: new Date().toISOString(),
            },
          ],
          joining: false,
        }));

        // Set session on consumerChat store
        consumerChat.initForApp(data.sessionId, appNameId);

        // Connect WebSocket
        await this.connectWs(appNameId, data.sessionId);

        return { shareToken: data.shareToken, sessionId: data.sessionId };
      } catch (e) {
        const error = e instanceof Error ? e.message : "Failed to create session";
        update((s) => ({ ...s, joining: false, error }));
        return null;
      }
    },

    /**
     * Join an existing multiplayer session via share token.
     */
    async joinSession(
      appNameId: string,
      shareToken: string
    ): Promise<boolean> {
      update((s) => ({ ...s, joining: true, error: null }));

      try {
        const anonymousToken = getAnonymousToken();
        const response = await fetch(
          `/consumer/${appNameId}/chat/multiplayer/join`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ shareToken, anonymousToken }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to join session");
        }

        const { data } = await response.json();

        // Convert messages to ChatMessage format for the consumerChat store
        const messages: ChatMessage[] = (data.messages || []).map(
          (msg: {
            id: string;
            role: string;
            content: string;
            senderParticipantId?: string;
            createdAt?: string;
          }) => ({
            id: msg.id,
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content || "",
            senderParticipantId: msg.senderParticipantId,
            createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
          })
        );

        update((s) => ({
          ...s,
          isMultiplayer: true,
          shareToken,
          sessionId: data.sessionId,
          myParticipantId: data.participant.id,
          participants: data.participants || [],
          joining: false,
        }));

        // Load messages into consumerChat - update sessionId and messages directly
        consumerChat.initForApp("", appNameId);
        // Push messages and sessionId into the store
        consumerChat.loadMultiplayerMessages(data.sessionId, messages);

        // Connect WebSocket
        await this.connectWs(appNameId, data.sessionId);

        return true;
      } catch (e) {
        const error = e instanceof Error ? e.message : "Failed to join session";
        update((s) => ({ ...s, joining: false, error }));
        return false;
      }
    },

    /**
     * Connect to the consumer WebSocket and subscribe to multiplayer events.
     */
    async connectWs(appNameId: string, sessionId: string): Promise<void> {
      // Clean up previous subscriptions
      unsubscribers.forEach((fn) => fn());
      unsubscribers = [];

      const connected = await wsConnect(appNameId, sessionId);
      update((s) => ({ ...s, wsConnected: connected }));

      if (!connected) return;

      // Subscribe to multiplayer events
      unsubscribers.push(
        wsSubscribe("multiplayer:user_message", (event) => {
          this.handleUserMessage(event);
        }),
        wsSubscribe("multiplayer:ai_start", () => {
          update((s) => ({ ...s, aiResponding: true }));
        }),
        wsSubscribe("multiplayer:ai_chunk", (event) => {
          this.handleAiChunk(event);
        }),
        wsSubscribe("multiplayer:ai_tool_call", (event) => {
          this.handleAiToolCall(event);
        }),
        wsSubscribe("multiplayer:ai_tool_result", (event) => {
          this.handleAiToolResult(event);
        }),
        wsSubscribe("multiplayer:ai_finish", () => {
          update((s) => ({ ...s, aiResponding: false }));
          this.finalizeObserverMessage();
        }),
        wsSubscribe("multiplayer:ai_stopped", () => {
          update((s) => ({ ...s, aiResponding: false }));
          this.finalizeObserverMessage();
        }),
        wsSubscribe("multiplayer:participant_joined", (event) => {
          this.handleParticipantJoined(event);
        }),
        wsSubscribe("multiplayer:participant_left", (event) => {
          this.handleParticipantLeft(event);
        }),
        wsSubscribe("multiplayer:typing", (event) => {
          this.handleTyping(event);
        }),
        wsSubscribe("multiplayer:participants", (event) => {
          if (Array.isArray(event.participants)) {
            update((s) => ({
              ...s,
              participants: event.participants as Participant[],
            }));
          }
        })
      );
    },

    // ========================================
    // Observer AI message assembly
    // ========================================
    // When an observer receives AI chunks via WS, we assemble them into
    // a temporary assistant message in the consumerChat store.

    _observerAssistantId: null as string | null,
    _observerText: "",
    _observerPendingTools: new Map<string, { name: string; input: unknown }>(),

    handleAiChunk(event: ConsumerWsEvent): void {
      const delta = event.delta as string;
      if (!delta) return;

      // Create observer assistant message if needed
      if (!this._observerAssistantId) {
        this._observerAssistantId = `observer-${crypto.randomUUID().slice(0, 8)}`;
        this._observerText = "";
        this._observerPendingTools = new Map();

        // Add empty assistant message placeholder
        consumerChat.addObserverMessage(this._observerAssistantId);
      }

      this._observerText += delta;
      consumerChat.updateAssistantMessage(this._observerAssistantId, this._observerText);
    },

    handleAiToolCall(event: ConsumerWsEvent): void {
      if (!this._observerAssistantId) {
        this._observerAssistantId = `observer-${crypto.randomUUID().slice(0, 8)}`;
        this._observerText = "";
        this._observerPendingTools = new Map();
        consumerChat.addObserverMessage(this._observerAssistantId);
      }

      const toolCallId = event.toolCallId as string;
      const toolName = event.toolName as string;
      const input = event.input;

      this._observerPendingTools.set(toolCallId, { name: toolName, input });

      consumerChat.addOrUpdateToolPart(this._observerAssistantId, {
        id: toolCallId,
        name: toolName,
        state: "call",
        input,
      });
    },

    handleAiToolResult(event: ConsumerWsEvent): void {
      if (!this._observerAssistantId) return;

      const toolCallId = event.toolCallId as string;
      const toolName = event.toolName as string;
      const output = event.output;
      const tool = this._observerPendingTools.get(toolCallId);

      consumerChat.addOrUpdateToolPart(this._observerAssistantId, {
        id: toolCallId,
        name: toolName || tool?.name || "unknown",
        state: "result",
        input: tool?.input,
        output,
      });

      this._observerPendingTools.delete(toolCallId);
    },

    finalizeObserverMessage(): void {
      this._observerAssistantId = null;
      this._observerText = "";
      this._observerPendingTools = new Map();
    },

    // ========================================
    // Event Handlers
    // ========================================

    handleUserMessage(event: ConsumerWsEvent): void {
      const message = event.message as {
        id: string;
        role: string;
        content: string;
        senderParticipantId?: string;
        createdAt?: string;
      };

      if (!message) return;

      // Find sender display info
      const state = get({ subscribe });
      const sender = state.participants.find((p) => p.id === message.senderParticipantId);

      const chatMsg: ChatMessage = {
        id: message.id,
        role: "user",
        content: message.content,
        senderParticipantId: message.senderParticipantId,
        senderName: sender?.displayName,
        senderAvatarColor: sender?.avatarColor,
      };

      // Add to consumerChat store
      consumerChat.addExternalMessage(chatMsg);
    },

    handleParticipantJoined(event: ConsumerWsEvent): void {
      const participant = event.participant as Participant;
      if (!participant) return;

      // Ensure new fields have defaults
      const now = new Date().toISOString();
      const enriched: Participant = {
        ...participant,
        leftAt: null,
        lastSeenAt: participant.lastSeenAt || now,
        joinedAt: participant.joinedAt || now,
      };

      update((s) => {
        // Don't add duplicates - reactivate if they were previously here
        const exists = s.participants.some((p) => p.id === enriched.id);
        if (exists) {
          return {
            ...s,
            participants: s.participants.map((p) =>
              p.id === enriched.id ? { ...p, isActive: true, leftAt: null, lastSeenAt: now } : p
            ),
          };
        }
        return {
          ...s,
          participants: [...s.participants, enriched],
        };
      });

      // Add system message
      consumerChat.addExternalMessage({
        id: `sys-join-${participant.id}`,
        role: "system",
        content: `${participant.displayName} joined the chat`,
        isSystemMessage: true,
      });
    },

    handleParticipantLeft(event: ConsumerWsEvent): void {
      const participantId = event.participantId as string;
      const displayName = event.displayName as string;
      const now = new Date().toISOString();

      update((s) => ({
        ...s,
        participants: s.participants.map((p) =>
          p.id === participantId ? { ...p, isActive: false, leftAt: now } : p
        ),
      }));

      if (displayName) {
        consumerChat.addExternalMessage({
          id: `sys-leave-${participantId}`,
          role: "system",
          content: `${displayName} left the chat`,
          isSystemMessage: true,
        });
      }
    },

    handleTyping(event: ConsumerWsEvent): void {
      const participantId = event.participantId as string;
      const displayName = event.displayName as string;
      const isTyping = event.isTyping as boolean;
      const state = get({ subscribe });

      // Don't show own typing
      if (participantId === state.myParticipantId) return;

      update((s) => {
        const newTyping = new Map(s.typingParticipants);

        if (isTyping) {
          // Clear existing timeout
          const existing = newTyping.get(participantId);
          if (existing) clearTimeout(existing.timeout);

          // Set new timeout
          const timeout = setTimeout(() => {
            update((s2) => {
              const t = new Map(s2.typingParticipants);
              t.delete(participantId);
              return { ...s2, typingParticipants: t };
            });
          }, TYPING_TIMEOUT_MS);

          newTyping.set(participantId, { displayName, timeout });
        } else {
          const existing = newTyping.get(participantId);
          if (existing) clearTimeout(existing.timeout);
          newTyping.delete(participantId);
        }

        return { ...s, typingParticipants: newTyping };
      });
    },

    // ========================================
    // Actions
    // ========================================

    /**
     * Send typing indicator.
     */
    sendTyping(isTyping: boolean): void {
      wsSendTyping(isTyping);
    },

    /**
     * Stop the AI response (for observers, via WebSocket).
     * The sender uses the existing SSE abort.
     */
    stopAi(): void {
      wsSendStop();
    },

    /**
     * Leave the current multiplayer session.
     */
    async leave(appNameId: string): Promise<void> {
      const state = get({ subscribe });
      if (!state.sessionId || !state.myParticipantId) return;

      try {
        await fetch(`/consumer/${appNameId}/chat/multiplayer/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sessionId: state.sessionId,
            participantId: state.myParticipantId,
          }),
        });
      } catch {
        // Best effort
      }

      wsDisconnect();
      this.reset();
    },

    /**
     * Get the share URL for the current session.
     */
    getShareUrl(appNameId: string): string | null {
      const state = get({ subscribe });
      if (!state.shareToken) return null;
      return `${window.location.origin}/consumer/${appNameId}/chat?session=${state.shareToken}`;
    },

    /**
     * Reset store to initial state.
     */
    reset(): void {
      unsubscribers.forEach((fn) => fn());
      unsubscribers = [];
      this._observerAssistantId = null;
      this._observerText = "";
      this._observerPendingTools = new Map();
      set(initialState);
    },
  };
}

export const multiplayerChat = createMultiplayerStore();

// ========================================
// Derived Stores
// ========================================

export const isMultiplayer = derived(multiplayerChat, ($s) => $s.isMultiplayer);
export const shareToken = derived(multiplayerChat, ($s) => $s.shareToken);
export const participants = derived(multiplayerChat, ($s) => $s.participants);
export const activeParticipants = derived(multiplayerChat, ($s) =>
  $s.participants.filter((p) => p.isActive)
);
export const inactiveParticipants = derived(multiplayerChat, ($s) =>
  $s.participants
    .filter((p) => !p.isActive)
    .sort((a, b) => {
      // Most recently left first
      const aTime = a.leftAt ? new Date(a.leftAt).getTime() : 0;
      const bTime = b.leftAt ? new Date(b.leftAt).getTime() : 0;
      return bTime - aTime;
    })
);
export const myParticipantId = derived(multiplayerChat, ($s) => $s.myParticipantId);
export const aiResponding = derived(multiplayerChat, ($s) => $s.aiResponding);
export const multiplayerError = derived(multiplayerChat, ($s) => $s.error);
export const isJoining = derived(multiplayerChat, ($s) => $s.joining);

export const typingNames = derived(multiplayerChat, ($s) => {
  const names: string[] = [];
  $s.typingParticipants.forEach(({ displayName }) => names.push(displayName));
  return names;
});
