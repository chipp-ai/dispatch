/**
 * Consumer Credits Routes
 *
 * Endpoints for consumer credit purchases and subscription management.
 * Uses Stripe Checkout for payments and Billing Portal for subscription management.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { log } from "@/lib/logger.ts";
import type Stripe from "npm:stripe";

import {
  consumerAuthMiddleware,
  type ConsumerAuthContext,
} from "../../middleware/consumerAuth.ts";
import { db } from "../../../db/index.ts";
import { stripe, isStripeConfigured } from "../../../services/stripe.client.ts";

// ========================================
// Validation Schemas
// ========================================

const paymentUrlQuerySchema = z.object({
  packageId: z.coerce.number().int().positive(),
});

// ========================================
// Router Setup
// ========================================

export const consumerCreditsRoutes = new Hono<ConsumerAuthContext>();

// All credits routes require consumer auth
consumerCreditsRoutes.use("*", consumerAuthMiddleware);

// ========================================
// Package Routes
// ========================================

/**
 * GET /packages
 * List available credit packages for the app
 */
consumerCreditsRoutes.get("/packages", async (c) => {
  const app = c.get("app");

  const packages = await db
    .selectFrom("app.packages")
    .select(["id", "name", "tokenQty", "price", "type", "createdAt"])
    .where("applicationId", "=", app.id)
    .where("isActive", "=", true)
    .orderBy("price", "asc")
    .execute();

  return c.json({
    data: packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      credits: pkg.tokenQty,
      price: Number(pkg.price),
      type: pkg.type, // ONE_TIME or SUBSCRIPTION
    })),
  });
});

// ========================================
// Payment URL Routes
// ========================================

/**
 * GET /payment-url
 * Generate a Stripe Checkout URL for purchasing a credit package
 */
consumerCreditsRoutes.get(
  "/payment-url",
  zValidator("query", paymentUrlQuerySchema),
  async (c) => {
    if (!isStripeConfigured() || !stripe) {
      return c.json({ error: "Payment system not configured" }, 503);
    }

    const consumer = c.get("consumer");
    const app = c.get("app");
    const query = c.req.valid("query");

    // Get the package
    const pkg = await db
      .selectFrom("app.packages")
      .selectAll()
      .where("id", "=", query.packageId)
      .where("applicationId", "=", app.id)
      .where("isActive", "=", true)
      .executeTakeFirst();

    if (!pkg) {
      return c.json({ error: "Package not found" }, 404);
    }

    // Get developer's Stripe account info (join with credentials for stripeAccountId)
    const developer = await db
      .selectFrom("app.developers as d")
      .innerJoin("app.developer_credentials as dc", "dc.developerId", "d.id")
      .select(["d.id", "dc.stripeAccountId", "d.hasCompletedStripeOnboarding"])
      .where("d.id", "=", app.developerId)
      .executeTakeFirst();

    if (!developer) {
      return c.json({ error: "Application developer not found" }, 500);
    }

    // Check if developer has completed Stripe onboarding
    if (!developer.stripeAccountId || !developer.hasCompletedStripeOnboarding) {
      return c.json(
        { error: "This application cannot process payments yet" },
        400
      );
    }

    // Get return URLs from request headers
    const referer = c.req.header("referer") || c.req.header("host");
    if (!referer) {
      return c.json({ error: "Could not determine return URL" }, 400);
    }

    // Use app's redirect URL or referer
    const successUrl = app.redirectAfterSignupUrl || referer;
    const cancelUrl = referer;

    try {
      // Get or create Stripe customer for consumer
      let stripeCustomerId = consumer.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create(
          {
            email: consumer.email || undefined,
            name: consumer.name || undefined,
            metadata: {
              consumerId: String(consumer.id),
              applicationId: String(app.id),
              consumerIdentifier: consumer.identifier,
            },
          },
          {
            stripeAccount: developer.stripeAccountId,
          }
        );

        stripeCustomerId = customer.id;

        // Save customer ID to consumer
        await db
          .updateTable("app.consumers")
          .set({ stripeCustomerId: customer.id })
          .where("id", "=", consumer.id)
          .execute();
      }

      // Build checkout session
      const isSubscription = pkg.type === "SUBSCRIPTION";
      const priceInCents = Math.round(Number(pkg.price) * 100);

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: stripeCustomerId,
        mode: isSubscription ? "subscription" : "payment",
        success_url: successUrl.replace(/\s/g, "%20"),
        cancel_url: cancelUrl.replace(/\s/g, "%20"),
        line_items: [
          {
            price_data: {
              currency: app.currency?.toLowerCase() || "usd",
              product_data: {
                name: isSubscription
                  ? app.name || "Subscription"
                  : `${pkg.tokenQty} Credits`,
                description: isSubscription
                  ? `Unlimited credits for ${app.name}`
                  : `${pkg.tokenQty} credits for ${app.name}`,
              },
              unit_amount: priceInCents,
              ...(isSubscription && {
                recurring: {
                  interval: "month" as const,
                },
              }),
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "package",
          developerId: String(developer.id),
          applicationId: String(app.id),
          packageId: String(pkg.id),
          consumerIdentifier: consumer.identifier,
        },
      };

      // Add tax configuration if enabled
      if (app.enableVatDynamicTax) {
        sessionParams.automatic_tax = { enabled: true };
        sessionParams.customer_update = {
          address: "auto",
          shipping: "auto",
        };
        sessionParams.billing_address_collection = "required";
      } else if (app.stripeAlwaysCollectBillingAddress) {
        sessionParams.billing_address_collection = "required";
      }

      // Add optional collection settings
      if (app.stripeCollectShippingAddress) {
        sessionParams.shipping_address_collection = {
          allowed_countries: [
            "US",
            "CA",
            "GB",
            "AU",
            "DE",
            "FR",
            "IT",
            "ES",
            "BR",
            "MX",
            "JP",
            "IN",
          ],
        };
      }

      if (app.stripeCollectPhoneNumber) {
        sessionParams.phone_number_collection = { enabled: true };
      }

      if (app.stripeCollectTaxId) {
        sessionParams.tax_id_collection = { enabled: true };
      }

      if (app.stripeAllowPromotionCodes !== false) {
        sessionParams.allow_promotion_codes = true;
      }

      const checkoutSession = await stripe.checkout.sessions.create(
        sessionParams,
        {
          stripeAccount: developer.stripeAccountId,
        }
      );

      if (!checkoutSession.url) {
        return c.json({ error: "Failed to create checkout session" }, 500);
      }

      return c.json({ url: checkoutSession.url });
    } catch (error) {
      log.error("Checkout session error", { source: "consumer-credits", feature: "checkout-session", consumerId: consumer.id, appId: app.id, packageId: pkg?.id }, error);
      return c.json(
        { error: error instanceof Error ? error.message : "Payment error" },
        500
      );
    }
  }
);

// ========================================
// Subscription Management Routes
// ========================================

/**
 * GET /manage-subscription
 * Generate a Stripe Billing Portal URL for managing subscription
 */
consumerCreditsRoutes.get("/manage-subscription", async (c) => {
  if (!isStripeConfigured() || !stripe) {
    return c.json({ error: "Payment system not configured" }, 503);
  }

  const consumer = c.get("consumer");
  const app = c.get("app");

  // Consumer must have a Stripe customer ID
  if (!consumer.stripeCustomerId) {
    return c.json(
      { error: "No billing account found. Purchase a package first." },
      400
    );
  }

  // Get developer's Stripe account (join with credentials for stripeAccountId)
  const developer = await db
    .selectFrom("app.developers as d")
    .innerJoin("app.developer_credentials as dc", "dc.developerId", "d.id")
    .select(["dc.stripeAccountId", "d.hasCompletedStripeOnboarding"])
    .where("d.id", "=", app.developerId)
    .executeTakeFirst();

  if (!developer?.stripeAccountId || !developer.hasCompletedStripeOnboarding) {
    return c.json({ error: "Billing not available for this app" }, 400);
  }

  const returnUrl = c.req.header("referer") || "";

  try {
    // Create or ensure billing portal configuration exists
    await stripe.billingPortal.configurations.create(
      {
        business_profile: {
          headline: `${app.name} Subscription`,
        },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true },
        },
      },
      {
        stripeAccount: developer.stripeAccountId,
      }
    );

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create(
      {
        customer: consumer.stripeCustomerId,
        return_url: returnUrl,
      },
      {
        stripeAccount: developer.stripeAccountId,
      }
    );

    return c.json({ url: portalSession.url });
  } catch (error) {
    log.error("Billing portal error", { source: "consumer-credits", feature: "billing-portal", consumerId: consumer.id, appId: app.id, stripeCustomerId: consumer.stripeCustomerId }, error);
    return c.json(
      { error: error instanceof Error ? error.message : "Billing error" },
      500
    );
  }
});

/**
 * GET /balance
 * Get consumer's current credit balance
 */
consumerCreditsRoutes.get("/balance", async (c) => {
  const consumer = c.get("consumer");

  return c.json({
    credits: consumer.credits,
    subscriptionActive: consumer.subscriptionActive,
    hasUnlimitedCredits: consumer.subscriptionActive,
  });
});
