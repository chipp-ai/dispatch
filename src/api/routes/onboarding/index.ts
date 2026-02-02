/**
 * Onboarding Routes
 *
 * API endpoints for user onboarding flow.
 */

import { Hono } from "hono";
import type { AuthContext } from "../../middleware/auth.ts";
import { onboardingService } from "../../../services/onboarding.service.ts";

export const onboardingRoutes = new Hono<AuthContext>();

/**
 * GET /onboarding/progress
 * Get all onboarding answers for the current user
 */
onboardingRoutes.get("/progress", async (c) => {
  const user = c.get("user");
  const answers = await onboardingService.getOnboardingAnswers(user.id);
  const isComplete = await onboardingService.isOnboardingComplete(user.id);

  return c.json({
    data: {
      answers,
      isComplete,
    },
  });
});

/**
 * POST /onboarding/profile
 * Update user profile during onboarding
 */
onboardingRoutes.post("/profile", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name?: string;
    picture?: string;
  }>();

  const result = await onboardingService.updateProfile(user.id, body);

  return c.json({
    data: result,
  });
});

/**
 * POST /onboarding/persona
 * Save persona selection
 */
onboardingRoutes.post("/persona", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    persona: string;
  }>();

  if (!body.persona) {
    return c.json({ error: "Persona is required" }, 400);
  }

  const PERSONA_OPTIONS = [
    {
      value: "sell",
      label: "I want to sell AI services and products to clients",
    },
    {
      value: "company",
      label: "I work within a company building internal AI tools",
    },
    { value: "indie", label: "I'm an indie hacker building AI products" },
    { value: "explore", label: "I'm just exploring AI" },
  ];

  const personaOption = PERSONA_OPTIONS.find((p) => p.value === body.persona);
  if (!personaOption) {
    return c.json({ error: "Invalid persona value" }, 400);
  }

  const result = await onboardingService.saveOnboardingAnswer(user.id, {
    questionSlug: "persona",
    question: "What best describes you?",
    options: PERSONA_OPTIONS.map((p) => p.value),
    answer: [body.persona],
  });

  return c.json({
    data: result,
  });
});

/**
 * POST /onboarding/invite
 * Send workspace invitations during onboarding
 */
onboardingRoutes.post("/invite", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    emails: string[];
  }>();

  if (!body.emails || !Array.isArray(body.emails)) {
    return c.json({ error: "emails array is required" }, 400);
  }

  // Filter out empty emails
  const validEmails = body.emails.filter(
    (email) => email && email.trim() && email.includes("@")
  );

  if (validEmails.length === 0) {
    // No valid emails, just mark as skipped and continue
    return c.json({
      data: {
        invited: 0,
        skipped: true,
      },
    });
  }

  // Get user's active workspace
  const workspace = await onboardingService.getActiveWorkspace(user.id);
  if (!workspace?.workspaceId) {
    return c.json({ error: "No active workspace found" }, 400);
  }

  // Send invitations
  const results = await onboardingService.sendWorkspaceInvites(
    workspace.workspaceId,
    validEmails,
    user.name || user.email || "A team member"
  );

  return c.json({
    data: {
      invited: results.success,
      failed: results.failed,
    },
  });
});

/**
 * POST /onboarding/complete
 * Mark onboarding as complete (optional endpoint for explicit completion)
 */
onboardingRoutes.post("/complete", async (c) => {
  const user = c.get("user");
  const isComplete = await onboardingService.isOnboardingComplete(user.id);

  return c.json({
    data: {
      isComplete,
    },
  });
});
