/**
 * Whitelabel Config Routes
 *
 * Public endpoint for SPA to fetch tenant branding on boot.
 * Called before login - no auth required.
 */

import { Hono } from "hono";
import { db } from "../../../db/client.ts";
import type { AppEnv } from "../../../../types.ts";

export const whitelabelConfigRoutes = new Hono<AppEnv>();

/**
 * GET /api/whitelabel/config
 * Public endpoint for SPA to detect whitelabel branding.
 *
 * Resolution order:
 * 1. X-Tenant-ID header (set by Cloudflare Worker for custom domain requests)
 * 2. Hostname lookup in custom_domains table (fallback for direct hits)
 *
 * Returns tenant branding config or 404 if not a whitelabeled domain.
 */
whitelabelConfigRoutes.get("/config", async (c) => {
  let tenantId = c.req.header("X-Tenant-ID");

  // Fallback: look up by hostname
  if (!tenantId) {
    const hostname =
      c.req.header("X-Original-Host") ||
      c.req.header("X-Forwarded-Host") ||
      new URL(c.req.url).hostname;

    // Strip port if present
    const cleanHostname = hostname.split(":")[0];

    const domain = await db
      .selectFrom("app.custom_domains")
      .select(["tenantId"])
      .where("hostname", "=", cleanHostname)
      .where("sslStatus", "=", "active")
      .where("type", "=", "dashboard")
      .executeTakeFirst();

    if (domain?.tenantId) {
      tenantId = domain.tenantId;
    }
  }

  if (!tenantId) {
    return c.json({ error: "Not a whitelabeled domain" }, 404);
  }

  // Fetch tenant branding
  const tenant = await db
    .selectFrom("app.whitelabel_tenants")
    .select([
      "id",
      "slug",
      "name",
      "primaryColor",
      "secondaryColor",
      "logoUrl",
      "faviconUrl",
      "features",
    ])
    .where("id", "=", tenantId)
    .executeTakeFirst();

  if (!tenant) {
    return c.json({ error: "Tenant not found" }, 404);
  }

  const features =
    typeof tenant.features === "string"
      ? JSON.parse(tenant.features)
      : tenant.features || {};

  return c.json({
    companyName: tenant.name,
    logoUrl: tenant.logoUrl,
    faviconUrl: tenant.faviconUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    slug: tenant.slug,
    features,
  });
});
