/**
 * Upload Service
 *
 * Handles file uploads and URL processing for knowledge sources.
 * Triggers inline RAG processing for small files, Temporal for large files/batches.
 */

import { uploadFileFromBuffer } from "./storage.service.ts";
import { knowledgeSourceService } from "./knowledge-source.service.ts";
import {
  processKnowledgeSource,
  processUrlContent,
} from "./rag-ingestion.service.ts";
import type { EmbeddingConfig } from "./embedding-provider.service.ts";
import { firecrawlService, isFirecrawlAvailable } from "./firecrawl.service.ts";
import { billingService } from "./billing.service.ts";
import { createProcessingJob } from "./job-processor.service.ts";
import { sql } from "../db/client.ts";
import { log } from "@/lib/logger.ts";

export interface UploadDocumentResult {
  knowledgeSourceId?: string;
  fileName: string;
  filePath?: string;
  status: "pending" | "processing" | "completed" | "failed" | "deleting";
  error?: string;
}

export interface UploadDocumentsParams {
  applicationId: string;
  userId: string;
  files: File[];
  embeddingConfig?: EmbeddingConfig;
}

export interface UploadUrlProgressDetail {
  pagesCompleted?: number;
  pagesTotal?: number;
}

export interface UploadUrlParams {
  applicationId: string;
  userId: string;
  url: string;
  crawlLinks?: boolean;
  maxPages?: number;
  maxDepth?: number;
  embeddingConfig?: EmbeddingConfig;
  onProgress?: (
    phase: string,
    progress: number,
    detail?: UploadUrlProgressDetail
  ) => Promise<void>;
}

/**
 * Upload service
 */
export const uploadService = {
  /**
   * Upload multiple document files
   */
  async uploadDocuments(
    params: UploadDocumentsParams
  ): Promise<UploadDocumentResult[]> {
    const { applicationId, userId, files, embeddingConfig } = params;

    const results: UploadDocumentResult[] = [];
    const filesToProcess: Array<{
      knowledgeSourceId: string;
      applicationId: string;
      size: number;
      filePath: string;
      mimeType: string;
    }> = [];

    for (const file of files) {
      try {
        // Generate unique file ID
        const fileId = crypto.randomUUID();
        const sanitizedName = sanitizeFileName(file.name);
        const storagePath = `workspaces/${applicationId}/files/${fileId}_${sanitizedName}`;

        // Upload to GCS
        const buffer = await file.arrayBuffer();
        const filePath = await uploadFileFromBuffer(
          new Uint8Array(buffer),
          storagePath,
          file.type
        );

        // Create knowledge source record
        const source = await knowledgeSourceService.create({
          applicationId,
          userId,
          type: "file",
          name: file.name,
          filePath,
          metadata: {
            originalFileName: file.name,
            mimeType: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        });

        results.push({
          knowledgeSourceId: source.id,
          fileName: file.name,
          filePath,
          status: source.status,
        });

        // Track files for job creation
        filesToProcess.push({
          knowledgeSourceId: source.id,
          applicationId,
          size: file.size,
          filePath,
          mimeType: file.type,
        });
      } catch (error) {
        log.error("Error uploading file", {
          source: "upload-service",
          feature: "file-upload",
          applicationId,
          fileName: file.name,
          fileSize: file.size,
        }, error);
        // Track failed uploads
        results.push({
          fileName: file.name,
          status: "failed",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    // Create processing jobs for all successfully uploaded files
    if (filesToProcess.length > 0) {
      log.info("Creating processing jobs for uploaded files", {
        source: "upload-service",
        feature: "job-queue",
        fileCount: filesToProcess.length,
        totalSize: filesToProcess.reduce((sum, f) => sum + f.size, 0),
      });

      for (const f of filesToProcess) {
        try {
          await createProcessingJob({
            applicationId: f.applicationId,
            knowledgeSourceId: f.knowledgeSourceId,
            type: "file",
            payload: {
              knowledgeSourceId: f.knowledgeSourceId,
              filePath: f.filePath,
              mimeType: f.mimeType,
            },
            embeddingConfig: embeddingConfig || undefined,
            userId,
          });
        } catch (err) {
          log.error("Failed to create processing job", {
            source: "upload-service",
            feature: "job-queue",
            knowledgeSourceId: f.knowledgeSourceId,
            applicationId: f.applicationId,
          }, err);
        }
      }
    }

    return results;
  },

  /**
   * Upload a URL as a knowledge source.
   * Uses Firecrawl for scraping/crawling when available, falls back to basic fetch.
   */
  async uploadUrl(
    params: UploadUrlParams
  ): Promise<{ knowledgeSourceId: string }> {
    const {
      applicationId,
      userId,
      url,
      crawlLinks,
      maxPages = 10,
      maxDepth = 1,
      embeddingConfig,
      onProgress,
    } = params;

    await onProgress?.("validating", 0);

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error("Invalid URL");
    }

    await onProgress?.("creating", 10);

    // Create knowledge source record
    const source = await knowledgeSourceService.create({
      applicationId,
      userId,
      type: "url",
      name: url,
      url,
      metadata: {
        crawlLinks: crawlLinks || false,
        maxPages,
        maxDepth,
        uploadedAt: new Date().toISOString(),
      },
    });

    await onProgress?.("processing", 20);

    if (!isFirecrawlAvailable()) {
      // PG mode fallback: basic fetch + strip HTML
      log.info("Firecrawl unavailable, using basic processing", {
        source: "upload-service",
        feature: "url-fallback",
        knowledgeSourceId: source.id,
        url,
      });
      processKnowledgeSource({
        knowledgeSourceId: source.id,
        applicationId,
        userId,
        embeddingConfig,
      }).catch((err) => {
        log.error("Basic URL processing failed", {
          source: "upload-service",
          feature: "url-fallback",
          knowledgeSourceId: source.id,
          applicationId,
          url,
        }, err);
      });

      await onProgress?.("completed", 100);
      return { knowledgeSourceId: source.id };
    }

    // Get billing context for usage reporting
    const billingCtx = await getBillingContextForApp(applicationId);

    if (crawlLinks) {
      // Site crawl mode -- start async crawl with webhook callbacks
      await startWebhookCrawl({
        knowledgeSourceId: source.id,
        applicationId,
        userId,
        url,
        maxPages,
        maxDepth,
        embeddingConfig,
        onProgress,
      });
    } else {
      // Single URL scrape
      await processSingleUrl({
        knowledgeSourceId: source.id,
        applicationId,
        userId,
        url,
        embeddingConfig,
        billingCtx,
        onProgress,
      });
    }

    return { knowledgeSourceId: source.id };
  },
};

/**
 * Sanitize file name for storage
 */
function sanitizeFileName(fileName: string): string {
  // Remove path separators and dangerous characters
  return fileName
    .replace(/[\/\\]/g, "_")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 255); // Limit length
}

/**
 * Get billing context for an application (stripe customer ID + sandbox flag)
 */
async function getBillingContextForApp(
  applicationId: string
): Promise<{ stripeCustomerId: string | null; useSandbox: boolean } | null> {
  try {
    const result = await sql`
      SELECT
        o.stripe_customer_id,
        o.stripe_sandbox_customer_id,
        o.use_sandbox_for_usage_billing
      FROM app.applications a
      JOIN app.workspaces w ON a.workspace_id = w.id
      JOIN app.organizations o ON w.organization_id = o.id
      WHERE a.id = ${applicationId}::uuid
    `;

    if (result.length === 0) return null;

    const org = result[0];
    const useSandbox =
      Deno.env.get("USE_STRIPE_SANDBOX") === "true" ||
      Boolean(org.use_sandbox_for_usage_billing);

    const stripeCustomerId = useSandbox
      ? org.stripe_sandbox_customer_id
      : org.stripe_customer_id;

    return { stripeCustomerId: stripeCustomerId || null, useSandbox };
  } catch (error) {
    log.error("Failed to get billing context", {
      source: "upload-service",
      feature: "billing-context",
      applicationId,
    }, error);
    return null;
  }
}

interface ProcessUrlContext {
  knowledgeSourceId: string;
  applicationId: string;
  userId: string;
  url: string;
  embeddingConfig?: EmbeddingConfig;
  billingCtx: { stripeCustomerId: string | null; useSandbox: boolean } | null;
  onProgress?: UploadUrlParams["onProgress"];
}

/**
 * Process a single URL via Firecrawl scrape
 */
async function processSingleUrl(ctx: ProcessUrlContext): Promise<void> {
  const {
    knowledgeSourceId,
    applicationId,
    userId,
    url,
    embeddingConfig,
    billingCtx,
    onProgress,
  } = ctx;

  try {
    await onProgress?.("scraping", 30);

    const { markdown, metadata } = await firecrawlService.scrapeUrl(url);

    await onProgress?.("embedding", 50);

    await processUrlContent({
      knowledgeSourceId,
      applicationId,
      url,
      markdown,
      sourceMetadata: metadata,
      userId,
      embeddingConfig,
    });

    // Report usage (fire-and-forget)
    if (billingCtx?.stripeCustomerId) {
      billingService.reportWebScrapeUsage({
        stripeCustomerId: billingCtx.stripeCustomerId,
        pagesScraped: 1,
        applicationId,
        knowledgeSourceId,
        useSandbox: billingCtx.useSandbox,
      });
    }

    await onProgress?.("completed", 100);
  } catch (error) {
    log.error("Single URL processing failed", {
      source: "upload-service",
      feature: "firecrawl-scrape",
      knowledgeSourceId,
      applicationId,
      url,
    }, error);
    throw error;
  }
}

/**
 * Start a site crawl using Firecrawl webhooks (non-blocking).
 * The crawl pages arrive via POST /api/webhooks/firecrawl and are
 * enqueued as processing_jobs for the cron processor.
 */
async function startWebhookCrawl(params: {
  knowledgeSourceId: string;
  applicationId: string;
  userId: string;
  url: string;
  maxPages: number;
  maxDepth: number;
  embeddingConfig?: EmbeddingConfig;
  onProgress?: UploadUrlParams["onProgress"];
}): Promise<void> {
  const {
    knowledgeSourceId,
    applicationId,
    userId,
    url,
    maxPages,
    maxDepth,
    embeddingConfig,
    onProgress,
  } = params;

  try {
    await onProgress?.("crawling", 25, { pagesCompleted: 0, pagesTotal: 0 });

    // Delete existing chunks upfront for clean replace
    await sql`
      DELETE FROM rag.text_chunks
      WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
    `;

    // Build the webhook URL from APP_URL
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:8000";
    const webhookUrl = `${appUrl}/api/webhooks/firecrawl`;

    // Start the crawl with webhook config
    const crawl = await firecrawlService.startCrawl({
      url,
      maxPages,
      maxDepth,
      webhook: {
        url: webhookUrl,
        metadata: {
          knowledgeSourceId,
          applicationId,
          userId,
          embeddingConfig: embeddingConfig || null,
        },
        events: ["page", "completed", "failed"],
      },
    });

    // Store crawl ID in knowledge source metadata for tracking
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = 'processing',
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ crawlId: crawl.id })}::jsonb,
        updated_at = NOW()
      WHERE id = ${knowledgeSourceId}::uuid
    `;

    await onProgress?.("crawling", 30, { pagesCompleted: 0, pagesTotal: 0 });

    log.info("Site crawl started with webhook", {
      source: "upload-service",
      feature: "webhook-crawl",
      knowledgeSourceId,
      applicationId,
      crawlId: crawl.id,
      url,
      webhookUrl,
    });
  } catch (error) {
    log.error("Failed to start webhook crawl", {
      source: "upload-service",
      feature: "webhook-crawl",
      knowledgeSourceId,
      applicationId,
      url,
    }, error);

    // Mark knowledge source as failed
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = 'failed',
        error_message = ${error instanceof Error ? error.message : "Crawl start failed"},
        updated_at = NOW()
      WHERE id = ${knowledgeSourceId}::uuid
    `;
    throw error;
  }
}
