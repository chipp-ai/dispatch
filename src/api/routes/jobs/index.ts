/**
 * Jobs Routes
 *
 * API endpoints for tracking async job history (file uploads, URL crawls, etc.)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { jobService } from "../../../services/job.service.ts";
import { listJobsQuerySchema } from "../../validators/job.ts";

export const jobRoutes = new Hono<AuthContext>();

/**
 * GET /jobs
 * List jobs for an application
 */
jobRoutes.get("/", zValidator("query", listJobsQuerySchema), async (c) => {
  const user = c.get("user");
  const query = c.req.valid("query");

  const jobs = await jobService.list({
    applicationId: query.applicationId,
    userId: user.id,
    status: query.status,
    jobType: query.jobType,
    limit: query.limit,
    offset: query.offset,
  });

  return c.json({ data: jobs });
});

/**
 * GET /jobs/:workflowId
 * Get a single job by workflow ID
 */
jobRoutes.get("/:workflowId", async (c) => {
  const user = c.get("user");
  const { workflowId } = c.req.param();

  const job = await jobService.getByWorkflowId(workflowId, user.id);
  return c.json({ data: job });
});
