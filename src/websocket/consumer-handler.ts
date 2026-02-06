/**
 * Consumer WebSocket Handler
 *
 * Manages WebSocket connections for multiplayer chat sessions.
 * Uses session-based routing (not user-based like the builder WS).
 *
 * Auth: validates consumer session cookie OR anonymous_token
 * against session_participants table.
 */

import * as Sentry from "@sentry/deno";
import type {
  ConsumerWebSocketEvent,
  ConsumerClientAction,
  ConsumerWsClient,
} from "./consumer-types.ts";
import { db } from "../db/client.ts";

// ========================================
// Connection Registry
// ========================================

// Map of sessionId -> Set<ConsumerWsClient>
const sessionConnections = new Map<string, Set<ConsumerWsClient>>();

let totalConsumerConnections = 0;

export function getConsumerConnectionCount(): number {
  return totalConsumerConnections;
}

export function getSessionConnectionCount(sessionId: string): number {
  return sessionConnections.get(sessionId)?.size ?? 0;
}

// ========================================
// Authentication
// ========================================

interface ConsumerWsAuth {
  sessionId: string;
  participantId: string;
  displayName: string;
}

/**
 * Validate consumer WS connection by checking session_participants.
 * Accepts either a consumer session ID (cookie) or anonymous token.
 * The cookieSessionId is extracted from the httpOnly cookie on the WS upgrade request.
 */
async function authenticateConsumer(
  chatSessionId: string,
  token: string,
  cookieSessionId?: string
): Promise<ConsumerWsAuth | null> {
  try {
    // Try as consumer session first - use cookie session ID if available, fall back to token
    const sessionIdToCheck = cookieSessionId || token;
    const consumerSession = await db
      .selectFrom("app.consumer_sessions")
      .select(["consumerId"])
      .where("id", "=", sessionIdToCheck)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst();

    if (consumerSession) {
      // Find participant by consumerId
      const participant = await db
        .selectFrom("chat.session_participants")
        .select(["id", "displayName"])
        .where("sessionId", "=", chatSessionId)
        .where("consumerId", "=", consumerSession.consumerId)
        .where("isActive", "=", true)
        .executeTakeFirst();

      if (participant) {
        return {
          sessionId: chatSessionId,
          participantId: participant.id,
          displayName: participant.displayName,
        };
      }
    }

    // Try as anonymous token
    const anonParticipant = await db
      .selectFrom("chat.session_participants")
      .select(["id", "displayName"])
      .where("sessionId", "=", chatSessionId)
      .where("anonymousToken", "=", token)
      .where("isActive", "=", true)
      .executeTakeFirst();

    if (anonParticipant) {
      return {
        sessionId: chatSessionId,
        participantId: anonParticipant.id,
        displayName: anonParticipant.displayName,
      };
    }

    // Try as session owner (single-player sessions without participants)
    // This allows consumer WS connections for takeover event delivery
    if (consumerSession) {
      const ownedSession = await db
        .selectFrom("chat.sessions")
        .select(["id"])
        .where("id", "=", chatSessionId)
        .where("consumerId", "=", consumerSession.consumerId)
        .executeTakeFirst();

      if (ownedSession) {
        return {
          sessionId: chatSessionId,
          participantId: consumerSession.consumerId,
          displayName: "Consumer",
        };
      }
    }

    // Anonymous single-player sessions: no consumer session, no participants.
    // The session ID itself acts as the auth secret — only the consumer who
    // created it knows it. Verify the session exists and allow the connection
    // so takeover events can be delivered.
    const session = await db
      .selectFrom("chat.sessions")
      .select(["id", "isMultiplayer"])
      .where("id", "=", chatSessionId)
      .executeTakeFirst();

    if (session && !session.isMultiplayer) {
      return {
        sessionId: chatSessionId,
        participantId: `anon-${token}`,
        displayName: "Anonymous",
      };
    }

    return null;
  } catch (error) {
    console.error("[consumer-ws] Auth error:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "websocket", feature: "consumer", operation: "auth" },
      extra: { chatSessionId },
    });
    return null;
  }
}

// ========================================
// Message Sending
// ========================================

function sendToConsumerClient(
  client: ConsumerWsClient,
  event: ConsumerWebSocketEvent
): boolean {
  try {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(event));
      return true;
    }
  } catch (error) {
    console.error("[consumer-ws] Error sending to client:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "websocket", feature: "consumer", operation: "send" },
      extra: { sessionId: client.sessionId, participantId: client.participantId },
    });
  }
  return false;
}

/**
 * Send event to all participants in a session, optionally excluding one.
 */
export function sendToSession(
  sessionId: string,
  event: ConsumerWebSocketEvent,
  excludeParticipantId?: string
): number {
  const clients = sessionConnections.get(sessionId);
  if (!clients) return 0;

  let sent = 0;
  for (const client of clients) {
    if (excludeParticipantId && client.participantId === excludeParticipantId) {
      continue;
    }
    if (sendToConsumerClient(client, event)) {
      sent++;
    }
  }
  return sent;
}

// ========================================
// Client Action Handlers
// ========================================

async function handleConsumerAction(
  client: ConsumerWsClient,
  action: ConsumerClientAction
): Promise<void> {
  switch (action.action) {
    case "ping":
      sendToConsumerClient(client, {
        type: "pong",
        sessionId: client.sessionId,
      });
      break;

    case "stop": {
      if (action.sessionId !== client.sessionId) break;
      try {
        const { multiplayerService } = await import(
          "../services/multiplayer.service.ts"
        );
        const aborted = multiplayerService.abortActiveStream(action.sessionId);
        if (aborted) {
          sendToSession(action.sessionId, {
            type: "multiplayer:ai_stopped",
            sessionId: action.sessionId,
            stoppedBy: client.participantId,
          });
        }
      } catch (error) {
        console.error("[consumer-ws] Stop error:", error);
        Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { source: "websocket", feature: "consumer", operation: "stop" },
          extra: { sessionId: client.sessionId, participantId: client.participantId },
        });
      }
      break;
    }

    case "typing_start":
      if (action.sessionId !== client.sessionId) break;
      sendToSession(
        action.sessionId,
        {
          type: "multiplayer:typing",
          sessionId: action.sessionId,
          participantId: client.participantId,
          displayName: client.displayName,
          isTyping: true,
        },
        client.participantId
      );
      break;

    case "typing_stop":
      if (action.sessionId !== client.sessionId) break;
      sendToSession(
        action.sessionId,
        {
          type: "multiplayer:typing",
          sessionId: action.sessionId,
          participantId: client.participantId,
          displayName: client.displayName,
          isTyping: false,
        },
        client.participantId
      );
      break;

    case "visibility_change": {
      if (action.sessionId !== client.sessionId) break;
      notifyConsumerPresence(
        client.sessionId,
        action.visible ? "active" : "away"
      ).catch(() => {});
      break;
    }

    default:
      console.warn("[consumer-ws] Unknown action:", action);
  }
}

// ========================================
// Connection Lifecycle
// ========================================

async function handleConsumerConnection(
  socket: WebSocket,
  chatSessionId: string,
  token: string,
  cookieSessionId?: string
): Promise<void> {
  const auth = await authenticateConsumer(chatSessionId, token, cookieSessionId);

  if (!auth) {
    socket.close(4001, "Invalid session or token");
    return;
  }

  const client: ConsumerWsClient = {
    socket,
    sessionId: auth.sessionId,
    participantId: auth.participantId,
    displayName: auth.displayName,
    connectedAt: new Date(),
  };

  // Register connection
  if (!sessionConnections.has(auth.sessionId)) {
    sessionConnections.set(auth.sessionId, new Set());
  }
  sessionConnections.get(auth.sessionId)!.add(client);
  totalConsumerConnections++;

  console.log(
    `[consumer-ws] Participant ${auth.displayName} connected to session ${auth.sessionId} (total: ${totalConsumerConnections})`
  );

  // Update last_seen_at
  db.updateTable("chat.session_participants")
    .set({ lastSeenAt: new Date() })
    .where("id", "=", auth.participantId)
    .execute()
    .catch(() => {});

  // Send current participant list
  try {
    const participants = await db
      .selectFrom("chat.session_participants")
      .select([
        "id",
        "displayName",
        "avatarColor",
        "isAnonymous",
        "isActive",
        "joinedAt",
      ])
      .where("sessionId", "=", auth.sessionId)
      .where("isActive", "=", true)
      .execute();

    sendToConsumerClient(client, {
      type: "multiplayer:participants",
      sessionId: auth.sessionId,
      participants: participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
        isAnonymous: p.isAnonymous,
        isActive: p.isActive,
        joinedAt: p.joinedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[consumer-ws] Failed to send participant list:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "websocket", feature: "consumer", operation: "participant-list" },
      extra: { sessionId: auth.sessionId, participantId: auth.participantId },
    });
  }

  // Handle incoming messages
  socket.onmessage = (e) => {
    try {
      const action = JSON.parse(e.data) as ConsumerClientAction;
      handleConsumerAction(client, action);
    } catch (error) {
      console.error("[consumer-ws] Error parsing message:", error);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { source: "websocket", feature: "consumer", operation: "message-parse" },
        extra: { sessionId: auth.sessionId, participantId: auth.participantId },
      });
    }
  };

  // Handle disconnect
  socket.onclose = () => {
    const clients = sessionConnections.get(auth.sessionId);
    let lastConsumerLeft = false;
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        sessionConnections.delete(auth.sessionId);
        lastConsumerLeft = true;
      }
    }
    totalConsumerConnections--;

    console.log(
      `[consumer-ws] Participant ${auth.displayName} disconnected from session ${auth.sessionId} (total: ${totalConsumerConnections})`
    );

    // Notify other consumers in the session
    sendToSession(auth.sessionId, {
      type: "multiplayer:participant_left",
      sessionId: auth.sessionId,
      participantId: auth.participantId,
      displayName: auth.displayName,
    });

    // If no consumers remain, notify builders and end session
    if (lastConsumerLeft) {
      notifyConsumerDisconnected(auth.sessionId).catch(() => {});
    }
  };

  // Handle errors
  socket.onerror = (e) => {
    console.error(
      `[consumer-ws] Socket error for ${auth.displayName}:`,
      e
    );
    Sentry.captureMessage(`Consumer WebSocket error for ${auth.displayName}`, {
      level: "error",
      tags: { source: "websocket", feature: "consumer", operation: "socket-error" },
      extra: { sessionId: auth.sessionId, participantId: auth.participantId, displayName: auth.displayName },
    });
  };
}

// ========================================
// Builder Notification Helpers
// ========================================

/**
 * Look up org members for a session's application and publish an event to each.
 */
async function notifyBuildersForSession(
  sessionId: string,
  makeEvent: (applicationId: string) => import("./types.ts").WebSocketEvent
): Promise<void> {
  const session = await db
    .selectFrom("chat.sessions")
    .select(["applicationId"])
    .where("id", "=", sessionId)
    .executeTakeFirst();

  if (!session) return;

  const app = await db
    .selectFrom("app.applications")
    .select(["organizationId"])
    .where("id", "=", session.applicationId)
    .executeTakeFirst();

  if (!app?.organizationId) return;

  const { publishToUser } = await import("./pubsub.ts");
  const orgMembers = await db
    .selectFrom("app.workspace_members as wm")
    .innerJoin("app.workspaces as w", "w.id", "wm.workspaceId")
    .select(["wm.userId"])
    .where("w.organizationId", "=", app.organizationId)
    .execute();

  const event = makeEvent(session.applicationId);
  for (const member of orgMembers) {
    publishToUser(member.userId, event).catch(() => {});
  }
}

/**
 * Notify builders that the last consumer disconnected from a session.
 * Also ends the session activity so it no longer shows as "live".
 */
async function notifyConsumerDisconnected(sessionId: string): Promise<void> {
  try {
    const { chatService } = await import("../services/chat.service.ts");

    // End session activity (sets endedAt, clears lastActivityAt)
    chatService.endSession(sessionId).catch(() => {});

    // Notify all org builders
    await notifyBuildersForSession(sessionId, (applicationId) => ({
      type: "consumer:disconnected" as const,
      sessionId,
      applicationId,
    }));
  } catch (error) {
    console.error("[consumer-ws] Failed to notify disconnect:", error);
  }
}

/**
 * Notify builders about consumer presence change (tab focus/unfocus).
 */
async function notifyConsumerPresence(
  sessionId: string,
  status: "active" | "away"
): Promise<void> {
  try {
    // If consumer came back, also refresh session activity
    if (status === "active") {
      const { chatService } = await import("../services/chat.service.ts");
      chatService.updateSessionActivity(sessionId).catch(() => {});
    }

    await notifyBuildersForSession(sessionId, (applicationId) => ({
      type: "consumer:presence" as const,
      sessionId,
      applicationId,
      status,
    }));
  } catch (error) {
    console.error("[consumer-ws] Failed to notify presence:", error);
  }
}

// ========================================
// Upgrade Handler
// ========================================

/**
 * Upgrade HTTP request to consumer WebSocket.
 * Query params: session (chat session ID), token (consumer session ID or anon token)
 */
export function upgradeConsumerWebSocket(req: Request): Response | null {
  if (req.headers.get("upgrade") !== "websocket") {
    return null;
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  const token = url.searchParams.get("token");

  if (!sessionId || !token) {
    return new Response("session and token required", { status: 400 });
  }

  // Extract consumer session cookie from the upgrade request (httpOnly cookie)
  let cookieSessionId: string | undefined;
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/consumer_session_id=([^;]+)/);
    if (match) {
      cookieSessionId = decodeURIComponent(match[1]);
    }
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    handleConsumerConnection(socket, sessionId, token, cookieSessionId).catch((error) => {
      console.error("[consumer-ws] Connection error:", error);
      Sentry.captureException(error, {
        tags: { source: "consumer-websocket", feature: "connection" },
      });
      socket.close(4000, "Connection error");
    });
  };

  return response;
}

/**
 * Get consumer WebSocket health info.
 */
export function getConsumerWebSocketHealth(): {
  totalConnections: number;
  activeSessions: number;
} {
  return {
    totalConnections: totalConsumerConnections,
    activeSessions: sessionConnections.size,
  };
}
