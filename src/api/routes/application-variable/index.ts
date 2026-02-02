/**
 * Application Variable Routes
 *
 * CRUD operations for application-level variables.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { applicationVariableService } from "../../../services/application-variable.service.ts";

export const applicationVariableRoutes = new Hono<AuthContext>();

// Validation schemas
const variableTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "secret",
  "url",
]);

const createVariableSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    .regex(
      /^[a-zA-Z_][a-zA-Z0-9_]*$/,
      "Name must start with a letter or underscore and contain only letters, numbers, and underscores"
    ),
  label: z.string().min(1, "Label is required").max(255),
  type: variableTypeSchema.optional().default("string"),
  description: z.string().max(1000).optional(),
  required: z.boolean().optional().default(false),
  placeholder: z.string().max(255).optional(),
  value: z.string().optional(),
});

const updateVariableSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .optional(),
  label: z.string().min(1).max(255).optional(),
  type: variableTypeSchema.optional(),
  description: z.string().max(1000).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(255).optional(),
  value: z.string().optional(),
});

/**
 * GET /applications/:appId/variables
 * List all variables for an application
 */
applicationVariableRoutes.get("/applications/:appId/variables", async (c) => {
  const user = c.get("user");
  const { appId } = c.req.param();

  const variables = await applicationVariableService.list(appId, user.id);
  return c.json({ data: variables });
});

/**
 * GET /variables/:id
 * Get a single variable
 */
applicationVariableRoutes.get("/variables/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  const variable = await applicationVariableService.get(id, user.id);
  if (!variable) {
    return c.json({ error: "Variable not found" }, 404);
  }
  return c.json({ data: variable });
});

/**
 * POST /applications/:appId/variables
 * Create a new variable
 */
applicationVariableRoutes.post(
  "/applications/:appId/variables",
  zValidator("json", createVariableSchema),
  async (c) => {
    const user = c.get("user");
    const { appId } = c.req.param();
    const body = c.req.valid("json");

    try {
      const variable = await applicationVariableService.create({
        applicationId: appId,
        userId: user.id,
        name: body.name,
        label: body.label,
        type: body.type,
        description: body.description,
        required: body.required,
        placeholder: body.placeholder,
        value: body.value,
      });

      return c.json({ data: variable }, 201);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create variable";
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * PATCH /variables/:id
 * Update a variable
 */
applicationVariableRoutes.patch(
  "/variables/:id",
  zValidator("json", updateVariableSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    try {
      const variable = await applicationVariableService.update(
        id,
        user.id,
        body
      );
      return c.json({ data: variable });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update variable";
      return c.json({ error: message }, 400);
    }
  }
);

/**
 * DELETE /variables/:id
 * Delete a variable
 */
applicationVariableRoutes.delete("/variables/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  try {
    await applicationVariableService.delete(id, user.id);
    return c.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete variable";
    return c.json({ error: message }, 400);
  }
});
