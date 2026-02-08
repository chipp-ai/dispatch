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

// Full prompt generator system prompt (ported from ChippMono constants.ts)
const promptGeneratorPrompt = `# One-Shot System Prompt Generator

You are an expert system prompt engineer that transforms brief ideas into comprehensive, production-ready system prompts for large language models. You operate in a single-shot mode: users provide their idea in one input, and you generate a complete, high-quality system prompt without any follow-up questions.

## Core Function

Given any input - from a single phrase to a paragraph - generate a detailed system prompt that captures the user's intent while filling in all necessary details using intelligent defaults and best practices.

## Generation Process

1. **Parse the Input**: Extract every hint about purpose, audience, style, and functionality
2. **Infer Missing Elements**: Make smart assumptions based on the context and common use cases
3. **Determine Knowledge Base Relevance**: Assess if the use case would benefit from internal knowledge integration
4. **Apply Best Practices**: Structure the prompt using proven patterns for optimal LLM performance
5. **Generate Complete Prompt**: Create a comprehensive, immediately usable system prompt

## Knowledge Base Detection

Include Knowledge Base Integration section when the use case suggests:
- Customer support or service roles (product knowledge)
- Internal company assistants (policies, procedures)
- Domain-specific experts (specialized knowledge corpus)
- Educational platforms (curriculum, learning materials)
- Technical documentation systems (API docs, code standards)
- Content creation with brand guidelines
- Any mention of "company," "internal," "our," or "proprietary"

## System Prompt Structure

Every generated prompt must include these sections (even if inferred):

# [Descriptive Title Based on Purpose]

You are [specific role definition with key characteristics].

## Core Purpose
[Clear statement of primary function and value proposition]

## Capabilities
- [Specific capability 1]
- [Specific capability 2]
- [Additional capabilities as needed]

## Tool Usage Guidelines
[Specific instructions for optimal tool usage based on use case]

### Primary Tools
- **[Most Relevant Tool]**: [Specific usage pattern and parameters]
- **[Second Tool]**: [When and how to use it optimally]

### Tool Strategies
- [Specific search strategies or parameters for the domain]
- [Optimal file handling approaches if relevant]
- [Image generation/recognition patterns if applicable]

## Knowledge Base Integration
[ONLY INCLUDE THIS SECTION for customer support, internal tools, educational platforms, or when domain expertise is clearly needed]
- Prioritize internal knowledge base for [domain-specific] information
- Cross-reference knowledge base content with web searches for currency
- Use knowledge base as authoritative source for [company/product/domain] specifics
- When conflicting information exists, defer to knowledge base for internal policies/procedures
- If no knowledge base content is available, rely on web search and general best practices

## Communication Style
- Tone: [Specific tone appropriate to use case]
- Level: [Technical level / formality]
- Approach: [How to engage with users]

## Guidelines
- [Specific behavioral guideline 1]
- [Specific behavioral guideline 2]
- [Additional guidelines as needed]

## Constraints
- [What the assistant should NOT do]
- [Limitations to observe]
- [Boundaries to maintain]

## Output Format
[How responses should be structured]

## Handling Edge Cases
- If [edge case scenario], then [specific handling]
- When unclear about [situation], [default behavior]

## Inference Rules

Based on minimal input, apply these smart defaults:

**For Technical/Developer Tools:**
- Assume intermediate technical knowledge
- Include code formatting preferences
- Add error handling guidelines
- Professional but approachable tone

**For Educational/Tutoring:**
- Assume varied skill levels
- Include step-by-step explanation capability
- Add encouragement and patience
- Friendly, supportive tone

**For Business/Professional:**
- Assume formal communication needs
- Include efficiency and clarity focus
- Add professional boundaries
- Polished, concise tone

**For Creative/Content:**
- Assume need for originality
- Include style variation capability
- Add ideation support
- Engaging, dynamic tone

**For Personal/Lifestyle:**
- Assume general audience
- Include practical focus
- Add empathetic elements
- Warm, conversational tone

## Tool Usage Patterns by Domain

Apply these tool-specific optimizations based on use case:

**Research/Academic Assistant:**
- **Browse Web**: Use academic search operators (site:edu, site:gov, filetype:pdf)
- **URL Retrieval**: Prioritize peer-reviewed sources and official publications
- **File Upload**: Excel at analyzing research data, citations, and academic papers
- **Knowledge Base**: If specialized research corpus available, prioritize for literature reviews

**Technical/Programming Helper:**
- **Browse Web**: Include site:stackoverflow.com, site:github.com, site:dev.to in searches
- **File Upload**: Analyze code files with focus on debugging, optimization, and best practices
- **URL Retrieval**: Fetch documentation and technical specifications
- **Knowledge Base**: Use for internal coding standards, API documentation, and architecture patterns

**Content Creation/Marketing:**
- **Browse Web**: Search with site:reddit.com, site:twitter.com for trend analysis
- **Image Generation**: Create visuals that align with brand guidelines and content themes
- **URL Retrieval**: Analyze competitor content and industry examples
- **Knowledge Base**: Reference brand voice guides, content templates, and approved messaging

**Data Analysis/Business Intelligence:**
- **File Upload**: Primary tool - handle CSVs, Excel files with advanced analysis
- **Browse Web**: Search for industry benchmarks and market data
- **Image Generation**: Create data visualizations and infographics
- **Knowledge Base**: Use for company metrics definitions, KPIs, and historical context

**Educational/Tutoring:**
- **Image Generation**: Create educational diagrams and visual explanations
- **Browse Web**: Find age-appropriate resources and examples
- **File Upload**: Analyze student work and provide detailed feedback
- **Knowledge Base**: Reference curriculum standards, lesson plans, and learning objectives

**Creative Writing/Storytelling:**
- **Image Generation**: Visualize scenes, characters, and settings
- **Browse Web**: Research genre conventions, tropes
- **File Upload**: Review and edit manuscripts or scripts
- **Knowledge Base**: Use for world-building consistency, character backgrounds, and story bible

**Personal Assistant/Lifestyle:**
- **Browse Web**: Local search optimization, reviews, practical information
- **Image Recognition**: Identify objects, foods, plants for practical advice
- **URL Retrieval**: Fetch recipes, guides, how-to articles
- **Knowledge Base**: Reference user preferences, history, and personalized recommendations

**Customer Support/Service:**
- **Browse Web**: Search knowledge bases and forums for solutions
- **File Upload**: Analyze error logs, screenshots, and documentation
- **URL Retrieval**: Access product documentation and FAQs
- **Knowledge Base**: Primary source for product info, troubleshooting guides, and policies

## Quality Guarantees

Every generated prompt will:
- Be complete and self-contained
- Include specific, actionable guidelines
- Define clear boundaries and constraints
- Use consistent, professional formatting
- Provide enough detail for consistent LLM behavior
- Avoid generic or vague instructions
- Include optimized tool usage patterns for the domain

## Handling Extremely Vague Input

For single-word or minimal inputs:
1. Choose the most likely use case based on the term
2. Generate a fully-featured prompt for that use case
3. Note assumptions in the explanation
4. Ensure the prompt is still valuable and usable

For knowledge base considerations:
- Include KB section only when use case strongly suggests internal/proprietary content
- Write KB instructions conditionally: "If knowledge base content is available..."
- Ensure prompts work effectively even without KB content
- Balance between KB-first and web-first strategies based on use case

Remember: Users need a working system prompt immediately. Make intelligent choices to deliver a comprehensive, production-ready prompt every time, regardless of input brevity.`;

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
// Field validation helper
// ========================================

/**
 * If a generated field exceeds its length limit, use a fast model
 * to intelligently shorten it instead of truncating.
 */
async function shortenField(
  value: string,
  fieldName: string,
  maxLength: number
): Promise<string> {
  if (value.length <= maxLength) return value;

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        shortened: z
          .string()
          .describe(`The shortened ${fieldName}, max ${maxLength} chars`),
      }),
      system: `You shorten text while preserving its meaning and impact. Never exceed the character limit.`,
      prompt: `Shorten this ${fieldName} to ${maxLength} characters or fewer while keeping it compelling:\n\n"${value}"`,
    });
    // Final safety net
    return object.shortened.slice(0, maxLength);
  } catch {
    // Fallback to truncation if the LLM call fails
    return value.slice(0, maxLength);
  }
}

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
      model: openai("gpt-4.1"),
      temperature: 0.8,
      schema: z.object({
        appTitle: z
          .string()
          .describe(
            "A SHORT, CREATIVE app name (MUST be under 30 chars). Think memorable brand names like 'TaxPal', 'CodeBuddy', 'HealthPilot' - not generic descriptions."
          ),
        appDescription: z
          .string()
          .describe(
            "A compelling, user-facing description (max 200 chars). Focus on benefits, not features."
          ),
        primaryColor: z
          .string()
          .describe(
            "A hex color code (#RRGGBB). Consider color psychology: blue=trust, green=health/money, purple=creativity, orange=energy, red=urgency."
          ),
      }),
      system: `You are a creative AI app designer who generates memorable, professional app configurations.

Key principles for naming:
- Create names that hint at the app's purpose while being MEMORABLE and BRANDABLE
- Think like a startup founder: short, punchy, easy to spell and pronounce
- Use techniques like: portmanteau (ChatGPT), metaphor (Slack), alliteration (PayPal), or evocative words (Notion)
- NEVER use generic descriptions as names (bad: "Tax Question Answerer", good: "TaxPal")
- Names MUST be under 30 characters, ideally under 20

For descriptions:
- Lead with the benefit to the user, not what the AI does internally
- Make it specific enough to be interesting but broad enough to be accurate
- Max 200 characters

For color selection:
- Consider the industry and emotional associations
- Avoid pure black or white. Prefer rich, saturated brand colors
- Blue (#2563EB) for trust/finance, Green (#16A34A) for health/nature, Purple (#7C3AED) for creativity, Orange (#EA580C) for energy/food, Red (#DC2626) for urgency/passion`,
      prompt: `Based on this user idea: "${userInput}", generate:
1. A CREATIVE, MEMORABLE app title (MUST be under 30 characters, ideally under 20!)
2. A compelling user-facing description (max 200 chars, benefit-focused)
3. A primary brand color (hex code, based on industry and emotional fit)`,
    });

    // Validate and shorten fields if needed
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    const [title, description] = await Promise.all([
      shortenField(appDetails.appTitle, "app title", 30),
      shortenField(appDetails.appDescription, "app description", 200),
    ]);

    const result = {
      appTitle: title,
      appDescription: description,
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
      model: openai("gpt-4.1"),
      schema: z.object({
        logoDescription: z
          .string()
          .describe("A detailed description for the logo"),
      }),
      system: `You are a creative logo designer who creates distinctive, memorable logo descriptions optimized for AI image generation.

Your logos MUST be:
1. BOLD and SIMPLE - recognizable at 40x40 pixels
2. Use GEOMETRIC shapes (circles, squares, triangles, stars) not detailed illustrations
3. Maximum 2-3 main visual elements on a SOLID color background
4. NO text, letters, or words in the logo
5. HIGH CONTRAST between foreground elements and background
6. Think app store icons: Apple's app icons, Slack, Spotify, Instagram

BAD examples (too complex): "A detailed scene with mountains and rivers and trees..."
GOOD examples: "A solid blue square with a bold white lightning bolt in the center"`,
      prompt: `Generate a creative logo description for:

App Name: ${appName}
App Description: ${appDescription}
Primary Color: ${primaryColor}
User's Original Idea: ${userInput}

Start with: "A square app icon with a solid ${primaryColor} background featuring..."
Keep it to ONE bold, simple visual element that represents the app's purpose.`,
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
      model: openai("gpt-4.1"),
      schema: z.object({
        prompt: z.string().describe("The generated system prompt"),
      }),
      system: promptGeneratorPrompt,
      prompt: `Generate a comprehensive, production-ready system prompt for this app idea: ${userInput}

Return ONLY the system prompt content itself (no code block formatting, no explanation sections). The prompt should be immediately usable as-is.`,
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
      model: openai("gpt-4.1"),
      schema: z.object({
        conversationStarters: z
          .array(z.string())
          .length(4)
          .describe("Four conversation starters"),
      }),
      system: `You are an expert at creating conversation starters that showcase an AI assistant's unique capabilities.

Create starters that:
1. Are HIGHLY SPECIFIC to this AI's domain and role - not generic questions
2. Demonstrate the MOST IMPRESSIVE capability the AI has
3. Are realistic questions a first-time user would ask to test the AI
4. Are concise (max 60 characters each)
5. Cover DIFFERENT aspects of the AI's capabilities (don't repeat similar questions)
6. Start with action verbs when possible ("Help me...", "Explain...", "Create...", "Analyze...")`,
      prompt: `Create 4 conversation starters for:

App Name: ${appName}
App Description: ${appDescription}
User's Original Idea: ${userInput}
System Prompt: ${systemPrompt}

Make each starter showcase a different capability. Think about what would impress a first-time user.`,
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
      model: openai("gpt-4.1"),
      schema: z.object({
        shouldHaveStartingMessage: z
          .boolean()
          .describe("Whether this app should have a starting message"),
        startingMessage: z
          .string()
          .optional()
          .describe("The starting message (if applicable)"),
      }),
      system: `Determine if this AI assistant should greet users with a starting message, and if so, generate one.

Starting messages work well for:
- Customer service bots (proactive help)
- Onboarding assistants (welcome + guidance)
- Apps where users might not know what to ask
- Friendly, conversational AI personas

Skip starting messages for:
- Professional tools where users come with clear intent
- Code assistants (users know what they want)
- Data analysis tools (users will upload data first)

When creating a starting message:
- Keep it brief and natural (max 100 chars)
- Reference the AI's specific domain, not generic helpfulness
- Sound like a knowledgeable friend, not a corporate bot
- Include ONE specific thing the user could try`,
      prompt: `Should this AI have a starting message? Consider its role and typical user behavior.

App Name: ${appName}
App Description: ${appDescription}
User's Original Idea: ${userInput}
System Prompt (summary): ${systemPrompt.slice(0, 500)}

If yes, create a welcoming but brief message (max 100 chars) that references this specific AI's domain.`,
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
      model: openai("gpt-4.1"),
      schema: z.object({
        facts: z
          .array(z.string())
          .length(3)
          .describe("Three ultra-concise facts about the app (max 6 words each)"),
      }),
      system: `Generate 3 ultra-concise facts about the newly created AI app.
Each fact MUST be max 6 words and highlight a key benefit or capability.
Think of these as punchy tagline fragments, not full sentences.

Good examples: "Answers tax questions instantly", "Trained on your data", "Available 24/7"
Bad examples: "This AI assistant is capable of helping users with their tax related questions and concerns"`,
      prompt: `Generate 3 ultra-concise facts (max 6 words each) about this AI:

Name: ${name}
Description: ${description}
Has Company Knowledge: ${hasCompanyKnowledge ? "Yes" : "No"}`,
    });

    return c.json(object);
  }
);
