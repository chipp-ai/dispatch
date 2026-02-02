/**
 * Custom Action Routes
 *
 * CRUD operations for user-defined tools (custom actions).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { customActionService } from "../../../services/custom-action.service.ts";
import {
  createToolSchema,
  updateToolSchema,
} from "../../validators/custom-action.ts";

export const customActionRoutes = new Hono<AuthContext>();

/**
 * GET /applications/:appId/tools
 * List all tools for an application
 */
customActionRoutes.get("/applications/:appId/tools", async (c) => {
  const user = c.get("user");
  const { appId } = c.req.param();

  const tools = await customActionService.list(appId, user.id);
  return c.json({ data: tools });
});

/**
 * GET /tools/:id
 * Get a single tool
 */
customActionRoutes.get("/tools/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const tool = await customActionService.get(id, user.id);
  return c.json({ data: tool });
});

/**
 * POST /applications/:appId/tools
 * Create a new tool
 */
customActionRoutes.post(
  "/applications/:appId/tools",
  zValidator("json", createToolSchema),
  async (c) => {
    const user = c.get("user");
    const { appId } = c.req.param();
    const body = c.req.valid("json");

    const tool = await customActionService.create({
      applicationId: appId,
      userId: user.id,
      name: body.name,
      slug: body.slug,
      description: body.description,
      url: body.url,
      method: body.method,
      headers: body.headers,
      pathParams: body.pathParams,
      queryParams: body.queryParams,
      bodyParams: body.bodyParams,
      variables: body.variables,
      presentTenseVerb: body.presentTenseVerb,
      pastTenseVerb: body.pastTenseVerb,
    });

    return c.json({ data: tool }, 201);
  }
);

/**
 * PATCH /tools/:id
 * Update a tool
 */
customActionRoutes.patch(
  "/tools/:id",
  zValidator("json", updateToolSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const tool = await customActionService.update(id, user.id, {
      name: body.name,
      description: body.description,
      url: body.url,
      method: body.method,
      headers: body.headers,
      pathParams: body.pathParams,
      queryParams: body.queryParams,
      bodyParams: body.bodyParams,
      variables: body.variables,
      presentTenseVerb: body.presentTenseVerb,
      pastTenseVerb: body.pastTenseVerb,
    });

    return c.json({ data: tool });
  }
);

/**
 * DELETE /tools/:id
 * Delete a tool
 */
customActionRoutes.delete("/tools/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  await customActionService.delete(id, user.id);
  return c.json({ success: true });
});

