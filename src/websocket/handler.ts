/**
 * WebSocket Connection Handler
 *
 * Manages WebSocket connections, authentication, and message routing.
 * Uses Deno's native WebSocket support.
 */

import { jwtVerify } from "jose";
import * as Sentry from "@sentry/deno";
import type {
  WebSocketEvent,
  ClientAction,
  ConnectedClient,
  EventPayload,
} from "./types.ts";
import {
  initPubSub,
  startSubscription,
  closePubSub,
  isPubSubConnected,
} from "./pubsub.ts";

// JWT secret for WebSocket token verification - must match auth.ts
const JWT_SECRET = new TextEncoder().encode(
  Deno.env.get("NEXTAUTH_SECRET") || "development-secret-must-be-32-chars!"
);

// ========================================
// Connection Registry
// ========================================

// Map of userId -> connected clients (a user can have multiple tabs/devices)
const connections = new Map<string, Set<ConnectedClient>>();

// Total connection count for metrics
let totalConnections = 0;

/**
 * Get connection count for a user
 */
export function getUserConnectionCount(userId: string): number {
  return connections.get(userId)?.size ?? 0;
}

/**
 * Get total connection count
 */
export function getTotalConnectionCount(): number {
  return totalConnections;
}

/**
 * Get all user IDs with active connections
 */
export function getConnectedUserIds(): string[] {
  return Array.from(connections.keys());
}

// ========================================
// Authentication
// ========================================

interface TokenPayload {
  sub: string;
  orgId?: string;
  exp?: number;
}

/**
 * Verify and decode a WebSocket auth token using HMAC-SHA256
 */
async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    return {
      sub: payload.sub as string,
      orgId: payload.orgId as string | undefined,
      exp: payload.exp,
    };
  } catch (error) {
    console.warn(
      "[ws] Token verification failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// ========================================
// Message Handlers
// ========================================

/**
 * Handle incoming client action
 */
async function handleClientAction(
  client: ConnectedClient,
  action: ClientAction
): Promise<void> {
  switch (action.action) {
    case "ping":
      sendToClient(client, {
        type: "system:notification",
        title: "pong",
        body: "",
        severity: "info",
      });
      break;

    case "subscribe":
      client.subscriptions.add(action.channel);
      console.log(`[ws] User ${client.userId} subscribed to ${action.channel}`);
      break;

    case "unsubscribe":
      client.subscriptions.delete(action.channel);
      console.log(
        `[ws] User ${client.userId} unsubscribed from ${action.channel}`
      );
      break;

    case "takeover": {
      // Handle conversation takeover
      const { sessionId, mode } = action;
      console.log(
        `[ws] User ${client.userId} taking over session ${sessionId} in ${mode} mode`
      );

      try {
        const { chatService } = await import("../services/chat.service.ts");
        const { publishToSession } = await import("./pubsub.ts");
        const { multiplayerService } = await import(
          "../services/multiplayer.service.ts"
        );
        const { db } = await import("../db/client.ts");

        // Get session (lightweight, no messages join)
        const session = await chatService.getSessionBasic(sessionId);
        if (!session) {
          throw new Error("Session not found");
        }

        // Verify user has access to this app
        await chatService.verifyAppAccess(session.applicationId, client.userId);

        // Abort any active AI stream
        multiplayerService.abortActiveStream(sessionId);

        // Get operator display name
        const userRow = await db
          .selectFrom("app.users")
          .select(["name", "email"])
          .where("id", "=", client.userId)
          .executeTakeFirst();
        const operatorName = userRow?.name || userRow?.email || "Support";

        // Update session mode in database
        await chatService.updateSessionMode(sessionId, mode, client.userId);

        // Notify consumer via session-based routing
        await publishToSession(sessionId, {
          type: "takeover:entered",
          sessionId,
          operatorName,
        });

        // Confirm to builder
        sendToClient(client, {
          type: "conversation:takeover",
          sessionId,
          takenOverBy: client.userId,
          mode,
        });
      } catch (error) {
        console.error(`[ws] Error handling takeover:`, error);
        Sentry.captureException(error, {
          tags: { source: "websocket-handler", feature: "takeover" },
          extra: { userId: client.userId, sessionId, mode },
        });
        sendToClient(client, {
          type: "system:notification",
          title: "Takeover failed",
          body: error instanceof Error ? error.message : "Unknown error",
          severity: "error",
        });
      }
      break;
    }

    case "release": {
      // Handle releasing conversation back to AI
      const { sessionId } = action;
      console.log(`[ws] User ${client.userId} releasing session ${sessionId}`);

      try {
        const { chatService } = await import("../services/chat.service.ts");
        const { publishToSession } = await import("./pubsub.ts");
        const { db } = await import("../db/client.ts");

        // Get operator display name
        const userRow = await db
          .selectFrom("app.users")
          .select(["name", "email"])
          .where("id", "=", client.userId)
          .executeTakeFirst();
        const operatorName = userRow?.name || userRow?.email || "Support";

        // Update session mode back to 'ai'
        await chatService.updateSessionMode(sessionId, "ai", null);

        // Notify consumer via session-based routing
        await publishToSession(sessionId, {
          type: "takeover:left",
          sessionId,
          operatorName,
        });

        // Confirm to builder
        sendToClient(client, {
          type: "conversation:takeover",
          sessionId,
          takenOverBy: null,
          mode: "ai",
        });
      } catch (error) {
        console.error(`[ws] Error handling release:`, error);
        Sentry.captureException(error, {
          tags: { source: "websocket-handler", feature: "release" },
          extra: { userId: client.userId, sessionId },
        });
        sendToClient(client, {
          type: "system:notification",
          title: "Release failed",
          body: error instanceof Error ? error.message : "Unknown error",
          severity: "error",
        });
      }
      break;
    }

    case "send_message": {
      // Handle builder sending message to consumer
      const { sessionId, content } = action;
      console.log(
        `[ws] User ${client.userId} sending message to session ${sessionId}`
      );

      try {
        const { chatService } = await import("../services/chat.service.ts");
        const { publishToSession, publishToUser } = await import("./pubsub.ts");
        const { db } = await import("../db/client.ts");

        // Get session (lightweight)
        const session = await chatService.getSessionBasic(sessionId);
        if (!session) {
          throw new Error("Session not found");
        }

        // Verify user has access to this app
        await chatService.verifyAppAccess(session.applicationId, client.userId);

        // Get operator display name
        const userRow = await db
          .selectFrom("app.users")
          .select(["name", "email"])
          .where("id", "=", client.userId)
          .executeTakeFirst();
        const operatorName = userRow?.name || userRow?.email || "Support";

        // Store message as assistant with model="human" to distinguish from AI
        const savedMsg = await chatService.addMessage(
          sessionId,
          "assistant",
          content,
          { model: "human" }
        );

        const timestamp = new Date().toISOString();

        // Notify consumer via session-based routing
        await publishToSession(sessionId, {
          type: "takeover:message",
          sessionId,
          content,
          operatorName,
          messageId: savedMsg.id,
          timestamp,
        });

        // Broadcast activity to other org members viewing the live panel
        const app = await db
          .selectFrom("app.applications")
          .select(["organizationId"])
          .where("id", "=", session.applicationId)
          .executeTakeFirst();

        if (app?.organizationId) {
          const orgMembers = await db
            .selectFrom("app.workspace_members as wm")
            .innerJoin("app.workspaces as w", "w.id", "wm.workspaceId")
            .select(["wm.userId"])
            .where("w.organizationId", "=", app.organizationId)
            .execute();

          for (const member of orgMembers) {
            if (member.userId !== client.userId) {
              publishToUser(member.userId, {
                type: "conversation:activity" as const,
                sessionId,
                applicationId: session.applicationId,
                messagePreview: content.slice(0, 120),
                timestamp,
              }).catch(() => {});
            }
          }
        }

        // Confirm to builder
        sendToClient(client, {
          type: "system:notification",
          title: "Message sent",
          body: "",
          severity: "info",
        });
      } catch (error) {
        console.error(`[ws] Error sending message:`, error);
        Sentry.captureException(error, {
          tags: { source: "websocket-handler", feature: "send-message" },
          extra: { userId: client.userId, sessionId },
        });
        sendToClient(client, {
          type: "system:notification",
          title: "Send failed",
          body: error instanceof Error ? error.message : "Unknown error",
          severity: "error",
        });
      }
      break;
    }

    default:
      console.warn(`[ws] Unknown action:`, action);
  }
}

/**
 * Send event to a specific client
 */
function sendToClient(client: ConnectedClient, event: WebSocketEvent): boolean {
  try {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(event));
      return true;
    }
  } catch (error) {
    console.error(`[ws] Error sending to client:`, error);
    Sentry.captureException(error, {
      tags: { source: "websocket-handler", feature: "send-to-client" },
      extra: { userId: client.userId, eventType: event.type },
    });
  }
  return false;
}

/**
 * Send event to all clients of a user (public wrapper for local delivery)
 */
export function localSendToUser(userId: string, event: WebSocketEvent): number {
  return sendToUser(userId, event);
}

/**
 * Send event to all clients of a user
 */
function sendToUser(userId: string, event: WebSocketEvent): number {
  const userClients = connections.get(userId);
  if (!userClients) return 0;

  let sent = 0;
  for (const client of userClients) {
    if (sendToClient(client, event)) {
      sent++;
    }
  }
  return sent;
}

/**
 * Send event to all connected clients
 */
function broadcast(event: WebSocketEvent): number {
  let sent = 0;
  for (const userClients of connections.values()) {
    for (const client of userClients) {
      if (sendToClient(client, event)) {
        sent++;
      }
    }
  }
  return sent;
}

// ========================================
// Connection Lifecycle
// ========================================

/**
 * Handle a new WebSocket connection
 */
async function handleConnection(
  socket: WebSocket,
  token: string
): Promise<void> {
  const payload = await verifyToken(token);

  if (!payload) {
    socket.close(4001, "Invalid or expired token");
    return;
  }

  const client: ConnectedClient = {
    socket,
    userId: payload.sub,
    orgId: payload.orgId,
    subscriptions: new Set(),
    connectedAt: new Date(),
  };

  // Register connection
  if (!connections.has(client.userId)) {
    connections.set(client.userId, new Set());
  }
  connections.get(client.userId)!.add(client);
  totalConnections++;

  console.log(
    `[ws] User ${client.userId} connected (total: ${totalConnections})`
  );

  // Handle incoming messages
  socket.onmessage = (e) => {
    try {
      const action = JSON.parse(e.data) as ClientAction;
      handleClientAction(client, action);
    } catch (error) {
      console.error(`[ws] Error parsing message:`, error);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: "websocket", feature: "message-parse" },
        extra: { userId: client.userId },
      });
    }
  };

  // Handle disconnect
  socket.onclose = () => {
    const userClients = connections.get(client.userId);
    if (userClients) {
      userClients.delete(client);
      if (userClients.size === 0) {
        connections.delete(client.userId);
      }
    }
    totalConnections--;
    console.log(
      `[ws] User ${client.userId} disconnected (total: ${totalConnections})`
    );
  };

  // Handle errors
  socket.onerror = (e) => {
    console.error(`[ws] Socket error for user ${client.userId}:`, e);
    Sentry.captureMessage(`WebSocket error for user ${client.userId}`, {
      level: "error",
      tags: { source: "websocket", feature: "socket-error" },
      extra: { userId: client.userId },
    });
  };
}

// ========================================
// Redis Event Handlers
// ========================================

/**
 * Handle event from Redis pub/sub (targeted to specific user)
 */
function handleRedisEvent(payload: EventPayload): void {
  sendToUser(payload.userId, payload.event);
}

/**
 * Handle broadcast event from Redis pub/sub
 */
function handleRedisBroadcast(event: WebSocketEvent): void {
  broadcast(event);
}

// ========================================
// Initialization
// ========================================

let initialized = false;

/**
 * Initialize WebSocket handler with Redis pub/sub
 */
export async function initWebSocket(): Promise<void> {
  if (initialized) return;

  // Initialize Redis pub/sub if available
  const pubsubReady = await initPubSub();

  if (pubsubReady) {
    await startSubscription(handleRedisEvent, handleRedisBroadcast);
    console.log("[ws] WebSocket handler initialized with Redis pub/sub");
  } else {
    console.log("[ws] WebSocket handler initialized (single-pod mode)");
  }

  initialized = true;
}

/**
 * Shutdown WebSocket handler
 */
export async function shutdownWebSocket(): Promise<void> {
  // Close all connections
  for (const userClients of connections.values()) {
    for (const client of userClients) {
      client.socket.close(1001, "Server shutting down");
    }
  }
  connections.clear();
  totalConnections = 0;

  // Close Redis connections
  await closePubSub();

  initialized = false;
  console.log("[ws] WebSocket handler shut down");
}

/**
 * Upgrade HTTP request to WebSocket
 */
export function upgradeWebSocket(req: Request): Response | null {
  // Check if this is a WebSocket upgrade request
  if (req.headers.get("upgrade") !== "websocket") {
    return null;
  }

  // Get token from query string
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token required", { status: 401 });
  }

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);

  // Handle connection asynchronously
  socket.onopen = () => {
    handleConnection(socket, token).catch((error) => {
      console.error("[ws] Error handling connection:", error);
      Sentry.captureException(error, {
        tags: { source: "websocket-handler", feature: "connection" },
      });
      socket.close(4000, "Connection error");
    });
  };

  return response;
}

/**
 * Check WebSocket health
 */
export function getWebSocketHealth(): {
  initialized: boolean;
  pubsubConnected: boolean;
  totalConnections: number;
  uniqueUsers: number;
} {
  return {
    initialized,
    pubsubConnected: isPubSubConnected(),
    totalConnections,
    uniqueUsers: connections.size,
  };
}
