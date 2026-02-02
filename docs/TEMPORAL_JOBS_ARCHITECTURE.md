# Temporal Jobs Architecture for chipp-deno

Design document for running durable, long-running jobs (site crawling, document processing) from chipp-deno while keeping the codebase self-contained.

## Problem Statement

chipp-deno needs to:

1. Trigger long-running jobs (e.g., crawl 2,000 pages)
2. Provide real-time progress to the UI
3. Maintain durability across page refreshes and server restarts
4. Stay self-contained (no shared Node.js utilities from the monorepo)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              chipp-deno                                      │
│                                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│  │ Svelte SPA   │◄────►│ Deno API     │◄────►│ Redis (subscribe)        │  │
│  │ (WebSocket)  │      │ (Hono)       │      │ job:progress:{workflowId}│  │
│  └──────────────┘      └──────┬───────┘      └──────────────────────────┘  │
│                               │                                              │
└───────────────────────────────┼──────────────────────────────────────────────┘
                                │
                                │ HTTP POST (start job)
                                │ HTTP GET (query status)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            chipp-admin                                       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ /api/jobs/start                                                       │  │
│  │ • Validates request                                                   │  │
│  │ • Starts Temporal workflow via jobHelpers.startJob()                 │  │
│  │ • Returns workflowId                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ /api/jobs/[workflowId]/status                                        │  │
│  │ • Queries Temporal workflow progress                                  │  │
│  │ • Returns current state (for page refresh recovery)                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                │ Temporal SDK
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Temporal Server                                      │
│                                                                              │
│  Workflows persist state, retry on failure, survive restarts                │
│                                                                              │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                │ Executes activities
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      chipp-temporal-worker                                   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ siteCrawlerStreamWorkflow                                             │  │
│  │ • Crawls pages in batches                                             │  │
│  │ • Publishes progress to Redis ────────────────────────────────────►  │  │
│  │ • Saves results to database                                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                │
                                │ Redis PUBLISH
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Redis                                           │
│                                                                              │
│  job:progress:{workflowId}  ─► Progress events                              │
│  job:complete:{workflowId}  ─► Completion events                            │
│  job:error:{workflowId}     ─► Error events                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Start Job

```
User clicks "Crawl Site"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Svelte: POST /api/jobs/crawl                                │
│ Body: { url: "https://example.com", maxPages: 100 }         │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-deno API: Validate, then forward to chipp-admin       │
│ POST https://app.chipp.ai/api/jobs/start                    │
│ Body: { jobType: "URL_CRAWL", appId, url, options }         │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-admin: Start Temporal workflow                        │
│ Returns: { workflowId: "crawl-123-abc" }                    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-deno: Return workflowId to client                     │
│ Client subscribes to WebSocket for progress                 │
└─────────────────────────────────────────────────────────────┘
```

### 2. Real-Time Progress

```
Temporal workflow (siteCrawlerStreamWorkflow)
        │
        │ After each page crawled
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Activity: Publish to Redis                                   │
│ PUBLISH job:progress:{workflowId} {                         │
│   "phase": "crawling",                                       │
│   "progress": 45,                                            │
│   "pagesProcessed": 45,                                      │
│   "totalPages": 100,                                         │
│   "currentUrl": "https://example.com/page-45"               │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
        │
        │ Redis Pub/Sub
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-deno: Redis subscriber receives message               │
│ Routes to WebSocket connection for user                     │
└─────────────────────────────────────────────────────────────┘
        │
        │ WebSocket
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Svelte: Update progress UI                                   │
│ { type: "job:progress", workflowId, progress: 45, ... }     │
└─────────────────────────────────────────────────────────────┘
```

### 3. Page Refresh Recovery

```
User refreshes page
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Svelte: Check for active jobs in localStorage               │
│ If workflowId exists, fetch current status                  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-deno API: GET /api/jobs/{workflowId}/status           │
│ Forwards to chipp-admin: GET /api/jobs/{workflowId}/status  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ chipp-admin: Query Temporal workflow                        │
│ handle.query("getProgress")                                  │
│ Returns current state                                        │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ Svelte: Restore UI state from response                      │
│ Re-subscribe to WebSocket for remaining updates             │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### chipp-deno: API Endpoints

```typescript
// src/api/routes/jobs/index.ts
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.ts";

const jobs = new Hono();

// Start a new job
jobs.post("/crawl", authMiddleware, async (c) => {
  const { url, maxPages = 50, maxDepth = 3 } = await c.req.json();
  const user = c.get("user");
  const appId = c.get("appId");

  // Forward to chipp-admin
  const response = await fetch(`${CHIPP_ADMIN_URL}/api/jobs/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Pass auth context
      "X-Internal-Auth": INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      jobType: "URL_CRAWL",
      appNameId: `app-${appId}`,
      sessionUserEmail: user.email,
      input: {
        rootUrl: url,
        options: { maxPages, maxDepth },
      },
    }),
  });

  const { workflowId } = await response.json();

  // Subscribe to Redis channel for this workflow
  await subscribeToJobProgress(workflowId, user.id);

  return c.json({ workflowId, status: "started" });
});

// Get job status (for recovery after refresh)
jobs.get("/:workflowId/status", authMiddleware, async (c) => {
  const { workflowId } = c.req.param();

  const response = await fetch(
    `${CHIPP_ADMIN_URL}/api/jobs/${workflowId}/status`,
    {
      headers: { "X-Internal-Auth": INTERNAL_API_KEY },
    }
  );

  return c.json(await response.json());
});

// Cancel a running job
jobs.post("/:workflowId/cancel", authMiddleware, async (c) => {
  const { workflowId } = c.req.param();

  const response = await fetch(
    `${CHIPP_ADMIN_URL}/api/jobs/${workflowId}/cancel`,
    {
      method: "POST",
      headers: { "X-Internal-Auth": INTERNAL_API_KEY },
    }
  );

  return c.json(await response.json());
});

export default jobs;
```

### chipp-deno: Redis Subscription for Job Progress

```typescript
// src/websocket/jobProgress.ts
import { Redis } from "ioredis";
import { sendToUser } from "./handler.ts";

const redis = new Redis(Deno.env.get("REDIS_URL"));
const subscriber = redis.duplicate();

// Track which users are watching which workflows
const workflowSubscribers = new Map<string, Set<string>>(); // workflowId -> Set<userId>

export async function subscribeToJobProgress(
  workflowId: string,
  userId: string
): Promise<void> {
  // Track the subscription
  if (!workflowSubscribers.has(workflowId)) {
    workflowSubscribers.set(workflowId, new Set());

    // Subscribe to Redis channel
    await subscriber.subscribe(`job:progress:${workflowId}`);
  }
  workflowSubscribers.get(workflowId)!.add(userId);
}

export function unsubscribeFromJobProgress(
  workflowId: string,
  userId: string
): void {
  const subscribers = workflowSubscribers.get(workflowId);
  if (subscribers) {
    subscribers.delete(userId);
    if (subscribers.size === 0) {
      workflowSubscribers.delete(workflowId);
      subscriber.unsubscribe(`job:progress:${workflowId}`);
    }
  }
}

// Handle incoming Redis messages
subscriber.on("message", (channel: string, message: string) => {
  const workflowId = channel.replace("job:progress:", "");
  const subscribers = workflowSubscribers.get(workflowId);

  if (subscribers) {
    const event = JSON.parse(message);
    for (const userId of subscribers) {
      sendToUser(userId, {
        type: "job:progress",
        workflowId,
        ...event,
      });
    }

    // Auto-unsubscribe on completion
    if (event.phase === "complete" || event.phase === "failed") {
      workflowSubscribers.delete(workflowId);
      subscriber.unsubscribe(channel);
    }
  }
});
```

### chipp-deno: Svelte Store

```typescript
// web/src/stores/jobProgress.ts
import { writable, derived } from "svelte/store";
import { subscribe as wsSubscribe, send } from "./websocket";

interface JobProgress {
  workflowId: string;
  phase: "initializing" | "crawling" | "indexing" | "complete" | "failed";
  progress: number;
  pagesProcessed?: number;
  totalPages?: number;
  currentUrl?: string;
  error?: string;
  crawledPages?: Array<{
    url: string;
    success: boolean;
    title?: string;
  }>;
}

// Store for tracking active jobs
const activeJobs = writable<Map<string, JobProgress>>(new Map());

// Subscribe to job progress events from WebSocket
wsSubscribe("job:progress", (event) => {
  activeJobs.update((jobs) => {
    jobs.set(event.workflowId, event as JobProgress);
    return jobs;
  });

  // Persist to localStorage for refresh recovery
  localStorage.setItem(
    `job:${event.workflowId}`,
    JSON.stringify({
      workflowId: event.workflowId,
      lastUpdate: Date.now(),
    })
  );

  // Clean up completed jobs from localStorage
  if (event.phase === "complete" || event.phase === "failed") {
    localStorage.removeItem(`job:${event.workflowId}`);
  }
});

// Start a new crawl job
export async function startCrawlJob(
  url: string,
  options?: { maxPages?: number; maxDepth?: number }
): Promise<string> {
  const response = await fetch("/api/jobs/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, ...options }),
  });

  const { workflowId } = await response.json();

  // Initialize job state
  activeJobs.update((jobs) => {
    jobs.set(workflowId, {
      workflowId,
      phase: "initializing",
      progress: 0,
    });
    return jobs;
  });

  return workflowId;
}

// Recover job state after page refresh
export async function recoverJobs(): Promise<void> {
  // Find any jobs in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("job:")) {
      const data = JSON.parse(localStorage.getItem(key)!);
      const workflowId = data.workflowId;

      // Fetch current status
      try {
        const response = await fetch(`/api/jobs/${workflowId}/status`);
        const status = await response.json();

        if (status.complete) {
          localStorage.removeItem(key);
        } else {
          activeJobs.update((jobs) => {
            jobs.set(workflowId, status);
            return jobs;
          });
        }
      } catch (error) {
        console.error(`Failed to recover job ${workflowId}:`, error);
        localStorage.removeItem(key);
      }
    }
  }
}

// Get progress for a specific job
export function getJobProgress(workflowId: string) {
  return derived(activeJobs, ($jobs) => $jobs.get(workflowId));
}

// Export the store
export { activeJobs };
```

### chipp-temporal-worker: Redis Progress Publishing

```typescript
// apps/chipp-temporal-worker/src/activities/jobProgressPublisher.ts
import Redis from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  }
  return redis;
}

export interface JobProgressEvent {
  phase: string;
  progress: number;
  pagesProcessed?: number;
  totalPages?: number;
  currentUrl?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function publishJobProgress(
  workflowId: string,
  event: JobProgressEvent
): Promise<void> {
  const redis = getRedis();
  await redis.publish(`job:progress:${workflowId}`, JSON.stringify(event));
}
```

```typescript
// apps/chipp-temporal-worker/src/workflows/siteCrawlerStream.ts
// Add to existing workflow - publish progress to Redis

import { proxyActivities } from "@temporalio/workflow";
import type * as progressActivities from "../activities/jobProgressPublisher";

const { publishJobProgress } = proxyActivities<typeof progressActivities>({
  startToCloseTimeout: "5 seconds",
  retry: { maximumAttempts: 2 },
});

// Inside the workflow, after processing each batch:
await publishJobProgress(workflowId, {
  phase: currentPhase,
  progress: Math.round((visited.size / maxPages) * 100),
  pagesProcessed: visited.size,
  totalPages: maxPages,
  currentUrl,
  metadata: {
    successfulPages: allResults.filter((r) => r.success).length,
    failedPages: allResults.filter((r) => !r.success).length,
  },
});

// On completion:
await publishJobProgress(workflowId, {
  phase: "complete",
  progress: 100,
  pagesProcessed: allResults.length,
  totalPages: allResults.length,
});

// On error:
await publishJobProgress(workflowId, {
  phase: "failed",
  progress: 100,
  error: errorMessage,
});
```

### chipp-admin: Job Gateway API

```typescript
// apps/chipp-admin/app/api/jobs/start/route.ts
import { NextResponse } from "next/server";
import { startJob } from "shared-utils-server/src/temporal/jobHelpers";
import { JobType } from "shared-utils/src/jobConstants";

export async function POST(req: Request) {
  // Validate internal auth
  const authHeader = req.headers.get("X-Internal-Auth");
  if (authHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobType, appNameId, sessionUserEmail, input } = await req.json();

  try {
    const workflowId = await startJob({
      jobType: jobType as JobType,
      appNameId,
      sessionUserEmail,
      input,
    });

    return NextResponse.json({ workflowId });
  } catch (error) {
    console.error("Failed to start job:", error);
    return NextResponse.json({ error: "Failed to start job" }, { status: 500 });
  }
}
```

```typescript
// apps/chipp-admin/app/api/jobs/[workflowId]/status/route.ts
import { NextResponse } from "next/server";
import { queryJobProgress } from "shared-utils-server/src/temporal/jobHelpers";

export async function GET(
  req: Request,
  { params }: { params: { workflowId: string } }
) {
  const authHeader = req.headers.get("X-Internal-Auth");
  if (authHeader !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const progress = await queryJobProgress(params.workflowId);
    return NextResponse.json(progress || { phase: "unknown" });
  } catch (error) {
    console.error("Failed to query job:", error);
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
}
```

## Key Design Decisions

### 1. HTTP Gateway vs Direct Temporal Client

**Chosen: HTTP Gateway via chipp-admin**

| Approach        | Pros                                                              | Cons                                                       |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| HTTP Gateway    | No Temporal SDK in Deno, simpler deployment, single auth boundary | Extra hop, slight latency                                  |
| Direct Temporal | Lower latency, fewer moving parts                                 | Temporal SDK in Deno (npm: import issues), auth complexity |

The HTTP gateway keeps chipp-deno clean and leverages existing chipp-admin infrastructure.

### 2. Polling vs Pub/Sub for Progress

**Chosen: Redis Pub/Sub**

| Approach      | Pros                      | Cons                                |
| ------------- | ------------------------- | ----------------------------------- |
| Polling       | Simple, works everywhere  | Latency, server load, not real-time |
| Redis Pub/Sub | True real-time, efficient | Requires Redis, more infrastructure |

chipp-deno already has Redis pub/sub for WebSocket events, so this is a natural extension.

### 3. Workflow ID in Redis Channel

**Pattern: `job:progress:{workflowId}`**

- One channel per job
- Auto-cleanup on completion
- Easy to debug (subscribe to specific job)

## Environment Variables

### chipp-deno

```bash
# Internal communication with chipp-admin
CHIPP_ADMIN_URL=https://app.chipp.ai
INTERNAL_API_KEY=shared-secret-for-internal-apis

# Redis for pub/sub (existing)
REDIS_URL=redis://localhost:6379
```

### chipp-admin

```bash
# Accept internal requests from chipp-deno
INTERNAL_API_KEY=shared-secret-for-internal-apis

# Temporal (existing)
TEMPORAL_ADDRESS=localhost:7233
```

### chipp-temporal-worker

```bash
# Redis for publishing progress
REDIS_URL=redis://localhost:6379
```

## Migration Checklist

### Phase 1: Infrastructure

- [ ] Add `INTERNAL_API_KEY` to both chipp-admin and chipp-deno
- [ ] Create `/api/jobs/start` endpoint in chipp-admin
- [ ] Create `/api/jobs/[workflowId]/status` endpoint in chipp-admin
- [ ] Add Redis progress publisher activity to chipp-temporal-worker

### Phase 2: chipp-deno API

- [ ] Create `/api/jobs/crawl` endpoint
- [ ] Create `/api/jobs/:workflowId/status` endpoint
- [ ] Create `/api/jobs/:workflowId/cancel` endpoint
- [ ] Add Redis subscription logic for job progress

### Phase 3: chipp-deno Frontend

- [ ] Create `jobProgress` Svelte store
- [ ] Add `recoverJobs()` call on app mount
- [ ] Build progress UI component
- [ ] Integrate with knowledge source upload flow

### Phase 4: Temporal Workflow Updates

- [ ] Add `publishJobProgress` activity
- [ ] Update `siteCrawlerStreamWorkflow` to publish progress
- [ ] Update `documentUploadWorkflow` to publish progress
- [ ] Test end-to-end flow

## Testing

### Local Development

1. Start Redis: `docker compose up -d redis`
2. Start Temporal: `temporal server start-dev`
3. Start chipp-temporal-worker: `npm run dev:chipp-temporal-worker`
4. Start chipp-admin: `npm run dev:chipp-admin`
5. Start chipp-deno: `cd apps/chipp-deno && deno task dev`

### Verify Flow

1. Open chipp-deno in browser
2. Start a site crawl
3. Open Redis CLI: `redis-cli`
4. Subscribe to channel: `SUBSCRIBE job:progress:*`
5. Verify messages appear
6. Verify WebSocket receives events
7. Verify UI updates in real-time
8. Refresh page, verify job state recovers

## Future Considerations

### Direct Temporal in Deno

If Temporal releases a Deno-native SDK, we could bypass the HTTP gateway:

```typescript
// Potential future - direct Temporal client
import { Client, Connection } from "npm:@temporalio/client";

const connection = await Connection.connect({
  address: Deno.env.get("TEMPORAL_ADDRESS"),
});

const client = new Client({ connection });
await client.workflow.start("siteCrawlerStreamWorkflow", { ... });
```

### Server-Sent Events (SSE) Alternative

If WebSocket proves complex, SSE is a simpler one-way stream:

```typescript
// Alternative: SSE endpoint
jobs.get("/:workflowId/stream", async (c) => {
  const stream = new ReadableStream({
    async start(controller) {
      const subscriber = redis.duplicate();
      await subscriber.subscribe(`job:progress:${workflowId}`);

      subscriber.on("message", (channel, message) => {
        controller.enqueue(`data: ${message}\n\n`);
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
});
```

### Workflow-Level Progress (No Redis)

For simpler cases, query Temporal directly without Redis:

```typescript
// Simpler polling approach
jobs.get("/:workflowId/poll", async (c) => {
  const response = await fetch(
    `${CHIPP_ADMIN_URL}/api/jobs/${workflowId}/status`
  );
  return c.json(await response.json());
});
```

Use this when real-time isn't critical (e.g., batch reports).
