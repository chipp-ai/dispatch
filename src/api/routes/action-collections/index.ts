/**
 * Action Collections Routes
 *
 * API endpoints for action collections, actions, and contributions
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { actionCollectionService } from "../../../services/action-collection.service.ts";
import {
  createCollectionSchema,
  updateCollectionSchema,
  listCollectionsQuerySchema,
  addActionSchema,
  createContributionSchema,
  reviewContributionSchema,
  listContributionsQuerySchema,
} from "../../validators/action-collection.ts";

export const actionCollectionRoutes = new Hono<AuthContext>();

// ============================================
// Collection Routes
// ============================================

/**
 * GET /action-collections
 * List collections accessible to user
 */
actionCollectionRoutes.get(
  "/",
  zValidator("query", listCollectionsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");

    const result = await actionCollectionService.list({
      userId: user.id,
      workspaceId: query.workspaceId,
      scope: query.scope,
      includeActions: query.includeActions,
      limit: query.limit,
      offset: query.offset,
    });

    return c.json({ data: result });
  }
);

/**
 * POST /action-collections
 * Create a new collection
 */
actionCollectionRoutes.post(
  "/",
  zValidator("json", createCollectionSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const collection = await actionCollectionService.create(user.id, body);

    return c.json({ data: collection }, 201);
  }
);

/**
 * GET /action-collections/:collectionId
 * Get a specific collection
 */
actionCollectionRoutes.get("/:collectionId", async (c) => {
  const user = c.get("user");
  const { collectionId } = c.req.param();

  const collection = await actionCollectionService.get(collectionId, user.id);

  return c.json({ data: collection });
});

/**
 * PATCH /action-collections/:collectionId
 * Update a collection
 */
actionCollectionRoutes.patch(
  "/:collectionId",
  zValidator("json", updateCollectionSchema),
  async (c) => {
    const user = c.get("user");
    const { collectionId } = c.req.param();
    const body = c.req.valid("json");

    const collection = await actionCollectionService.update(
      collectionId,
      user.id,
      body
    );

    return c.json({ data: collection });
  }
);

/**
 * DELETE /action-collections/:collectionId
 * Delete a collection (soft delete)
 */
actionCollectionRoutes.delete("/:collectionId", async (c) => {
  const user = c.get("user");
  const { collectionId } = c.req.param();

  await actionCollectionService.remove(collectionId, user.id);

  return c.json({ success: true });
});

// ============================================
// Collection Actions Routes
// ============================================

/**
 * GET /action-collections/:collectionId/actions
 * Get actions in a collection
 */
actionCollectionRoutes.get("/:collectionId/actions", async (c) => {
  const user = c.get("user");
  const { collectionId } = c.req.param();

  const actions = await actionCollectionService.getActions(
    collectionId,
    user.id
  );

  return c.json({ data: actions });
});

/**
 * POST /action-collections/:collectionId/actions
 * Add an action to a collection
 */
actionCollectionRoutes.post(
  "/:collectionId/actions",
  zValidator("json", addActionSchema),
  async (c) => {
    const user = c.get("user");
    const { collectionId } = c.req.param();
    const body = c.req.valid("json");

    const action = await actionCollectionService.addAction(
      collectionId,
      user.id,
      body.actionData
    );

    return c.json({ data: action }, 201);
  }
);

/**
 * DELETE /action-collections/:collectionId/actions/:actionId
 * Remove an action from a collection
 */
actionCollectionRoutes.delete("/:collectionId/actions/:actionId", async (c) => {
  const user = c.get("user");
  const { collectionId, actionId } = c.req.param();

  await actionCollectionService.removeAction(collectionId, actionId, user.id);

  return c.json({ success: true });
});

// ============================================
// Contribution Routes
// ============================================

/**
 * GET /action-collections/:collectionId/contributions
 * List contributions for a collection
 */
actionCollectionRoutes.get(
  "/:collectionId/contributions",
  zValidator("query", listContributionsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { collectionId } = c.req.param();
    const query = c.req.valid("query");

    const contributions = await actionCollectionService.listContributions(
      collectionId,
      user.id,
      query.status
    );

    return c.json({ data: contributions });
  }
);

/**
 * POST /action-collections/:collectionId/contributions
 * Create a contribution (PR) for a collection action
 */
actionCollectionRoutes.post(
  "/:collectionId/contributions",
  zValidator("json", createContributionSchema),
  async (c) => {
    const user = c.get("user");
    const { collectionId } = c.req.param();
    const body = c.req.valid("json");

    const contribution = await actionCollectionService.createContribution(
      user.id,
      {
        collectionId,
        actionId: body.actionId,
        contribution: body.contribution,
        description: body.description,
      }
    );

    return c.json({ data: contribution }, 201);
  }
);

/**
 * GET /action-collections/:collectionId/contributions/:contributionId
 * Get a specific contribution
 */
actionCollectionRoutes.get(
  "/:collectionId/contributions/:contributionId",
  async (c) => {
    const user = c.get("user");
    const { contributionId } = c.req.param();

    const contribution = await actionCollectionService.getContribution(
      contributionId,
      user.id
    );

    return c.json({ data: contribution });
  }
);

/**
 * PATCH /action-collections/:collectionId/contributions/:contributionId
 * Review a contribution (approve/reject)
 */
actionCollectionRoutes.patch(
  "/:collectionId/contributions/:contributionId",
  zValidator("json", reviewContributionSchema),
  async (c) => {
    const user = c.get("user");
    const { contributionId } = c.req.param();
    const body = c.req.valid("json");

    const contribution = await actionCollectionService.reviewContribution(
      contributionId,
      user.id,
      body
    );

    return c.json({ data: contribution });
  }
);
