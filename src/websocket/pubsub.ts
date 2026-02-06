/**
 * Redis Pub/Sub for WebSocket Events
 *
 * Enables cross-pod event distribution using Redis pub/sub.
 * When an event is published, all pods receive it and forward
 * to any connected clients that should receive it.
 */

import { connect, type Redis } from "redis";
import * as Sentry from "@sentry/deno";
import type { WebSocketEvent, EventPayload } from "./types.ts";

// Separate Redis connection for pub/sub (required by Redis)
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

const EVENTS_CHANNEL = "ws:events";
const BROADCAST_CHANNEL = "ws:broadcast";

type EventHandler = (payload: EventPayload) => void;
type BroadcastHandler = (event: WebSocketEvent) => void;

let eventHandler: EventHandler | null = null;
let broadcastHandler: BroadcastHandler | null = null;

/**
 * Initialize Redis pub/sub connections
 */
export async function initPubSub(): Promise<boolean> {
  const redisUrl = Deno.env.get("REDIS_URL");

  if (!redisUrl) {
    console.log("[pubsub] No REDIS_URL configured, skipping initialization");
    return false;
  }

  try {
    const url = new URL(redisUrl);
    const config = {
      hostname: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      maxRetryCount: 10,
    };

    // Create separate connections for pub and sub
    pubClient = await connect(config);
    subClient = await connect(config);

    console.log("[pubsub] Connected");
    return true;
  } catch (error) {
    console.error("[pubsub] Failed to initialize:", error);
    Sentry.captureException(error, {
      tags: { source: "websocket-pubsub", feature: "init" },
    });
    return false;
  }
}

/**
 * Start listening for events
 */
export async function startSubscription(
  onEvent: EventHandler,
  onBroadcast: BroadcastHandler
): Promise<void> {
  if (!subClient) {
    console.warn("[pubsub] Not initialized, cannot start subscription");
    return;
  }

  eventHandler = onEvent;
  broadcastHandler = onBroadcast;

  // Subscribe to channels
  const sub = await subClient.subscribe(EVENTS_CHANNEL, BROADCAST_CHANNEL);

  console.log("[pubsub] Subscribed to event channels");

  // Process incoming messages using .receive() async iterator
  (async () => {
    for await (const { channel, message } of sub.receive()) {
      try {
        if (channel === EVENTS_CHANNEL && eventHandler) {
          const payload = JSON.parse(message) as EventPayload;
          eventHandler(payload);
        } else if (channel === BROADCAST_CHANNEL && broadcastHandler) {
          const event = JSON.parse(message) as WebSocketEvent;
          broadcastHandler(event);
        }
      } catch (error) {
        console.error("[pubsub] Error processing message:", error);
        Sentry.captureException(error, {
          tags: { source: "websocket-pubsub", feature: "message-processing" },
          extra: { channel },
        });
      }
    }
  })();
}

/**
 * Publish an event to a specific user
 */
export async function publishToUser(
  userId: string,
  event: WebSocketEvent
): Promise<boolean> {
  // If Redis is available, publish through it (cross-pod delivery)
  if (pubClient) {
    try {
      const payload: EventPayload = { userId, event };
      await pubClient.publish(EVENTS_CHANNEL, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error("[pubsub] Error publishing event:", error);
      Sentry.captureException(error, {
        tags: { source: "websocket-pubsub", feature: "publish-event" },
        extra: { userId, eventType: event.type },
      });
      // Fall through to local delivery
    }
  }

  // Local delivery fallback (no Redis or Redis publish failed)
  try {
    const { localSendToUser } = await import("./handler.ts");
    const sent = localSendToUser(userId, event);
    return sent > 0;
  } catch (error) {
    console.error("[pubsub] Local delivery fallback failed:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "pubsub", feature: "local-delivery-fallback" },
      extra: { userId, eventType: event.type },
    });
    return false;
  }
}

/**
 * Publish an event to all connected clients
 */
export async function publishBroadcast(
  event: WebSocketEvent
): Promise<boolean> {
  if (!pubClient) {
    console.warn("[pubsub] Not initialized, cannot broadcast");
    return false;
  }

  try {
    await pubClient.publish(BROADCAST_CHANNEL, JSON.stringify(event));
    return true;
  } catch (error) {
    console.error("[pubsub] Error broadcasting event:", error);
    Sentry.captureException(error, {
      tags: { source: "websocket-pubsub", feature: "broadcast" },
      extra: { eventType: event.type },
    });
    return false;
  }
}

/**
 * Publish an event to all WebSocket clients in a multiplayer session.
 * Uses local delivery (consumer-handler's sendToSession).
 * For multi-pod, would route through Redis.
 */
export async function publishToSession(
  sessionId: string,
  event: unknown,
  excludeParticipantId?: string
): Promise<boolean> {
  try {
    const { sendToSession } = await import("./consumer-handler.ts");
    // deno-lint-ignore no-explicit-any
    const sent = sendToSession(sessionId, event as any, excludeParticipantId);
    return sent > 0;
  } catch (error) {
    console.error("[pubsub] Error publishing to session:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "pubsub", feature: "publish-session" },
      extra: { sessionId },
    });
    return false;
  }
}

/**
 * Publish to multiple users
 */
export async function publishToUsers(
  userIds: string[],
  event: WebSocketEvent
): Promise<void> {
  await Promise.all(userIds.map((userId) => publishToUser(userId, event)));
}

/**
 * Close pub/sub connections
 */
export async function closePubSub(): Promise<void> {
  try {
    if (subClient) {
      subClient.close();
      subClient = null;
    }
    if (pubClient) {
      pubClient.close();
      pubClient = null;
    }
    eventHandler = null;
    broadcastHandler = null;
    console.log("[pubsub] Disconnected");
  } catch (error) {
    console.error("[pubsub] Error closing connections:", error);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: "pubsub", feature: "close" },
    });
  }
}

/**
 * Check if pub/sub is connected
 */
export function isPubSubConnected(): boolean {
  return pubClient !== null && subClient !== null;
}

// ========================================
// Convenience Functions for Common Events
// ========================================

/**
 * Notify user about job progress
 */
export async function notifyJobProgress(
  userId: string,
  jobId: string,
  percent: number,
  message: string
): Promise<void> {
  await publishToUser(userId, {
    type: "job:progress",
    jobId,
    percent,
    message,
  });
}

/**
 * Notify user about job completion
 */
export async function notifyJobCompleted(
  userId: string,
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  await publishToUser(userId, {
    type: "job:completed",
    jobId,
    result,
  });
}

/**
 * Notify user about job failure
 */
export async function notifyJobFailed(
  userId: string,
  jobId: string,
  error: string
): Promise<void> {
  await publishToUser(userId, {
    type: "job:failed",
    jobId,
    error,
  });
}

/**
 * Notify about new conversation
 */
export async function notifyConversationStarted(
  userId: string,
  sessionId: string,
  appId: string,
  consumer: { id: string; name?: string; email?: string }
): Promise<void> {
  await publishToUser(userId, {
    type: "conversation:started",
    sessionId,
    appId,
    consumer,
  });
}

/**
 * Send system notification to user
 */
export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  severity: "info" | "warning" | "error" = "info"
): Promise<void> {
  await publishToUser(userId, {
    type: "system:notification",
    title,
    body,
    severity,
  });
}

/**
 * Broadcast system maintenance notice
 */
export async function broadcastMaintenance(
  message: string,
  scheduledAt: string
): Promise<void> {
  await publishBroadcast({
    type: "system:maintenance",
    message,
    scheduledAt,
  });
}
