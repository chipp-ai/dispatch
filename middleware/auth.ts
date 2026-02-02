/**
 * Authentication Middleware
 *
 * Uses database-backed sessions with Arctic for OAuth.
 * No third-party hosted auth services.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { Unauthorized, Forbidden } from "./error.ts";
import { db } from "../src/db/client.ts";

/**
 * Get session from database by session ID cookie
 */
async function getSession(sessionId: string) {
  return db
    .selectFrom("app.sessions")
    .selectAll()
    .where("id", "=", sessionId)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
}

/**
 * Main authentication middleware
 * Verifies session cookie and loads user from database
 */
export async function authMiddleware(c: Context, next: Next) {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    throw Unauthorized("Missing session");
  }

  const session = await getSession(sessionId);

  if (!session) {
    throw Unauthorized("Session expired or invalid");
  }

  // Load user from database
  const user = await db
    .selectFrom("app.users")
    .select(["id", "email", "name", "organization_id", "role"])
    .where("id", "=", session.user_id)
    .executeTakeFirst();

  if (!user) {
    throw Unauthorized("User not found");
  }

  // Attach user and session to context
  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organization_id,
    role: user.role,
  });
  c.set("session", session);

  await next();
}

/**
 * Optional auth middleware - doesn't fail if no session present
 * Useful for routes that work with or without authentication
 */
export async function optionalAuth(c: Context, next: Next) {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    await next();
    return;
  }

  try {
    const session = await getSession(sessionId);

    if (session) {
      const user = await db
        .selectFrom("app.users")
        .select(["id", "email", "name", "organization_id", "role"])
        .where("id", "=", session.user_id)
        .executeTakeFirst();

      if (user) {
        c.set("user", {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organization_id,
          role: user.role,
        });
        c.set("session", session);
      }
    }
  } catch {
    // Ignore auth errors for optional auth
  }

  await next();
}

/**
 * Role-based access control middleware
 * Requires user to have specific role(s)
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user) {
      throw Unauthorized("Authentication required");
    }

    if (!roles.includes(user.role)) {
      throw Forbidden(`Required role: ${roles.join(" or ")}`);
    }

    await next();
  };
}

/**
 * Subscription tier middleware
 * Requires organization to have specific subscription tier(s)
 */
export function requireTier(...tiers: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user) {
      throw Unauthorized("Authentication required");
    }

    // Load organization subscription
    const org = await db
      .selectFrom("app.organizations")
      .select(["subscription_tier"])
      .where("id", "=", user.organizationId)
      .executeTakeFirst();

    if (!org) {
      throw Forbidden("Organization not found");
    }

    if (!tiers.includes(org.subscription_tier)) {
      throw Forbidden(
        `This feature requires ${tiers.join(" or ")} subscription. ` +
          `Current tier: ${org.subscription_tier}`
      );
    }

    await next();
  };
}

/**
 * API key authentication middleware
 * For external API consumers (SDK, integrations)
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const apiKey = c.req.header("X-API-Key") ?? c.req.query("api_key");

  if (!apiKey) {
    throw Unauthorized("Missing API key");
  }

  // Verify API key
  const credential = await db
    .selectFrom("app.api_credentials")
    .select(["id", "developer_id", "application_id", "scopes"])
    .where("api_key", "=", apiKey)
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!credential) {
    throw Unauthorized("Invalid API key");
  }

  // Load developer/user info
  const developer = await db
    .selectFrom("app.users")
    .select(["id", "email", "name", "organization_id", "role"])
    .where("id", "=", credential.developer_id)
    .executeTakeFirst();

  if (!developer) {
    throw Unauthorized("Developer not found");
  }

  c.set("user", {
    id: developer.id,
    email: developer.email,
    name: developer.name,
    organizationId: developer.organization_id,
    role: developer.role,
  });

  c.set("apiCredential", {
    id: credential.id,
    developerId: credential.developer_id,
    applicationId: credential.application_id,
    scopes: credential.scopes,
  });

  // Update last used timestamp (fire and forget)
  db.updateTable("app.api_credentials")
    .set({ last_used_at: new Date() })
    .where("id", "=", credential.id)
    .execute()
    .catch(() => {});

  // Also set the app context if this is an app-specific key
  if (credential.application_id) {
    const app = await db
      .selectFrom("app.applications")
      .select(["id", "name", "developer_id"])
      .where("id", "=", credential.application_id)
      .executeTakeFirst();

    if (app) {
      c.set("app", {
        id: app.id,
        name: app.name,
        developerId: app.developer_id,
      });
    }
  }

  await next();
}

/**
 * Tenant detection middleware for white-label support
 * Detects tenant from custom domain
 */
export async function tenantMiddleware(c: Context, next: Next) {
  const host = c.req.header("host") ?? "";

  // Check for custom domain
  const tenant = await db
    .selectFrom("app.whitelabel_tenants")
    .selectAll()
    .where("custom_domain", "=", host)
    .executeTakeFirst();

  if (tenant) {
    c.set("tenant", tenant);
  } else {
    // Default tenant (main Chipp app)
    c.set("tenant", null);
  }

  await next();
}
