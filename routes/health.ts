/**
 * Health Check Routes
 *
 * Endpoints for monitoring and readiness probes.
 */

import { Hono } from "hono";
import { db } from "../src/db/client.ts";
import type { AppEnv } from "../types.ts";

export const health = new Hono<AppEnv>();

/**
 * Basic liveness probe
 * Returns 200 if the server is running
 */
health.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe
 * Checks database and Redis connectivity
 */
health.get("/ready", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};
  let allHealthy = true;

  // Check database
  try {
    await db.selectFrom("app.users").select("id").limit(1).execute();
    checks.database = "ok";
  } catch {
    checks.database = "error";
    allHealthy = false;
  }

  // Check Redis (if configured)
  const redisUrl = Deno.env.get("REDIS_URL");
  if (redisUrl) {
    try {
      // TODO: Add Redis health check when Redis client is implemented
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
      allHealthy = false;
    }
  }

  const status = allHealthy ? 200 : 503;

  return c.json(
    {
      status: allHealthy ? "ready" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    status
  );
});

/**
 * Detailed system info (protected, for debugging)
 */
health.get("/health/info", (c) => {
  // Only expose in non-production
  if (Deno.env.get("ENVIRONMENT") === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  return c.json({
    status: "ok",
    version: Deno.env.get("VERSION") ?? "development",
    environment: Deno.env.get("ENVIRONMENT") ?? "development",
    deno: Deno.version,
    uptime: performance.now() / 1000,
    memory: Deno.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
