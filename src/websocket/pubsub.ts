/**
 * Redis Pub/Sub for WebSocket Events
 *
 * Enables cross-pod event distribution using Redis pub/sub.
 * When an event is published, all pods receive it and forward
 * to any connected clients that should receive it.
 */

import { connect, type Redis } from "redis";
import { log } from "@/lib/logger.ts";
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
    log.info("No REDIS_URL configured, skipping pub/sub initialization", {
      source: "pubsub",
      feature: "init",
    });
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

    log.info("Pub/sub connected", { source: "pubsub", feature: "init" });
    return true;
  } catch (error) {
    log.error("Failed to initialize pub/sub", {
      source: "pubsub",
      feature: "init",
    }, error);
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
    log.warn("Pub/sub not initialized, cannot start subscription", {
      source: "pubsub",
      feature: "subscription",
    });
    return;
  }

  eventHandler = onEvent;
  broadcastHandler = onBroadcast;

  // Subscribe to channels
  const sub = await subClient.subscribe(EVENTS_CHANNEL, BROADCAST_CHANNEL);

  log.info("Subscribed to event channels", { source: "pubsub", feature: "subscription" });

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
        log.error("Error processing pub/sub message", {
          source: "pubsub",
          feature: "message-processing",
          channel,
        }, error);
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
      log.error("Error publishing event to Redis", {
        source: "pubsub",
        feature: "publish-event",
        userId,
        eventType: event.type,
      }, error);
      // Fall through to local delivery
    }
  }

  // Local delivery fallback (no Redis or Redis publish failed)
  try {
    const { localSendToUser } = await import("./handler.ts");
    const sent = localSendToUser(userId, event);
    return sent > 0;
  } catch (error) {
    log.error("Local delivery fallback failed", {
      source: "pubsub",
      feature: "local-delivery-fallback",
      userId,
      eventType: event.type,
    }, error);
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
    log.warn("Pub/sub not initialized, cannot broadcast", {
      source: "pubsub",
      feature: "broadcast",
    });
    return false;
  }

  try {
    await pubClient.publish(BROADCAST_CHANNEL, JSON.stringify(event));
    return true;
  } catch (error) {
    log.error("Error broadcasting event", {
      source: "pubsub",
      feature: "broadcast",
      eventType: event.type,
    }, error);
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
    log.error("Error publishing to session", {
      source: "pubsub",
      feature: "publish-session",
      sessionId,
    }, error);
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
    log.info("Pub/sub disconnected", { source: "pubsub", feature: "close" });
  } catch (error) {
    log.error("Error closing pub/sub connections", {
      source: "pubsub",
      feature: "close",
    }, error);
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
