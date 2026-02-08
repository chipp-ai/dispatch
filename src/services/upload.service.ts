/**
 * Upload Service
 *
 * Handles file uploads and URL processing for knowledge sources.
 * Triggers inline RAG processing for small files, Temporal for large files/batches.
 */

import { uploadFileFromBuffer } from "./storage.service.ts";
import { knowledgeSourceService } from "./knowledge-source.service.ts";
import {
  ragIngestionService,
  processKnowledgeSource,
  processUrlContent,
} from "./rag-ingestion.service.ts";
import type { EmbeddingConfig } from "./embedding-provider.service.ts";
import { firecrawlService, isFirecrawlAvailable } from "./firecrawl.service.ts";
import { billingService } from "./billing.service.ts";
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

        // Track files for processing decision
        filesToProcess.push({
          knowledgeSourceId: source.id,
          applicationId,
          size: file.size,
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

    // Trigger RAG processing for successfully uploaded files
    if (filesToProcess.length > 0) {
      const shouldInline = ragIngestionService.shouldProcessInline(
        filesToProcess.map((f) => ({ size: f.size }))
      );

      if (shouldInline) {
        log.info("Processing files inline", {
          source: "upload-service",
          feature: "inline-processing",
          fileCount: filesToProcess.length,
          totalSize: filesToProcess.reduce((sum, f) => sum + f.size, 0),
        });

        // Process inline - don't await, let it run in background
        // This allows the upload response to return quickly
        Promise.all(
          filesToProcess.map((f) =>
            processKnowledgeSource({
              knowledgeSourceId: f.knowledgeSourceId,
              applicationId: f.applicationId,
              userId, // For WebSocket notifications
              embeddingConfig, // Use selected embedding provider
            }).catch((err) => {
              log.error("Inline processing failed", {
                source: "upload-service",
                feature: "inline-processing",
                knowledgeSourceId: f.knowledgeSourceId,
                applicationId: f.applicationId,
              }, err);
            })
          )
        );
      } else {
        log.info("Files queued for Temporal processing", {
          source: "upload-service",
          feature: "temporal-processing",
          fileCount: filesToProcess.length,
          reason: "exceeds inline thresholds",
        });
        // TODO: Trigger Temporal workflow for batch processing
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
      // Site crawl mode
      await processSiteCrawl({
        knowledgeSourceId: source.id,
        applicationId,
        userId,
        url,
        maxPages,
        maxDepth,
        embeddingConfig,
        billingCtx,
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

interface ProcessCrawlContext extends ProcessUrlContext {
  maxPages: number;
  maxDepth: number;
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ITERATIONS = 300; // 300 * 2s = 10 min timeout

/**
 * Process a site crawl via Firecrawl crawl API
 */
async function processSiteCrawl(ctx: ProcessCrawlContext): Promise<void> {
  const {
    knowledgeSourceId,
    applicationId,
    userId,
    url,
    maxPages,
    maxDepth,
    embeddingConfig,
    billingCtx,
    onProgress,
  } = ctx;

  let crawlId: string | null = null;

  try {
    await onProgress?.("crawling", 25, { pagesCompleted: 0, pagesTotal: 0 });

    // Delete existing chunks upfront for clean replace
    await sql`
      DELETE FROM rag.text_chunks
      WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
    `;

    // Start the crawl
    const crawl = await firecrawlService.startCrawl({
      url,
      maxPages,
      maxDepth,
    });
    crawlId = crawl.id;

    let pagesProcessed = 0;
    let processedUrls = new Set<string>();

    for (let i = 0; i < MAX_POLL_ITERATIONS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = await firecrawlService.getCrawlStatus(crawlId);

      // Process newly completed pages
      for (const page of status.data) {
        const pageUrl = page.metadata?.sourceURL || url;
        if (processedUrls.has(pageUrl as string)) continue;
        if (!page.markdown || page.markdown.trim().length === 0) {
          processedUrls.add(pageUrl as string);
          continue;
        }

        try {
          await processUrlContent({
            knowledgeSourceId,
            applicationId,
            url: pageUrl as string,
            markdown: page.markdown,
            sourceMetadata: page.metadata,
            userId,
            embeddingConfig,
            skipDelete: true, // append mode
          });
          pagesProcessed++;
        } catch (pageError) {
          log.error("Failed to process crawled page", {
            source: "upload-service",
            feature: "crawl-page-processing",
            knowledgeSourceId,
            applicationId,
            pageUrl,
            crawlId,
          }, pageError);
          // Continue processing other pages
        }

        processedUrls.add(pageUrl as string);
      }

      const progress =
        status.total > 0
          ? Math.min(
              25 + Math.round((status.completed / status.total) * 70),
              95
            )
          : 30;

      await onProgress?.("crawling", progress, {
        pagesCompleted: pagesProcessed,
        pagesTotal: status.total,
      });

      if (
        status.status === "completed" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        break;
      }
    }

    // If we hit the poll limit, cancel the crawl
    const finalStatus = await firecrawlService.getCrawlStatus(crawlId);
    if (finalStatus.status === "scraping") {
      log.warn("Crawl timed out, cancelling", { source: "upload-service", feature: "firecrawl-crawl", crawlId, url });
      await firecrawlService.cancelCrawl(crawlId);
    }

    // Update knowledge source with final chunk count
    const chunkCountResult = await sql`
      SELECT COUNT(*) as count
      FROM rag.text_chunks
      WHERE knowledge_source_id = ${knowledgeSourceId}::uuid
    `;
    const totalChunks = Number(chunkCountResult[0]?.count || 0);

    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = 'completed',
        chunk_count = ${totalChunks},
        updated_at = NOW()
      WHERE id = ${knowledgeSourceId}::uuid
    `;

    // Report usage (fire-and-forget)
    if (billingCtx?.stripeCustomerId && pagesProcessed > 0) {
      billingService.reportWebScrapeUsage({
        stripeCustomerId: billingCtx.stripeCustomerId,
        pagesScraped: pagesProcessed,
        applicationId,
        knowledgeSourceId,
        useSandbox: billingCtx.useSandbox,
      });
    }

    await onProgress?.("completed", 100, {
      pagesCompleted: pagesProcessed,
      pagesTotal: finalStatus.total,
    });

    log.info("Site crawl complete", {
      source: "upload-service",
      feature: "firecrawl-crawl",
      knowledgeSourceId,
      url,
      pagesProcessed,
      totalChunks,
    });
  } catch (error) {
    log.error("Site crawl failed", {
      source: "upload-service",
      feature: "firecrawl-crawl",
      knowledgeSourceId,
      applicationId,
      url,
      crawlId,
    }, error);

    // Try to cancel if crawl is still running
    if (crawlId) {
      firecrawlService.cancelCrawl(crawlId).catch(() => {});
    }

    // Mark knowledge source as failed
    await sql`
      UPDATE rag.knowledge_sources
      SET
        status = 'failed',
        error_message = ${error instanceof Error ? error.message : "Crawl failed"},
        updated_at = NOW()
      WHERE id = ${knowledgeSourceId}::uuid
    `;
    throw error;
  }
}
