/**
 * Consumer WebSocket Event Types
 *
 * Events for multiplayer chat sessions. Separate from builder WS types
 * because consumer WS uses session-based routing (not user-based).
 */

// ========================================
// Server -> Client Events
// ========================================

export interface MultiplayerUserMessageEvent {
  type: "multiplayer:user_message";
  sessionId: string;
  messageId: string;
  content: string;
  participantId: string;
  displayName: string;
  avatarColor: string;
  timestamp: string;
}

export interface MultiplayerAiChunkEvent {
  type: "multiplayer:ai_chunk";
  sessionId: string;
  delta: string;
}

export interface MultiplayerAiToolCallEvent {
  type: "multiplayer:ai_tool_call";
  sessionId: string;
  toolCallId: string;
  toolName: string;
}

export interface MultiplayerAiToolResultEvent {
  type: "multiplayer:ai_tool_result";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export interface MultiplayerAiStartEvent {
  type: "multiplayer:ai_start";
  sessionId: string;
}

export interface MultiplayerAiFinishEvent {
  type: "multiplayer:ai_finish";
  sessionId: string;
  finishReason: string;
}

export interface MultiplayerAiStoppedEvent {
  type: "multiplayer:ai_stopped";
  sessionId: string;
  stoppedBy: string; // participantId
}

export interface MultiplayerParticipantJoinedEvent {
  type: "multiplayer:participant_joined";
  sessionId: string;
  participant: ParticipantInfo;
}

export interface MultiplayerParticipantLeftEvent {
  type: "multiplayer:participant_left";
  sessionId: string;
  participantId: string;
  displayName: string;
}

export interface MultiplayerTypingEvent {
  type: "multiplayer:typing";
  sessionId: string;
  participantId: string;
  displayName: string;
  isTyping: boolean;
}

export interface MultiplayerParticipantsEvent {
  type: "multiplayer:participants";
  sessionId: string;
  participants: ParticipantInfo[];
}

export interface TakeoverEnteredEvent {
  type: "takeover:entered";
  sessionId: string;
  operatorName: string;
}

export interface TakeoverLeftEvent {
  type: "takeover:left";
  sessionId: string;
  operatorName: string;
}

export interface TakeoverMessageEvent {
  type: "takeover:message";
  sessionId: string;
  content: string;
  operatorName: string;
  messageId: string;
  timestamp: string;
}

export interface PongEvent {
  type: "pong";
  sessionId: string;
}

// ========================================
// Shared Types
// ========================================

export interface ParticipantInfo {
  id: string;
  displayName: string;
  avatarColor: string;
  isAnonymous: boolean;
  isActive: boolean;
  joinedAt: string;
}

// ========================================
// Union Type
// ========================================

export type ConsumerWebSocketEvent =
  | MultiplayerUserMessageEvent
  | MultiplayerAiChunkEvent
  | MultiplayerAiToolCallEvent
  | MultiplayerAiToolResultEvent
  | MultiplayerAiStartEvent
  | MultiplayerAiFinishEvent
  | MultiplayerAiStoppedEvent
  | MultiplayerParticipantJoinedEvent
  | MultiplayerParticipantLeftEvent
  | MultiplayerTypingEvent
  | MultiplayerParticipantsEvent
  | TakeoverEnteredEvent
  | TakeoverLeftEvent
  | TakeoverMessageEvent
  | PongEvent;

// ========================================
// Client -> Server Actions
// ========================================

export interface ConsumerPingAction {
  action: "ping";
}

export interface ConsumerStopAction {
  action: "stop";
  sessionId: string;
}

export interface ConsumerTypingStartAction {
  action: "typing_start";
  sessionId: string;
}

export interface ConsumerTypingStopAction {
  action: "typing_stop";
  sessionId: string;
}

export interface ConsumerVisibilityChangeAction {
  action: "visibility_change";
  sessionId: string;
  visible: boolean;
}

export type ConsumerClientAction =
  | ConsumerPingAction
  | ConsumerStopAction
  | ConsumerTypingStartAction
  | ConsumerTypingStopAction
  | ConsumerVisibilityChangeAction;

// ========================================
// Internal Types
// ========================================

export interface ConsumerWsClient {
  socket: WebSocket;
  sessionId: string;
  participantId: string;
  displayName: string;
  connectedAt: Date;
}
