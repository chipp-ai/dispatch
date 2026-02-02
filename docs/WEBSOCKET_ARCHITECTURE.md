# WebSocket Architecture

Real-time bidirectional communication for the Chipp Deno application.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (Svelte App)                         │
│                                                                   │
│   WebSocket Store ────────────────────────────────────────────►  │
│   • Auto-reconnect with exponential backoff                      │
│   • Token refresh before expiry                                  │
│   • Page visibility / network event handling                     │
│   • Cross-device event sync                                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ WSS (token in query param)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Deno Server                                 │
│                                                                   │
│   /auth/ws-token ─────► Issues JWT (HMAC-SHA256, 5min TTL)       │
│   /ws?token=xxx  ─────► WebSocket upgrade, validates token        │
│                                                                   │
│   websocket/                                                      │
│   ├── handler.ts   ─► Connection registry, message routing       │
│   ├── pubsub.ts    ─► Redis pub/sub for multi-pod support        │
│   └── types.ts     ─► Event and action type definitions          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Redis Pub/Sub
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Redis                                        │
│                                                                   │
│   ws:user:{userId}  ─► User-specific event channel               │
│   ws:broadcast      ─► System-wide broadcast channel             │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

### 1. Token Issuance

The frontend requests a short-lived WebSocket token from the session-authenticated endpoint:

```typescript
// Frontend: Request token
const response = await fetch("/auth/ws-token", {
  credentials: "include", // Send session cookie
});
const { token, expiresIn } = await response.json();
```

```typescript
// Backend: auth.ts
auth.get("/ws-token", sessionAuthMiddleware, async (c) => {
  const user = c.get("user");

  const token = await new SignJWT({
    email: user.email,
    orgId: user.organizationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m") // Short-lived for security
    .sign(JWT_SECRET);

  return c.json({ token, expiresIn: 300 });
});
```

### 2. WebSocket Connection

The token is passed in the query string when opening the WebSocket:

```typescript
// Frontend
const wsUrl = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
const socket = new WebSocket(wsUrl);
```

```typescript
// Backend: handler.ts
export function upgradeWebSocket(req: Request): Response | null {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token required", { status: 401 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    handleConnection(socket, token);
  };

  return response;
}
```

### 3. Token Verification

The server verifies the token using HMAC-SHA256:

```typescript
// Backend: handler.ts
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(Deno.env.get("NEXTAUTH_SECRET"));

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
    console.warn("[ws] Token verification failed:", error.message);
    return null;
  }
}
```

### Security Considerations

- **Short TTL (5 minutes)**: Limits window of token reuse if compromised
- **HMAC-SHA256**: Production-ready signing algorithm (not base64 encoding)
- **Same secret as session**: Uses `NEXTAUTH_SECRET` for consistency
- **Token refresh**: Client refreshes token 1 minute before expiry
- **No token in headers**: Query param avoids CORS preflight issues

## Reconnection Logic

The WebSocket store handles all reconnection scenarios automatically:

### Exponential Backoff

```typescript
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

function scheduleReconnect(): void {
  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );

  setTimeout(() => connect(), delay);
}
```

### Page Visibility

Reconnects when user returns to tab:

```typescript
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && user && disconnected) {
    connect();
  }
});
```

### Network Events

Reconnects when network comes back online:

```typescript
window.addEventListener("online", () => {
  if (user && disconnected) {
    connect();
  }
});
```

### Token Refresh

Refreshes token before expiry to maintain connection:

```typescript
const TOKEN_REFRESH_BUFFER = 60000; // 1 minute before expiry

function scheduleTokenRefresh(expiresInMs: number) {
  const refreshIn = Math.max(expiresInMs - TOKEN_REFRESH_BUFFER, 0);

  setTimeout(async () => {
    if (connected) {
      const newToken = await getToken();
      disconnect();
      await connect(); // Reconnect with new token
    }
  }, refreshIn);
}
```

## Event System

### Event Types

```typescript
// Server → Client
interface WebSocketEvent {
  type: string;
  [key: string]: unknown;
}

interface JobCompletedEvent extends WebSocketEvent {
  type: "job:completed";
  jobId: string;
  result: {
    type?: string;
    knowledgeSourceId?: string;
    chunkCount?: number;
  };
}

interface JobFailedEvent extends WebSocketEvent {
  type: "job:failed";
  jobId: string;
  error: string;
}

interface JobProgressEvent extends WebSocketEvent {
  type: "job:progress";
  jobId: string;
  percent: number;
  message: string;
}

// System notifications
interface SystemNotificationEvent extends WebSocketEvent {
  type: "system:notification";
  title: string;
  body: string;
  severity: "info" | "warning" | "error" | "success";
}
```

### Client Actions

```typescript
// Client → Server
type ClientAction =
  | { action: "ping" }
  | { action: "subscribe"; channel: string }
  | { action: "unsubscribe"; channel: string }
  | { action: "takeover"; sessionId: string; mode: "human" | "hybrid" }
  | { action: "release"; sessionId: string }
  | { action: "send_message"; sessionId: string; content: string };
```

### Subscription Pattern

Frontend subscribes to specific event types:

```typescript
import { subscribe } from "$stores/websocket";

// Subscribe to job completion events
const unsubscribe = subscribe("job:completed", (event) => {
  console.log("Job completed:", event.jobId, event.result);
});

// Cleanup on component destroy
onDestroy(() => unsubscribe());

// Subscribe to all events (wildcard)
subscribe("*", (event) => {
  console.log("Any event:", event);
});
```

## Redis Pub/Sub (Multi-Pod Support)

For horizontal scaling, events are distributed via Redis:

### Publishing Events

```typescript
// pubsub.ts
export async function publishToUser(
  userId: string,
  event: WebSocketEvent
): Promise<void> {
  const channel = `ws:user:${userId}`;
  await redis.publish(
    channel,
    JSON.stringify({
      userId,
      event,
    })
  );
}

export async function broadcast(event: WebSocketEvent): Promise<void> {
  await redis.publish("ws:broadcast", JSON.stringify(event));
}
```

### Service Integration

```typescript
// rag-ingestion.service.ts
import { notifyJobCompleted, notifyJobFailed } from "../websocket/pubsub.ts";

// On successful processing
if (params.userId) {
  await notifyJobCompleted(params.userId, knowledgeSourceId, {
    type: "knowledge_source_processed",
    knowledgeSourceId,
    chunkCount: chunks.length,
  });
}

// On failure
if (params.userId) {
  await notifyJobFailed(params.userId, knowledgeSourceId, errorMessage);
}
```

### Subscription Handler

```typescript
// handler.ts
function handleRedisEvent(payload: EventPayload): void {
  sendToUser(payload.userId, payload.event);
}

function handleRedisBroadcast(event: WebSocketEvent): void {
  broadcast(event);
}

// On init
await startSubscription(handleRedisEvent, handleRedisBroadcast);
```

## Cross-Device Sync

The architecture supports cross-device notifications:

1. **User uploads file on desktop**
2. **Server processes file, emits `job:completed` event**
3. **Event published to Redis `ws:user:{userId}` channel**
4. **All pods subscribed to Redis receive event**
5. **Pod with user's mobile connection delivers event**
6. **Mobile UI updates showing upload complete**

```
Desktop                  Server Pod 1              Server Pod 2              Mobile
   │                          │                          │                      │
   │ Upload file              │                          │                      │
   ├─────────────────────────►│                          │                      │
   │                          │                          │                      │
   │                          │ Process + Redis publish  │                      │
   │                          ├─────────────────────────►│                      │
   │                          │                          │                      │
   │                          │                          │ Send to mobile conn  │
   │                          │                          ├─────────────────────►│
   │                          │                          │                      │
   │                          │                          │        job:completed │
   │                          │                          │◄─────────────────────┤
```

## Connection Registry

The server tracks all active connections:

```typescript
// Map of userId -> Set of connected clients
const connections = new Map<string, Set<ConnectedClient>>();

interface ConnectedClient {
  socket: WebSocket;
  userId: string;
  orgId?: string;
  subscriptions: Set<string>;
  connectedAt: Date;
}

// A user can have multiple connections (multiple tabs/devices)
function sendToUser(userId: string, event: WebSocketEvent): number {
  const userClients = connections.get(userId);
  if (!userClients) return 0;

  let sent = 0;
  for (const client of userClients) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(event));
      sent++;
    }
  }
  return sent;
}
```

## Health Monitoring

```typescript
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
```

## File Structure

```
apps/chipp-deno/
├── routes/
│   └── auth.ts              # /auth/ws-token endpoint
├── src/
│   └── websocket/
│       ├── handler.ts       # Connection lifecycle, message routing
│       ├── pubsub.ts        # Redis pub/sub for multi-pod
│       └── types.ts         # Event and action type definitions
└── web/
    └── src/
        └── stores/
            └── websocket.ts # Svelte store with reconnection logic
```

## Environment Variables

```bash
NEXTAUTH_SECRET=your-32-char-secret  # JWT signing secret
REDIS_URL=redis://localhost:6379     # Redis for pub/sub (optional)
```

## Usage Example

### Component Subscribing to Events

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { subscribe, wsState } from "$stores/websocket";

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = subscribe("job:completed", (event) => {
      if (event.result?.knowledgeSourceId === myKnowledgeSourceId) {
        // Update UI to show processing complete
        status = "completed";
        chunkCount = event.result.chunkCount;
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

{#if $wsState.connectionState === "connected"}
  <span class="text-green-500">Connected</span>
{:else if $wsState.connectionState === "reconnecting"}
  <span class="text-yellow-500">Reconnecting...</span>
{:else}
  <span class="text-red-500">Disconnected</span>
{/if}
```

### Sending Messages

```typescript
import { send } from "$stores/websocket";

// Ping the server
send({ action: "ping" });

// Subscribe to a channel
send({ action: "subscribe", channel: "app:123:events" });

// Take over a chat session
send({ action: "takeover", sessionId: "session-id", mode: "human" });
```
