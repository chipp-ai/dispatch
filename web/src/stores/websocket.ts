/**
 * WebSocket Store
 *
 * Provides real-time communication with the server via WebSocket.
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Cross-device event sync (same user on multiple devices)
 * - Token refresh before expiry
 * - Event subscription system
 */

import { writable, get } from "svelte/store";
import { user } from "./auth";

// Connection states
type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// Event types from server
export interface WebSocketEvent {
  type: string;
  [key: string]: unknown;
}

export interface JobCompletedEvent extends WebSocketEvent {
  type: "job:completed";
  jobId: string;
  result: {
    type?: string;
    knowledgeSourceId?: string;
    chunkCount?: number;
    embeddingProvider?: string;
    embeddingModel?: string;
  };
}

export interface JobFailedEvent extends WebSocketEvent {
  type: "job:failed";
  jobId: string;
  error: string;
}

export interface JobProgressEvent extends WebSocketEvent {
  type: "job:progress";
  jobId: string;
  percent: number;
  message: string;
}

// Store state
interface WebSocketState {
  connectionState: ConnectionState;
  lastConnected: Date | null;
  reconnectAttempts: number;
}

// Event listeners
type EventListener = (event: WebSocketEvent) => void;
const listeners = new Map<string, Set<EventListener>>();

// Store
export const wsState = writable<WebSocketState>({
  connectionState: "disconnected",
  lastConnected: null,
  reconnectAttempts: 0,
});

// Internal state
let socket: WebSocket | null = null;
let token: string | null = null;
let tokenExpiresAt: number = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

// Reconnection config
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
const TOKEN_REFRESH_BUFFER = 60000; // Refresh 1 minute before expiry

/**
 * Get WebSocket token from server
 */
async function getToken(): Promise<string | null> {
  try {
    const response = await fetch("/auth/ws-token", {
      credentials: "include",
    });

    if (!response.ok) {
      console.warn("[ws-store] Failed to get token:", response.status);
      return null;
    }

    const data = await response.json();
    tokenExpiresAt = Date.now() + data.expiresIn * 1000;

    // Schedule token refresh
    scheduleTokenRefresh(data.expiresIn * 1000);

    return data.token;
  } catch (error) {
    console.error("[ws-store] Error getting token:", error);
    return null;
  }
}

/**
 * Schedule token refresh before expiry
 */
function scheduleTokenRefresh(expiresInMs: number) {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
  }

  const refreshIn = Math.max(expiresInMs - TOKEN_REFRESH_BUFFER, 0);

  tokenRefreshTimer = setTimeout(async () => {
    if (get(wsState).connectionState === "connected") {
      console.log("[ws-store] Refreshing token...");
      const newToken = await getToken();
      if (newToken) {
        token = newToken;
        // Reconnect with new token
        disconnect();
        await connect();
      }
    }
  }, refreshIn);
}

/**
 * Connect to WebSocket server
 */
export async function connect(): Promise<boolean> {
  const currentUser = get(user);
  if (!currentUser) {
    console.warn("[ws-store] Cannot connect: user not authenticated");
    return false;
  }

  const state = get(wsState);
  if (
    state.connectionState === "connected" ||
    state.connectionState === "connecting"
  ) {
    return true;
  }

  wsState.update((s) => ({ ...s, connectionState: "connecting" }));

  // Get fresh token
  token = await getToken();
  if (!token) {
    wsState.update((s) => ({ ...s, connectionState: "disconnected" }));
    return false;
  }

  return new Promise((resolve) => {
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws?token=${encodeURIComponent(token!)}`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("[ws-store] Connected");
        wsState.update((s) => ({
          ...s,
          connectionState: "connected",
          lastConnected: new Date(),
          reconnectAttempts: 0,
        }));
        resolve(true);
      };

      socket.onclose = (event) => {
        console.log("[ws-store] Disconnected:", event.code, event.reason);
        socket = null;

        const wasConnected = get(wsState).connectionState === "connected";
        wsState.update((s) => ({ ...s, connectionState: "disconnected" }));

        // Auto-reconnect if we were connected and user is still authenticated
        if (wasConnected && get(user)) {
          scheduleReconnect();
        }
      };

      socket.onerror = (error) => {
        console.error("[ws-store] Error:", error);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent;
          handleEvent(data);
        } catch (error) {
          console.error("[ws-store] Error parsing message:", error);
        }
      };
    } catch (error) {
      console.error("[ws-store] Error creating WebSocket:", error);
      wsState.update((s) => ({ ...s, connectionState: "disconnected" }));
      resolve(false);
    }
  });
}

/**
 * Disconnect from WebSocket server
 */
export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }

  if (socket) {
    socket.close(1000, "Client disconnect");
    socket = null;
  }

  wsState.update((s) => ({
    ...s,
    connectionState: "disconnected",
    reconnectAttempts: 0,
  }));
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(): void {
  const state = get(wsState);

  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn("[ws-store] Max reconnect attempts reached");
    return;
  }

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, state.reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  console.log(
    `[ws-store] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1})`
  );

  wsState.update((s) => ({
    ...s,
    connectionState: "reconnecting",
    reconnectAttempts: s.reconnectAttempts + 1,
  }));

  reconnectTimer = setTimeout(async () => {
    await connect();
  }, delay);
}

/**
 * Handle incoming WebSocket event
 */
function handleEvent(event: WebSocketEvent): void {
  console.log("[ws-store] Event received:", event.type, event);

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
 * Subscribe to WebSocket events
 * @param eventType - Event type to listen for, or "*" for all events
 * @param listener - Callback function
 * @returns Unsubscribe function
 */
export function subscribe(
  eventType: string,
  listener: EventListener
): () => void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }

  listeners.get(eventType)!.add(listener);

  // Return unsubscribe function
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
 * Send a message to the server
 */
export function send(action: {
  action: string;
  [key: string]: unknown;
}): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("[ws-store] Cannot send: not connected");
    return false;
  }

  socket.send(JSON.stringify(action));
  return true;
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
  return get(wsState).connectionState === "connected";
}

// Auto-connect when user logs in, disconnect on logout
user.subscribe((currentUser) => {
  if (currentUser && get(wsState).connectionState === "disconnected") {
    connect();
  } else if (!currentUser) {
    disconnect();
  }
});

// Handle page visibility changes - reconnect when page becomes visible
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && get(user)) {
      const state = get(wsState);
      if (state.connectionState === "disconnected") {
        console.log("[ws-store] Page visible, reconnecting...");
        connect();
      }
    }
  });

  // Handle online/offline events
  window.addEventListener("online", () => {
    if (get(user) && get(wsState).connectionState === "disconnected") {
      console.log("[ws-store] Network online, reconnecting...");
      connect();
    }
  });
}
