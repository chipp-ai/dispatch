/**
 * Organization Routes
 *
 * Endpoints for organization management including reading org details,
 * updating settings, listing members, and billing operations.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthContext } from "../../middleware/auth.ts";
import { organizationService } from "../../../services/organization.service.ts";
import { whitelabelService } from "../../../services/whitelabel.service.ts";
import { billingService } from "../../../services/billing.service.ts";
import {
  updateOrganizationSchema,
  updateWhitelabelSchema,
} from "../../validators/organization.ts";

// Validators for billing endpoints
const billingPortalSchema = z.object({
  returnUrl: z.string().url(),
});

const topupSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  amount_cents: z.number().positive().optional(),
  threshold_percent: z.number().min(0).max(100).optional(),
});

const topupNowSchema = z.object({
  amount_cents: z.number().positive(),
  upsellSource: z.string().optional(),
});

export const organizationRoutes = new Hono<AuthContext>();

/**
 * GET /organization
 * Get the current user's organization
 *
 * Returns the organization associated with the user's active workspace.
 */
organizationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const organization = await organizationService.getForUser(user.id);
  return c.json({ data: organization });
});

/**
 * PATCH /organization
 * Update the current user's organization
 *
 * Only organization admins can update org details.
 * Updatable fields: name, pictureUrl
 */
organizationRoutes.patch(
  "/",
  zValidator("json", updateOrganizationSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const organization = await organizationService.update(user.id, body);
    return c.json({ data: organization });
  }
);

/**
 * GET /organization/members
 * List members of the current user's organization
 *
 * Returns all organization members with their roles.
 */
organizationRoutes.get("/members", async (c) => {
  const user = c.get("user");
  const members = await organizationService.listMembers(user.id);
  return c.json({ data: members });
});

// ========================================
// Whitelabel Settings (Enterprise only)
// ========================================

/**
 * GET /organization/whitelabel
 * Get whitelabel settings for the organization
 *
 * Only available to Enterprise tier organizations.
 * Returns null if no tenant is configured.
 */
organizationRoutes.get("/whitelabel", async (c) => {
  const user = c.get("user");
  const result = await whitelabelService.getForUser(user.id);
  return c.json({ data: result });
});

/**
 * PATCH /organization/whitelabel
 * Update whitelabel settings
 *
 * Only available to Enterprise tier organizations.
 * Creates a new tenant if one doesn't exist.
 * Only owners and admins can update settings.
 */
organizationRoutes.patch(
  "/whitelabel",
  zValidator("json", updateWhitelabelSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const tenant = await whitelabelService.update(user.id, body);
    return c.json({ data: tenant });
  }
);

// ========================================
// Billing Endpoints
// ========================================

/**
 * GET /organization/payment-method-status
 * Get payment method status for the organization
 *
 * Returns the default payment method info and whether one is configured.
 */
organizationRoutes.get("/payment-method-status", async (c) => {
  const user = c.get("user");
  const context = await billingService.getOrganizationBillingContext(user.id);
  const status = await billingService.getPaymentMethodStatus(context);
  return c.json(status);
});

/**
 * POST /organization/billing-portal
 * Create a Stripe billing portal session
 *
 * Returns a URL to redirect the user to the Stripe billing portal.
 */
organizationRoutes.post(
  "/billing-portal",
  zValidator("json", billingPortalSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const context = await billingService.getOrganizationBillingContext(user.id);
    const customerId = billingService.getEffectiveCustomerId(context);

    if (!customerId) {
      return c.json({ error: "No billing account found" }, 400);
    }

    const url = await billingService.createBillingPortalSession({
      customerId,
      returnUrl: body.returnUrl,
      organizationName: context.organizationName,
    });

    return c.json({ url });
  }
);

/**
 * GET /organization/invoice-preview
 * Get invoice preview for the organization
 *
 * Returns upcoming invoice details from Stripe v2 billing.
 */
organizationRoutes.get("/invoice-preview", async (c) => {
  const user = c.get("user");
  const context = await billingService.getOrganizationBillingContext(user.id);
  const preview = await billingService.getInvoicePreview(context);
  return c.json(preview);
});

/**
 * GET /organization/billing-topups
 * Get auto-topup settings for the organization
 *
 * Returns current topup configuration stored in Stripe customer metadata.
 */
organizationRoutes.get("/billing-topups", async (c) => {
  const user = c.get("user");
  const context = await billingService.getOrganizationBillingContext(user.id);
  const settings = await billingService.getTopupSettings(context);
  return c.json(settings);
});

/**
 * POST /organization/billing-topups
 * Update auto-topup settings for the organization
 *
 * Saves topup configuration to Stripe customer metadata.
 */
organizationRoutes.post(
  "/billing-topups",
  zValidator("json", topupSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const context = await billingService.getOrganizationBillingContext(user.id);
    const settings = await billingService.updateTopupSettings(context, body);
    return c.json(settings);
  }
);

/**
 * POST /organization/billing-topups/topup-now
 * Perform an immediate credit top-up
 *
 * Charges the default payment method and creates a credit grant.
 */
organizationRoutes.post(
  "/billing-topups/topup-now",
  zValidator("json", topupNowSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const context = await billingService.getOrganizationBillingContext(user.id);
    const result = await billingService.topupNow(context, body);
    return c.json(result);
  }
);
