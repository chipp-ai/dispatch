/**
 * Voice Routes
 *
 * API endpoints for voice agent session creation.
 */

import { Hono } from "hono";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import { applicationService } from "../../../services/application.service.ts";
import { billingService } from "../../../services/billing.service.ts";

export const voiceRoutes = new Hono<AuthContext>();

// Debug: Log all requests to voice routes
voiceRoutes.use("*", async (c, next) => {
  console.log("[voiceRoutes] Request received:", c.req.method, c.req.path);
  await next();
});

// Map legacy voice IDs to OpenAI Realtime API voice IDs
const VOICE_ID_MAPPING: Record<string, string> = {
  nova: "marin",
  alloy: "alloy",
  ash: "ash",
  ballad: "ballad",
  coral: "coral",
  echo: "echo",
  marin: "marin",
  sage: "sage",
  verse: "verse",
  cedar: "cedar",
};

/**
 * GET /voice/session
 * Create an ephemeral session key for OpenAI Realtime API
 * Query params: applicationId (required)
 */
voiceRoutes.get("/session", async (c) => {
  const applicationId = c.req.query("applicationId");
  console.log(
    "[Voice Session] Request received, applicationId:",
    applicationId
  );

  // Require applicationId - voice sessions must be scoped to an application
  if (!applicationId) {
    return c.json({ error: "applicationId query parameter is required" }, 400);
  }

  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Verify user has access to the application (throws if not authorized)
  let app;
  try {
    app = await applicationService.get(applicationId, user.id);
  } catch (error) {
    console.error("[Voice Session] Authorization failed:", error);
    Sentry.captureException(error, {
      tags: { source: "voice-api", feature: "authorization" },
      extra: { applicationId, userId: user.id },
    });
    return c.json({ error: "Application not found or access denied" }, 404);
  }

  if (!app) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Get voice config from capabilities
  const capabilities = app.capabilities as Record<string, unknown> | null;
  const voiceConfig = capabilities?.voiceAgent as
    | {
        enabled?: boolean;
        provider?: string;
        voice?: { voiceId?: string };
        greeting?: string;
        systemPrompt?: string;
      }
    | undefined;

  if (!voiceConfig?.enabled) {
    return c.json(
      { error: "Voice mode is not enabled for this application" },
      403
    );
  }

  // Check credit balance before creating session
  if (app.organizationId) {
    try {
      const creditCheck = await billingService.checkCreditsForVoice(
        app.organizationId
      );
      if (!creditCheck.hasCredits) {
        console.log("[Voice Session] Insufficient credits, rejecting session", {
          applicationId,
          organizationId: app.organizationId,
          balance: creditCheck.balance,
        });
        return c.json(
          {
            error: "Insufficient credits for voice session",
            code: "INSUFFICIENT_CREDITS",
          },
          402
        );
      }
    } catch (error) {
      // Log but don't block on credit check errors (fail open)
      console.error("[Voice Session] Error checking credits:", error);
      Sentry.captureException(error, {
        tags: { source: "voice-api", feature: "credit-check" },
        extra: { applicationId, organizationId: app.organizationId },
      });
    }
  }

  const voiceInstructions =
    "\n\nVOICE MODE INSTRUCTIONS: Keep your responses concise and conversational. Always respond in English. When you need to use a tool, briefly acknowledge what you're doing before calling the tool (e.g., 'Let me look that up for you' or 'I'll check that').";

  // Use application system prompt if available, otherwise default
  let instructions = app.systemPrompt
    ? app.systemPrompt + voiceInstructions
    : "You are a helpful voice assistant." + voiceInstructions;

  // Use voice config system prompt override if provided
  if (voiceConfig.systemPrompt) {
    instructions = voiceConfig.systemPrompt + voiceInstructions;
  }

  // Map voice ID
  const rawVoice = voiceConfig.voice?.voiceId || "nova";
  const voice = VOICE_ID_MAPPING[rawVoice] || "marin";
  const tools: unknown[] = [];

  console.log("[Voice Session] Config loaded:", {
    applicationId,
    voice,
    hasVoiceConfig: !!voiceConfig,
  });

  // Build session config
  const sessionConfig = {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions,
      audio: {
        output: { voice },
      },
      ...(tools.length > 0 && {
        tools,
        tool_choice: "auto",
      }),
    },
  };

  // Request ephemeral key from OpenAI
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.error("[Voice Session] OPENAI_API_KEY not configured");
    Sentry.captureMessage("OPENAI_API_KEY not configured for voice session", {
      level: "error",
      tags: { source: "voice-api", feature: "configuration" },
      extra: { applicationId },
    });
    return c.json({ error: "OpenAI API key not configured" }, 500);
  }

  try {
    console.log("[Voice Session] Requesting ephemeral key from OpenAI");
    const res = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionConfig),
      }
    );

    console.log("[Voice Session] OpenAI response status:", res.status);

    if (!res.ok) {
      const errorText = await res.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(errorText);
      } catch {
        // non-JSON response
      }

      const errorObj = parsed?.error as Record<string, unknown> | undefined;
      const errorMessage =
        (errorObj?.message as string) ||
        (parsed?.message as string) ||
        errorText.slice(0, 500);

      console.error("[Voice Session] OpenAI error:", errorMessage);
      Sentry.captureMessage(`OpenAI Realtime API error: ${errorMessage}`, {
        level: "error",
        tags: { source: "voice-api", feature: "openai-realtime" },
        extra: {
          applicationId,
          statusCode: res.status,
          errorCode: errorObj?.code,
        },
      });

      if (res.status >= 400 && res.status < 500) {
        return c.json(
          {
            error: errorMessage,
            code: errorObj?.code,
          },
          res.status as 400 | 401 | 403 | 404
        );
      }

      return c.json({ error: "Error fetching ephemeral key from OpenAI" }, 500);
    }

    const data = await res.json();
    console.log("[Voice Session] Successfully created session");
    return c.json(data);
  } catch (error) {
    console.error("[Voice Session] Error:", error);
    Sentry.captureException(error, {
      tags: { source: "voice-api", feature: "ephemeral-key" },
      extra: { applicationId },
    });
    return c.json({ error: "Error fetching ephemeral key" }, 500);
  }
});
