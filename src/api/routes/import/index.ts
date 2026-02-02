/**
 * Import Routes
 *
 * API endpoints for importing user data from chipp-admin (app.chipp.ai).
 * Allows new users to migrate their existing data from the legacy platform.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { importService } from "../../../services/import.service.ts";

export const importRoutes = new Hono<AuthContext>();

// ============================================================
// Schemas
// ============================================================

const checkSchema = z.object({
  email: z.string().email().optional(),
});

const startImportSchema = z.object({
  developerId: z.number().int().positive(),
  appIds: z.array(z.number().int().positive()).optional(),
});

// ============================================================
// Routes
// ============================================================

/**
 * POST /import/check
 * Check if the current user's email exists in chipp-admin and has data to import.
 * Optionally accepts an email parameter to check a different email.
 */
importRoutes.post("/check", zValidator("json", checkSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Use provided email or fall back to user's email
  const emailToCheck = body.email || user.email;

  if (!emailToCheck) {
    return c.json({ error: "No email to check" }, 400);
  }

  const result = await importService.checkExistingUser(emailToCheck);

  return c.json({
    data: {
      hasExistingData: result.hasExistingData,
      developerId: result.developerId,
      appsCount: result.appsCount,
    },
  });
});

/**
 * GET /import/preview/:developerId
 * Get detailed preview of what will be imported for a specific developer.
 * Security: Verifies the developer's email matches the logged-in user's email.
 */
importRoutes.get("/preview/:developerId", async (c) => {
  const user = c.get("user");
  const developerId = parseInt(c.req.param("developerId"), 10);

  if (isNaN(developerId) || developerId <= 0) {
    return c.json({ error: "Invalid developer ID" }, 400);
  }

  const preview = await importService.getImportPreview(developerId);

  if (!preview) {
    return c.json({ error: "Developer not found or has no data" }, 404);
  }

  // Security: Verify the developer's email matches the logged-in user
  if (preview.email.toLowerCase() !== user.email?.toLowerCase()) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  return c.json({
    data: preview,
  });
});

/**
 * POST /import/start
 * Begin the import process for a specific developer's data.
 * Returns the import session ID to track progress.
 */
importRoutes.post(
  "/start",
  zValidator("json", startImportSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Check if user already has an import in progress
    const existingImport = await importService.getActiveImportForUser(user.id);
    if (existingImport) {
      return c.json(
        {
          error: "Import already in progress",
          message: "An import is already in progress for your account",
          importSessionId: existingImport.id,
        },
        409
      );
    }

    // Get the source email from the developer
    const preview = await importService.getImportPreview(body.developerId);
    if (!preview) {
      return c.json({ error: "Developer not found" }, 404);
    }

    // Security: Verify the developer's email matches the logged-in user
    if (preview.email.toLowerCase() !== user.email?.toLowerCase()) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const importSessionId = await importService.startImport(
      user.id,
      body.developerId,
      preview.email,
      body.appIds
    );

    return c.json({
      data: {
        importSessionId,
        message: "Import started successfully",
      },
    });
  }
);

/**
 * GET /import/status/:id
 * Get the current status and progress of an import session.
 */
importRoutes.get("/status/:id", async (c) => {
  const user = c.get("user");
  const importSessionId = c.req.param("id");

  const result = await importService.getImportStatus(importSessionId);

  if (!result) {
    return c.json({ error: "Import session not found" }, 404);
  }

  // Verify the import belongs to the current user
  if (result.session.userId !== user.id) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  return c.json({
    data: {
      session: result.session,
      progress: result.progress,
    },
  });
});

/**
 * GET /import/active
 * Get the user's active import session, if any.
 */
importRoutes.get("/active", async (c) => {
  const user = c.get("user");

  const activeImport = await importService.getActiveImportForUser(user.id);

  return c.json({
    data: activeImport
      ? {
          hasActiveImport: true,
          importSessionId: activeImport.id,
          status: activeImport.status,
          currentPhase: activeImport.currentPhase,
        }
      : {
          hasActiveImport: false,
        },
  });
});

/**
 * GET /import/should-prompt
 * Check if the user should see the import prompt.
 * Returns false if:
 * - User has any completed/failed import sessions (already done)
 * - User has any apps in chipp-deno (already using platform)
 */
importRoutes.get("/should-prompt", async (c) => {
  const user = c.get("user");

  const shouldPrompt = await importService.shouldShowImportPrompt(user.id);

  return c.json({
    data: {
      shouldPrompt,
    },
  });
});

/**
 * GET /import/routing
 * Get the recommended routing destination for the current user.
 * Returns:
 * - "dashboard" - user has apps (returning user)
 * - "import" - user has legacy data in chipp-admin
 * - "onboarding-v2" - completely new user
 */
importRoutes.get("/routing", async (c) => {
  const user = c.get("user");

  const result = await importService.getRoutingDecision(user.id, user.email);

  return c.json({
    data: result,
  });
});

/**
 * POST /import/skip
 * Mark the user as having skipped the import flow.
 * Creates a "skipped" record so they won't be prompted again.
 */
importRoutes.post("/skip", async (c) => {
  const user = c.get("user");

  // Mark user as having skipped import by recording it
  await importService.markImportSkipped(user.id);

  return c.json({
    data: {
      success: true,
      message: "Import skipped, proceeding to onboarding",
    },
  });
});
