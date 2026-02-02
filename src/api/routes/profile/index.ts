/**
 * Profile Routes
 *
 * Endpoints for managing the current user's profile.
 * All routes require authentication.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { developerService } from "../../../services/developer.service.ts";

export const profileRoutes = new Hono<AuthContext>();

// Validation schema for profile updates
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pictureUrl: z.string().url().optional().or(z.literal("")),
});

/**
 * GET /profile
 * Get the current user's profile
 */
profileRoutes.get("/", async (c) => {
  const user = c.get("user");
  const profile = await developerService.getProfile(user.id);

  if (!profile) {
    return c.json(
      {
        error: "Not Found",
        message: "Profile not found",
      },
      404
    );
  }

  return c.json({
    data: profile,
  });
});

/**
 * PUT /profile
 * Update the current user's profile
 */
profileRoutes.put("/", zValidator("json", updateProfileSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const profile = await developerService.updateProfile(user.id, {
    name: body.name,
    pictureUrl: body.pictureUrl === "" ? null : body.pictureUrl,
  });

  return c.json({
    data: profile,
  });
});
