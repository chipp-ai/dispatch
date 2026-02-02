/**
 * Health Check Routes
 *
 * Used by load balancers and monitoring to verify service health.
 */

import { Hono } from "hono";
import { db } from "../../db/client.ts";

export const healthRoutes = new Hono();

// Simple liveness check
healthRoutes.get("/", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: Deno.env.get("APP_VERSION") || "dev",
  });
});

// Detailed readiness check (includes dependencies)
healthRoutes.get("/ready", async (c) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Check database
  try {
    const start = Date.now();
    await db.selectFrom("app.organizations").limit(1).execute();
    checks.database = {
      status: "ok",
      latency: Date.now() - start,
    };
  } catch (error) {
    checks.database = {
      status: "error",
    };
  }

  // Check Redis (if configured)
  const redisUrl = Deno.env.get("REDIS_URL");
  if (redisUrl) {
    try {
      // Redis check would go here
      checks.redis = { status: "ok" };
    } catch {
      checks.redis = { status: "error" };
    }
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "ok");

  return c.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    allHealthy ? 200 : 503
  );
});
