/**
 * Marketplace Routes
 *
 * Public API endpoints for the marketplace.
 * No authentication required - these show public apps.
 */

import { Hono } from "hono";
import { marketplaceService } from "../../../services/marketplace.service.ts";

export const marketplaceRoutes = new Hono();

/**
 * GET /marketplace/apps
 * List public apps with search
 */
marketplaceRoutes.get("/apps", async (c) => {
  const searchQuery = c.req.query("q") || c.req.query("search");
  const rawLimit = parseInt(c.req.query("limit") || "20", 10);
  const rawOffset = parseInt(c.req.query("offset") || "0", 10);

  // Ensure non-negative values
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100));
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  const result = await marketplaceService.listPublicApps({
    searchQuery,
    limit,
    offset,
  });

  return c.json({
    success: true,
    data: result.apps,
    total: result.total,
    limit,
    offset,
  });
});

/**
 * GET /marketplace/apps/recent
 * Get recent apps for the hero section
 */
marketplaceRoutes.get("/apps/recent", async (c) => {
  const limit = parseInt(c.req.query("limit") || "6", 10);
  const apps = await marketplaceService.getRecentApps(Math.min(limit, 20));

  return c.json({
    success: true,
    data: apps,
  });
});

/**
 * GET /marketplace/apps/:appNameId
 * Get a single public app by its vanity slug
 */
marketplaceRoutes.get("/apps/:appNameId", async (c) => {
  const appNameId = c.req.param("appNameId");
  const app = await marketplaceService.getPublicApp(appNameId);

  if (!app) {
    return c.json({ success: false, error: "App not found" }, 404);
  }

  return c.json({
    success: true,
    data: app,
  });
});

/**
 * GET /marketplace/stats
 * Get marketplace statistics
 */
marketplaceRoutes.get("/stats", async (c) => {
  const count = await marketplaceService.getPublicAppCount();

  return c.json({
    success: true,
    data: {
      totalApps: count,
    },
  });
});
