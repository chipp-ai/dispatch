# Temporal Integration for chipp-deno

This document outlines how to integrate Temporal workflows for reliable, scalable document processing in chipp-deno.

## Current Architecture

chipp-deno currently processes documents **synchronously in-process**:

```
Upload Request → API Handler → RAG Ingestion Service → PostgreSQL
                                    ↓
                              LlamaParse (inline)
                                    ↓
                              Embeddings (inline)
```

**Limitations:**

- No retry logic for failed operations
- Large uploads block the request
- No progress tracking across restarts
- Site crawling is slow and unreliable

## Target Architecture

Leverage existing Temporal workflows from `chipp-temporal-worker`:

```
Upload Request → API Handler → Temporal Client → Temporal Server
                                                       ↓
                                              chipp-temporal-worker
                                                       ↓
                                              Shared PostgreSQL
                                                       ↓
                                              Redis Pub/Sub → WebSocket → UI
```

## Prerequisites

1. **Temporal Server** - Already running (local: `localhost:7233`, prod: Cloud)
2. **Redis** - Already configured for pub/sub
3. **Shared PostgreSQL** - Switch from `DENO_DATABASE_URL` to `PG_DATABASE_URL`

## Integration Steps

### Step 1: Add Temporal Client

Install the Temporal SDK for Deno:

```typescript
// src/temporal/client.ts
import { Client, Connection } from "npm:@temporalio/client";

let temporalClient: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (temporalClient) return temporalClient;

  const connection = await Connection.connect({
    address: Deno.env.get("TEMPORAL_ADDRESS") || "localhost:7233",
  });

  temporalClient = new Client({
    connection,
    namespace: Deno.env.get("TEMPORAL_NAMESPACE") || "default",
  });

  return temporalClient;
}
```

### Step 2: Trigger Existing Workflows

The `chipp-temporal-worker` already has these workflows:

| Workflow                    | Use Case                   |
| --------------------------- | -------------------------- |
| `fileRagWorkflow`           | Single document processing |
| `siteCrawlerStreamWorkflow` | URL/site scraping          |
| `documentUploadWorkflow`    | Batch document uploads     |

Example trigger from chipp-deno API:

```typescript
// src/routes/knowledge-sources.ts
import { getTemporalClient } from "../temporal/client.ts";

async function handleDocumentUpload(c: Context) {
  const client = await getTemporalClient();
  const knowledgeSourceId = crypto.randomUUID();

  // Start workflow (non-blocking)
  const handle = await client.workflow.start("fileRagWorkflow", {
    taskQueue: "file-rag-queue",
    workflowId: `rag-${knowledgeSourceId}`,
    args: [
      {
        fileId: knowledgeSourceId,
        applicationId: appId,
        fileName: file.name,
        fileUrl: uploadedUrl,
        useLlamaParse: true,
      },
    ],
  });

  // Return immediately with pending status
  return c.json({
    id: knowledgeSourceId,
    status: "processing",
    workflowId: handle.workflowId,
  });
}
```

### Step 3: Database Unification

Switch chipp-deno to use the shared PostgreSQL:

```bash
# .env
# Before (separate database):
DENO_DATABASE_URL=postgres://postgres:postgres@localhost:5436/chipp_deno

# After (shared with chipp-admin):
PG_DATABASE_URL=postgresql://postgres:supersecret@localhost:5433/chipp
```

Update the database client:

```typescript
// src/db/client.ts
const connectionString =
  Deno.env.get("PG_DATABASE_URL") || Deno.env.get("DENO_DATABASE_URL");
```

**Schema Mapping:**

| chipp-deno (current)    | chipp-postgres-prisma (target) |
| ----------------------- | ------------------------------ |
| `rag.text_chunks`       | `textchunk`                    |
| `rag.knowledge_sources` | `KnowledgeSource` (MySQL)      |

### Step 4: Progress Tracking via WebSocket

Temporal workflows emit progress via Redis pub/sub. chipp-deno already has WebSocket support.

```typescript
// Temporal activity (in chipp-temporal-worker)
await notifyJobProgress({
  knowledgeSourceId,
  phase: "generating_embeddings",
  progress: 75,
  message: "Processing 150/200 chunks",
});

// chipp-deno WebSocket handler receives via Redis
// Already implemented in src/websocket/pubsub.ts
```

### Step 5: Environment Variables

Add to `.env`:

```bash
# Temporal
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Shared database (same as chipp-admin)
PG_DATABASE_URL=postgresql://postgres:supersecret@localhost:5433/chipp

# Redis (already configured)
REDIS_URL=redis://localhost:6379
```

## Workflow Capabilities

### fileRagWorkflow

Handles single document processing with:

- LlamaParse for semantic chunking
- Automatic retry on failure (3 attempts)
- Progress reporting every 10%
- Embedding generation in batches

```typescript
// Trigger for PDF/DOC files
await client.workflow.start("fileRagWorkflow", {
  taskQueue: "file-rag-queue",
  workflowId: `rag-${knowledgeSourceId}`,
  args: [
    {
      fileId: knowledgeSourceId,
      applicationId,
      fileName,
      fileUrl,
      useLlamaParse: true,
    },
  ],
});
```

### siteCrawlerStreamWorkflow

Handles URL scraping with:

- Browser pool for JavaScript rendering
- Rate limiting and politeness delays
- Depth-limited crawling
- Deduplication of visited URLs

```typescript
// Trigger for URL/website sources
await client.workflow.start("siteCrawlerStreamWorkflow", {
  taskQueue: "file-rag-queue",
  workflowId: `crawl-${knowledgeSourceId}`,
  args: [
    {
      url: sourceUrl,
      applicationId,
      knowledgeSourceId,
      maxDepth: 3,
      maxPages: 100,
    },
  ],
});
```

### documentUploadWorkflow

Handles batch uploads:

- Parallel processing of multiple files
- Individual retry per file
- Aggregate progress reporting

## Migration Checklist

- [ ] Install `@temporalio/client` for Deno
- [ ] Create Temporal client singleton
- [ ] Update upload endpoints to trigger workflows
- [ ] Switch to shared `PG_DATABASE_URL`
- [ ] Update schema references (`rag.text_chunks` → `textchunk`)
- [ ] Test WebSocket progress notifications
- [ ] Update Kubernetes manifests with Temporal address

## Testing Locally

1. Start Temporal server:

   ```bash
   temporal server start-dev
   ```

2. Start Temporal worker:

   ```bash
   npm run dev:chipp-temporal-worker
   ```

3. Start chipp-deno with Temporal config:

   ```bash
   cd apps/chipp-deno
   TEMPORAL_ADDRESS=localhost:7233 deno task dev
   ```

4. Upload a document and verify workflow execution:
   ```bash
   temporal workflow list --query "WorkflowType='fileRagWorkflow'"
   ```

## Production Considerations

- **Temporal Cloud** - Use managed Temporal for production reliability
- **Task Queue Isolation** - Consider separate queue for chipp-deno workloads
- **Workflow Versioning** - Use workflow versioning for zero-downtime deploys
- **Observability** - Temporal UI provides built-in workflow tracing
