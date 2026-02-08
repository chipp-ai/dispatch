/**
 * Job Processor Service
 *
 * Postgres-backed job queue for RAG processing (files, URLs, crawl pages).
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for multi-replica safe claiming.
 * Designed to be called from Deno.cron every 30 seconds.
 */

import { sql } from "../db/client.ts";
import {
  processKnowledgeSource,
  processUrlContent,
} from "./rag-ingestion.service.ts";
import {
  notifyJobCompleted,
  notifyJobFailed,
  notifyJobProgress,
} from "../websocket/pubsub.ts";
import { log } from "@/lib/logger.ts";

// How many jobs to claim per cron tick
const BATCH_SIZE = 5;
// Heartbeat interval during processing (ms)
const HEARTBEAT_INTERVAL_MS = 60_000;
// Jobs stuck in processing with heartbeat older than this are considered stale
const STALE_THRESHOLD_MINUTES = 10;

interface JobRow {
  id: string;
  application_id: string;
  knowledge_source_id: string;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  embedding_config: unknown;
  user_id: string | null;
}

/**
 * Claim pending jobs using FOR UPDATE SKIP LOCKED.
 * This is the core concurrency mechanism -- multiple pods can call this
 * simultaneously and each gets a disjoint set of jobs.
 */
async function claimPendingJobs(limit: number): Promise<JobRow[]> {
  const jobs = await sql`
    UPDATE rag.processing_jobs
    SET
      status = 'processing',
      started_at = NOW(),
      heartbeat_at = NOW(),
      attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM rag.processing_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING
      id, application_id, knowledge_source_id, type,
      payload, attempts, max_attempts, embedding_config, user_id
  `;
  return jobs as unknown as JobRow[];
}

/**
 * Update heartbeat timestamp for a running job.
 * If the process crashes, stale detection will find jobs whose
 * heartbeat stopped updating.
 */
async function updateHeartbeat(jobId: string): Promise<void> {
  await sql`
    UPDATE rag.processing_jobs
    SET heartbeat_at = NOW()
    WHERE id = ${jobId}::uuid
  `;
}

/**
 * Mark a job as completed.
 */
async function markCompleted(jobId: string): Promise<void> {
  await sql`
    UPDATE rag.processing_jobs
    SET status = 'completed', completed_at = NOW()
    WHERE id = ${jobId}::uuid
  `;
}

/**
 * Mark a job as failed. If attempts < max_attempts, reset to pending for retry.
 */
async function markFailed(
  jobId: string,
  error: string,
  attempts: number,
  maxAttempts: number
): Promise<void> {
  if (attempts < maxAttempts) {
    // Reset to pending for retry
    await sql`
      UPDATE rag.processing_jobs
      SET status = 'pending', last_error = ${error}, started_at = NULL, heartbeat_at = NULL
      WHERE id = ${jobId}::uuid
    `;
  } else {
    // Permanently failed
    await sql`
      UPDATE rag.processing_jobs
      SET status = 'failed', last_error = ${error}, completed_at = NOW()
      WHERE id = ${jobId}::uuid
    `;
  }
}

/**
 * Recover stale jobs -- jobs stuck in 'processing' whose heartbeat
 * is older than STALE_THRESHOLD_MINUTES. Resets them to pending
 * if under max_attempts, else marks failed.
 */
async function recoverStaleJobs(): Promise<number> {
  // Find stale jobs
  const stale = await sql`
    SELECT id, attempts, max_attempts
    FROM rag.processing_jobs
    WHERE status = 'processing'
      AND heartbeat_at < NOW() - INTERVAL '${sql.unsafe(String(STALE_THRESHOLD_MINUTES))} minutes'
  `;

  if (stale.length === 0) return 0;

  let recovered = 0;
  for (const job of stale) {
    const jobData = job as { id: string; attempts: number; max_attempts: number };
    if (jobData.attempts < jobData.max_attempts) {
      await sql`
        UPDATE rag.processing_jobs
        SET status = 'pending', last_error = 'Recovered from stale processing', started_at = NULL, heartbeat_at = NULL
        WHERE id = ${jobData.id}::uuid AND status = 'processing'
      `;
      recovered++;
    } else {
      await sql`
        UPDATE rag.processing_jobs
        SET status = 'failed', last_error = 'Exceeded max attempts (stale recovery)', completed_at = NOW()
        WHERE id = ${jobData.id}::uuid AND status = 'processing'
      `;
    }
  }

  if (recovered > 0) {
    log.info("Recovered stale jobs", {
      source: "job-processor",
      feature: "stale-recovery",
      staleCount: stale.length,
      recoveredCount: recovered,
    });
  }

  return recovered;
}

/**
 * Process a single job with heartbeat updates.
 */
async function processJobWithHeartbeat(job: JobRow): Promise<void> {
  const heartbeat = setInterval(() => {
    updateHeartbeat(job.id).catch((err) => {
      log.warn("Heartbeat update failed", {
        source: "job-processor",
        feature: "heartbeat",
        jobId: job.id,
        error: err.message,
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const payload = typeof job.payload === "string"
      ? JSON.parse(job.payload)
      : job.payload;
    const embeddingConfig = job.embedding_config
      ? (typeof job.embedding_config === "string"
          ? JSON.parse(job.embedding_config)
          : job.embedding_config)
      : undefined;

    switch (job.type) {
      case "file": {
        await processKnowledgeSource({
          knowledgeSourceId: job.knowledge_source_id,
          applicationId: job.application_id,
          userId: job.user_id || undefined,
          embeddingConfig,
        });
        break;
      }
      case "url":
      case "crawl_page": {
        const { markdown, sourceMetadata, url } = payload as {
          markdown: string;
          sourceMetadata?: Record<string, unknown>;
          url: string;
        };
        await processUrlContent({
          knowledgeSourceId: job.knowledge_source_id,
          applicationId: job.application_id,
          url,
          markdown,
          sourceMetadata,
          userId: job.user_id || undefined,
          embeddingConfig,
          skipDelete: job.type === "crawl_page",
        });
        break;
      }
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    await markCompleted(job.id);

    if (job.user_id) {
      await notifyJobCompleted(job.user_id, job.knowledge_source_id, {
        type: "processing_job_completed",
        jobId: job.id,
        knowledgeSourceId: job.knowledge_source_id,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    log.error("Job processing failed", {
      source: "job-processor",
      feature: "process-job",
      jobId: job.id,
      jobType: job.type,
      knowledgeSourceId: job.knowledge_source_id,
      applicationId: job.application_id,
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
    }, error);

    await markFailed(job.id, errorMessage, job.attempts, job.max_attempts);

    if (job.user_id && job.attempts >= job.max_attempts) {
      await notifyJobFailed(job.user_id, job.knowledge_source_id, errorMessage);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Main cron handler. Called every 30 seconds by Deno.cron.
 * Deno.cron guarantees non-overlapping execution per cron name.
 */
export async function processRagJobs(): Promise<void> {
  try {
    // 1. Recover stale jobs first
    await recoverStaleJobs();

    // 2. Claim and process a batch
    const jobs = await claimPendingJobs(BATCH_SIZE);

    if (jobs.length === 0) return;

    log.info("Processing job batch", {
      source: "job-processor",
      feature: "cron-tick",
      jobCount: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });

    // Process jobs concurrently within the batch
    await Promise.allSettled(
      jobs.map((job) => processJobWithHeartbeat(job))
    );
  } catch (error) {
    log.error("Cron tick failed", {
      source: "job-processor",
      feature: "cron-tick",
    }, error);
  }
}

/**
 * Create a processing job record.
 */
export async function createProcessingJob(params: {
  applicationId: string;
  knowledgeSourceId: string;
  type: "file" | "url" | "crawl_page";
  payload: Record<string, unknown>;
  embeddingConfig?: unknown;
  userId?: string;
  priority?: number;
}): Promise<string> {
  const result = await sql`
    INSERT INTO rag.processing_jobs (
      application_id,
      knowledge_source_id,
      type,
      payload,
      embedding_config,
      user_id,
      priority
    ) VALUES (
      ${params.applicationId}::uuid,
      ${params.knowledgeSourceId}::uuid,
      ${params.type},
      ${JSON.stringify(params.payload)}::jsonb,
      ${params.embeddingConfig ? JSON.stringify(params.embeddingConfig) : null}::jsonb,
      ${params.userId || null}::uuid,
      ${params.priority ?? 0}
    )
    RETURNING id
  `;
  return (result[0] as { id: string }).id;
}

/**
 * Get aggregate job progress for an application (last 24 hours).
 */
export async function getJobProgress(applicationId: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const result = await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'processing') AS processing,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM rag.processing_jobs
    WHERE application_id = ${applicationId}::uuid
      AND created_at > NOW() - INTERVAL '24 hours'
  `;

  const row = result[0] as Record<string, unknown>;
  return {
    total: Number(row.total || 0),
    pending: Number(row.pending || 0),
    processing: Number(row.processing || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
  };
}
