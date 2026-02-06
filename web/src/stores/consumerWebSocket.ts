/**
 * Consumer WebSocket Store
 *
 * WebSocket connection for consumer multiplayer chat.
 * Uses session-based auth (consumer session cookie or anonymous token).
 * Connects to /ws/consumer and dispatches events to the multiplayerChat store.
 *
 * Key differences from builder websocket.ts:
 * - Session-based routing (vs user-based)
 * - Consumer auth (session cookie or anonymous token, vs JWT)
 * - Dispatches multiplayer-specific events
 */

import { writable, get } from "svelte/store";
import { captureException } from "$lib/sentry";

// ========================================
// Types
// ========================================

type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface ConsumerWsEvent {
  type: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface ConsumerWsState {
  connectionState: ConnectionState;
  lastConnected: Date | null;
  reconnectAttempts: number;
}

type EventListener = (event: ConsumerWsEvent) => void;

// ========================================
// Store
// ========================================

export const consumerWsState = writable<ConsumerWsState>({
  connectionState: "disconnected",
  lastConnected: null,
  reconnectAttempts: 0,
});

// ========================================
// Internal State
// ========================================

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
const listeners = new Map<string, Set<EventListener>>();

// Connection params - set via connect()
let currentAppNameId: string | null = null;
let currentSessionId: string | null = null;
let currentToken: string | null = null;

// Reconnection config
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 25000; // 25 seconds

// ========================================
// Anonymous Token
// ========================================

const ANON_TOKEN_KEY = "multiplayer-anon-token";

export function getAnonymousToken(): string {
  if (typeof window === "undefined") return crypto.randomUUID();

  let token = localStorage.getItem(ANON_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(ANON_TOKEN_KEY, token);
  }
  return token;
}

// ========================================
// Connection Management
// ========================================

/**
 * Connect to the consumer WebSocket for a multiplayer session.
 */
export function connect(
  appNameId: string,
  sessionId: string,
  consumerSessionId?: string
): Promise<boolean> {
  const state = get(consumerWsState);
  if (state.connectionState === "connected" || state.connectionState === "connecting") {
    return Promise.resolve(true);
  }

  currentAppNameId = appNameId;
  currentSessionId = sessionId;
  currentToken = consumerSessionId || getAnonymousToken();

  consumerWsState.update((s) => ({ ...s, connectionState: "connecting" }));

  return new Promise((resolve) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/consumer?app=${encodeURIComponent(appNameId)}&session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(currentToken!)}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("[consumer-ws] Connected to session:", sessionId);
        consumerWsState.update((s) => ({
          ...s,
          connectionState: "connected",
          lastConnected: new Date(),
          reconnectAttempts: 0,
        }));

        // Start ping interval
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          send({ action: "ping" });
        }, PING_INTERVAL);

        resolve(true);
      };

      socket.onclose = (event) => {
        console.log("[consumer-ws] Disconnected:", event.code, event.reason);
        socket = null;
        clearPingInterval();

        const wasConnected = get(consumerWsState).connectionState === "connected";
        consumerWsState.update((s) => ({ ...s, connectionState: "disconnected" }));

        // Don't reconnect on auth failure (4001) or explicit client disconnect (1000)
        const noReconnectCodes = [1000, 4001, 4000];
        if (wasConnected && currentSessionId && !noReconnectCodes.includes(event.code)) {
          scheduleReconnect();
        }
      };

      socket.onerror = (error) => {
        captureException(new Error("Consumer WebSocket connection error"), { tags: { source: "consumer-websocket" }, extra: { event: error } });
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ConsumerWsEvent;
          handleEvent(data);
        } catch (error) {
          captureException(error, { tags: { source: "consumer-websocket" }, extra: { action: "parseMessage" } });
        }
      };
    } catch (error) {
      captureException(error, { tags: { source: "consumer-websocket" }, extra: { action: "createWebSocket" } });
      consumerWsState.update((s) => ({ ...s, connectionState: "disconnected" }));
      resolve(false);
    }
  });
}

/**
 * Disconnect from the consumer WebSocket.
 */
export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearPingInterval();

  if (socket) {
    socket.close(1000, "Client disconnect");
    socket = null;
  }

  currentAppNameId = null;
  currentSessionId = null;
  currentToken = null;

  consumerWsState.update((s) => ({
    ...s,
    connectionState: "disconnected",
    reconnectAttempts: 0,
  }));
}

function clearPingInterval(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

function scheduleReconnect(): void {
  const state = get(consumerWsState);

  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn("[consumer-ws] Max reconnect attempts reached");
    return;
  }

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, state.reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  console.log(
    `[consumer-ws] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1})`
  );

  consumerWsState.update((s) => ({
    ...s,
    connectionState: "reconnecting",
    reconnectAttempts: s.reconnectAttempts + 1,
  }));

  reconnectTimer = setTimeout(() => {
    if (currentAppNameId && currentSessionId) {
      connect(currentAppNameId, currentSessionId, currentToken || undefined);
    }
  }, delay);
}

// ========================================
// Event Handling
// ========================================

function handleEvent(event: ConsumerWsEvent): void {
  // Notify type-specific listeners
  const typeListeners = listeners.get(event.type);
  if (typeListeners) {
    typeListeners.forEach((listener) => listener(event));
  }

  // Notify wildcard listeners
  const wildcardListeners = listeners.get("*");
  if (wildcardListeners) {
    wildcardListeners.forEach((listener) => listener(event));
  }
}

/**
 * Subscribe to consumer WebSocket events.
 * @returns Unsubscribe function
 */
export function subscribe(eventType: string, listener: EventListener): () => void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }

  listeners.get(eventType)!.add(listener);

  return () => {
    const typeListeners = listeners.get(eventType);
    if (typeListeners) {
      typeListeners.delete(listener);
      if (typeListeners.size === 0) {
        listeners.delete(eventType);
      }
    }
  };
}

/**
 * Send a message to the server.
 */
export function send(action: { action: string; [key: string]: unknown }): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(JSON.stringify(action));
  return true;
}

/**
 * Send a typing indicator.
 */
export function sendTyping(isTyping: boolean): void {
  send({ action: isTyping ? "typing_start" : "typing_stop" });
}

/**
 * Send a stop signal to abort the AI response.
 */
export function sendStop(): void {
  send({ action: "stop" });
}

/**
 * Check if connected.
 */
export function isConnected(): boolean {
  return get(consumerWsState).connectionState === "connected";
}

// Handle page visibility - reconnect when page becomes visible, notify server of focus changes
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!currentSessionId) return;

    if (document.visibilityState === "visible") {
      const state = get(consumerWsState);
      if (state.connectionState === "disconnected") {
        console.log("[consumer-ws] Page visible, reconnecting...");
        if (currentAppNameId) {
          connect(currentAppNameId, currentSessionId, currentToken || undefined).then(() => {
            send({ action: "visibility_change", sessionId: currentSessionId!, visible: true });
          });
        }
      } else {
        // Already connected - just notify server we're back
        send({ action: "visibility_change", sessionId: currentSessionId, visible: true });
      }
    } else {
      // Tab hidden - notify server
      send({ action: "visibility_change", sessionId: currentSessionId, visible: false });
    }
  });
}
