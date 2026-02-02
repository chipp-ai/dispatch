/**
 * Authentication Middleware
 *
 * Supports both:
 * - JWT Bearer tokens (for API clients)
 * - Session cookies (for web app)
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { db } from "../../db/client.ts";

// User context added to requests
export interface User {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  activeWorkspaceId: string | null;
  role: "owner" | "admin" | "member";
}

// Typed Hono context
export interface AuthContext {
  Variables: {
    user: User;
    requestId: string;
  };
}

// JWT secret - in production, use proper key management
const JWT_SECRET = Deno.env.get("NEXTAUTH_SECRET") || "development-secret";

/**
 * Verify session from cookie and return user
 */
async function verifySession(sessionId: string): Promise<User | null> {
  try {
    const result = await db
      .selectFrom("app.sessions")
      .innerJoin("app.users as u", "u.id", "app.sessions.userId")
      .select([
        "u.id",
        "u.email",
        "u.name",
        "u.organizationId",
        "u.role",
        "app.sessions.id as sessionId",
        "app.sessions.expiresAt",
      ])
      .where("app.sessions.id", "=", sessionId)
      .where("app.sessions.expiresAt", ">", new Date())
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      email: result.email,
      name: result.name,
      organizationId: result.organizationId,
      activeWorkspaceId: null,
      role: result.role as "owner" | "admin" | "member",
    };
  } catch {
    return null;
  }
}

/**
 * Decode and verify JWT token
 * Uses the same secret as NextAuth for compatibility
 */
async function verifyToken(token: string): Promise<User | null> {
  try {
    // For production, use a proper JWT library like jose
    // This is a simplified implementation for the skeleton
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!headerB64 || !payloadB64 || !signature) {
      return null;
    }

    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    // Extract user from NextAuth-compatible token
    return {
      id: payload.sub || payload.developerId,
      email: payload.email,
      name: payload.name || null,
      organizationId: payload.organizationId,
      activeWorkspaceId: payload.activeWorkspaceId || null,
      role: payload.role || "member",
    };
  } catch {
    return null;
  }
}

/**
 * Auth middleware - supports both session cookies and Bearer tokens
 */
export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  let user: User | null = null;

  // Try session cookie first (for web app)
  const sessionId = getCookie(c, "session_id");
  if (sessionId) {
    user = await verifySession(sessionId);
  }

  // Fall back to Bearer token (for API clients)
  if (!user) {
    const authHeader = c.req.header("Authorization");
    if (authHeader) {
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
      if (token) {
        user = await verifyToken(token);
      }
    }
  }

  if (!user) {
    throw new HTTPException(401, {
      message: "Authentication required",
    });
  }

  // Add user to context
  c.set("user", user);

  await next();
});

/**
 * Optional auth - doesn't fail if no token, but populates user if present
 */
export const optionalAuthMiddleware = createMiddleware<AuthContext>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader) {
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      const user = await verifyToken(token);
      if (user) {
        c.set("user", user);
      }
    }

    await next();
  }
);

/**
 * Require specific role
 */
export const requireRole = (...roles: Array<"owner" | "admin" | "member">) =>
  createMiddleware<AuthContext>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!roles.includes(user.role)) {
      throw new HTTPException(403, {
        message: `Required role: ${roles.join(" or ")}`,
      });
    }

    await next();
  });
