/**
 * AI App Generation Routes
 *
 * Public routes for AI-powered app generation.
 * These routes don't require authentication.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateObject } from "npm:ai@4.3.15";
import { openai } from "npm:@ai-sdk/openai@1.3.22";

// Prompt generator system prompt (simplified version)
const promptGeneratorPrompt = `You are an expert AI system prompt designer. Generate a comprehensive, well-structured system prompt for AI assistants.

Your prompts should:
1. Clearly define the AI's role and personality
2. Set boundaries for what the AI can and cannot do
3. Include specific instructions for handling common scenarios
4. Be concise but thorough (200-500 words)
5. Use a professional, helpful tone`;

// ========================================
// Schemas
// ========================================

const generateAppDetailsSchema = z.object({
  userInput: z.string().min(1),
});

const generateLogoDescriptionSchema = z.object({
  userInput: z.string(),
  appName: z.string(),
  appDescription: z.string(),
  primaryColor: z.string(),
});

const generatePromptSchema = z.object({
  userInput: z.string().min(1),
});

const generateConversationStartersSchema = z.object({
  userInput: z.string(),
  appName: z.string(),
  appDescription: z.string(),
  systemPrompt: z.string(),
});

const generateStartingMessageSchema = z.object({
  userInput: z.string(),
  appName: z.string(),
  appDescription: z.string(),
  systemPrompt: z.string(),
});

const generateAppFactsSchema = z.object({
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string().optional(),
  hasCompanyKnowledge: z.boolean(),
});

// ========================================
// Routes
// ========================================

export const generateRoutes = new Hono();

/**
 * POST /generate/app-details
 * Generate app name, description, and primary color
 */
generateRoutes.post(
  "/app-details",
  zValidator("json", generateAppDetailsSchema),
  async (c) => {
    const { userInput } = c.req.valid("json");

    const { object: appDetails } = await generateObject({
      model: openai("gpt-4o-mini"),
      temperature: 0.8,
      schema: z.object({
        appTitle: z
          .string()
          .describe("A SHORT, FUN app name (MUST be under 30 chars!)"),
        appDescription: z
          .string()
          .describe("A compelling description (max 200 chars)"),
        primaryColor: z.string().describe("A hex color code (#RRGGBB)"),
      }),
      system: `You are a creative AI app designer who generates memorable but professional app configurations.

Key principles:
- Create names that hint at the app's purpose while being memorable
- Keep names professional and easy to pronounce
- Be creative but not bizarre

For color selection, consider industry conventions and emotional associations.`,
      prompt: `Based on this user idea: "${userInput}", generate:
1. A CREATIVE, MEMORABLE app title (MUST be under 30 characters!)
2. A compelling user-facing description (max 200 chars)
3. A primary brand color (hex code)`,
    });

    // Validate lengths
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    const result = {
      appTitle: appDetails.appTitle.slice(0, 30),
      appDescription: appDetails.appDescription.slice(0, 200),
      primaryColor: hexColorRegex.test(appDetails.primaryColor)
        ? appDetails.primaryColor
        : "#5B72EE",
    };

    return c.json(result);
  }
);

/**
 * POST /generate/logo-description
 * Generate a logo description based on app details
 */
generateRoutes.post(
  "/logo-description",
  zValidator("json", generateLogoDescriptionSchema),
  async (c) => {
    const { userInput, appName, appDescription, primaryColor } =
      c.req.valid("json");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        logoDescription: z
          .string()
          .describe("A detailed description for the logo"),
      }),
      system: `You are a creative logo designer who creates distinctive, memorable logo descriptions.

Your goal is to generate a logo description that:
1. Uses the provided primary color as a SOLID BACKGROUND
2. Creates SIMPLE, BOLD foreground elements
3. Uses LARGE SHAPES recognizable at 40x40 pixels
4. Maximum 2-3 main visual elements`,
      prompt: `Generate a creative logo description for:

App Name: ${appName}
App Description: ${appDescription}
Primary Color: ${primaryColor}

Start with: "A square app icon with a solid ${primaryColor} background featuring..."`,
    });

    return c.json(object);
  }
);

/**
 * POST /generate/prompt
 * Generate a system prompt for the AI assistant
 */
generateRoutes.post(
  "/prompt",
  zValidator("json", generatePromptSchema),
  async (c) => {
    const { userInput } = c.req.valid("json");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        prompt: z.string().describe("The generated system prompt"),
      }),
      system: promptGeneratorPrompt,
      prompt: `Generate a comprehensive system prompt for this app idea: ${userInput}`,
    });

    return c.json(object);
  }
);

/**
 * POST /generate/conversation-starters
 * Generate conversation starters based on app context
 */
generateRoutes.post(
  "/conversation-starters",
  zValidator("json", generateConversationStartersSchema),
  async (c) => {
    const { userInput, appName, appDescription, systemPrompt } =
      c.req.valid("json");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        conversationStarters: z
          .array(z.string())
          .length(4)
          .describe("Four conversation starters"),
      }),
      system: `You are an expert at creating conversation starters that showcase AI assistants' capabilities.

Create starters that:
1. Are HIGHLY SPECIFIC to this AI's role
2. Demonstrate unique value
3. Are realistic questions users would ask
4. Are concise (max 60 characters each)`,
      prompt: `Create 4 conversation starters for:

App Name: ${appName}
App Description: ${appDescription}
System Prompt: ${systemPrompt}`,
    });

    return c.json(object);
  }
);

/**
 * POST /generate/starting-message
 * Generate a starting message for the AI assistant
 */
generateRoutes.post(
  "/starting-message",
  zValidator("json", generateStartingMessageSchema),
  async (c) => {
    const { userInput, appName, appDescription, systemPrompt } =
      c.req.valid("json");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        shouldHaveStartingMessage: z
          .boolean()
          .describe("Whether this app should have a starting message"),
        startingMessage: z
          .string()
          .optional()
          .describe("The starting message (if applicable)"),
      }),
      system: `Determine if this AI assistant should have a starting message, and if so, generate one.

Starting messages work well for:
- Customer service bots
- Onboarding assistants
- Apps where users might need guidance

Skip starting messages for:
- Professional tools
- Apps where users know what they want`,
      prompt: `Should this AI have a starting message?

App Name: ${appName}
App Description: ${appDescription}
System Prompt: ${systemPrompt}

If yes, create a welcoming but brief message (max 100 chars).`,
    });

    return c.json(object);
  }
);

/**
 * POST /generate/app-facts
 * Generate fun facts about the app for success screen
 */
generateRoutes.post(
  "/app-facts",
  zValidator("json", generateAppFactsSchema),
  async (c) => {
    const { name, description, systemPrompt, hasCompanyKnowledge } =
      c.req.valid("json");

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        facts: z
          .array(z.string())
          .length(4)
          .describe("Four short facts about the app"),
      }),
      system: `Generate 4 short, engaging facts about the newly created AI app.
Each fact should be max 50 characters and highlight a benefit or feature.`,
      prompt: `Generate 4 facts about this AI:

Name: ${name}
Description: ${description}
Has Company Knowledge: ${hasCompanyKnowledge ? "Yes" : "No"}`,
    });

    return c.json(object);
  }
);
