/**
 * Billing Routes
 *
 * Endpoints for credit status, usage tracking, and subscription management.
 * Actual Stripe integration (portal sessions, webhooks) is handled by chipp-admin.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as Sentry from "@sentry/deno";
import type { AuthContext } from "../../middleware/auth.ts";
import { billingService } from "../../../services/billing.service.ts";
import { createPortalSessionSchema } from "../../validators/billing.ts";

export const billingRoutes = new Hono<AuthContext>();

/**
 * GET /billing/credits
 * Get current credit status for the user's organization
 *
 * Returns credit balance and warning state for UI banners.
 * Supports ?_test=exhausted|low|ok on localhost for development testing.
 */
billingRoutes.get("/credits", async (c) => {
  // Test mode for development
  const testMode = c.req.query("_test");
  const isLocal = Deno.env.get("ENVIRONMENT") !== "production";
  if (testMode && isLocal) {
    const mockStates: Record<string, any> = {
      exhausted: {
        usageBasedBillingEnabled: true,
        creditBalanceCents: 0,
        isExhausted: true,
        isLow: false,
        showWarning: true,
        warningSeverity: "exhausted",
        creditBalanceFormatted: "$0.00",
        hasDefaultPaymentMethod: true,
      },
      low: {
        usageBasedBillingEnabled: true,
        creditBalanceCents: 50,
        isExhausted: false,
        isLow: true,
        showWarning: true,
        warningSeverity: "low",
        creditBalanceFormatted: "$0.50",
        hasDefaultPaymentMethod: true,
      },
      ok: {
        usageBasedBillingEnabled: true,
        creditBalanceCents: 500,
        isExhausted: false,
        isLow: false,
        showWarning: false,
        warningSeverity: "none",
        creditBalanceFormatted: "$5.00",
        hasDefaultPaymentMethod: true,
      },
    };
    return c.json({ data: mockStates[testMode] || mockStates.ok });
  }

  const user = c.get("user");
  const organizationId = await billingService.getOrganizationIdForUser(user.id);
  const creditStatus = await billingService.getCreditStatus(organizationId);
  return c.json({ data: creditStatus });
});

/**
 * GET /billing/usage-analytics
 * Get usage analytics grouped by dimension
 *
 * Query params:
 *   - startDate: ISO 8601 (optional, defaults to 30 days ago)
 *   - endDate: ISO 8601 (optional, defaults to now)
 *   - groupBy: "app" | "model" | "agentType" (optional, defaults to "model")
 */
billingRoutes.get("/usage-analytics", async (c) => {
  const user = c.get("user");
  const organizationId = await billingService.getOrganizationIdForUser(user.id);

  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const groupBy = c.req.query("groupBy") as
    | "app"
    | "model"
    | "agentType"
    | undefined;

  const analytics = await billingService.getUsageAnalytics(organizationId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    groupBy: groupBy || "model",
  });

  return c.json({ data: analytics });
});

/**
 * GET /billing/usage
 * Get token usage summary for the user's organization
 *
 * Query params:
 *   - startDate: ISO 8601 date string (optional, defaults to start of month)
 *   - endDate: ISO 8601 date string (optional, defaults to now)
 */
billingRoutes.get("/usage", async (c) => {
  const user = c.get("user");
  const organizationId = await billingService.getOrganizationIdForUser(user.id);

  // Parse query parameters
  const startDateParam = c.req.query("startDate");
  const endDateParam = c.req.query("endDate");

  const options: { startDate?: Date; endDate?: Date } = {};
  if (startDateParam) {
    options.startDate = new Date(startDateParam);
  }
  if (endDateParam) {
    options.endDate = new Date(endDateParam);
  }

  const usage = await billingService.getUsageSummary(organizationId, options);
  return c.json({ data: usage });
});

/**
 * GET /billing/subscription
 * Get subscription details for the user's organization
 *
 * Returns tier, Stripe IDs, and billing flags.
 */
billingRoutes.get("/subscription", async (c) => {
  const user = c.get("user");
  const organizationId = await billingService.getOrganizationIdForUser(user.id);
  const subscription = await billingService.getSubscription(organizationId);
  return c.json({ data: subscription });
});

/**
 * POST /billing/portal
 * Create a Stripe billing portal session
 *
 * Creates a Stripe billing portal session for the user's organization
 * to manage subscriptions, payment methods, and billing history.
 */
billingRoutes.post(
  "/portal",
  zValidator("json", createPortalSessionSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    try {
      // Get organization ID for user
      const organizationId = await billingService.getOrganizationIdForUser(
        user.id
      );

      // Get organization's Stripe customer ID
      const subscription = await billingService.getSubscription(organizationId);

      if (!subscription.stripeCustomerId) {
        return c.json(
          {
            error: "No Stripe customer",
            message:
              "This organization does not have a Stripe customer ID. Please contact support.",
          },
          400
        );
      }

      // Validate and sanitize returnUrl to prevent open redirect attacks
      const baseUrl = Deno.env.get("APP_URL") || "http://localhost:5174";
      const defaultReturnUrl = `${baseUrl}/settings/billing`;

      let returnUrl = defaultReturnUrl;
      if (body.returnUrl) {
        try {
          const rawUrl = body.returnUrl;
          // Reject absolute URLs with protocols or schemeless URLs
          if (
            /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawUrl) ||
            rawUrl.startsWith("//")
          ) {
            // Only allow if it's same origin
            const candidateUrl = new URL(rawUrl);
            const baseOrigin = new URL(baseUrl).origin;
            if (candidateUrl.origin === baseOrigin) {
              returnUrl = candidateUrl.toString();
            }
            // Otherwise use default (reject external URLs)
          } else {
            // Relative path - normalize and validate
            const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
            const candidateUrl = new URL(path, baseUrl);
            // Double-check same origin
            if (candidateUrl.origin === new URL(baseUrl).origin) {
              returnUrl = candidateUrl.toString();
            }
          }
        } catch {
          // Invalid URL, use default
        }
      }

      // Create billing portal session
      const portalUrl = await billingService.createBillingPortalSession({
        customerId: subscription.stripeCustomerId,
        returnUrl,
        organizationName: subscription.organizationName,
      });

      return c.json({
        data: {
          url: portalUrl,
        },
      });
    } catch (error) {
      console.error("[billing] Failed to create portal session:", error);
      Sentry.captureException(error, {
        tags: { source: "billing-api", feature: "portal-session" },
        extra: { userId: user.id },
      });
      return c.json(
        {
          error: "Failed to create portal session",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
        500
      );
    }
  }
);
