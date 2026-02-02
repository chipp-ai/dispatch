/**
 * Onboarding V2 Routes
 *
 * API endpoints for the new 4-step onboarding flow:
 * Build → Train → Share → Unlock
 *
 * Handles template application creation and progress tracking.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { applicationService } from "../../../services/application.service.ts";
import * as Sentry from "@sentry/deno";

// Template definitions (must match frontend ONBOARDING_TEMPLATES)
const ONBOARDING_TEMPLATES = [
  {
    id: "website-chat",
    name: "Website Assistant",
    description:
      "Turn every visitor into an engaged lead with instant, intelligent answers",
    brandColor: "#2563EB",
    startingMessage:
      "Hey! I can answer any questions about what we do and help you find exactly what you're looking for. What brings you here today?",
    suggestions: [
      "What makes you different from competitors?",
      "Can you walk me through your pricing?",
      "What results have your customers seen?",
      "How quickly can I get started?",
    ],
    systemPrompt: `You are a high-converting website assistant designed to turn curious visitors into qualified leads.

## Core Behaviors
- **Opening**: Greet warmly and ask what brought them to the site today
- **Discovery**: Ask strategic questions to understand their needs and timeline
- **Value**: Connect their specific pain points to relevant solutions
- **Urgency**: Create gentle urgency without being pushy
- **Capture**: Naturally collect contact info when they show buying signals

## Conversation Style
- Friendly but professional
- Concise responses (2-3 sentences max)
- Ask one question at a time
- Use their name once you learn it
- Mirror their communication style

Never be pushy. Build rapport first, qualify second, capture third.`,
  },
  {
    id: "support-agent",
    name: "Support Agent",
    description: "Resolve customer issues instantly with AI-powered support",
    brandColor: "#059669",
    startingMessage:
      "Hi there! I'm here to help you with any questions or issues. What can I assist you with today?",
    suggestions: [
      "I'm having trouble logging in",
      "How do I reset my password?",
      "I need help with my order",
      "Can I speak to a human?",
    ],
    systemPrompt: `You are a patient and helpful customer support agent focused on resolving issues quickly and completely.

## Core Behaviors
- **Acknowledge**: Start by acknowledging their issue and showing empathy
- **Clarify**: Ask specific questions to understand the full problem
- **Solve**: Provide step-by-step solutions when possible
- **Verify**: Confirm the issue is resolved before ending
- **Escalate**: Know when to hand off to a human agent

## Conversation Style
- Patient and understanding
- Clear, simple language
- Step-by-step instructions
- Proactive in offering additional help

Always prioritize customer satisfaction over efficiency.`,
  },
  {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    description:
      "Qualify leads automatically and book meetings while you sleep",
    brandColor: "#7C3AED",
    startingMessage:
      "Welcome! I'd love to learn more about what you're looking for. Are you exploring solutions for yourself or your team?",
    suggestions: [
      "I want to learn more about your product",
      "What's your pricing?",
      "Can I book a demo?",
      "How does this compare to alternatives?",
    ],
    systemPrompt: `You are a strategic lead qualification specialist focused on identifying high-intent buyers and booking meetings.

## Core Behaviors
- **Qualify**: Determine fit through strategic questioning
- **Score**: Mentally rate leads based on responses
- **Route**: Guide qualified leads to booking, others to resources
- **Book**: Secure meeting commitments with decision-makers

## BANT Qualification Framework
- **Budget**: Do they have purchasing authority?
- **Authority**: Are they a decision-maker?
- **Need**: Do they have a clear problem we solve?
- **Timeline**: Are they actively looking to buy?

Qualify efficiently but never rush. Bad-fit leads waste everyone's time.`,
  },
];

// Validation schemas
const createTemplateAppsSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
  clientStoredIds: z.record(z.number()).optional(),
});

const updateProgressSchema = z.object({
  step: z.enum(["build", "train", "share", "unlock"]),
  completed: z.boolean(),
  data: z.record(z.any()).optional(),
});

export const onboardingV2Routes = new Hono<AuthContext>();

/**
 * POST /onboarding-v2/template-apps
 * Create template applications for onboarding
 *
 * Returns existing template apps if they already exist for this user,
 * or creates new ones if they don't.
 */
onboardingV2Routes.post(
  "/template-apps",
  zValidator("json", createTemplateAppsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      // Check for existing apps in this workspace that match template names
      const existingApps = await applicationService.list({
        userId: user.id,
        workspaceId: body.workspaceId,
      });

      // Build a map of existing template apps by name
      const existingByName = new Map<string, string>();
      for (const app of existingApps) {
        for (const template of ONBOARDING_TEMPLATES) {
          if (app.name === template.name) {
            existingByName.set(template.id, app.id);
            break;
          }
        }
      }

      // Check client-stored IDs and verify they still exist
      const verifiedIds: Record<string, string> = {};
      if (body.clientStoredIds) {
        for (const [templateId, appId] of Object.entries(
          body.clientStoredIds
        )) {
          try {
            const app = await applicationService.get(String(appId), user.id);
            if (app) {
              verifiedIds[templateId] = app.id;
            }
          } catch {
            // App doesn't exist or user doesn't have access
          }
        }
      }

      // Merge existing and verified IDs
      const templateApplicationIds: Record<string, string> = {
        ...Object.fromEntries(existingByName),
        ...verifiedIds,
      };

      // Create missing template apps
      const created: string[] = [];
      for (const template of ONBOARDING_TEMPLATES) {
        if (!templateApplicationIds[template.id]) {
          const app = await applicationService.create({
            name: template.name,
            description: template.description,
            systemPrompt: template.systemPrompt,
            workspaceId: body.workspaceId,
            creatorId: user.id,
            organizationId: user.organizationId,
          });

          // Update the app with additional settings
          await applicationService.update(String(app.id), user.id, {
            welcomeMessages: [template.startingMessage],
            suggestedMessages: template.suggestions,
            brandStyles: {
              primaryColor: template.brandColor,
            },
          });

          templateApplicationIds[template.id] = app.id;
          created.push(template.id);
        }
      }

      return c.json({
        data: {
          templateApplicationIds,
          created,
        },
      });
    } catch (error) {
      console.error("[onboarding-v2] Error creating template apps:", error);
      Sentry.captureException(error, {
        tags: { source: "onboarding-api", feature: "template-apps" },
        extra: { userId: user.id, workspaceId: body.workspaceId },
      });
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create template apps";
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * GET /onboarding-v2/progress
 * Get onboarding V2 progress for the current user
 */
onboardingV2Routes.get("/progress", async (c) => {
  const user = c.get("user");

  try {
    // For now, return minimal progress info
    // The main state is stored client-side in localStorage
    // This endpoint can be used for server-side progress tracking if needed
    return c.json({
      data: {
        userId: user.id,
        version: "v2",
        // Progress tracking could be added here in the future
      },
    });
  } catch (error) {
    console.error("[onboarding-v2] Error getting progress:", error);
    Sentry.captureException(error, {
      tags: { source: "onboarding-api", feature: "get-progress" },
      extra: { userId: user.id },
    });
    const message =
      error instanceof Error ? error.message : "Failed to get progress";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /onboarding-v2/complete
 * Mark onboarding V2 as complete
 */
onboardingV2Routes.post("/complete", async (c) => {
  const user = c.get("user");

  try {
    // Mark V2 onboarding as complete
    // This could update a user flag or create a record
    console.log(`[onboarding-v2] User ${user.id} completed onboarding V2`);

    return c.json({
      data: {
        completed: true,
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[onboarding-v2] Error completing onboarding:", error);
    Sentry.captureException(error, {
      tags: { source: "onboarding-api", feature: "complete-onboarding" },
      extra: { userId: user.id },
    });
    const message =
      error instanceof Error ? error.message : "Failed to complete onboarding";
    return c.json({ error: message }, 500);
  }
});
