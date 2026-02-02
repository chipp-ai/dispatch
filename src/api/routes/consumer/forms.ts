/**
 * Consumer Forms Routes
 *
 * Handles lead generation form submissions for consumer chat.
 * These routes don't require consumer auth - anonymous users can submit forms.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as Sentry from "@sentry/deno";
import { db } from "../../../db/index.ts";
import { type AppOnlyContext } from "../../middleware/consumerAuth.ts";

// ========================================
// Validation Schemas
// ========================================

const formSubmissionSchema = z.object({
  formData: z.record(z.string()),
  chatSessionId: z.string(),
  applicationId: z.number().optional(),
  workspaceId: z.string().optional(),
});

// ========================================
// Router Setup
// ========================================

export const consumerFormsRoutes = new Hono<AppOnlyContext>();

/**
 * POST /forms/:formId/submissions
 * Submit a lead generation form
 */
consumerFormsRoutes.post(
  "/forms/:formId/submissions",
  zValidator("json", formSubmissionSchema),
  async (c) => {
    const formId = c.req.param("formId");
    const body = c.req.valid("json");
    const app = c.get("app");

    if (!formId) {
      return c.json({ error: "Form ID is required" }, 400);
    }

    const formIdNum = parseInt(formId, 10);
    if (isNaN(formIdNum)) {
      return c.json({ error: "Invalid form ID" }, 400);
    }

    try {
      // Verify the form exists and belongs to this app
      const form = await db
        .selectFrom("app.lead_generation_forms")
        .selectAll()
        .where("id", "=", formIdNum)
        .where("applicationId", "=", parseInt(app.id, 10))
        .where("deletedAt", "is", null)
        .executeTakeFirst();

      if (!form) {
        return c.json({ error: "Form not found" }, 404);
      }

      // Create the form submission
      const result = await db
        .insertInto("app.form_submissions")
        .values({
          formId: formIdNum,
          chatSessionId: body.chatSessionId,
          data: JSON.stringify(body.formData),
        })
        .executeTakeFirst();

      const submissionId = Number(result.insertId);

      console.log(
        `[consumer-forms] Form submission created: ${submissionId} for form ${formIdNum}`
      );

      return c.json({
        message: "Form submission created successfully",
        data: {
          id: submissionId,
          formId: formIdNum,
          chatSessionId: body.chatSessionId,
          data: body.formData,
        },
      });
    } catch (error) {
      console.error("[consumer-forms] Error creating form submission:", error);
      Sentry.captureException(error, {
        tags: { source: "consumer-forms-api", feature: "form-submission" },
        extra: { formId, appId: app.id, chatSessionId: body.chatSessionId },
      });
      return c.json({ error: "Error creating form submission" }, 500);
    }
  }
);
