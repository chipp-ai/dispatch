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
  ConversationActivityEvent,
  JobStartedEvent,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  BillingUsageAlertEvent,
  BillingLimitReachedEvent,
  BillingCreditsLowEvent,
  NotificationPushEvent,
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
  localSendToUser,
} from "./handler.ts";

// Pub/Sub (for publishing events from anywhere in the app)
export {
  publishToUser,
  publishToUsers,
  publishBroadcast,
  publishToSession,
  isPubSubConnected,
  // Convenience functions
  notifyJobProgress,
  notifyJobCompleted,
  notifyJobFailed,
  notifyConversationStarted,
  notifyUser,
  broadcastMaintenance,
} from "./pubsub.ts";

// Consumer WebSocket (multiplayer chat)
export {
  upgradeConsumerWebSocket,
  getConsumerWebSocketHealth,
  sendToSession,
  getConsumerConnectionCount,
} from "./consumer-handler.ts";

// Consumer WS types
export type {
  ConsumerWebSocketEvent,
  ConsumerClientAction,
  ConsumerWsClient,
  ParticipantInfo,
} from "./consumer-types.ts";
