/**
 * Authentication Routes
 *
 * OAuth flows using Arctic, with database-backed sessions.
 * No third-party hosted auth services.
 */

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  generateState,
  generateCodeVerifier,
  Google,
  MicrosoftEntraId,
} from "arctic";
import { SignJWT } from "jose";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { sql } from "kysely";
import { db } from "../src/db/client.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, AuthUser, Session } from "../types.ts";
import { userProvisioningService } from "../src/services/user-provisioning.service.ts";
import { sendOtpEmail, sendPasswordResetEmail } from "../src/services/transactional-email.service.ts";

// JWT secret for WebSocket tokens - uses same secret as session auth
const JWT_SECRET = new TextEncoder().encode(
  Deno.env.get("NEXTAUTH_SECRET") || "development-secret-must-be-32-chars!"
);

export const auth = new Hono<AppEnv>();

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// OAuth state/verifier cookie duration: 10 minutes
const OAUTH_COOKIE_MAX_AGE = 60 * 10;

// Cookie settings
const SECURE_COOKIE = Deno.env.get("ENVIRONMENT") === "production";

// Cookie domain for cross-subdomain auth (build.chipp.ai + dino-mullet.chipp.ai)
// In production, set domain to .chipp.ai so cookies work across subdomains
// In dev, leave undefined so cookies work on localhost
const COOKIE_DOMAIN =
  Deno.env.get("ENVIRONMENT") === "production" ? ".chipp.ai" : undefined;

// Internal API key for server-to-server authentication
// Read at request time (not module load time) so tests can set it after import
function getInternalApiKey(): string | undefined {
  return Deno.env.get("INTERNAL_API_KEY");
}

// ============================================================
// Embedded Context Detection (for iframe auth)
// ============================================================

// Embedded iframes on third-party sites need sameSite: "None" + secure: true
// because browsers block "Lax" cookies on cross-origin requests.
// Detect embedded context via query param or referrer header.

import type { Context } from "hono";

function isEmbeddedContext(c: Context): boolean {
  // Check explicit query param (set by embed widget)
  if (c.req.query("embed") === "true") return true;

  // Check if referrer is a different origin (likely iframe scenario)
  const referer = c.req.header("referer");
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:8000";
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      const appOrigin = new URL(appUrl).origin;
      if (refererOrigin !== appOrigin) {
        return true;
      }
    } catch {
      // Invalid URL, ignore
    }
  }

  return false;
}

// Get sameSite value - "None" for embedded (allows cross-origin), "Lax" otherwise
function getCookieSameSite(c: Context): "Lax" | "None" {
  return isEmbeddedContext(c) ? "None" : "Lax";
}

// Embedded contexts MUST use secure cookies (required for sameSite: "None")
function getCookieSecure(c: Context): boolean {
  return isEmbeddedContext(c) ? true : SECURE_COOKIE;
}

// ============================================================
// Mock Auth Mode (when database is not configured)
// ============================================================

const MOCK_USER = {
  id: "mock-user-id",
  email: "hunter@chipp.ai",
  name: "hunter",
  picture: null,
  organizationId: "mock-org-id",
  role: "owner" as const,
  activeWorkspaceId: 1,
};

// Check for database config at import time (can't use isDatabaseConfigured() as initDb() hasn't run yet)
const hasDbConfig =
  Deno.env.get("DENO_DATABASE_URL") ||
  Deno.env.get("PG_DATABASE_URL") ||
  Deno.env.get("DATABASE_URL");

// In dev mode without database, provide mock auth endpoints
if (Deno.env.get("ENVIRONMENT") !== "production" && !hasDbConfig) {
  console.log("[auth] Database not configured - using mock auth mode");

  auth.get("/me", (c) => {
    return c.json(MOCK_USER);
  });

  auth.get("/dev-login", (c) => {
    const webAppUrl = Deno.env.get("WEB_APP_URL") || "http://localhost:5174";
    const redirect = c.req.query("redirect") || `${webAppUrl}/#/dashboard`;
    return c.redirect(redirect);
  });

  auth.post("/logout", (c) => {
    return c.json({ success: true });
  });

  auth.get("/ws-token", async (c) => {
    const token = await new SignJWT({
      email: MOCK_USER.email,
      orgId: MOCK_USER.organizationId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(MOCK_USER.id)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(JWT_SECRET);
    return c.json({ token, expiresIn: 300 });
  });

  auth.get("/session", (c) => {
    return c.json({ authenticated: true, user: MOCK_USER });
  });
}

// ============================================================
// OAuth Providers
// ============================================================

function getProviders() {
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:8000";

  return {
    google: new Google(
      Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      `${appUrl}/auth/callback/google`
    ),
    microsoft: new MicrosoftEntraId(
      Deno.env.get("MICROSOFT_TENANT_ID") ?? "common",
      Deno.env.get("MICROSOFT_CLIENT_ID") ?? "",
      Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "",
      `${appUrl}/auth/callback/microsoft`
    ),
  };
}

function getScopes(provider: string): string[] {
  switch (provider) {
    case "google":
      return ["openid", "email", "profile"];
    case "microsoft":
      return ["openid", "email", "profile", "User.Read"];
    default:
      return [];
  }
}

// ============================================================
// User Info Fetching
// ============================================================

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

async function fetchUserInfo(
  provider: string,
  accessToken: string
): Promise<UserInfo> {
  switch (provider) {
    case "google": {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch Google user info");
      const data = await res.json();
      return {
        id: data.sub,
        email: data.email,
        name: data.name ?? null,
        picture: data.picture ?? null,
      };
    }

    case "microsoft": {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch Microsoft user info");
      const data = await res.json();
      return {
        id: data.id,
        email: data.mail || data.userPrincipalName,
        name: data.displayName ?? null,
        picture: null, // Microsoft Graph requires separate call for photo
      };
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ============================================================
// Session Management
// ============================================================

async function createSession(
  userId: string,
  metadata?: { ip?: string; userAgent?: string }
) {
  return db
    .insertInto("app.sessions")
    .values({
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      ipAddress: metadata?.ip ?? null,
      userAgent: metadata?.userAgent ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function deleteSession(sessionId: string) {
  await db.deleteFrom("app.sessions").where("id", "=", sessionId).execute();
}

async function deleteUserSessions(userId: string) {
  await db.deleteFrom("app.sessions").where("userId", "=", userId).execute();
}

// Session auth context type
interface SessionAuthContext {
  Variables: {
    user: AuthUser;
    session: Session;
  };
}

// Session-based auth middleware (uses cookie, not Bearer token)
const sessionAuthMiddleware = createMiddleware<SessionAuthContext>(
  async (c, next) => {
    const sessionId = getCookie(c, "session_id");

    if (!sessionId) {
      throw new HTTPException(401, { message: "Not authenticated" });
    }

    // Get session and user
    const result = await db
      .selectFrom("app.sessions as s")
      .innerJoin("app.users as u", "u.id", "s.userId")
      .select([
        "s.id as sessionId",
        "s.expiresAt",
        "u.id",
        "u.email",
        "u.name",
        "u.picture",
        "u.organizationId",
        "u.role",
      ])
      .where("s.id", "=", sessionId)
      .where("s.expiresAt", ">", new Date())
      .executeTakeFirst();

    if (!result) {
      deleteCookie(c, "session_id", { path: "/", domain: COOKIE_DOMAIN });
      throw new HTTPException(401, { message: "Session expired" });
    }

    c.set("user", {
      id: result.id,
      email: result.email,
      name: result.name,
      picture: result.picture,
      organizationId: result.organizationId,
      role: result.role as "owner" | "admin" | "member",
    });

    c.set("session", {
      id: result.sessionId,
      userId: result.id,
      expiresAt: result.expiresAt,
    });

    await next();
  }
);

// ============================================================
// User Management
// ============================================================

async function findOrCreateUser(
  provider: string,
  userInfo: UserInfo
): Promise<{ id: string; isNew: boolean }> {
  // Check if user exists by OAuth ID
  let user = await db
    .selectFrom("app.users")
    .select(["id"])
    .where("oauthProvider", "=", provider)
    .where("oauthId", "=", userInfo.id)
    .executeTakeFirst();

  if (user) {
    return { id: user.id, isNew: false };
  }

  // Check if user exists by email (link accounts)
  user = await db
    .selectFrom("app.users")
    .select(["id"])
    .where("email", "=", userInfo.email)
    .executeTakeFirst();

  if (user) {
    // Link OAuth to existing account
    await db
      .updateTable("app.users")
      .set({
        oauthProvider: provider,
        oauthId: userInfo.id,
        updatedAt: new Date(),
      })
      .where("id", "=", user.id)
      .execute();
    return { id: user.id, isNew: false };
  }

  // Create new user via provisioning service (handles org, workspace, Stripe setup)
  const result = await userProvisioningService.provisionNewUser({
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    oauthProvider: provider,
    oauthId: userInfo.id,
    emailVerified: true,
  });

  return { id: result.userId, isNew: true };
}

// ============================================================
// Routes
// ============================================================

/**
 * Initiate OAuth login
 */
auth.get("/login/:provider", async (c) => {
  const provider = c.req.param("provider");
  const providers = getProviders();

  if (!(provider in providers)) {
    return c.json({ error: "Unknown provider" }, 400);
  }

  const oauthProvider = providers[provider as keyof typeof providers];
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  // Store state and verifier in cookies
  // Use dynamic sameSite for embedded iframe contexts
  setCookie(c, "oauth_state", state, {
    httpOnly: true,
    secure: getCookieSecure(c),
    sameSite: getCookieSameSite(c),
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  });

  setCookie(c, "oauth_verifier", codeVerifier, {
    httpOnly: true,
    secure: getCookieSecure(c),
    sameSite: getCookieSameSite(c),
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  });

  // Store redirect URL if provided (default to / which checks for import prompt)
  const redirectTo = c.req.query("redirect") ?? "/";
  setCookie(c, "oauth_redirect", redirectTo, {
    httpOnly: true,
    secure: getCookieSecure(c),
    sameSite: getCookieSameSite(c),
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  });

  const scopes = getScopes(provider);
  const url = oauthProvider.createAuthorizationURL(state, codeVerifier, scopes);

  return c.redirect(url.toString());
});

/**
 * OAuth callback
 */
auth.get("/callback/:provider", async (c) => {
  const provider = c.req.param("provider");
  const providers = getProviders();
  const webAppUrl = Deno.env.get("WEB_APP_URL") || "http://localhost:5174";

  if (!(provider in providers)) {
    return c.redirect(`${webAppUrl}/#/login?error=unknown_provider`);
  }

  const oauthProvider = providers[provider as keyof typeof providers];

  const code = c.req.query("code");
  const state = c.req.query("state");
  const storedState = getCookie(c, "oauth_state");
  const codeVerifier = getCookie(c, "oauth_verifier");
  const redirectTo = getCookie(c, "oauth_redirect") ?? "/";

  // Clean up OAuth cookies
  deleteCookie(c, "oauth_state");
  deleteCookie(c, "oauth_verifier");
  deleteCookie(c, "oauth_redirect");

  // Verify state
  if (!state || state !== storedState) {
    return c.redirect(`${webAppUrl}/#/login?error=invalid_state`);
  }

  if (!code || !codeVerifier) {
    return c.redirect(`${webAppUrl}/#/login?error=missing_code`);
  }

  try {
    // Exchange code for tokens
    const tokens = await oauthProvider.validateAuthorizationCode(
      code,
      codeVerifier
    );

    // Get user info from provider
    const userInfo = await fetchUserInfo(provider, tokens.accessToken());

    // Find or create user
    const { id: userId, isNew } = await findOrCreateUser(provider, userInfo);

    // Create session
    const session = await createSession(userId, {
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
    });

    // Set session cookie (use dynamic sameSite for embedded contexts)
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: getCookieSecure(c),
      sameSite: getCookieSameSite(c),
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
      domain: COOKIE_DOMAIN,
    });

    // Redirect to web app (different port in dev)
    // All users go to / which handles routing decision (may route to import for legacy data)
    return c.redirect(`${webAppUrl}/#/`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return c.redirect(`${webAppUrl}/#/login?error=auth_failed`);
  }
});

/**
 * Email/password login
 */
auth.post("/login/credentials", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    // Find user by email
    const user = await db
      .selectFrom("app.users")
      .select([
        "id",
        "email",
        "name",
        "picture",
        "role",
        "organizationId",
        "passwordHash",
      ])
      .where("email", "=", email.toLowerCase())
      .executeTakeFirst();

    if (!user) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Check if user has a password set
    if (!user.passwordHash) {
      return c.json(
        {
          error:
            "This account uses OAuth login. Please sign in with Google or Microsoft.",
        },
        400
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Create session
    const session = await createSession(user.id, {
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
    });

    // Update last login
    await db
      .updateTable("app.users")
      .set({ lastLoginAt: new Date() })
      .where("id", "=", user.id)
      .execute();

    // Set session cookie (use dynamic sameSite for embedded contexts)
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: getCookieSecure(c),
      sameSite: getCookieSameSite(c),
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
      domain: COOKIE_DOMAIN,
    });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error) {
    console.error("[auth] Credentials login error:", error);
    return c.json({ error: "Login failed" }, 500);
  }
});

/**
 * Get current user
 */
auth.get("/me", sessionAuthMiddleware, (c) => {
  const user = c.get("user");
  return c.json(user);
});

/**
 * Logout
 */
auth.post("/logout", sessionAuthMiddleware, async (c) => {
  const session = c.get("session");

  await deleteSession(session.id);
  deleteCookie(c, "session_id", { path: "/", domain: COOKIE_DOMAIN });

  return c.json({ success: true });
});

/**
 * Logout from all devices
 */
auth.post("/logout-all", sessionAuthMiddleware, async (c) => {
  const user = c.get("user");

  await deleteUserSessions(user.id);
  deleteCookie(c, "session_id", { path: "/", domain: COOKIE_DOMAIN });

  return c.json({ success: true });
});

/**
 * DEV ONLY: Bypass login for testing
 * Creates a session for a user by email (creates user if needed)
 */
if (Deno.env.get("ENVIRONMENT") !== "production") {
  auth.get("/dev-login", async (c) => {
    const email = c.req.query("email") || "hunter@chipp.ai";

    // Find or create user by email
    let user = await db
      .selectFrom("app.users")
      .select(["id", "email", "name"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) {
      // Create user, organization, and workspace for dev
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const workspaceId = crypto.randomUUID();
      const name = email.split("@")[0];

      // Create organization first
      await db
        .insertInto("app.organizations")
        .values({
          id: orgId,
          name: `${name}'s Organization`,
          subscriptionTier: "PRO",
          usageBasedBillingEnabled: false,
          creditsBalance: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      // Create user
      await db
        .insertInto("app.users")
        .values({
          id: userId,
          email,
          name,
          role: "owner",
          organizationId: orgId,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      // Create default workspace
      await db
        .insertInto("app.workspaces")
        .values({
          id: workspaceId,
          name: "My Workspace",
          organizationId: orgId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      // Add user as workspace owner
      await db
        .insertInto("app.workspace_members")
        .values({
          id: crypto.randomUUID(),
          workspaceId: workspaceId,
          userId: userId,
          role: "OWNER",
          joinedAt: new Date(),
          joinedViaPublicInvite: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

      user = { id: userId, email, name };
      console.log(`[dev-login] Created dev user: ${email}`);
    } else {
      // Existing user - ensure they have a workspace membership
      const membership = await db
        .selectFrom("app.workspace_members")
        .select("id")
        .where("userId", "=", user.id)
        .executeTakeFirst();

      if (!membership) {
        // Get user's org and find or create a workspace
        const userWithOrg = await db
          .selectFrom("app.users")
          .select("organizationId")
          .where("id", "=", user.id)
          .executeTakeFirst();

        if (userWithOrg) {
          let workspace = await db
            .selectFrom("app.workspaces")
            .select("id")
            .where("organizationId", "=", userWithOrg.organizationId)
            .executeTakeFirst();

          if (!workspace) {
            // Create workspace for existing org
            const workspaceId = crypto.randomUUID();
            await db
              .insertInto("app.workspaces")
              .values({
                id: workspaceId,
                name: "My Workspace",
                organizationId: userWithOrg.organizationId,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .execute();
            workspace = { id: workspaceId };
          }

          // Add user to workspace
          await db
            .insertInto("app.workspace_members")
            .values({
              id: crypto.randomUUID(),
              workspaceId: workspace.id,
              userId: user.id,
              role: "OWNER",
              joinedAt: new Date(),
              joinedViaPublicInvite: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .execute();

          console.log(
            `[dev-login] Created workspace membership for existing user: ${email}`
          );
        }
      }
    }

    // Create session
    const session = await createSession(user.id, {
      ip: "127.0.0.1",
      userAgent: "dev-bypass",
    });

    // Set session cookie (dev mode only - Lax is fine, secure: false for localhost)
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
      domain: COOKIE_DOMAIN,
    });

    // Redirect to Svelte app (or custom redirect)
    const webAppUrl = Deno.env.get("WEB_APP_URL") || "http://localhost:5174";
    const redirect = c.req.query("redirect") || `${webAppUrl}/#/apps`;
    return c.redirect(redirect);
  });
}

/**
 * Get WebSocket token for real-time connections
 * Returns a short-lived JWT that can be used to connect to /ws
 */
auth.get("/ws-token", sessionAuthMiddleware, async (c) => {
  const user = c.get("user");

  // Create a short-lived token (5 minutes) for WebSocket connection
  // Uses proper HMAC-SHA256 signing
  const token = await new SignJWT({
    email: user.email,
    orgId: user.organizationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(JWT_SECRET);

  return c.json({ token, expiresIn: 300 });
});

/**
 * Check session status
 */
auth.get("/session", async (c) => {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    return c.json({ authenticated: false });
  }

  const session = await db
    .selectFrom("app.sessions")
    .select(["id", "expiresAt"])
    .where("id", "=", sessionId)
    .where("expiresAt", ">", new Date())
    .executeTakeFirst();

  if (!session) {
    deleteCookie(c, "session_id", { path: "/", domain: COOKIE_DOMAIN });
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
    expiresAt: session.expiresAt,
  });
});

// ============================================================
// Email/Password Signup Routes
// ============================================================

/**
 * Check if email already exists
 */
auth.post("/check-email", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existingUser = await db
      .selectFrom("app.users")
      .select(["id", "oauthProvider"])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    if (existingUser) {
      return c.json({
        exists: true,
        hasOAuth: !!existingUser.oauthProvider,
        oauthProvider: existingUser.oauthProvider,
      });
    }

    return c.json({ exists: false });
  } catch (error) {
    console.error("[auth] Check email error:", error);
    return c.json({ error: "Failed to check email" }, 500);
  }
});

/**
 * Send OTP verification email
 */
auth.post("/send-otp", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Generate 6-digit OTP using cryptographically secure random values
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const otp = String(100000 + (randomBytes[0] % 900000)).padStart(6, "0");

    // Delete any existing OTPs for this email
    await db
      .deleteFrom("app.otp_verifications")
      .where("email", "=", normalizedEmail)
      .execute();

    // Store OTP with 10 minute expiry
    await db
      .insertInto("app.otp_verifications")
      .values({
        email: normalizedEmail,
        otpCode: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      })
      .execute();

    // Send email with OTP via SMTP2GO (falls back to console.log when SMTP not configured)
    const sent = await sendOtpEmail({
      to: normalizedEmail,
      otpCode: otp,
      context: {
        appName: "Chipp",
        appId: "platform",
        organizationId: "platform",
        brandColor: "#000000",
      },
    });
    if (!sent) {
      return c.json({ error: "Failed to send verification email" }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[auth] Send OTP error:", error);
    return c.json({ error: "Failed to send verification code" }, 500);
  }
});

/**
 * Complete signup with verified OTP
 */
auth.post("/signup", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, otp } = body;

    if (!email || !password || !otp) {
      return c.json({ error: "Email, password, and OTP are required" }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db
      .selectFrom("app.users")
      .select(["id"])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    if (existingUser) {
      return c.json(
        { error: "An account with this email already exists" },
        409
      );
    }

    // Verify OTP
    const otpRecord = await db
      .selectFrom("app.otp_verifications")
      .select(["id", "attempts", "expiresAt"])
      .where("email", "=", normalizedEmail)
      .where("otpCode", "=", otp)
      .where("verifiedAt", "is", null)
      .executeTakeFirst();

    if (!otpRecord) {
      // Increment attempts for this email's OTP records
      await db
        .updateTable("app.otp_verifications")
        .set({ attempts: sql`attempts + 1` })
        .where("email", "=", normalizedEmail)
        .execute();

      return c.json({ error: "Invalid verification code" }, 400);
    }

    // Check if OTP is expired
    if (new Date() > otpRecord.expiresAt) {
      return c.json({ error: "Verification code has expired" }, 400);
    }

    // Check if too many attempts
    if (otpRecord.attempts >= 5) {
      return c.json(
        { error: "Too many failed attempts. Please request a new code." },
        400
      );
    }

    // Mark OTP as verified
    await db
      .updateTable("app.otp_verifications")
      .set({ verifiedAt: new Date() })
      .where("id", "=", otpRecord.id)
      .execute();

    // Hash password
    const passwordHash = await bcrypt.hash(password);

    // Create user via provisioning service (handles org, workspace, Stripe setup)
    const name = normalizedEmail.split("@")[0];
    const result = await userProvisioningService.provisionNewUser({
      email: normalizedEmail,
      name,
      passwordHash,
      emailVerified: true,
    });
    const userId = result.userId;

    // Create session
    const session = await createSession(userId, {
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
    });

    // Set session cookie (use dynamic sameSite for embedded contexts)
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: getCookieSecure(c),
      sameSite: getCookieSameSite(c),
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
      domain: COOKIE_DOMAIN,
    });

    // Clean up OTP records for this email
    await db
      .deleteFrom("app.otp_verifications")
      .where("email", "=", normalizedEmail)
      .execute();

    return c.json({
      success: true,
      user: {
        id: userId,
        email: normalizedEmail,
        name,
        role: "owner",
        organizationId: result.organizationId,
      },
    });
  } catch (error) {
    console.error("[auth] Signup error:", error);
    return c.json({ error: "Signup failed" }, 500);
  }
});

// ============================================================
// Password Reset Routes
// ============================================================

/**
 * Request password reset
 */
auth.post("/forgot-password", async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db
      .selectFrom("app.users")
      .select(["id", "email", "name", "passwordHash"])
      .where("email", "=", normalizedEmail)
      .executeTakeFirst();

    // Always return success to prevent email enumeration
    if (!user) {
      return c.json({ success: true });
    }

    // If user only has OAuth, they can't reset password
    if (!user.passwordHash) {
      // Still return success but don't send email
      return c.json({ success: true });
    }

    // Generate reset token (URL-safe random string)
    const resetToken = crypto.randomUUID();
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token
    await db
      .updateTable("app.users")
      .set({
        resetToken: resetToken,
        resetTokenExpiry: resetExpiry,
        updatedAt: new Date(),
      })
      .where("id", "=", user.id)
      .execute();

    // Send reset email via SMTP2GO (falls back to console.log when SMTP not configured)
    const webAppUrl = Deno.env.get("WEB_APP_URL") || "http://localhost:5174";
    const resetUrl = `${webAppUrl}/#/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail({
      to: normalizedEmail,
      resetUrl,
      context: {
        appName: "Chipp",
        appId: "platform",
        organizationId: "platform",
        brandColor: "#000000",
      },
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("[auth] Forgot password error:", error);
    return c.json({ error: "Failed to process request" }, 500);
  }
});

/**
 * Reset password with token
 */
auth.post("/reset-password", async (c) => {
  try {
    const body = await c.req.json();
    const { token, password } = body;

    if (!token || !password) {
      return c.json({ error: "Token and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Find user by reset token
    const user = await db
      .selectFrom("app.users")
      .select(["id", "resetTokenExpiry"])
      .where("resetToken", "=", token)
      .executeTakeFirst();

    if (!user) {
      return c.json({ error: "Invalid or expired reset link" }, 400);
    }

    // Check if token is expired
    if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
      // Clear the expired token
      await db
        .updateTable("app.users")
        .set({
          resetToken: null,
          resetTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where("id", "=", user.id)
        .execute();

      return c.json({ error: "Reset link has expired" }, 400);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password);

    // Update password and clear reset token
    await db
      .updateTable("app.users")
      .set({
        passwordHash: passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        updatedAt: new Date(),
      })
      .where("id", "=", user.id)
      .execute();

    // Invalidate all existing sessions for security
    await deleteUserSessions(user.id);

    return c.json({ success: true });
  } catch (error) {
    console.error("[auth] Reset password error:", error);
    return c.json({ error: "Failed to reset password" }, 500);
  }
});

// ============================================================
// User Provisioning API (v2 billing enabled)
// ============================================================

/**
 * Provision a new user with organization and workspace.
 * This endpoint uses the v2 billing model (usageBasedBillingEnabled: true).
 *
 * SECURITY: Requires internal API key to prevent unauthorized user creation.
 *
 * Used by:
 * - chipp-admin post-login hook to provision users
 * - Import flow to provision users during data migration
 */
auth.post("/provision", async (c) => {
  try {
    // Verify internal API key for server-to-server authentication
    const internalAuth = c.req.header("X-Internal-Auth");
    const apiKey = getInternalApiKey();
    if (!apiKey || internalAuth !== apiKey) {
      throw new HTTPException(401, {
        message: "Internal authentication required",
      });
    }

    const body = await c.req.json();
    const { email, name, picture, oauthProvider, oauthId } = body;

    if (!email) {
      throw new HTTPException(400, { message: "Email is required" });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Use the provisioning service to find or create user
    const result = await userProvisioningService.findOrCreateUser({
      email: normalizedEmail,
      name: name || null,
      picture: picture || null,
      oauthProvider: oauthProvider || null,
      oauthId: oauthId || null,
    });

    return c.json({
      data: {
        userId: result.userId,
        email: result.email,
        name: result.name,
        organizationId: result.organizationId,
        workspaceId: result.workspaceId,
        role: result.role,
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("[auth] Provision error:", error);
    return c.json({ error: "Failed to provision user" }, 500);
  }
});

/**
 * Create a session for an existing user.
 * Used after provisioning to establish authentication.
 *
 * SECURITY: Requires internal API key to prevent unauthorized session creation.
 * This endpoint is called by chipp-admin after successful OAuth authentication.
 */
auth.post("/session-create", async (c) => {
  try {
    // Verify internal API key for server-to-server authentication
    const internalAuth = c.req.header("X-Internal-Auth");
    const apiKey = getInternalApiKey();
    if (!apiKey || internalAuth !== apiKey) {
      throw new HTTPException(401, {
        message: "Internal authentication required",
      });
    }

    const body = await c.req.json();
    const { userId } = body;

    if (!userId) {
      throw new HTTPException(400, { message: "userId is required" });
    }

    // Verify user exists
    const user = await db
      .selectFrom("app.users")
      .select(["id"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    // Create session
    const session = await createSession(userId, {
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
    });

    // Set session cookie (use dynamic sameSite for embedded contexts)
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: getCookieSecure(c),
      sameSite: getCookieSameSite(c),
      maxAge: SESSION_DURATION_MS / 1000,
      path: "/",
      domain: COOKIE_DOMAIN,
    });

    return c.json({
      data: {
        sessionId: session.id,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("[auth] Session create error:", error);
    return c.json({ error: "Failed to create session" }, 500);
  }
});
