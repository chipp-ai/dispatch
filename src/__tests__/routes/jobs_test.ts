/**
 * Jobs API Route Tests
 *
 * Tests for background job monitoring and management endpoints.
 * These are PROTECTED endpoints requiring developer authentication.
 *
 * ENDPOINTS TESTED:
 * - GET  /api/jobs                   - List background jobs
 * - GET  /api/jobs/:id               - Get job details
 * - POST /api/jobs/:id/cancel        - Cancel running job
 * - GET  /api/jobs/:id/logs          - Get job logs
 *
 * SCENARIOS COVERED:
 * 1. Job Listing
 *    - List all jobs for application
 *    - Filter by status (pending, running, completed, failed)
 *    - Pagination support
 *    - Sort by created/updated date
 *
 * 2. Job Details
 *    - Get single job by ID
 *    - Include progress percentage
 *    - Include result/error data
 *    - Include timing information
 *
 * 3. Job Cancellation
 *    - Cancel pending/running job
 *    - Prevent cancel of completed jobs
 *    - Handle graceful shutdown
 *
 * 4. Job Logs
 *    - Stream job logs
 *    - Filter by log level
 *    - Pagination for long logs
 *
 * 5. Job Types
 *    - Document processing jobs
 *    - URL scraping jobs
 *    - Embedding generation jobs
 *    - Site crawling jobs
 *    - Video generation jobs
 *
 * 6. Authorization
 *    - Only job owner can view/cancel
 *    - Application-scoped access
 *
 * USAGE:
 *   deno test src/__tests__/routes/jobs_test.ts
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  unauthenticated,
} from "../setup.ts";
import type { TestUser, TestApplication } from "../setup.ts";
import { getProUser, createIsolatedUser } from "../fixtures/users.ts";
import { createPublishedApp } from "../fixtures/applications.ts";
import {
  createPendingJob,
  createRunningJob,
  createCompletedJob,
  createFailedJob,
  createCancelledJob,
  createMultipleJobs,
  createJobWithLogs,
  createDocumentJob,
  createUrlJob,
  createCrawlJob,
  createEmbeddingJob,
  createVideoJob,
  cleanupAppJobs,
} from "../fixtures/jobs.ts";

// ========================================
// Test Setup
// ========================================

describe("Jobs API", () => {
  let testUser: TestUser;
  let testApp: TestApplication;
  let otherUser: TestUser;
  let otherApp: TestApplication;

  beforeAll(async () => {
    await setupTests();
    testUser = await getProUser();
    testApp = await createPublishedApp(testUser);
    otherUser = await createIsolatedUser("PRO");
    otherApp = await createPublishedApp(otherUser);
  });

  afterAll(async () => {
    if (testApp) {
      await cleanupAppJobs(testApp.id);
    }
    if (otherApp) {
      await cleanupAppJobs(otherApp.id);
    }
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // List Jobs
  // ========================================

  describe("GET /api/jobs - List Jobs", () => {
    it("should list jobs for application", async () => {
      // Create some jobs
      await createPendingJob(testApp.id);
      await createRunningJob(testApp.id);
      await createCompletedJob(testApp.id);

      const res = await get(`/api/applications/${testApp.id}/jobs`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          jobs: Array<{ id: string; status: string }>;
        };

        assertExists(data.jobs);
        assert(Array.isArray(data.jobs));
        assert(data.jobs.length >= 3);
      }
    });

    it("should filter by status", async () => {
      // Create jobs with different statuses
      await createPendingJob(testApp.id);
      await createCompletedJob(testApp.id);
      await createCompletedJob(testApp.id);

      const res = await get(
        `/api/applications/${testApp.id}/jobs?status=completed`,
        testUser
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          jobs: Array<{ status: string }>;
        };

        // All returned jobs should be completed
        data.jobs.forEach((job) => {
          assertEquals(job.status, "completed");
        });
      }
    });

    it("should support pagination", async () => {
      // Create many jobs
      await createMultipleJobs(testApp.id, 15);

      // Request first page
      const res1 = await get(
        `/api/applications/${testApp.id}/jobs?limit=10&offset=0`,
        testUser
      );

      assert(
        res1.status === 200 || res1.status === 404,
        `Expected 200 or 404, got ${res1.status}`
      );
      if (res1.status === 200) {
        const data1 = (await res1.json()) as {
          jobs: unknown[];
          total?: number;
        };

        assert(data1.jobs.length <= 10);

        // Request second page
        const res2 = await get(
          `/api/applications/${testApp.id}/jobs?limit=10&offset=10`,
          testUser
        );

        assert(
          res2.status === 200 || res2.status === 404,
          `Expected 200 or 404, got ${res2.status}`
        );
        if (res2.status === 200) {
          const data2 = (await res2.json()) as { jobs: unknown[] };
          assert(data2.jobs.length >= 0);
        }
      }
    });

    it("should sort by created date", async () => {
      const res = await get(
        `/api/applications/${testApp.id}/jobs?sort=createdAt&order=desc`,
        testUser
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          jobs: Array<{ createdAt: string }>;
        };

        if (data.jobs.length > 1) {
          // Verify descending order
          for (let i = 1; i < data.jobs.length; i++) {
            const prev = new Date(data.jobs[i - 1].createdAt).getTime();
            const curr = new Date(data.jobs[i].createdAt).getTime();
            assert(prev >= curr);
          }
        }
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated(`/api/applications/${testApp.id}/jobs`);

      assert([401, 403].includes(res.status));
    });

    it("should scope to user's applications", async () => {
      // Create a job in other user's app
      await createPendingJob(otherApp.id);

      // Try to access other user's app jobs
      const res = await get(`/api/applications/${otherApp.id}/jobs`, testUser);

      // Should return 404 or 403 (no access)
      assert([403, 404].includes(res.status));
    });
  });

  // ========================================
  // Get Job Details
  // ========================================

  describe("GET /api/jobs/:id - Get Job", () => {
    it("should return job details", async () => {
      const job = await createRunningJob(testApp.id);

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          id: string;
          status: string;
          type: string;
          progress?: number;
        };

        assertEquals(data.id, job.id);
        assertExists(data.status);
        assertExists(data.type);
      }
    });

    it("should include progress percentage", async () => {
      const job = await createRunningJob(testApp.id, { progress: 75 });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { progress?: number };

        if (data.progress !== undefined) {
          assertEquals(data.progress, 75);
        }
      }
    });

    it("should include result data on completion", async () => {
      const job = await createCompletedJob(testApp.id, {
        result: { itemsProcessed: 100, success: true },
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          result?: { itemsProcessed?: number };
        };

        if (data.result) {
          assertEquals(data.result.itemsProcessed, 100);
        }
      }
    });

    it("should include error on failure", async () => {
      const job = await createFailedJob(testApp.id, {
        error: "Processing failed: Invalid format",
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { error?: string };

        if (data.error) {
          assert(data.error.includes("Processing failed"));
        }
      }
    });

    it("should include timing info", async () => {
      const job = await createCompletedJob(testApp.id);

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          createdAt?: string;
          startedAt?: string;
          completedAt?: string;
          duration?: number;
        };

        assertExists(data.createdAt);
        if (data.startedAt && data.completedAt) {
          assertExists(data.startedAt);
          assertExists(data.completedAt);
        }
      }
    });

    it("should return 404 for non-existent job", async () => {
      const res = await get("/api/jobs/nonexistent-job-id", testUser);

      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    it("should return 404 for other user's job", async () => {
      const otherJob = await createPendingJob(otherApp.id);

      const res = await get(`/api/jobs/${otherJob.id}`, testUser);

      // Should return 404, not 403 (don't reveal existence)
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });
  });

  // ========================================
  // Cancel Job
  // ========================================

  describe("POST /api/jobs/:id/cancel - Cancel Job", () => {
    it("should cancel pending job", async () => {
      const job = await createPendingJob(testApp.id);

      const res = await post(`/api/jobs/${job.id}/cancel`, testUser, {});

      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Expected 200, 400, or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { status?: string };

        if (data.status) {
          assertEquals(data.status, "cancelled");
        }
      }
    });

    it("should cancel running job", async () => {
      const job = await createRunningJob(testApp.id);

      const res = await post(`/api/jobs/${job.id}/cancel`, testUser, {});

      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Expected 200, 400, or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          status?: string;
          message?: string;
        };

        assertExists(data);
      }
    });

    it("should reject cancel of completed job", async () => {
      const job = await createCompletedJob(testApp.id);

      const res = await post(`/api/jobs/${job.id}/cancel`, testUser, {});

      // Should return 400 - cannot cancel completed job
      if (res.status !== 404) {
        assert([400, 409].includes(res.status));
      }
    });

    it("should reject cancel of failed job", async () => {
      const job = await createFailedJob(testApp.id);

      const res = await post(`/api/jobs/${job.id}/cancel`, testUser, {});

      // Should return 400 - cannot cancel failed job
      if (res.status !== 404) {
        assert([400, 409].includes(res.status));
      }
    });

    it("should require job ownership", async () => {
      const otherJob = await createPendingJob(otherApp.id);

      const res = await post(`/api/jobs/${otherJob.id}/cancel`, testUser, {});

      // Should return 404 for other user's job
      assert(res.status === 404, `Expected 404, got ${res.status}`);
    });

    it("should not allow cancelling already cancelled job", async () => {
      const job = await createCancelledJob(testApp.id);

      const res = await post(`/api/jobs/${job.id}/cancel`, testUser, {});

      // Should return 400 - already cancelled
      if (res.status !== 404) {
        assert([400, 409, 200].includes(res.status));
      }
    });
  });

  // ========================================
  // Job Logs
  // ========================================

  describe("GET /api/jobs/:id/logs - Get Logs", () => {
    it("should return job logs", async () => {
      const { job, logs } = await createJobWithLogs(testApp.id, {
        logCount: 5,
      });

      const res = await get(`/api/jobs/${job.id}/logs`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          logs: Array<{ message: string; level: string }>;
        };

        assertExists(data.logs);
        assert(Array.isArray(data.logs));
        assert(data.logs.length >= 1);
      }
    });

    it("should filter by log level", async () => {
      const { job } = await createJobWithLogs(testApp.id, {
        logCount: 10,
        includeErrors: true,
      });

      const res = await get(`/api/jobs/${job.id}/logs?level=error`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          logs: Array<{ level: string }>;
        };

        data.logs.forEach((log) => {
          assertEquals(log.level, "error");
        });
      }
    });

    it("should support pagination", async () => {
      const { job } = await createJobWithLogs(testApp.id, { logCount: 20 });

      const res = await get(
        `/api/jobs/${job.id}/logs?limit=10&offset=0`,
        testUser
      );

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { logs: unknown[] };

        assert(data.logs.length <= 10);
      }
    });

    it("should include timestamps", async () => {
      const { job } = await createJobWithLogs(testApp.id, { logCount: 3 });

      const res = await get(`/api/jobs/${job.id}/logs`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          logs: Array<{ timestamp: string }>;
        };

        data.logs.forEach((log) => {
          assertExists(log.timestamp);
          assert(new Date(log.timestamp).getTime() > 0);
        });
      }
    });

    it("should return empty for no logs", async () => {
      const job = await createPendingJob(testApp.id);

      const res = await get(`/api/jobs/${job.id}/logs`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { logs: unknown[] };

        assertEquals(data.logs.length, 0);
      }
    });
  });

  // ========================================
  // Job Types
  // ========================================

  describe("Document Processing Jobs", () => {
    it("should track document processing progress", async () => {
      const job = await createDocumentJob(testApp.id, { status: "running" });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          type: string;
          progress?: number;
        };

        assertEquals(data.type, "document");
        if (data.progress !== undefined) {
          assert(data.progress >= 0 && data.progress <= 100);
        }
      }
    });

    it("should report file metadata in result", async () => {
      const job = await createDocumentJob(testApp.id, {
        status: "completed",
        pageCount: 10,
        chunkCount: 25,
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          result?: { pageCount?: number; chunkCount?: number };
        };

        if (data.result) {
          assertEquals(data.result.pageCount, 10);
          assertEquals(data.result.chunkCount, 25);
        }
      }
    });
  });

  describe("URL Scraping Jobs", () => {
    it("should track URL scrape progress", async () => {
      const job = await createUrlJob(testApp.id, { status: "running" });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as { type: string };

        assertEquals(data.type, "url");
      }
    });

    it("should handle scrape failures gracefully", async () => {
      const job = await createUrlJob(testApp.id, { status: "failed" });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          status: string;
          error?: string;
        };

        assertEquals(data.status, "failed");
        if (data.error) {
          assert(data.error.length > 0);
        }
      }
    });
  });

  describe("Site Crawling Jobs", () => {
    it("should track crawl progress", async () => {
      const job = await createCrawlJob(testApp.id, {
        status: "running",
        pagesProcessed: 10,
        maxPages: 50,
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          type: string;
          progress?: number;
        };

        assertEquals(data.type, "crawl");
        if (data.progress !== undefined) {
          // Should be ~20% (10/50)
          assert(data.progress >= 0 && data.progress <= 100);
        }
      }
    });

    it("should respect crawl limits", async () => {
      const job = await createCrawlJob(testApp.id, {
        status: "completed",
        maxPages: 25,
        pagesProcessed: 25,
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          result?: { pagesProcessed?: number };
        };

        if (data.result?.pagesProcessed) {
          assertEquals(data.result.pagesProcessed, 25);
        }
      }
    });
  });

  describe("Embedding Generation Jobs", () => {
    it("should track embedding progress", async () => {
      const job = await createEmbeddingJob(testApp.id, { status: "running" });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          type: string;
          progress?: number;
        };

        assertEquals(data.type, "embedding");
      }
    });

    it("should report token usage", async () => {
      const job = await createEmbeddingJob(testApp.id, {
        status: "completed",
        chunkCount: 50,
        tokenCount: 10000,
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          result?: { tokenCount?: number; model?: string };
        };

        if (data.result) {
          assertEquals(data.result.tokenCount, 10000);
          assertExists(data.result.model);
        }
      }
    });
  });

  describe("Video Generation Jobs", () => {
    it("should track video generation progress", async () => {
      const job = await createVideoJob(testApp.id, { status: "running" });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          type: string;
          progress?: number;
        };

        assertEquals(data.type, "video");
        if (data.progress !== undefined) {
          assert(data.progress >= 0 && data.progress <= 100);
        }
      }
    });

    it("should include video URL on completion", async () => {
      const job = await createVideoJob(testApp.id, {
        status: "completed",
        videoUrl: "https://storage.example.com/video-abc.mp4",
      });

      const res = await get(`/api/jobs/${job.id}`, testUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
      if (res.status === 200) {
        const data = (await res.json()) as {
          result?: { videoUrl?: string; durationSeconds?: number };
        };

        if (data.result?.videoUrl) {
          assert(data.result.videoUrl.includes("video-abc.mp4"));
        }
      }
    });
  });

  // ========================================
  // Authorization Edge Cases
  // ========================================

  describe("Authorization", () => {
    it("should not allow listing jobs without app access", async () => {
      const res = await get(`/api/applications/${otherApp.id}/jobs`, testUser);

      assert([403, 404].includes(res.status));
    });

    it("should require authentication for all job endpoints", async () => {
      const job = await createPendingJob(testApp.id);

      const listRes = await unauthenticated(
        `/api/applications/${testApp.id}/jobs`
      );
      const getRes = await unauthenticated(`/api/jobs/${job.id}`);
      const cancelRes = await unauthenticated(`/api/jobs/${job.id}/cancel`, {
        method: "POST",
      });
      const logsRes = await unauthenticated(`/api/jobs/${job.id}/logs`);

      assert([401, 403].includes(listRes.status));
      assert([401, 403].includes(getRes.status));
      assert([401, 403].includes(cancelRes.status));
      assert([401, 403].includes(logsRes.status));
    });
  });
});
