/**
 * Slack Integration Routes
 *
 * OAuth flow and management for Slack integration.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { applicationService } from "../../../services/application.service.ts";
import { slackService } from "../../../services/slack.service.ts";
import { encrypt, decrypt } from "../../../services/crypto.service.ts";
import { db } from "../../../db/client.ts";

// ========================================
// Schemas
// ========================================

const saveCredentialsSchema = z.object({
  applicationId: z.string().uuid(),
  slackClientId: z.string().min(1),
  slackClientSecret: z.string().min(1),
  slackSigningSecret: z.string().min(1),
});

// ========================================
// Helper Functions
// ========================================

/**
 * Get shortened app identifier (chatName) for Slack
 */
function getShortenedAppIdentifier(app: { name: string; id: string }): string {
  const nameWithoutSpacesOrPunctuation = app.name.replace(/[\s\W_]+/g, "");
  return `${nameWithoutSpacesOrPunctuation}-${app.id}`.toLowerCase();
}

/**
 * Get OAuth callback URL
 */
function getOAuthCallbackUrl(): string {
  const apiOrigin =
    Deno.env.get("API_ORIGIN") ||
    (Deno.env.get("ENVIRONMENT") === "production"
      ? "https://dino-mullet.chipp.ai"
      : "http://localhost:8000");
  return `${apiOrigin}/api/integrations/slack/oauth/callback`;
}

/**
 * Get Slack OAuth URL
 */
function getSlackOAuthUrl(clientId: string, state: string): string {
  const redirectUri = getOAuthCallbackUrl();
  const scopes = [
    "app_mentions:read",
    "channels:history",
    "channels:join",
    "channels:read",
    "chat:write",
    "files:read",
    "files:write",
    "groups:history",
    "groups:read",
    "im:history",
    "im:read",
    "im:write",
    "mpim:history",
    "mpim:read",
    "reactions:write",
    "users:read",
    "users:read.email",
  ].join(",");

  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

/**
 * Get Slack credentials from application settings
 */
async function getSlackCredentials(applicationId: string): Promise<{
  clientId: string;
  clientSecret: string;
  signingSecret: string;
} | null> {
  // Check for credentials stored in application settings
  const app = await db
    .selectFrom("app.applications")
    .select(["settings"])
    .where("id", "=", applicationId)
    .executeTakeFirst();

  if (!app?.settings) return null;

  const settings = app.settings as {
    slack?: {
      clientId?: string;
      clientSecret?: string;
      signingSecret?: string;
    };
  };

  if (
    !settings.slack?.clientId ||
    !settings.slack?.clientSecret ||
    !settings.slack?.signingSecret
  ) {
    return null;
  }

  // Decrypt secrets
  let clientSecret: string;
  let signingSecret: string;

  try {
    clientSecret = await decrypt(settings.slack.clientSecret);
  } catch {
    clientSecret = settings.slack.clientSecret;
  }

  try {
    signingSecret = await decrypt(settings.slack.signingSecret);
  } catch {
    signingSecret = settings.slack.signingSecret;
  }

  return {
    clientId: settings.slack.clientId,
    clientSecret,
    signingSecret,
  };
}

// ========================================
// Routes
// ========================================

export const slackRoutes = new Hono<AuthContext>();

/**
 * GET /slack/oauth/start?applicationId=<uuid>
 * Initiate Slack OAuth flow
 */
slackRoutes.get("/oauth/start", async (c) => {
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json({ error: "applicationId is required" }, 400);
  }

  const user = c.get("user");

  // Verify user has access to this app
  let app;
  try {
    app = await applicationService.get(applicationId, user.id);
  } catch {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check if credentials are configured
  const credentials = await getSlackCredentials(applicationId);
  if (!credentials) {
    return c.json(
      {
        error:
          "Slack credentials not configured. Please save your Slack app credentials first.",
      },
      400
    );
  }

  // Create OAuth state
  const state = await slackService.createOAuthState(applicationId, user.id);

  // Build OAuth URL
  const oauthUrl = getSlackOAuthUrl(credentials.clientId, state);

  // Redirect to Slack OAuth
  return c.redirect(oauthUrl);
});

/**
 * GET /slack/oauth/callback?code=<code>&state=<state>
 * Handle Slack OAuth callback
 */
slackRoutes.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  console.log("[SlackOAuth] Callback received", { code: !!code, state, error });

  if (error) {
    return c.html(createErrorHtml("OAuth was cancelled", error));
  }

  if (!code || !state) {
    return c.html(createErrorHtml("Missing code or state", "invalid_request"));
  }

  // Validate and consume state
  const stateRecord = await slackService.validateAndConsumeState(state);
  if (!stateRecord) {
    return c.html(createErrorHtml("Invalid or expired state", "invalid_state"));
  }

  console.log("[SlackOAuth] State validated", {
    applicationId: stateRecord.applicationId,
    developerId: stateRecord.developerId,
  });

  // Get application
  const app = await db
    .selectFrom("app.applications")
    .select(["id", "name", "settings"])
    .where("id", "=", stateRecord.applicationId)
    .executeTakeFirst();

  if (!app) {
    return c.html(createErrorHtml("Application not found", "app_not_found"));
  }

  // Get Slack credentials
  const credentials = await getSlackCredentials(stateRecord.applicationId);
  if (!credentials) {
    return c.html(
      createErrorHtml("Slack credentials not found", "missing_credentials")
    );
  }

  // Exchange code for token
  const redirectUri = getOAuthCallbackUrl();
  const tokenResponse = await slackService.exchangeCodeForToken(
    code,
    credentials.clientId,
    credentials.clientSecret,
    redirectUri
  );

  console.log("[SlackOAuth] Token exchange result", {
    ok: tokenResponse.ok,
    team: tokenResponse.team,
    appId: tokenResponse.app_id,
    error: tokenResponse.error,
  });

  if (!tokenResponse.ok || !tokenResponse.access_token) {
    return c.html(
      createErrorHtml(
        `Failed to exchange code for token: ${tokenResponse.error || "unknown error"}`,
        "token_exchange_failed"
      )
    );
  }

  const { access_token: botToken, team, app_id: slackAppId } = tokenResponse;
  const teamId = team?.id;
  const teamName = team?.name;

  if (!botToken || !teamId || !slackAppId) {
    return c.html(
      createErrorHtml(
        "Invalid token response from Slack",
        "invalid_token_response"
      )
    );
  }

  // Generate chat name
  const chatName = getShortenedAppIdentifier(app);

  console.log("[SlackOAuth] Creating installation", {
    teamId,
    slackAppId,
    teamName,
    chatName,
  });

  // Create or update installation
  const installation = await slackService.upsertInstallation({
    workspaceTeamId: teamId,
    slackAppId,
    workspaceName: teamName,
    botToken,
    signingSecret: credentials.signingSecret,
    slackClientId: credentials.clientId,
    slackClientSecret: credentials.clientSecret,
  });

  // Delete existing mappings for this installation
  await slackService.deleteChatMappingsForInstallation(installation.id);

  // Create chat mapping
  await slackService.createChatMapping({
    slackInstallationId: installation.id,
    chatName,
    applicationId: stateRecord.applicationId,
  });

  console.log("[SlackOAuth] Installation complete", {
    installationId: installation.id,
    chatName,
  });

  return c.html(
    createSuccessHtml(
      stateRecord.applicationId,
      teamName || "Connected workspace"
    )
  );
});

/**
 * POST /slack/credentials
 * Save Slack app credentials
 */
slackRoutes.post(
  "/credentials",
  zValidator("json", saveCredentialsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Verify user has access
    let app;
    try {
      app = await applicationService.get(body.applicationId, user.id);
    } catch {
      return c.json({ error: "Application not found" }, 404);
    }

    // Encrypt secrets
    const encryptedClientSecret = await encrypt(body.slackClientSecret);
    const encryptedSigningSecret = await encrypt(body.slackSigningSecret);

    // Get current settings
    const currentSettings = (app.settings || {}) as Record<string, unknown>;

    // Update settings with Slack credentials
    const updatedSettings = {
      ...currentSettings,
      slack: {
        clientId: body.slackClientId,
        clientSecret: encryptedClientSecret,
        signingSecret: encryptedSigningSecret,
      },
    };

    // Save to database
    await db
      .updateTable("app.applications")
      .set({ settings: JSON.stringify(updatedSettings) })
      .where("id", "=", body.applicationId)
      .execute();

    return c.json({ ok: true });
  }
);

/**
 * GET /slack/status?applicationId=<uuid>
 * Check Slack connection status
 */
slackRoutes.get("/status", async (c) => {
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json({ error: "applicationId is required" }, 400);
  }

  const user = c.get("user");

  // Verify access
  try {
    await applicationService.get(applicationId, user.id);
  } catch {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check for installation
  const installation =
    await slackService.getInstallationByApplicationId(applicationId);

  if (!installation) {
    // Check if credentials are configured
    const credentials = await getSlackCredentials(applicationId);

    return c.json({
      connected: false,
      hasCredentials: !!credentials,
      workspaceName: null,
    });
  }

  return c.json({
    connected: true,
    hasCredentials: true,
    workspaceName: installation.installation.workspaceName,
    installedAt: installation.installation.createdAt,
  });
});

/**
 * DELETE /slack/disconnect?applicationId=<uuid>
 * Disconnect Slack integration
 */
slackRoutes.delete("/disconnect", async (c) => {
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json({ error: "applicationId is required" }, 400);
  }

  const user = c.get("user");

  // Verify access
  try {
    await applicationService.get(applicationId, user.id);
  } catch {
    return c.json({ error: "Application not found" }, 404);
  }

  // Get installation
  const installation =
    await slackService.getInstallationByApplicationId(applicationId);

  if (!installation) {
    return c.json({ ok: true }); // Already disconnected
  }

  // Delete installation
  await slackService.deleteInstallation(installation.installation.id);

  return c.json({ ok: true });
});

/**
 * GET /slack/oauth-url?applicationId=<uuid>
 * Get the OAuth URL for installing to Slack (without redirecting)
 */
slackRoutes.get("/oauth-url", async (c) => {
  const applicationId = c.req.query("applicationId");
  if (!applicationId) {
    return c.json({ error: "applicationId is required" }, 400);
  }

  const user = c.get("user");

  // Verify user has access
  try {
    await applicationService.get(applicationId, user.id);
  } catch {
    return c.json({ error: "Application not found" }, 404);
  }

  // Check if credentials are configured
  const credentials = await getSlackCredentials(applicationId);
  if (!credentials) {
    return c.json({ error: "Slack credentials not configured" }, 400);
  }

  // Create OAuth state
  const state = await slackService.createOAuthState(applicationId, user.id);

  // Build OAuth URL
  const oauthUrl = getSlackOAuthUrl(credentials.clientId, state);

  return c.json({ oauthUrl });
});

// ========================================
// HTML Helpers
// ========================================

function createSuccessHtml(
  applicationId: string,
  workspaceName: string
): string {
  // Escape the workspace name for safe embedding in JS string
  const escapedWorkspaceName = workspaceName
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Slack Installation Complete</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
          }
          .container { text-align: center; padding: 2rem; }
          .success-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1rem;
            background-color: #28a745;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .success-icon svg { width: 32px; height: 32px; stroke: white; stroke-width: 3; }
          h1 { color: #333; font-size: 1.5rem; margin-bottom: 0.5rem; }
          p { color: #666; margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Successfully installed to Slack!</h1>
          <p>You can close this window now.</p>
        </div>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'slack-oauth-complete',
              success: true,
              workspaceName: '${escapedWorkspaceName}',
              applicationId: '${applicationId}'
            }, '*');
          }
          setTimeout(() => {
            window.close();
            setTimeout(() => {
              document.querySelector('p').textContent = 'You can now safely close this window.';
            }, 500);
          }, 1500);
        </script>
      </body>
    </html>
  `;
}

function createErrorHtml(message: string, _errorCode: string): string {
  // Escape the message for safe embedding in JS string
  const escapedMessage = message.replace(/'/g, "\\'").replace(/"/g, "&quot;");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Slack Installation Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
          }
          .container { text-align: center; padding: 2rem; }
          .error-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1rem;
            background-color: #dc3545;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .error-icon svg { width: 32px; height: 32px; stroke: white; stroke-width: 3; }
          h1 { color: #333; font-size: 1.5rem; margin-bottom: 0.5rem; }
          p { color: #666; margin-bottom: 1rem; }
          .error-message { color: #dc3545; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Installation Failed</h1>
          <p class="error-message">${message}</p>
          <p>This window will close automatically.</p>
        </div>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'slack-oauth-complete',
              success: false,
              error: '${escapedMessage}'
            }, '*');
          }
          setTimeout(() => {
            window.close();
            setTimeout(() => {
              document.querySelector('p:last-child').textContent = 'You can now safely close this window.';
            }, 500);
          }, 3000);
        </script>
      </body>
    </html>
  `;
}
