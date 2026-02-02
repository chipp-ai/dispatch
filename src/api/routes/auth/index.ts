/**
 * Auth Routes
 *
 * Handles authentication, user provisioning, and session management.
 * These routes do NOT require auth middleware as they handle login/signup.
 */

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { jwtVerify } from "jose";
import { db } from "../../../db/client.ts";
import { userProvisioningService } from "../../../services/user-provisioning.service.ts";
import { welcomeScreenService } from "../../../services/welcome-screen.service.ts";

// JWT secret for token verification - must match auth.ts
const JWT_SECRET = new TextEncoder().encode(
  Deno.env.get("NEXTAUTH_SECRET") || "development-secret-must-be-32-chars!"
);

// Internal API key for server-to-server authentication
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY");

// Context type (no auth required for these routes)
interface AuthRouteContext {
  Variables: {
    requestId: string;
  };
}

export const authRoutes = new Hono<AuthRouteContext>();

/**
 * POST /auth/provision
 *
 * Provision a new user with organization and workspace.
 * Called after successful OAuth authentication to ensure user exists
 * with proper org/workspace setup.
 *
 * SECURITY: Requires internal API key to prevent unauthorized user creation.
 *
 * This is the v2 equivalent of chipp-admin's post-login route.
 */
authRoutes.post("/provision", async (c) => {
  // Verify internal API key for server-to-server authentication
  const internalAuth = c.req.header("X-Internal-Auth");
  if (!INTERNAL_API_KEY || internalAuth !== INTERNAL_API_KEY) {
    throw new HTTPException(401, {
      message: "Internal authentication required",
    });
  }

  const body = await c.req.json<{
    email: string;
    name?: string | null;
    picture?: string | null;
    oauthProvider?: string | null;
    oauthId?: string | null;
  }>();

  if (!body.email) {
    throw new HTTPException(400, { message: "Email is required" });
  }

  // Normalize email
  const email = body.email.toLowerCase().trim();

  // Find or create user with organization and workspace
  const user = await userProvisioningService.findOrCreateUser({
    email,
    name: body.name,
    picture: body.picture,
    oauthProvider: body.oauthProvider,
    oauthId: body.oauthId,
  });

  return c.json({
    data: {
      userId: user.userId,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      workspaceId: user.workspaceId,
      role: user.role,
      isNewUser: !!(await isNewUser(user.userId)),
    },
  });
});

/**
 * GET /auth/me
 *
 * Get current user info from session cookie.
 * Returns user details if authenticated, 401 if not.
 */
authRoutes.get("/me", async (c) => {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  // Verify session and get user
  const result = await db
    .selectFrom("app.sessions")
    .innerJoin("app.users as u", "u.id", "app.sessions.userId")
    .select([
      "u.id",
      "u.email",
      "u.name",
      "u.picture",
      "u.organizationId",
      "u.activeWorkspaceId",
      "u.role",
      "app.sessions.expiresAt",
    ])
    .where("app.sessions.id", "=", sessionId)
    .where("app.sessions.expiresAt", ">", new Date())
    .executeTakeFirst();

  if (!result) {
    // Clear invalid session cookie
    deleteCookie(c, "session_id");
    throw new HTTPException(401, { message: "Session expired or invalid" });
  }

  return c.json({
    data: {
      id: result.id,
      email: result.email,
      name: result.name,
      picture: result.picture,
      organizationId: result.organizationId,
      activeWorkspaceId: result.activeWorkspaceId,
      role: result.role,
    },
  });
});

/**
 * POST /auth/session
 *
 * Create a new session for an authenticated user.
 * Called after OAuth callback to establish session.
 *
 * SECURITY: Requires internal API key to prevent unauthorized session creation.
 */
authRoutes.post("/session", async (c) => {
  // Verify internal API key for server-to-server authentication
  const internalAuth = c.req.header("X-Internal-Auth");
  if (!INTERNAL_API_KEY || internalAuth !== INTERNAL_API_KEY) {
    throw new HTTPException(401, {
      message: "Internal authentication required",
    });
  }

  const body = await c.req.json<{
    userId: string;
    expiresInDays?: number;
  }>();

  if (!body.userId) {
    throw new HTTPException(400, { message: "userId is required" });
  }

  // Verify user exists
  const user = await db
    .selectFrom("app.users")
    .select(["id", "email"])
    .where("id", "=", body.userId)
    .executeTakeFirst();

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  // Create session
  const sessionId = crypto.randomUUID();
  const expiresInDays = body.expiresInDays || 30;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await db
    .insertInto("app.sessions")
    .values({
      id: sessionId,
      userId: body.userId,
      expiresAt,
    })
    .execute();

  // Set session cookie
  setCookie(c, "session_id", sessionId, {
    httpOnly: true,
    secure: Deno.env.get("DENO_ENV") !== "development",
    sameSite: "Lax",
    maxAge: expiresInDays * 24 * 60 * 60,
    path: "/",
  });

  return c.json({
    data: {
      sessionId,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

/**
 * POST /auth/logout
 *
 * Logout and invalidate current session.
 */
authRoutes.post("/logout", async (c) => {
  const sessionId = getCookie(c, "session_id");

  if (sessionId) {
    // Delete session from database
    await db.deleteFrom("app.sessions").where("id", "=", sessionId).execute();

    // Clear cookie
    deleteCookie(c, "session_id");
  }

  return c.json({
    data: { success: true },
  });
});

/**
 * POST /auth/verify-token
 *
 * Verify a JWT token and return user info.
 * Used for API key authentication and token validation.
 */
authRoutes.post("/verify-token", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    throw new HTTPException(401, {
      message: "Authorization header required",
    });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    throw new HTTPException(401, { message: "Token required" });
  }

  // Verify token signature using HMAC-SHA256
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    return c.json({
      data: {
        valid: true,
        userId: payload.sub || (payload as Record<string, unknown>).developerId,
        email: payload.email,
        organizationId: payload.organizationId,
        role: payload.role,
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    // jose throws JWTExpired for expired tokens
    if ((error as Error).name === "JWTExpired") {
      throw new HTTPException(401, { message: "Token expired" });
    }
    throw new HTTPException(401, { message: "Invalid token" });
  }
});

/**
 * Helper: Check if user was recently created (within last 5 minutes)
 */
async function isNewUser(userId: string): Promise<boolean> {
  const user = await db
    .selectFrom("app.users")
    .select(["createdAt"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!user) return false;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return user.createdAt > fiveMinutesAgo;
}

/**
 * POST /auth/welcome-screen/check
 *
 * Check if an email has already seen the welcome back screen.
 * No auth required - this is called before login.
 */
authRoutes.post("/welcome-screen/check", async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email) {
    throw new HTTPException(400, { message: "Email is required" });
  }

  const hasSeen = await welcomeScreenService.hasSeenWelcomeScreen(body.email);

  return c.json({
    data: { hasSeen },
  });
});

/**
 * POST /auth/welcome-screen/mark-seen
 *
 * Mark an email as having seen the welcome back screen.
 * No auth required - this is called before/during login.
 */
authRoutes.post("/welcome-screen/mark-seen", async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email) {
    throw new HTTPException(400, { message: "Email is required" });
  }

  await welcomeScreenService.markWelcomeScreenSeen(body.email);

  return c.json({
    data: { success: true },
  });
});
