/**
 * Consumer Authentication Middleware
 *
 * Authenticates end-users (consumers) of chat applications.
 * Separate from developer auth - consumers use their own session system.
 *
 * Supports:
 * - Session cookies (consumer_session_id)
 * - Bearer tokens for API access
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { db } from "../../db/client.ts";
import type { Application } from "../../db/schema.ts";

// Consumer context added to requests
export interface ConsumerUser {
  id: string;
  email: string | null;
  name: string | null;
  identifier: string;
  applicationId: string;
  credits: number;
  subscriptionActive: boolean;
}

// Application context (resolved from slug or ID)
export interface AppContext {
  app: Pick<
    Application,
    | "id"
    | "name"
    | "appNameId"
    | "brandStyles"
    | "capabilities"
    | "settings"
    | "isActive"
    | "organizationId"
    | "description"
    | "language"
    | "model"
  >;
}

// Typed Hono context for consumer routes
export interface ConsumerAuthContext {
  Variables: {
    consumer: ConsumerUser;
    app: AppContext["app"];
    requestId: string;
  };
}

// Context for public routes with just app info
export interface AppOnlyContext {
  Variables: {
    app: AppContext["app"];
    consumer?: ConsumerUser;
    requestId: string;
  };
}

/**
 * Resolve application from appNameId (slug) or ID
 */
// UUID v4 regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveApp(
  appIdentifier: string
): Promise<AppContext["app"] | null> {
  try {
    // Build query - only check UUID column if input looks like a UUID
    const isUuid = UUID_REGEX.test(appIdentifier);

    let query = db
      .selectFrom("app.applications")
      .select([
        "id",
        "name",
        "appNameId",
        "brandStyles",
        "capabilities",
        "settings",
        "isActive",
        "organizationId",
        "description",
        "language",
        "model",
        "launchedVersionId",
      ])
      .where("isDeleted", "=", false);

    if (isUuid) {
      // Search by ID or appNameId
      query = query.where((eb) =>
        eb.or([
          eb("appNameId", "=", appIdentifier),
          eb("id", "=", appIdentifier),
        ])
      );
    } else {
      // Only search by appNameId (slug)
      query = query.where("appNameId", "=", appIdentifier);
    }

    const result = await query.executeTakeFirst();
    if (!result) return null;

    // If app has a launched version, overlay its config onto the result
    if (result.launchedVersionId) {
      const version = await db
        .selectFrom("app.application_version_history")
        .select(["data"])
        .where("id", "=", result.launchedVersionId)
        .executeTakeFirst();

      if (version?.data) {
        const data =
          typeof version.data === "string"
            ? JSON.parse(version.data)
            : version.data;
        return {
          id: result.id,
          appNameId: result.appNameId,
          isActive: result.isActive,
          organizationId: result.organizationId,
          name: data.name ?? result.name,
          description: data.description ?? result.description,
          brandStyles: data.brandStyles ?? result.brandStyles,
          capabilities: data.capabilities ?? result.capabilities,
          settings: data.settings ?? result.settings,
          language: data.language ?? result.language,
          model: data.model ?? result.model,
        };
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Verify consumer session from cookie
 */
async function verifyConsumerSession(
  sessionId: string,
  applicationId: string
): Promise<ConsumerUser | null> {
  try {
    const result = await db
      .selectFrom("app.consumer_sessions as cs")
      .innerJoin("app.consumers as c", "c.id", "cs.consumerId")
      .select([
        "c.id",
        "c.email",
        "c.name",
        "c.identifier",
        "c.applicationId",
        "c.credits",
        "c.subscriptionActive",
      ])
      .where("cs.id", "=", sessionId)
      .where("cs.applicationId", "=", applicationId)
      .where("cs.expiresAt", ">", new Date())
      .where("c.isDeleted", "=", false)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      email: result.email,
      name: result.name,
      identifier: result.identifier,
      applicationId: result.applicationId,
      credits: result.credits,
      subscriptionActive: result.subscriptionActive,
    };
  } catch {
    return null;
  }
}

/**
 * Verify consumer bearer token (for API access)
 */
async function verifyConsumerToken(
  token: string,
  applicationId: string
): Promise<ConsumerUser | null> {
  try {
    // Token format: base64(consumerId:sessionId)
    const decoded = atob(token);
    const [consumerId, sessionId] = decoded.split(":");

    if (!consumerId || !sessionId) return null;

    return await verifyConsumerSession(sessionId, applicationId);
  } catch {
    return null;
  }
}

/**
 * Consumer auth middleware - requires valid consumer session
 * Must be used after appMiddleware
 */
export const consumerAuthMiddleware = createMiddleware<ConsumerAuthContext>(
  async (c, next) => {
    const app = c.get("app");

    if (!app) {
      throw new HTTPException(400, {
        message: "App context required. Use appMiddleware first.",
      });
    }

    let consumer: ConsumerUser | null = null;

    // Try session cookie first
    const sessionId = getCookie(c, "consumer_session_id");
    if (sessionId) {
      consumer = await verifyConsumerSession(sessionId, app.id);
    }

    // Fall back to Bearer token
    if (!consumer) {
      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : authHeader;
        if (token) {
          consumer = await verifyConsumerToken(token, app.id);
        }
      }
    }

    if (!consumer) {
      throw new HTTPException(401, {
        message: "Consumer authentication required",
      });
    }

    c.set("consumer", consumer);
    await next();
  }
);

/**
 * Optional consumer auth - populates consumer if present but doesn't require it
 */
export const optionalConsumerAuthMiddleware = createMiddleware<AppOnlyContext>(
  async (c, next) => {
    const app = c.get("app");

    if (!app) {
      await next();
      return;
    }

    // Try session cookie
    const sessionId = getCookie(c, "consumer_session_id");
    if (sessionId) {
      const consumer = await verifyConsumerSession(sessionId, app.id);
      if (consumer) {
        c.set("consumer", consumer);
      }
    }

    // Try Bearer token if no cookie
    if (!c.get("consumer")) {
      const authHeader = c.req.header("Authorization");
      if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : authHeader;
        if (token) {
          const consumer = await verifyConsumerToken(token, app.id);
          if (consumer) {
            c.set("consumer", consumer);
          }
        }
      }
    }

    await next();
  }
);

/**
 * App resolution middleware - resolves app from URL param or header
 * Required before consumer auth
 */
export const appMiddleware = createMiddleware<AppOnlyContext>(
  async (c, next) => {
    // Get app identifier from URL param, query, or header
    const appIdentifier =
      c.req.param("appNameId") ||
      c.req.param("appId") ||
      c.req.query("app") ||
      c.req.header("X-App-ID");

    if (!appIdentifier) {
      throw new HTTPException(400, {
        message: "App identifier required",
      });
    }

    const app = await resolveApp(appIdentifier);

    if (!app) {
      throw new HTTPException(404, {
        message: "Application not found",
      });
    }

    if (!app.isActive) {
      throw new HTTPException(403, {
        message: "Application is not active",
      });
    }

    c.set("app", app);
    await next();
  }
);
