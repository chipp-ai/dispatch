/**
 * Knowledge Source Routes
 *
 * CRUD operations for knowledge sources (files, URLs, etc.)
 * Used for RAG (Retrieval-Augmented Generation).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { knowledgeSourceService } from "../../../services/knowledge-source.service.ts";
import { getJobProgress } from "../../../services/job-processor.service.ts";
import {
  createKnowledgeSourceSchema,
  updateKnowledgeSourceSchema,
  listKnowledgeSourcesQuerySchema,
} from "../../validators/knowledge-source.ts";

export const knowledgeSourceRoutes = new Hono<AuthContext>();

/**
 * GET /knowledge-sources
 * List knowledge sources for an application
 */
knowledgeSourceRoutes.get(
  "/",
  zValidator("query", listKnowledgeSourcesQuerySchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");

    const sources = await knowledgeSourceService.list({
      applicationId: query.applicationId,
      userId: user.id,
      status: query.status,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json({ data: sources });
  }
);

/**
 * GET /knowledge-sources/progress
 * Get aggregate processing job progress for an application (last 24 hours)
 */
knowledgeSourceRoutes.get("/progress", async (c) => {
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json({ error: "applicationId query parameter required" }, 400);
  }

  const progress = await getJobProgress(applicationId);
  return c.json({ data: progress });
});

/**
 * GET /knowledge-sources/:id
 * Get a single knowledge source
 */
knowledgeSourceRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const source = await knowledgeSourceService.get(id, user.id);
  return c.json({ data: source });
});

/**
 * POST /knowledge-sources
 * Create a new knowledge source (from URL or file reference)
 */
knowledgeSourceRoutes.post(
  "/",
  zValidator("json", createKnowledgeSourceSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const source = await knowledgeSourceService.create({
      applicationId: body.applicationId,
      userId: user.id,
      type: body.type,
      name: body.name,
      url: body.url,
      filePath: body.filePath,
      metadata: body.metadata,
    });

    return c.json({ data: source }, 201);
  }
);

/**
 * PATCH /knowledge-sources/:id
 * Update a knowledge source
 */
knowledgeSourceRoutes.patch(
  "/:id",
  zValidator("json", updateKnowledgeSourceSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const source = await knowledgeSourceService.update(id, user.id, body);
    return c.json({ data: source });
  }
);

/**
 * DELETE /knowledge-sources/:id
 * Delete a knowledge source and all its chunks
 */
knowledgeSourceRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await knowledgeSourceService.delete(id, user.id);
  return c.json({ success: true });
});

/**
 * POST /knowledge-sources/:id/reprocess
 * Trigger reprocessing of a knowledge source
 */
knowledgeSourceRoutes.post("/:id/reprocess", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await knowledgeSourceService.reprocess(id, user.id);
  return c.json({ success: true });
});

