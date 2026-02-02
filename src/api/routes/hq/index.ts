/**
 * Public HQ Routes
 *
 * Public-facing endpoints for workspace HQ pages.
 * These routes do not require authentication.
 */

import { Hono } from "hono";
import { workspaceService } from "../../../services/workspace.service.ts";

export const hqRoutes = new Hono();

/**
 * GET /hq/:slug
 * Get public HQ data by slug
 */
hqRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const result = await workspaceService.getPublicHQ(slug);

  if (!result) {
    return c.json(
      {
        error: "Not Found",
        message: "HQ not found or not public",
      },
      404
    );
  }

  return c.json({
    data: result,
  });
});
