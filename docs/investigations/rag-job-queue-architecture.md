# RAG Job Queue Architecture: Replacing Temporal with Deno.cron + Postgres

**Date:** 2026-02-08
**Status:** Investigation complete, ready for implementation
**Goal:** Eliminate Temporal dependency for knowledge source processing

## Current State

### Bulk File Upload (4,000 files)
- Files > 5 count or > 5MB total hit a `TODO: Trigger Temporal workflow` (upload.service.ts:176)
- Small batches use fire-and-forget `Promise.all()` that silently drops errors
- No job tracking, no retry, no progress visibility

### Website Crawling
- Holds an SSE connection open for up to 10 minutes while polling Firecrawl every 2 seconds
- Client must stay connected for the entire crawl duration
- 300 poll iterations * 2s = 10 min hard timeout, then crawl is cancelled
- If the SSE connection drops, progress is lost (crawl may still run on Firecrawl but we stop processing pages)

### Single URL Scrape
- Synchronous within SSE stream. Works fine for single pages.

---

## Proposed Architecture

Two independent improvements that together eliminate Temporal:

### 1. Database Job Queue + Deno.cron Processor (Bulk Files)
### 2. Firecrawl Webhooks (Website Crawling)

---

## Part 1: Database Job Queue

### New Table: `rag.processing_jobs`

```sql
CREATE TABLE rag.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES app.applications(id) ON DELETE CASCADE,
    knowledge_source_id UUID NOT NULL REFERENCES rag.knowledge_sources(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('file', 'url', 'crawl_page')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}',
    -- Retry tracking
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    -- For stale job detection: if a job has been "processing" for > 10 min, it's stuck
    heartbeat_at TIMESTAMPTZ,
    -- Embedding config (stored so retries use the same config)
    embedding_config JSONB,
    -- Who requested this (for WebSocket notifications)
    user_id UUID
);

CREATE INDEX idx_processing_jobs_pending
    ON rag.processing_jobs (status, priority DESC, created_at ASC)
    WHERE status = 'pending';

CREATE INDEX idx_processing_jobs_app
    ON rag.processing_jobs (application_id);

CREATE INDEX idx_processing_jobs_ks
    ON rag.processing_jobs (knowledge_source_id);

CREATE INDEX idx_processing_jobs_stale
    ON rag.processing_jobs (heartbeat_at)
    WHERE status = 'processing';
```

### Flow: User Uploads 4,000 Files

```
User uploads files via POST /upload/documents
    │
    ├── For each file:
    │   ├── Upload to GCS
    │   ├── Create knowledge_source record (status: pending)
    │   └── Create processing_job record (status: pending)
    │
    ├── Return 202 Accepted with { jobCount: 4000, knowledgeSourceIds: [...] }
    │
    └── Client connects to WebSocket for progress updates

Deno.cron("process-rag-jobs", "*/30 * * * * *", async () => {
    // Runs every 30 seconds
    // 1. Claim up to N pending jobs using SELECT ... FOR UPDATE SKIP LOCKED
    // 2. Process each job (extract -> chunk -> embed -> store)
    // 3. Update job status (completed/failed)
    // 4. Send WebSocket notification per completed job
    // 5. Recover stale jobs (processing for > 10 min with no heartbeat)
});
```

### Job Claim Query (Multi-Replica Safe)

```sql
-- Claim batch of pending jobs atomically
-- FOR UPDATE SKIP LOCKED ensures no two pods process the same job
UPDATE rag.processing_jobs
SET status = 'processing',
    started_at = NOW(),
    heartbeat_at = NOW(),
    attempts = attempts + 1
WHERE id IN (
    SELECT id FROM rag.processing_jobs
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT 5  -- concurrency limit per cron tick
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### Stale Job Recovery

```sql
-- Reclaim jobs stuck in processing for > 10 minutes
UPDATE rag.processing_jobs
SET status = 'pending',
    heartbeat_at = NULL
WHERE status = 'processing'
  AND heartbeat_at < NOW() - INTERVAL '10 minutes'
  AND attempts < max_attempts;
```

### Heartbeat During Processing

Long-running jobs (e.g., large PDFs through LlamaParse) update their heartbeat:

```typescript
async function processJobWithHeartbeat(jobId: string, fn: () => Promise<void>) {
  const heartbeatInterval = setInterval(async () => {
    await sql`
      UPDATE rag.processing_jobs
      SET heartbeat_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
  }, 60_000); // every 60 seconds

  try {
    await fn();
  } finally {
    clearInterval(heartbeatInterval);
  }
}
```

### Concurrency Control

The `LIMIT 5` in the claim query controls how many jobs one pod processes per tick. With 30-second ticks and ~30 seconds per file (LlamaParse + embedding), each pod processes roughly 5 files/minute.

With 2 replicas, that's ~10 files/minute. 4,000 files takes ~6.5 hours. This is fine -- it's a background process and the user gets real-time progress via WebSocket.

For faster processing, increase the `LIMIT` or add a second cron with a shorter interval for small files:

```typescript
Deno.cron("process-rag-jobs-fast", "*/10 * * * * *", processSmallJobs);  // every 10s for small files
Deno.cron("process-rag-jobs-slow", "*/60 * * * * *", processLargeJobs);  // every 60s for large files
```

### Progress API

New endpoint for clients to check progress:

```
GET /api/knowledge-source/:id/progress
→ { total: 4000, completed: 1523, failed: 2, processing: 5, pending: 2470 }
```

```sql
SELECT
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'processing') as processing,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) as total
FROM rag.processing_jobs
WHERE application_id = $1
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## Part 2: Firecrawl Webhooks (Website Crawling)

### Current Problem

`processSiteCrawl()` in upload.service.ts:
1. Starts a Firecrawl crawl
2. Polls `GET /crawl/:id` every 2 seconds in a loop
3. Holds an SSE connection open for the entire duration (up to 10 min)
4. Client disconnect = lost progress tracking

### Solution: Firecrawl Webhook Callbacks

Firecrawl supports webhook notifications. Instead of polling, we tell Firecrawl to POST to us when pages are ready.

### New Webhook Endpoint

```
POST /api/webhooks/firecrawl
```

Firecrawl sends events:
- `crawl.started` -- crawl has begun
- `crawl.page` -- a page has been crawled (includes markdown)
- `crawl.completed` -- all pages done
- `crawl.failed` -- crawl failed

Each event includes the crawl ID and page data.

### Flow: User Starts Site Crawl

```
User requests crawl via GET /upload/url?crawlLinks=true
    │
    ├── Create knowledge_source record (status: processing)
    ├── Create processing_job of type 'site_crawl' (tracks overall crawl)
    ├── Call Firecrawl POST /crawl with webhook URL:
    │     {
    │       url: "https://example.com",
    │       limit: 50,
    │       maxDepth: 5,
    │       webhook: {
    │         url: "https://api.chipp.ai/api/webhooks/firecrawl",
    │         metadata: {
    │           knowledgeSourceId: "...",
    │           applicationId: "...",
    │           userId: "..."
    │         },
    │         events: ["page", "completed", "failed"]
    │       },
    │       scrapeOptions: { formats: ["markdown"], onlyMainContent: true }
    │     }
    │
    ├── Return 202 Accepted immediately (no SSE needed)
    └── Client gets WebSocket updates as pages arrive

Firecrawl POSTs to /api/webhooks/firecrawl:
    │
    ├── On "crawl.page" event:
    │   ├── Verify X-Firecrawl-Signature (HMAC-SHA256)
    │   ├── Create processing_job of type 'crawl_page' (for the individual page)
    │   └── (Job processor picks it up and processes: chunk -> embed -> store)
    │
    ├── On "crawl.completed" event:
    │   ├── Update knowledge_source status to 'completed'
    │   ├── Update parent crawl job to 'completed'
    │   └── Send WebSocket notification to user
    │
    └── On "crawl.failed" event:
        ├── Update knowledge_source status to 'failed'
        └── Send WebSocket notification with error
```

### Webhook Security

```typescript
import { createHmac } from "node:crypto";

function verifyFirecrawlSignature(body: string, signature: string): boolean {
  const secret = Deno.env.get("FIRECRAWL_WEBHOOK_SECRET");
  if (!secret) return false;

  const expected = "sha256=" + createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return signature === expected;
}
```

### Why This Is Better

| Aspect | Current (Polling + SSE) | Proposed (Webhooks + Job Queue) |
|--------|------------------------|---------------------------------|
| Server resources | Holds connection 10 min | Returns immediately |
| Client connection | Must stay open | Can close and come back |
| Progress tracking | Lost on disconnect | Persistent in DB |
| Multi-page processing | Inline during poll loop | Background via job queue |
| Timeout | Hard 10 min limit | No limit (Firecrawl manages) |
| Error recovery | None | Retry via job queue |
| Observability | SSE stream only | DB queries, WebSocket, API |

---

## Implementation Plan

### Phase 1: Job Queue Table + Processor (eliminates Temporal TODO)

1. Create migration `rag.processing_jobs`
2. Create `src/services/job-processor.service.ts`:
   - `claimPendingJobs(limit)` -- SELECT FOR UPDATE SKIP LOCKED
   - `processJob(job)` -- dispatches to file/url/crawl_page handler
   - `recoverStaleJobs()` -- reclaim stuck jobs
   - `updateHeartbeat(jobId)` -- keep-alive during long processing
3. Register Deno.cron in `src/app.ts`:
   ```typescript
   Deno.cron("process-rag-jobs", "*/30 * * * * *", processRagJobs);
   ```
4. Update `uploadService.uploadDocuments()`:
   - Always create job records instead of fire-and-forget Promise.all
   - Return 202 with job IDs
5. Add `GET /api/knowledge-source/:appId/progress` endpoint
6. Wire WebSocket notifications from job processor

### Phase 2: Firecrawl Webhooks (eliminates SSE crawl polling)

1. Add `FIRECRAWL_WEBHOOK_SECRET` to env
2. Create `POST /api/webhooks/firecrawl` endpoint with signature verification
3. Update `uploadService.uploadUrl()` for crawlLinks=true:
   - Pass webhook config to Firecrawl
   - Return 202 immediately instead of opening SSE
4. Webhook handler creates `crawl_page` jobs for the job processor
5. Keep SSE for single URL scrape (fast, synchronous, works fine as-is)

### Phase 3: Periodic Re-Scraping (future)

Once job queue + webhooks are in place, adding periodic re-scraping is trivial:

```typescript
Deno.cron("rescrape-urls", "0 3 * * *", async () => {
  // Daily at 3am UTC: find URL knowledge sources due for re-scrape
  // Create fresh processing_jobs for each
});
```

This is what Cloudflare AI Search does automatically (every 6 hours). We can offer this with more control -- configurable per-app frequency, immediate re-scrape button, etc.

---

## Deno.cron Considerations on GKE

**Non-overlapping execution:** Deno.cron guarantees a handler won't be invoked again if the previous invocation is still running. Good -- prevents double-processing.

**Multi-replica:** Each pod runs its own Deno.cron. But `FOR UPDATE SKIP LOCKED` ensures no two pods claim the same job. Multiple pods = higher throughput.

**Pod restarts:** Jobs in 'processing' status with stale heartbeats get reclaimed by the recovery cron. No work is lost.

**Not Deno Deploy:** We're on GKE, so Deno.cron is an in-process scheduler (no Deno Deploy HA). That's fine -- the database is the source of truth, not the cron. If a pod dies, another pod picks up the work.

---

## Why Not Deno KV Queues?

Deno KV queues (`kv.enqueue()` / `kv.listenQueue()`) use SQLite as the backend on non-Deploy environments. This:
- Only works for a single instance (not multi-replica safe)
- Has a 100K message limit
- Loses messages on pod restart

Postgres + FOR UPDATE SKIP LOCKED gives us:
- Multi-replica safety
- Unlimited queue size
- Crash recovery via stale job detection
- Full SQL queryability for progress/analytics
- Already our primary datastore (no new dependency)
