/**
 * Stripe Routes
 *
 * Endpoints for Stripe payment operations including checkout sessions
 * for subscription upgrades.
 */

import { Hono } from "hono";
import type { AuthContext } from "../../middleware/auth.ts";
import { sql } from "../../../db/client.ts";
import { BadRequestError } from "../../../utils/errors.ts";
import Stripe from "npm:stripe";
import {
  getStripeApiKey,
  STRIPE_API_VERSION,
  STRIPE_V2_API_VERSION,
} from "../../../services/stripe.client.ts";

// ========================================
// Stripe Pricing Constants
// ========================================

// Mode type for test/live switching
type Mode = "TEST" | "LIVE";

// Traditional subscription price IDs (for backward compatibility)
const PRO_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "price_1OXbwmDDECPSIOsvOrUOuXqd",
  LIVE: "price_1OYuakDDECPSIOsvkN4IaAXC",
};
const PRO_YEARLY_PRICE: Record<Mode, string> = {
  TEST: "price_1OXiIlDDECPSIOsvXR86CfYH",
  LIVE: "price_1OYuakDDECPSIOsv4Uu8bTQY",
};

const TEAM_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "price_1OY3e2DDECPSIOsvEmvzHxZX",
  LIVE: "price_1QJpnsDDECPSIOsvSt5WlYHY",
};
const TEAM_YEARLY_PRICE: Record<Mode, string> = {
  TEST: "price_1OY3ejDDECPSIOsvmEcV4SB7",
  LIVE: "price_1OYuaRDDECPSIOsvoxRNMsQX",
};

const BUSINESS_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "price_1SDqTCDDECPSIOsv5EhmaRra",
  LIVE: "price_1SDYRCDDECPSIOsv5wKLFsMV",
};
const BUSINESS_YEARLY_PRICE: Record<Mode, string> = {
  TEST: "price_1SDqTODDECPSIOsvbfhOR7zt",
  LIVE: "price_1SDYSjDDECPSIOsvEwiuoVL0",
};

// Usage-based billing v2 pricing plan IDs
const USAGE_BASED_PRO_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "bpp_test_61T9UyPP167CaUjY016T9TMHRuSQ9dYb669EuoS3UFjs",
  LIVE: "bpp_61TqjPr9aBFLlL1sS16PAYkwRuSQV6uTJRipwOFHUF96",
};
const USAGE_BASED_PRO_YEARLY_PRICE: Record<Mode, string> = {
  TEST: "bpp_test_61T9V3gI81fWnF58916T9TMHRuSQ9dYb669EuoS3UCGu",
  LIVE: "bpp_61Tqjd7nn2AbpROt816PAYkwRuSQV6uTJRipwOFHUI3c",
};

const USAGE_BASED_TEAM_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "bpp_test_61T9V5JqjQgudRWiY16T9TMHRuSQ9dYb669EuoS3UU6a",
  LIVE: "bpp_61TqjNcQzOlILWykg16PAYkwRuSQV6uTJRipwOFHUI5g",
};
const USAGE_BASED_TEAM_YEARLY_PRICE: Record<Mode, string> = {
  TEST: "bpp_test_61T9V7O30ojRiytGo16T9TMHRuSQ9dYb669EuoS3UTsW",
  LIVE: "bpp_61TqjaI2Glr6O4hMf16PAYkwRuSQV6uTJRipwOFHU6jY",
};

const USAGE_BASED_BUSINESS_MONTHLY_PRICE: Record<Mode, string> = {
  TEST: "bpp_test_61TWJFmkF3dDTVsXs16T9TMHRuSQ9dYb669EuoS3U3m4",
  LIVE: "bpp_61TqjQUV9CZIlomEz16PAYkwRuSQV6uTJRipwOFHULUu",
};

// Helper to get stripe ID based on mode
function getStripeId(constant: Record<Mode, string>, mode: Mode): string {
  return constant[mode] || "";
}

// ========================================
// Helper Functions
// ========================================

/**
 * Fetch license fee component ID from a pricing plan using Stripe v2 API
 */
async function getLicenseFeeComponentId(
  pricingPlanId: string,
  stripeKey: string
): Promise<string | null> {
  try {
    const headers = {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/json",
      "Stripe-Version": STRIPE_V2_API_VERSION,
    } as const;

    const componentsRes = await fetch(
      `https://api.stripe.com/v2/billing/pricing_plans/${pricingPlanId}/components`,
      { headers }
    );

    if (!componentsRes.ok) {
      console.error(
        "[STRIPE PLAN] Failed to fetch pricing plan components:",
        componentsRes.status
      );
      return null;
    }

    const componentsJson = (await componentsRes.json()) as {
      data?: { id?: string; type?: string }[];
    };
    const components = componentsJson?.data || [];

    // Find the license_fee component
    const licenseFeeComponent = components.find(
      (c) => c?.type === "license_fee"
    );

    if (!licenseFeeComponent?.id) {
      console.error("[STRIPE PLAN] No license_fee component found");
      return null;
    }

    return licenseFeeComponent.id;
  } catch (error) {
    console.error("[STRIPE PLAN] Error fetching license fee component:", error);
    return null;
  }
}

/**
 * Ensure organization has a Stripe customer ID, creating one if needed
 */
async function ensureStripeCustomerForOrganization(
  developerId: number,
  organizationId: number,
  useSandbox: boolean
): Promise<string> {
  const stripeKey = getStripeApiKey(useSandbox);
  if (!stripeKey) {
    throw new BadRequestError("Stripe is not configured");
  }

  // Get organization details
  const orgs = await sql`
    SELECT
      o.id,
      o.name,
      o.stripe_customer_id,
      o.stripe_sandbox_customer_id,
      d.email,
      d.name as developer_name
    FROM app.organizations o
    JOIN app.users u ON u.organization_id = o.id
    JOIN app.developers d ON d.id = u.id
    WHERE o.id = ${organizationId}
    LIMIT 1
  `;

  if (orgs.length === 0) {
    throw new BadRequestError("Organization not found");
  }

  const org = orgs[0];
  const existingCustomerId = useSandbox
    ? org.stripe_sandbox_customer_id
    : org.stripe_customer_id;

  if (existingCustomerId) {
    return existingCustomerId;
  }

  // Create new Stripe customer
  const stripe = new Stripe(stripeKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });

  const customer = await stripe.customers.create({
    email: org.email,
    name: org.name || org.developer_name || org.email,
    metadata: {
      organizationId: organizationId.toString(),
      developerId: developerId.toString(),
      source: "chipp-deno",
    },
  });

  // Update organization with new customer ID
  if (useSandbox) {
    await sql`
      UPDATE app.organizations
      SET stripe_sandbox_customer_id = ${customer.id}, updated_at = NOW()
      WHERE id = ${organizationId}
    `;
  } else {
    await sql`
      UPDATE app.organizations
      SET stripe_customer_id = ${customer.id}, updated_at = NOW()
      WHERE id = ${organizationId}
    `;
  }

  return customer.id;
}

// ========================================
// Routes
// ========================================

export const stripeRoutes = new Hono<AuthContext>();

/**
 * GET /stripe/plans/payment-url
 * Generate a Stripe checkout session URL for subscription upgrade
 *
 * Query params:
 *   - subscriptionTier: PRO, TEAM, or BUSINESS
 *   - subscriptionPeriod: MONTHLY or YEARLY
 *   - returnToUrl: URL to redirect after checkout
 *   - cancelUrl: URL to redirect on cancel (optional)
 *   - upsellSource: Source of the upsell (optional)
 */
stripeRoutes.get("/plans/payment-url", async (c) => {
  const user = c.get("user");

  // Parse query params
  const subscriptionTier = c.req.query("subscriptionTier");
  const subscriptionPeriod = c.req.query("subscriptionPeriod");
  const returnToUrl = c.req.query("returnToUrl");
  const cancelUrl = c.req.query("cancelUrl") || returnToUrl;
  const upsellSource = c.req.query("upsellSource") || "direct";

  if (!subscriptionTier || !subscriptionPeriod || !returnToUrl) {
    return c.json({ error: "Missing query parameters" }, 400);
  }

  const period = subscriptionPeriod.toUpperCase();
  const tier = subscriptionTier.toUpperCase();

  if (!["PRO", "TEAM", "BUSINESS"].includes(tier)) {
    return c.json({ error: "Invalid subscription tier" }, 400);
  }

  if (!["MONTHLY", "YEARLY"].includes(period)) {
    return c.json({ error: "Invalid subscription period" }, 400);
  }

  // Get user's workspace and organization
  const userResult = await sql`
    SELECT
      u.id as user_id,
      d.id as developer_id,
      d.email,
      d.name as developer_name,
      d.referral_id,
      d.active_workspace_id,
      w.id as workspace_id,
      w.organization_id,
      o.name as organization_name,
      o.subscription_tier,
      o.use_sandbox_for_usage_billing
    FROM app.users u
    JOIN app.developers d ON d.id = u.id
    LEFT JOIN app.workspaces w ON w.id = d.active_workspace_id
    LEFT JOIN app.organizations o ON o.id = w.organization_id
    WHERE u.id = ${user.id}
  `;

  if (userResult.length === 0) {
    return c.json({ error: "User not found" }, 400);
  }

  const userData = userResult[0];

  if (!userData.organization_id) {
    return c.json({ error: "No organization found for user" }, 400);
  }

  // Usage-based billing is always enabled
  const globalSandboxDefault =
    Deno.env.get("USE_STRIPE_SANDBOX_BY_DEFAULT") === "true";

  const useSandboxForUsageBilling =
    userData.use_sandbox_for_usage_billing === true
      ? true
      : globalSandboxDefault;

  // Get appropriate Stripe key
  const stripeKey = getStripeApiKey(useSandboxForUsageBilling);
  if (!stripeKey) {
    return c.json({ error: "Stripe is not configured" }, 500);
  }

  // Determine mode
  const mode: Mode = useSandboxForUsageBilling ? "TEST" : "LIVE";

  // Get price ID (usage-based billing is always enabled)
  let price: string | undefined;
  switch (tier) {
    case "PRO":
      price =
        period === "MONTHLY"
          ? getStripeId(USAGE_BASED_PRO_MONTHLY_PRICE, mode)
          : getStripeId(USAGE_BASED_PRO_YEARLY_PRICE, mode);
      break;
    case "TEAM":
      price =
        period === "MONTHLY"
          ? getStripeId(USAGE_BASED_TEAM_MONTHLY_PRICE, mode)
          : getStripeId(USAGE_BASED_TEAM_YEARLY_PRICE, mode);
      break;
    case "BUSINESS":
      price = getStripeId(USAGE_BASED_BUSINESS_MONTHLY_PRICE, mode);
      break;
  }

  if (!price) {
    return c.json({ error: "Invalid subscription tier" }, 400);
  }

  // Ensure Stripe customer exists
  const stripeCustomerId = await ensureStripeCustomerForOrganization(
    userData.developer_id,
    userData.organization_id,
    useSandboxForUsageBilling
  );

  // Create Stripe client
  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion,
  });

  const encodedReturnToUrl = returnToUrl.replace(/\s/g, "%20");
  const clientReferenceId =
    userData.referral_id || userData.developer_id.toString();

  // Build checkout session options (usage-based billing is always enabled)
  // Get license fee component ID for v2 billing
  const licenseFeeComponentId = await getLicenseFeeComponentId(
    price,
    stripeKey
  );

  // V2 billing uses checkout_items with pricing_plan_subscription_item
  const checkoutSessionOptions = {
    success_url: `${encodedReturnToUrl}?purchased=true&ucid={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || encodedReturnToUrl,
    customer_email: userData.email,
    client_reference_id: clientReferenceId,
    metadata: {
      subscriptionTier: tier,
      subscriptionPeriod: period,
      organizationId: userData.organization_id.toString(),
      developerId: userData.developer_id.toString(),
      organizationStripeCustomerId: stripeCustomerId,
      billingType: "usage-based",
      upsellSource,
    },
    checkout_items: [
      {
        type: "pricing_plan_subscription_item" as const,
        pricing_plan_subscription_item: {
          pricing_plan: price,
          component_configurations: licenseFeeComponentId
            ? {
                [licenseFeeComponentId]: {
                  type: "license_fee_component" as const,
                  license_fee_component: {
                    quantity: 1,
                  },
                },
              }
            : {},
        },
      },
    ],
  } as Stripe.Checkout.SessionCreateParams;

  // Create checkout session
  try {
    // Add beta header for v2 billing with pricing plans
    const checkoutSession = await stripe.checkout.sessions.create(
      checkoutSessionOptions,
      {
        stripeAccount: undefined,
        idempotencyKey: undefined,
        // @ts-ignore - Need to pass the beta header for v2 billing
        apiVersion: "2025-05-28.basil;checkout_product_catalog_preview=v1",
      }
    );

    return c.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[STRIPE] Checkout session creation failed:", error);
    if (error instanceof Error) {
      return c.json({ error: `Stripe error: ${error.message}` }, 400);
    }
    throw error;
  }
});
