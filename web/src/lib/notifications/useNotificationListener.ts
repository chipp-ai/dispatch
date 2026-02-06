/**
 * WebSocket Notification Listener
 *
 * Subscribes to "notification:push" WebSocket events and feeds them
 * into the notification toast store for real-time display.
 */

import { subscribe as wsSubscribe } from "../../stores/websocket";
import {
  notificationToasts,
  type NotificationCategory,
} from "../design-system/stores/notificationToast";

let cleanup: (() => void) | null = null;

/**
 * Start listening for notification:push WebSocket events.
 * Idempotent -- calling multiple times won't double-subscribe.
 * Returns a cleanup function.
 */
export function startNotificationListener(): () => void {
  if (cleanup) return cleanup;

  const unsub = wsSubscribe("notification:push", (event) => {
    notificationToasts.add({
      notificationType: (event.notificationType as string) || "unknown",
      category: (event.category as NotificationCategory) || "engagement",
      title: (event.title as string) || "Notification",
      body: (event.body as string) || "",
      data: (event.data as Record<string, unknown>) || {},
      actionUrl: event.actionUrl as string | undefined,
      actionLabel: event.actionLabel as string | undefined,
      duration: 8000,
    });
  });

  cleanup = () => {
    unsub();
    cleanup = null;
  };

  return cleanup;
}
