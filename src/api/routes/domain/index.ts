/**
 * Domain Routes
 *
 * Endpoints for custom domain management.
 * Integrates with Cloudflare for SaaS for automatic TLS.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext } from "../../middleware/auth.ts";
import { domainService } from "../../../services/domain.service.ts";
import {
  registerDomainSchema,
  domainLookupSchema,
  updateDomainSchema,
} from "../../validators/domain.ts";
import { organizationService } from "../../../services/organization.service.ts";

export const domainRoutes = new Hono<AuthContext>();

/**
 * POST /domains
 * Register a new custom domain
 *
 * Creates the domain in Cloudflare for SaaS and stores mapping in DB.
 * Returns DNS records the customer needs to configure.
 */
domainRoutes.post("/", zValidator("json", registerDomainSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Get user's organization
  const org = await organizationService.getForUser(user.id);

  // Verify app ownership if chat domain
  if (body.type === "chat" && body.appId) {
    const { applicationService } = await import(
      "../../../services/application.service.ts"
    );
    const app = await applicationService.get(body.appId!, user.id);

    // App must belong to user's organization
    if (app.organizationId !== org.id) {
      return c.json({ error: "Not authorized to use this app" }, 403);
    }
  }

  const result = await domainService.register({
    hostname: body.hostname,
    type: body.type,
    appId: body.appId,
    tenantId: body.tenantId,
    organizationId: org.id,
  });

  return c.json({
    data: {
      domain: result.domain,
      dnsRecords: result.dnsRecords,
      instructions: [
        "Add the following DNS records to your domain:",
        ...result.dnsRecords.map((r) => `${r.type} ${r.name} -> ${r.value}`),
        "SSL certificate will be automatically provisioned once DNS is configured.",
        "Check status using GET /api/domains/:hostname/status",
      ],
    },
  });
});

/**
 * GET /domains
 * List all domains for the current organization
 */
domainRoutes.get("/", async (c) => {
  const user = c.get("user");
  const org = await organizationService.getForUser(user.id);

  const domains = await domainService.listForOrganization(org.id);

  return c.json({ data: domains });
});

/**
 * GET /domains/:hostname
 * Get details for a specific domain
 */
domainRoutes.get("/:hostname", async (c) => {
  const user = c.get("user");
  const hostname = c.req.param("hostname");

  // Verify ownership
  const domain = await domainService.verifyOwnership(user.id, hostname);

  return c.json({ data: domain });
});

/**
 * GET /domains/:hostname/status
 * Check SSL/TLS status for a domain
 *
 * Fetches latest status from Cloudflare and updates local cache.
 */
domainRoutes.get("/:hostname/status", async (c) => {
  const user = c.get("user");
  const hostname = c.req.param("hostname");

  // Verify ownership first
  await domainService.verifyOwnership(user.id, hostname);

  // Refresh status from Cloudflare
  const domain = await domainService.refreshSslStatus(hostname);

  return c.json({
    data: {
      hostname: domain.hostname,
      sslStatus: domain.sslStatus,
      isActive: domain.sslStatus === "active",
      message:
        domain.sslStatus === "active"
          ? "SSL certificate is active. Your domain is ready to use."
          : domain.sslStatus === "pending"
            ? "SSL certificate is pending. Please ensure DNS records are configured correctly."
            : "SSL certificate has an issue. Please check DNS configuration.",
    },
  });
});

/**
 * PATCH /domains/:hostname
 * Update domain settings (brand styles, etc.)
 */
domainRoutes.patch(
  "/:hostname",
  zValidator("json", updateDomainSchema),
  async (c) => {
    const user = c.get("user");
    const hostname = c.req.param("hostname");
    const body = c.req.valid("json");

    // Verify ownership
    await domainService.verifyOwnership(user.id, hostname);

    let domain = await domainService.getByHostname(hostname);

    if (body.brandStyles) {
      domain = await domainService.updateBrandStyles(
        hostname,
        body.brandStyles
      );
    }

    return c.json({ data: domain });
  }
);

/**
 * DELETE /domains/:hostname
 * Remove a custom domain
 *
 * Deletes from Cloudflare and removes local records.
 */
domainRoutes.delete("/:hostname", async (c) => {
  const user = c.get("user");
  const hostname = c.req.param("hostname");

  // Verify ownership
  await domainService.verifyOwnership(user.id, hostname);

  await domainService.delete(hostname);

  return c.json({
    data: {
      deleted: true,
      hostname,
    },
  });
});

// ========================================
// Internal Routes (for Cloudflare Worker)
// ========================================

/**
 * POST /internal/domain-lookup
 * Internal endpoint for Cloudflare Worker to look up unknown domains
 *
 * This is called when the Worker receives a request for a domain
 * that isn't in KV cache. Returns the full domain mapping.
 *
 * No auth required - but validate the request comes from our Worker.
 */
export const internalDomainRoutes = new Hono();

internalDomainRoutes.post(
  "/domain-lookup",
  zValidator("json", domainLookupSchema),
  async (c) => {
    // Verify request comes from our Worker
    const internalHeader = c.req.header("X-Internal-Request");
    if (internalHeader !== "cloudflare-router") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { hostname } = c.req.valid("json");

    const mapping = await domainService.lookupForWorker(hostname);

    if (!mapping) {
      return c.json({ error: "Domain not found or not active" }, 404);
    }

    return c.json(mapping);
  }
);
