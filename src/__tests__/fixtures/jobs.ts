/**
 * Jobs Test Fixtures
 *
 * Provides utilities for creating and managing background jobs in tests.
 * Covers various job types: document processing, URL scraping, embeddings,
 * site crawling, and video generation.
 *
 * FIXTURE CATEGORIES:
 * - Job creation: Create jobs in different states
 * - Job status: pending, running, completed, failed, cancelled
 * - Job types: document, url, crawl, embedding, video
 * - Job logs: Log entries for testing log retrieval
 *
 * USAGE:
 *   import { createPendingJob, createCompletedJob } from "../fixtures/jobs.ts";
 *   const job = await createPendingJob(appId, { type: "document" });
 */

import { sql } from "../../db/client.ts";

// ========================================
// Types
// ========================================

export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type JobType =
  | "document"
  | "url"
  | "crawl"
  | "embedding"
  | "video"
  | "export";

export interface TestJob {
  id: string;
  applicationId: string;
  type: JobType;
  status: JobStatus;
  progress?: number;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TestJobLog {
  id: string;
  jobId: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ========================================
// Job Creation Helpers
// ========================================

/**
 * Create a pending job that hasn't started yet.
 */
export async function createPendingJob(
  applicationId: string,
  options: {
    type?: JobType;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TestJob> {
  const type = options.type || "document";
  const jobId = `test_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const [job] = await sql`
      INSERT INTO app.background_jobs (
        id,
        application_id,
        type,
        status,
        progress,
        metadata,
        created_at
      )
      VALUES (
        ${jobId},
        ${applicationId},
        ${type},
        ${"pending"},
        ${0},
        ${JSON.stringify(options.metadata || {})},
        NOW()
      )
      RETURNING id, application_id, type, status, progress, created_at
    `;

    return {
      id: job.id,
      applicationId: job.application_id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      progress: job.progress,
      createdAt: job.created_at,
    };
  } catch (_e) {
    // Table may not exist, return mock job
    return {
      id: jobId,
      applicationId,
      type,
      status: "pending",
      progress: 0,
      createdAt: new Date(),
    };
  }
}

/**
 * Create a running job with progress.
 */
export async function createRunningJob(
  applicationId: string,
  options: {
    type?: JobType;
    progress?: number;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<TestJob> {
  const type = options.type || "document";
  const progress = options.progress ?? 50;
  const jobId = `test_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const [job] = await sql`
      INSERT INTO app.background_jobs (
        id,
        application_id,
        type,
        status,
        progress,
        metadata,
        created_at,
        started_at
      )
      VALUES (
        ${jobId},
        ${applicationId},
        ${type},
        ${"running"},
        ${progress},
        ${JSON.stringify(options.metadata || {})},
        NOW() - INTERVAL '5 minutes',
        NOW() - INTERVAL '4 minutes'
      )
      RETURNING id, application_id, type, status, progress, created_at, started_at
    `;

    return {
      id: job.id,
      applicationId: job.application_id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      progress: job.progress,
      createdAt: job.created_at,
      startedAt: job.started_at,
    };
  } catch (_e) {
    return {
      id: jobId,
      applicationId,
      type,
      status: "running",
      progress,
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
      startedAt: new Date(Date.now() - 4 * 60 * 1000),
    };
  }
}

/**
 * Create a completed job with result data.
 */
export async function createCompletedJob(
  applicationId: string,
  options: {
    type?: JobType;
    result?: Record<string, unknown>;
    durationMs?: number;
  } = {}
): Promise<TestJob> {
  const type = options.type || "document";
  const durationMs = options.durationMs ?? 30000;
  const result = options.result || { success: true, itemsProcessed: 10 };
  const jobId = `test_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const [job] = await sql`
      INSERT INTO app.background_jobs (
        id,
        application_id,
        type,
        status,
        progress,
        result,
        created_at,
        started_at,
        completed_at
      )
      VALUES (
        ${jobId},
        ${applicationId},
        ${type},
        ${"completed"},
        ${100},
        ${JSON.stringify(result)},
        NOW() - INTERVAL '${durationMs + 10000} milliseconds',
        NOW() - INTERVAL '${durationMs} milliseconds',
        NOW()
      )
      RETURNING id, application_id, type, status, progress, result, created_at, started_at, completed_at
    `;

    return {
      id: job.id,
      applicationId: job.application_id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      progress: job.progress,
      result: job.result,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    };
  } catch (_e) {
    const now = Date.now();
    return {
      id: jobId,
      applicationId,
      type,
      status: "completed",
      progress: 100,
      result,
      createdAt: new Date(now - durationMs - 10000),
      startedAt: new Date(now - durationMs),
      completedAt: new Date(now),
    };
  }
}

/**
 * Create a failed job with error information.
 */
export async function createFailedJob(
  applicationId: string,
  options: {
    type?: JobType;
    error?: string;
    progress?: number;
  } = {}
): Promise<TestJob> {
  const type = options.type || "document";
  const error = options.error || "Processing failed: File format not supported";
  const progress = options.progress ?? 25;
  const jobId = `test_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const [job] = await sql`
      INSERT INTO app.background_jobs (
        id,
        application_id,
        type,
        status,
        progress,
        error,
        created_at,
        started_at,
        completed_at
      )
      VALUES (
        ${jobId},
        ${applicationId},
        ${type},
        ${"failed"},
        ${progress},
        ${error},
        NOW() - INTERVAL '10 minutes',
        NOW() - INTERVAL '9 minutes',
        NOW()
      )
      RETURNING id, application_id, type, status, progress, error, created_at, started_at, completed_at
    `;

    return {
      id: job.id,
      applicationId: job.application_id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      progress: job.progress,
      error: job.error,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    };
  } catch (_e) {
    const now = Date.now();
    return {
      id: jobId,
      applicationId,
      type,
      status: "failed",
      progress,
      error,
      createdAt: new Date(now - 10 * 60 * 1000),
      startedAt: new Date(now - 9 * 60 * 1000),
      completedAt: new Date(now),
    };
  }
}

/**
 * Create a cancelled job.
 */
export async function createCancelledJob(
  applicationId: string,
  options: {
    type?: JobType;
    progress?: number;
  } = {}
): Promise<TestJob> {
  const type = options.type || "document";
  const progress = options.progress ?? 50;
  const jobId = `test_job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    const [job] = await sql`
      INSERT INTO app.background_jobs (
        id,
        application_id,
        type,
        status,
        progress,
        created_at,
        started_at,
        completed_at
      )
      VALUES (
        ${jobId},
        ${applicationId},
        ${type},
        ${"cancelled"},
        ${progress},
        NOW() - INTERVAL '15 minutes',
        NOW() - INTERVAL '14 minutes',
        NOW()
      )
      RETURNING id, application_id, type, status, progress, created_at, started_at, completed_at
    `;

    return {
      id: job.id,
      applicationId: job.application_id,
      type: job.type as JobType,
      status: job.status as JobStatus,
      progress: job.progress,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    };
  } catch (_e) {
    const now = Date.now();
    return {
      id: jobId,
      applicationId,
      type,
      status: "cancelled",
      progress,
      createdAt: new Date(now - 15 * 60 * 1000),
      startedAt: new Date(now - 14 * 60 * 1000),
      completedAt: new Date(now),
    };
  }
}

// ========================================
// Job Type-Specific Creators
// ========================================

/**
 * Create a document processing job.
 */
export async function createDocumentJob(
  applicationId: string,
  options: {
    status?: JobStatus;
    fileName?: string;
    pageCount?: number;
    chunkCount?: number;
  } = {}
): Promise<TestJob> {
  const metadata = {
    fileName: options.fileName || "test-document.pdf",
    mimeType: "application/pdf",
  };

  const result =
    options.status === "completed"
      ? {
          pageCount: options.pageCount ?? 10,
          chunkCount: options.chunkCount ?? 25,
          tokenCount: 5000,
        }
      : undefined;

  switch (options.status || "pending") {
    case "running":
      return createRunningJob(applicationId, { type: "document", metadata });
    case "completed":
      return createCompletedJob(applicationId, { type: "document", result });
    case "failed":
      return createFailedJob(applicationId, { type: "document" });
    case "cancelled":
      return createCancelledJob(applicationId, { type: "document" });
    default:
      return createPendingJob(applicationId, { type: "document", metadata });
  }
}

/**
 * Create a URL scraping job.
 */
export async function createUrlJob(
  applicationId: string,
  options: {
    status?: JobStatus;
    url?: string;
  } = {}
): Promise<TestJob> {
  const metadata = {
    url: options.url || "https://example.com/article",
  };

  const result =
    options.status === "completed"
      ? {
          title: "Example Article",
          contentLength: 5000,
          chunkCount: 5,
        }
      : undefined;

  switch (options.status || "pending") {
    case "running":
      return createRunningJob(applicationId, { type: "url", metadata });
    case "completed":
      return createCompletedJob(applicationId, { type: "url", result });
    case "failed":
      return createFailedJob(applicationId, {
        type: "url",
        error: "Failed to fetch URL: Connection timeout",
      });
    default:
      return createPendingJob(applicationId, { type: "url", metadata });
  }
}

/**
 * Create a site crawling job.
 */
export async function createCrawlJob(
  applicationId: string,
  options: {
    status?: JobStatus;
    siteUrl?: string;
    maxPages?: number;
    pagesFound?: number;
    pagesProcessed?: number;
  } = {}
): Promise<TestJob> {
  const metadata = {
    siteUrl: options.siteUrl || "https://example.com",
    maxPages: options.maxPages ?? 50,
  };

  const result =
    options.status === "completed"
      ? {
          pagesFound: options.pagesFound ?? 25,
          pagesProcessed: options.pagesProcessed ?? 25,
          totalChunks: 150,
        }
      : undefined;

  switch (options.status || "pending") {
    case "running":
      return createRunningJob(applicationId, {
        type: "crawl",
        metadata,
        progress: Math.floor(
          ((options.pagesProcessed ?? 12) / (options.maxPages ?? 50)) * 100
        ),
      });
    case "completed":
      return createCompletedJob(applicationId, { type: "crawl", result });
    case "failed":
      return createFailedJob(applicationId, {
        type: "crawl",
        error: "Crawl failed: robots.txt disallowed",
      });
    default:
      return createPendingJob(applicationId, { type: "crawl", metadata });
  }
}

/**
 * Create an embedding generation job.
 */
export async function createEmbeddingJob(
  applicationId: string,
  options: {
    status?: JobStatus;
    chunkCount?: number;
    tokenCount?: number;
  } = {}
): Promise<TestJob> {
  const chunkCount = options.chunkCount ?? 50;

  const result =
    options.status === "completed"
      ? {
          chunksEmbedded: chunkCount,
          tokenCount: options.tokenCount ?? chunkCount * 200,
          model: "text-embedding-3-small",
        }
      : undefined;

  switch (options.status || "pending") {
    case "running":
      return createRunningJob(applicationId, {
        type: "embedding",
        progress: 60,
      });
    case "completed":
      return createCompletedJob(applicationId, { type: "embedding", result });
    case "failed":
      return createFailedJob(applicationId, {
        type: "embedding",
        error: "Embedding failed: Rate limit exceeded",
      });
    default:
      return createPendingJob(applicationId, { type: "embedding" });
  }
}

/**
 * Create a video generation job.
 */
export async function createVideoJob(
  applicationId: string,
  options: {
    status?: JobStatus;
    prompt?: string;
    videoUrl?: string;
  } = {}
): Promise<TestJob> {
  const metadata = {
    prompt: options.prompt || "A cat playing piano",
    model: "veo-2",
  };

  const result =
    options.status === "completed"
      ? {
          videoUrl:
            options.videoUrl || "https://storage.example.com/video-123.mp4",
          durationSeconds: 10,
          resolution: "1080p",
        }
      : undefined;

  switch (options.status || "pending") {
    case "running":
      return createRunningJob(applicationId, {
        type: "video",
        metadata,
        progress: 40,
      });
    case "completed":
      return createCompletedJob(applicationId, { type: "video", result });
    case "failed":
      return createFailedJob(applicationId, {
        type: "video",
        error: "Video generation failed: Content policy violation",
      });
    default:
      return createPendingJob(applicationId, { type: "video", metadata });
  }
}

// ========================================
// Job Logs
// ========================================

/**
 * Add log entries to a job.
 */
export async function addJobLogs(
  jobId: string,
  logs: Array<{
    level?: "info" | "warn" | "error" | "debug";
    message: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<TestJobLog[]> {
  const createdLogs: TestJobLog[] = [];

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const logId = `test_log_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;

    try {
      const [created] = await sql`
        INSERT INTO app.job_logs (
          id,
          job_id,
          level,
          message,
          metadata,
          timestamp
        )
        VALUES (
          ${logId},
          ${jobId},
          ${log.level || "info"},
          ${log.message},
          ${JSON.stringify(log.metadata || {})},
          NOW() - INTERVAL '${(logs.length - i) * 1000} milliseconds'
        )
        RETURNING id, job_id, level, message, metadata, timestamp
      `;

      createdLogs.push({
        id: created.id,
        jobId: created.job_id,
        level: created.level,
        message: created.message,
        timestamp: created.timestamp,
        metadata: created.metadata,
      });
    } catch (_e) {
      // Table may not exist, create mock log
      createdLogs.push({
        id: logId,
        jobId,
        level: log.level || "info",
        message: log.message,
        timestamp: new Date(Date.now() - (logs.length - i) * 1000),
        metadata: log.metadata,
      });
    }
  }

  return createdLogs;
}

/**
 * Create a job with sample logs.
 */
export async function createJobWithLogs(
  applicationId: string,
  options: {
    type?: JobType;
    status?: JobStatus;
    logCount?: number;
    includeErrors?: boolean;
  } = {}
): Promise<{ job: TestJob; logs: TestJobLog[] }> {
  const logCount = options.logCount ?? 10;
  const status = options.status || "running";

  // Create the job
  let job: TestJob;
  switch (status) {
    case "completed":
      job = await createCompletedJob(applicationId, { type: options.type });
      break;
    case "failed":
      job = await createFailedJob(applicationId, { type: options.type });
      break;
    case "running":
      job = await createRunningJob(applicationId, { type: options.type });
      break;
    default:
      job = await createPendingJob(applicationId, { type: options.type });
  }

  // Create log entries
  const logEntries: Array<{
    level: "info" | "warn" | "error" | "debug";
    message: string;
  }> = [];

  for (let i = 0; i < logCount; i++) {
    let level: "info" | "warn" | "error" | "debug" = "info";

    if (options.includeErrors && i === logCount - 2) {
      level = "warn";
    }
    if (options.includeErrors && i === logCount - 1) {
      level = "error";
    }

    logEntries.push({
      level,
      message: `Processing step ${i + 1} of ${logCount}`,
    });
  }

  const logs = await addJobLogs(job.id, logEntries);

  return { job, logs };
}

// ========================================
// Batch Creation
// ========================================

/**
 * Create multiple jobs for pagination testing.
 */
export async function createMultipleJobs(
  applicationId: string,
  count: number,
  options: {
    type?: JobType;
    statusDistribution?: Partial<Record<JobStatus, number>>;
  } = {}
): Promise<TestJob[]> {
  const jobs: TestJob[] = [];
  const type = options.type || "document";

  // Default distribution if not specified
  const distribution = options.statusDistribution || {
    pending: Math.ceil(count * 0.2),
    running: Math.ceil(count * 0.2),
    completed: Math.ceil(count * 0.4),
    failed: Math.floor(count * 0.1),
    cancelled: Math.floor(count * 0.1),
  };

  for (const [status, statusCount] of Object.entries(distribution)) {
    for (let i = 0; i < (statusCount || 0); i++) {
      let job: TestJob;
      switch (status as JobStatus) {
        case "running":
          job = await createRunningJob(applicationId, { type });
          break;
        case "completed":
          job = await createCompletedJob(applicationId, { type });
          break;
        case "failed":
          job = await createFailedJob(applicationId, { type });
          break;
        case "cancelled":
          job = await createCancelledJob(applicationId, { type });
          break;
        default:
          job = await createPendingJob(applicationId, { type });
      }
      jobs.push(job);
    }
  }

  return jobs;
}

// ========================================
// Cleanup
// ========================================

/**
 * Clean up all test jobs for an application.
 */
export async function cleanupAppJobs(applicationId: string): Promise<void> {
  try {
    // Delete logs first (foreign key)
    await sql`
      DELETE FROM app.job_logs
      WHERE job_id IN (
        SELECT id FROM app.background_jobs
        WHERE application_id = ${applicationId}
        AND id LIKE 'test_%'
      )
    `;

    // Delete jobs
    await sql`
      DELETE FROM app.background_jobs
      WHERE application_id = ${applicationId}
      AND id LIKE 'test_%'
    `;
  } catch (_e) {
    // Tables may not exist
  }
}

/**
 * Clean up all test jobs in the database.
 */
export async function cleanupAllTestJobs(): Promise<void> {
  try {
    await sql`
      DELETE FROM app.job_logs
      WHERE job_id LIKE 'test_%'
    `;

    await sql`
      DELETE FROM app.background_jobs
      WHERE id LIKE 'test_%'
    `;
  } catch (_e) {
    // Tables may not exist
  }
}
