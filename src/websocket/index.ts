/**
 * WebSocket Module
 *
 * Export all WebSocket-related components.
 */

// Types
export type {
  WebSocketEvent,
  ClientAction,
  ConnectedClient,
  EventPayload,
  // Event types
  ConversationStartedEvent,
  ConsumerMessageEvent,
  AIChunkEvent,
  AIToolCallEvent,
  AIToolResultEvent,
  ConsumerDisconnectedEvent,
  ConversationTakeoverEvent,
  JobStartedEvent,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  BillingUsageAlertEvent,
  BillingLimitReachedEvent,
  BillingCreditsLowEvent,
  SystemNotificationEvent,
  SystemMaintenanceEvent,
  // Action types
  SubscribeAction,
  UnsubscribeAction,
  TakeoverAction,
  ReleaseAction,
  SendMessageAction,
  PingAction,
} from "./types.ts";

// Handler
export {
  initWebSocket,
  shutdownWebSocket,
  upgradeWebSocket,
  getWebSocketHealth,
  getUserConnectionCount,
  getTotalConnectionCount,
  getConnectedUserIds,
} from "./handler.ts";

// Pub/Sub (for publishing events from anywhere in the app)
export {
  publishToUser,
  publishToUsers,
  publishBroadcast,
  isPubSubConnected,
  // Convenience functions
  notifyJobProgress,
  notifyJobCompleted,
  notifyJobFailed,
  notifyConversationStarted,
  notifyUser,
  broadcastMaintenance,
} from "./pubsub.ts";
