/**
 * WebSocket Event Types
 *
 * All real-time events that can be pushed to connected clients.
 */

// ========================================
// Conversation Events
// ========================================

export interface ConversationStartedEvent {
  type: "conversation:started";
  sessionId: string;
  appId: string;
  consumer: {
    id: string;
    name?: string;
    email?: string;
  };
}

export interface ConsumerMessageEvent {
  type: "consumer:message";
  sessionId: string;
  content: string;
  timestamp: string;
}

export interface AIChunkEvent {
  type: "ai:chunk";
  sessionId: string;
  delta: string;
}

export interface AIToolCallEvent {
  type: "ai:tool_call";
  sessionId: string;
  toolName: string;
  toolId: string;
}

export interface AIToolResultEvent {
  type: "ai:tool_result";
  sessionId: string;
  toolId: string;
  result: unknown;
}

export interface ConsumerDisconnectedEvent {
  type: "consumer:disconnected";
  sessionId: string;
}

export interface ConversationTakeoverEvent {
  type: "conversation:takeover";
  sessionId: string;
  takenOverBy: string | null;
  mode: "ai" | "human" | "hybrid";
}

// ========================================
// Job Events (Temporal)
// ========================================

export interface JobStartedEvent {
  type: "job:started";
  jobId: string;
  jobType: string;
  metadata?: Record<string, unknown>;
}

export interface JobProgressEvent {
  type: "job:progress";
  jobId: string;
  percent: number;
  message: string;
}

export interface JobCompletedEvent {
  type: "job:completed";
  jobId: string;
  result: Record<string, unknown>;
}

export interface JobFailedEvent {
  type: "job:failed";
  jobId: string;
  error: string;
}

// ========================================
// Billing Events
// ========================================

export interface BillingUsageAlertEvent {
  type: "billing:usage_alert";
  threshold: number;
  current: number;
  percentage: number;
}

export interface BillingLimitReachedEvent {
  type: "billing:limit_reached";
  orgId: string;
}

export interface BillingCreditsLowEvent {
  type: "billing:credits_low";
  balance: number;
  threshold: number;
}

// ========================================
// System Events
// ========================================

export interface SystemNotificationEvent {
  type: "system:notification";
  title: string;
  body: string;
  severity: "info" | "warning" | "error";
}

export interface SystemMaintenanceEvent {
  type: "system:maintenance";
  message: string;
  scheduledAt: string;
}

// ========================================
// Union Type
// ========================================

export type WebSocketEvent =
  // Conversations
  | ConversationStartedEvent
  | ConsumerMessageEvent
  | AIChunkEvent
  | AIToolCallEvent
  | AIToolResultEvent
  | ConsumerDisconnectedEvent
  | ConversationTakeoverEvent
  // Jobs
  | JobStartedEvent
  | JobProgressEvent
  | JobCompletedEvent
  | JobFailedEvent
  // Billing
  | BillingUsageAlertEvent
  | BillingLimitReachedEvent
  | BillingCreditsLowEvent
  // System
  | SystemNotificationEvent
  | SystemMaintenanceEvent;

// ========================================
// Client Actions (messages from client)
// ========================================

export interface SubscribeAction {
  action: "subscribe";
  channel: string; // e.g., "app:123", "session:456"
}

export interface UnsubscribeAction {
  action: "unsubscribe";
  channel: string;
}

export interface TakeoverAction {
  action: "takeover";
  sessionId: string;
  mode: "human" | "hybrid";
}

export interface ReleaseAction {
  action: "release";
  sessionId: string;
}

export interface SendMessageAction {
  action: "send_message";
  sessionId: string;
  content: string;
}

export interface PingAction {
  action: "ping";
}

export type ClientAction =
  | SubscribeAction
  | UnsubscribeAction
  | TakeoverAction
  | ReleaseAction
  | SendMessageAction
  | PingAction;

// ========================================
// Internal Types
// ========================================

export interface ConnectedClient {
  socket: WebSocket;
  userId: string;
  orgId?: string;
  subscriptions: Set<string>;
  connectedAt: Date;
}

export interface EventPayload {
  userId: string;
  event: WebSocketEvent;
}
