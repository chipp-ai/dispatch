/**
 * Firecrawl Webhook Route
 *
 * Receives crawl events from Firecrawl's webhook system.
 * Events: crawl.page (new page scraped), crawl.completed, crawl.failed
 *
 * Each scraped page creates a processing_job (type='crawl_page')
 * so the cron processor handles embedding asynchronously.
 */

import { Hono } from "hono";
import type { WebhookContext } from "../../middleware/webhookAuth.ts";
import { firecrawlWebhookMiddleware } from "../../middleware/webhookAuth.ts";
import { createProcessingJob } from "../../../services/job-processor.service.ts";
import { notifyJobProgress } from "../../../websocket/pubsub.ts";
import { sql } from "../../../db/client.ts";
import { log } from "@/lib/logger.ts";

export const firecrawlWebhookRoutes = new Hono<WebhookContext>();

// Apply signature verification
firecrawlWebhookRoutes.use("/*", firecrawlWebhookMiddleware);

firecrawlWebhookRoutes.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    const rawBody = c.get("rawBody");
    body = JSON.parse(rawBody);
  } catch {
    log.warn("Invalid JSON in Firecrawl webhook", {
      source: "firecrawl-webhook",
      feature: "parse",
    });
    // Always return 200 to prevent Firecrawl retries
    return c.json({ received: true });
  }

  const eventType = body.type as string;
  const metadata = (body.metadata || {}) as Record<string, unknown>;
  const knowledgeSourceId = metadata.knowledgeSourceId as string;
  const applicationId = metadata.applicationId as string;
  const userId = metadata.userId as string | undefined;
  const embeddingConfig = metadata.embeddingConfig as unknown;

  if (!knowledgeSourceId || !applicationId) {
    log.warn("Firecrawl webhook missing required metadata", {
      source: "firecrawl-webhook",
      feature: "validation",
      eventType,
      hasKsId: !!knowledgeSourceId,
      hasAppId: !!applicationId,
    });
    return c.json({ received: true });
  }

  log.info("Firecrawl webhook received", {
    source: "firecrawl-webhook",
    feature: "event-routing",
    eventType,
    knowledgeSourceId,
    applicationId,
  });

  try {
    switch (eventType) {
      case "crawl.page": {
        await handleCrawlPage(body, {
          knowledgeSourceId,
          applicationId,
          userId,
          embeddingConfig,
        });
        break;
      }
      case "crawl.completed": {
        await handleCrawlCompleted(knowledgeSourceId, userId);
        break;
      }
      case "crawl.failed": {
        const error = (body.error as string) || "Crawl failed";
        await handleCrawlFailed(knowledgeSourceId, error, userId);
        break;
      }
      default: {
        log.info("Unhandled Firecrawl event type", {
          source: "firecrawl-webhook",
          feature: "event-routing",
          eventType,
        });
      }
    }
  } catch (error) {
    log.error("Error handling Firecrawl webhook", {
      source: "firecrawl-webhook",
      feature: "event-handling",
      eventType,
      knowledgeSourceId,
      applicationId,
    }, error);
  }

  // Always return 200
  return c.json({ received: true });
});

/**
 * Handle a newly scraped page -- create a processing job for embedding.
 */
async function handleCrawlPage(
  body: Record<string, unknown>,
  ctx: {
    knowledgeSourceId: string;
    applicationId: string;
    userId?: string;
    embeddingConfig?: unknown;
  }
): Promise<void> {
  const data = body.data as Record<string, unknown> | undefined;
  const markdown = (data?.markdown as string) || "";
  const pageMetadata = (data?.metadata || {}) as Record<string, unknown>;
  const pageUrl = (pageMetadata.sourceURL as string) || "";

  if (!markdown || markdown.trim().length === 0) {
    log.info("Skipping empty crawl page", {
      source: "firecrawl-webhook",
      feature: "crawl-page",
      knowledgeSourceId: ctx.knowledgeSourceId,
      pageUrl,
    });
    return;
  }

  await createProcessingJob({
    applicationId: ctx.applicationId,
    knowledgeSourceId: ctx.knowledgeSourceId,
    type: "crawl_page",
    payload: {
      url: pageUrl,
      markdown,
      sourceMetadata: pageMetadata,
    },
    embeddingConfig: ctx.embeddingConfig || undefined,
    userId: ctx.userId,
  });

  // Send progress update via WebSocket
  if (ctx.userId) {
    // Count current jobs for this knowledge source to estimate progress
    const counts = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) AS total
      FROM rag.processing_jobs
      WHERE knowledge_source_id = ${ctx.knowledgeSourceId}::uuid
    `;
    const row = counts[0] as { completed: string; total: string };
    const completed = Number(row.completed);
    const total = Number(row.total);

    await notifyJobProgress(
      ctx.userId,
      ctx.knowledgeSourceId,
      total > 0 ? Math.round((completed / total) * 100) : 0,
      `Processing page: ${pageUrl || "unknown"}`
    );
  }
}

/**
 * Handle crawl completion -- update knowledge source status.
 */
async function handleCrawlCompleted(
  knowledgeSourceId: string,
  userId?: string
): Promise<void> {
  // Get final chunk count from DB
  const chunkCountResult = await sql`
    SELECT COUNT(*) as count
    FROM rag.text_chunks
    WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
  `;
  const totalChunks = Number((chunkCountResult[0] as { count: string }).count || 0);

  // Check if there are still pending/processing jobs for this knowledge source
  const pendingJobs = await sql`
    SELECT COUNT(*) as count
    FROM rag.processing_jobs
    WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
      AND status IN ('pending', 'processing')
  `;
  const pendingCount = Number((pendingJobs[0] as { count: string }).count || 0);

  if (pendingCount > 0) {
    // Jobs still processing -- the last job to complete will finalize
    log.info("Crawl completed but jobs still processing", {
      source: "firecrawl-webhook",
      feature: "crawl-completed",
      knowledgeSourceId,
      pendingCount,
    });
    return;
  }

  await sql`
    UPDATE rag.knowledge_sources
    SET
      status = 'completed',
      chunk_count = ${totalChunks},
      updated_at = NOW()
    WHERE id = ${knowledgeSourceId}::uuid
  `;

  log.info("Crawl completed, knowledge source finalized", {
    source: "firecrawl-webhook",
    feature: "crawl-completed",
    knowledgeSourceId,
    totalChunks,
  });

  if (userId) {
    const { notifyJobCompleted } = await import("../../../websocket/pubsub.ts");
    await notifyJobCompleted(userId, knowledgeSourceId, {
      type: "crawl_completed",
      knowledgeSourceId,
      chunkCount: totalChunks,
    });
  }
}

/**
 * Handle crawl failure -- mark knowledge source as failed.
 */
async function handleCrawlFailed(
  knowledgeSourceId: string,
  error: string,
  userId?: string
): Promise<void> {
  await sql`
    UPDATE rag.knowledge_sources
    SET
      status = 'failed',
      error_message = ${error},
      updated_at = NOW()
    WHERE id = ${knowledgeSourceId}::uuid
  `;

  // Cancel any pending jobs for this knowledge source
  await sql`
    UPDATE rag.processing_jobs
    SET status = 'cancelled', completed_at = NOW()
    WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
      AND status IN ('pending', 'processing')
  `;

  log.error("Crawl failed", {
    source: "firecrawl-webhook",
    feature: "crawl-failed",
    knowledgeSourceId,
    error,
  });

  if (userId) {
    const { notifyJobFailed } = await import("../../../websocket/pubsub.ts");
    await notifyJobFailed(userId, knowledgeSourceId, error);
  }
}
