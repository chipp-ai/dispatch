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
import { brandSyncService } from "../../../services/brand-sync.service.ts";
import * as Sentry from "@sentry/deno";
import { senderDomainService } from "../../../services/notifications/sender-domain.service.ts";
import {
  NOTIFICATION_REGISTRY,
  NOTIFICATION_CATEGORIES,
  type NotificationType,
} from "../../../services/notifications/notification-types.ts";
import { sql } from "../../../db/client.ts";
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

/**
 * POST /organization/whitelabel/upload?type=logo|favicon
 * Upload a branding asset (logo or favicon) to R2.
 *
 * Enterprise tier + admin/owner required.
 * Accepts multipart/form-data with a single "file" field.
 * Max 2MB, PNG/JPEG/SVG/ICO only.
 * Auto-updates the whitelabel_tenants logoUrl or faviconUrl.
 */
organizationRoutes.post("/whitelabel/upload", async (c) => {
  const user = c.get("user");
  const assetType = c.req.query("type");

  if (assetType !== "logo" && assetType !== "favicon") {
    return c.json({ error: "Query param 'type' must be 'logo' or 'favicon'" }, 400);
  }

  // Get tenant (verifies Enterprise tier + ownership)
  const { tenant } = await whitelabelService.getForUser(user.id);
  if (!tenant) {
    return c.json({ error: "No whitelabel tenant configured. Save branding settings first." }, 400);
  }

  // Check admin role
  const org = await organizationService.getForUser(user.id);
  const members = await organizationService.listMembers(user.id);
  const member = members.find((m) => m.id === user.id);
  if (!member || !["owner", "admin"].includes(member.role)) {
    return c.json({ error: "Only owners and admins can upload assets" }, 403);
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file uploaded. Send a 'file' field in multipart form data." }, 400);
  }

  // Validate content type
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: `Invalid file type '${file.type}'. Allowed: PNG, JPEG, SVG, ICO` }, 400);
  }

  // Validate size (2MB max)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return c.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 2MB.` }, 400);
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const url = await brandSyncService.uploadTenantAsset(
      tenant.slug,
      assetType,
      buffer,
      file.type
    );

    // Auto-update whitelabel tenant with new URL
    const updateField = assetType === "logo" ? "logoUrl" : "faviconUrl";
    await whitelabelService.update(user.id, { [updateField]: url });

    return c.json({ data: { url, type: assetType } });
  } catch (error) {
    console.error("[whitelabel] Upload failed:", error);
    Sentry.captureException(error, {
      tags: { source: "whitelabel-upload", feature: assetType },
      extra: { tenantSlug: tenant.slug, fileSize: file.size, fileType: file.type },
    });
    return c.json({ error: "Failed to upload file" }, 500);
  }
});

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
  try {
    const context = await billingService.getOrganizationBillingContext(user.id);
    const status = await billingService.getPaymentMethodStatus(context);
    return c.json(status);
  } catch (error) {
    // Handle Stripe customer not found gracefully
    if (
      error instanceof Error &&
      (error.message.includes("No such customer") ||
        error.message.includes("resource_missing"))
    ) {
      return c.json({
        hasPaymentMethod: false,
        paymentMethod: null,
        error: "no_billing_account",
      });
    }
    throw error;
  }
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
  try {
    const context = await billingService.getOrganizationBillingContext(user.id);
    const settings = await billingService.getTopupSettings(context);
    return c.json(settings);
  } catch (error) {
    // Handle Stripe customer not found gracefully
    if (
      error instanceof Error &&
      (error.message.includes("No such customer") ||
        error.message.includes("resource_missing"))
    ) {
      return c.json({
        enabled: false,
        threshold: null,
        amount: null,
        error: "no_billing_account",
      });
    }
    throw error;
  }
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

// ========================================
// Notification Settings
// ========================================

const notificationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  defaultPercentage: z.number().min(0).max(100).optional(),
  thresholds: z.array(z.number().positive()).optional(),
});

/**
 * GET /organization/notification-settings
 * Get credit notification settings for the organization
 */
organizationRoutes.get("/notification-settings", async (c) => {
  const user = c.get("user");
  const organizationId = await billingService.getOrganizationIdForUser(user.id);
  const settings = await billingService.getNotificationSettings(organizationId);
  return c.json({ data: settings });
});

/**
 * PUT /organization/notification-settings
 * Update credit notification settings for the organization
 */
organizationRoutes.put(
  "/notification-settings",
  zValidator("json", notificationSettingsSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const organizationId = await billingService.getOrganizationIdForUser(
      user.id
    );
    const settings = await billingService.updateNotificationSettings(
      organizationId,
      body
    );
    return c.json({ data: settings });
  }
);

// ========================================
// Subscription Management
// ========================================

// Validators for subscription management
const scheduleDowngradeSchema = z.object({
  targetTier: z.enum(["FREE", "PRO", "TEAM", "BUSINESS"]),
});

/**
 * POST /organization/schedule-downgrade
 * Schedule a subscription downgrade at the end of the billing period
 *
 * For v2 subscriptions, sets the pending downgrade tier without immediate change.
 * The actual tier change happens at billing period end via Stripe webhooks.
 */
organizationRoutes.post(
  "/schedule-downgrade",
  zValidator("json", scheduleDowngradeSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const context = await billingService.getOrganizationBillingContext(user.id);
    const result = await billingService.scheduleDowngrade(
      context,
      body.targetTier
    );
    return c.json(result);
  }
);

/**
 * POST /organization/undo-downgrade
 * Cancel a scheduled subscription downgrade
 *
 * Removes the pending downgrade, keeping the current tier.
 */
organizationRoutes.post("/undo-downgrade", async (c) => {
  const user = c.get("user");

  const context = await billingService.getOrganizationBillingContext(user.id);
  const result = await billingService.undoDowngrade(context);
  return c.json(result);
});

/**
 * POST /organization/cancel-subscription
 * Schedule subscription cancellation at the end of the billing period
 *
 * Marks the subscription for cancellation but maintains access until period end.
 */
organizationRoutes.post("/cancel-subscription", async (c) => {
  const user = c.get("user");

  const context = await billingService.getOrganizationBillingContext(user.id);
  const result = await billingService.cancelSubscription(context);
  return c.json(result);
});

/**
 * POST /organization/undo-cancellation
 * Remove a scheduled subscription cancellation
 *
 * Restores the subscription to active status.
 */
organizationRoutes.post("/undo-cancellation", async (c) => {
  const user = c.get("user");

  const context = await billingService.getOrganizationBillingContext(user.id);
  const result = await billingService.undoCancellation(context);
  return c.json(result);
});

/**
 * GET /organization/subscription-status
 * Get the current subscription status including any pending changes
 *
 * Returns current tier, pending downgrade/cancellation info, and billing period details.
 */
organizationRoutes.get("/subscription-status", async (c) => {
  const user = c.get("user");

  const context = await billingService.getOrganizationBillingContext(user.id);
  const status = await billingService.getSubscriptionStatus(context);
  return c.json(status);
});

// ========================================
// Sender Domain Verification (Enterprise)
// ========================================

const addDomainSchema = z.object({
  domain: z.string().min(3).max(255),
});

/**
 * GET /organization/sender-domains
 * List verified/pending sender domains for the organization
 */
organizationRoutes.get("/sender-domains", async (c) => {
  const user = c.get("user");
  const org = await organizationService.getForUser(user.id);
  const domains = await senderDomainService.getDomains(org.id);
  return c.json({ data: domains });
});

/**
 * POST /organization/sender-domains
 * Add a new sender domain (calls SMTP2GO)
 */
organizationRoutes.post(
  "/sender-domains",
  zValidator("json", addDomainSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const org = await organizationService.getForUser(user.id);
    const domain = await senderDomainService.addDomain(org.id, body.domain);
    return c.json({ data: domain }, 201);
  }
);

/**
 * POST /organization/sender-domains/:id/verify
 * Trigger verification check for a pending domain
 */
organizationRoutes.post("/sender-domains/:id/verify", async (c) => {
  const user = c.get("user");
  const domainId = c.req.param("id");
  const org = await organizationService.getForUser(user.id);
  const domain = await senderDomainService.verifyDomain(domainId, org.id);
  return c.json({ data: domain });
});

/**
 * DELETE /organization/sender-domains/:id
 * Remove a sender domain
 */
organizationRoutes.delete("/sender-domains/:id", async (c) => {
  const user = c.get("user");
  const domainId = c.req.param("id");
  const org = await organizationService.getForUser(user.id);
  await senderDomainService.removeDomain(domainId, org.id);
  return c.json({ success: true });
});

// ========================================
// Notification Preferences
// ========================================

const updatePreferencesSchema = z.record(z.string(), z.boolean());

/**
 * GET /organization/notification-preferences/types
 * List all available notification types with categories
 */
organizationRoutes.get("/notification-preferences/types", async (c) => {
  const types = Object.entries(NOTIFICATION_REGISTRY).map(([key, info]) => ({
    type: key,
    ...info,
    categoryLabel: NOTIFICATION_CATEGORIES[info.category],
  }));
  return c.json({ data: types });
});

/**
 * GET /organization/notification-preferences
 * Get user's notification preferences (merged with defaults)
 */
organizationRoutes.get("/notification-preferences", async (c) => {
  const user = c.get("user");

  // Get user's explicit opt-outs
  let prefs: Array<{ notification_type: string; enabled: boolean }> = [];
  try {
    const rows = await sql`
      SELECT notification_type, enabled
      FROM app.notification_preferences
      WHERE user_id = ${user.id} AND channel = 'email'
    `;
    prefs = rows as unknown as Array<{ notification_type: string; enabled: boolean }>;
  } catch {
    // Table may not exist yet
  }

  const prefMap = new Map(prefs.map((p) => [p.notification_type, p.enabled]));

  // Merge with registry (opt-out model: everything enabled by default)
  const result = Object.entries(NOTIFICATION_REGISTRY).map(([key, info]) => ({
    type: key,
    label: info.label,
    description: info.description,
    category: info.category,
    categoryLabel: NOTIFICATION_CATEGORIES[info.category],
    enabled: prefMap.has(key) ? prefMap.get(key)! : true,
  }));

  return c.json({ data: result });
});

/**
 * PUT /organization/notification-preferences
 * Update user's notification preferences
 * Body: { "consumer_signup": false, "credit_low": true, ... }
 */
organizationRoutes.put(
  "/notification-preferences",
  zValidator("json", updatePreferencesSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json") as Record<string, boolean>;

    for (const [type, enabled] of Object.entries(body)) {
      if (!(type in NOTIFICATION_REGISTRY)) continue;

      await sql`
        INSERT INTO app.notification_preferences (user_id, notification_type, channel, enabled)
        VALUES (${user.id}, ${type}, 'email', ${enabled})
        ON CONFLICT (user_id, notification_type, channel)
        DO UPDATE SET enabled = ${enabled}, updated_at = NOW()
      `;
    }

    return c.json({ success: true });
  }
);
