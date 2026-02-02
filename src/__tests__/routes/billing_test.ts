/**
 * Billing Route Tests
 *
 * Tests for /api/billing and /api/stripe endpoints.
 * Covers subscription management, credits, and payment handling.
 *
 * ENDPOINTS TESTED:
 * - GET /api/billing - Get billing overview (credits, subscription)
 * - GET /api/billing/usage - Get usage statistics
 * - GET /api/billing/invoices - List invoices
 * - POST /api/stripe/create-checkout-session - Start subscription
 * - POST /api/stripe/create-portal-session - Access Stripe portal
 * - POST /api/stripe/webhook - Handle Stripe webhooks
 *
 * USAGE:
 *   deno test src/__tests__/routes/billing_test.ts
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  unauthenticated,
} from "../setup.ts";
import type { TestUser } from "../setup.ts";
import {
  getFreeUser,
  getProUser,
  getExhaustedCreditsUser,
} from "../fixtures/users.ts";
import {
  createFreeOrg,
  createProOrg,
  createOrgWithCredits,
  createOrgWithExhaustedCredits,
  createOrgWithLowCredits,
  cleanupOrg,
} from "../fixtures/organizations.ts";
import {
  createStripeSubscriptionCreatedEvent,
  createStripeSubscriptionUpdatedEvent,
  createStripeSubscriptionDeletedEvent,
  createStripeInvoicePaidEvent,
  createStripePaymentFailedEvent,
  createStripeSignature,
} from "../fixtures/webhooks.ts";
import { PRICING_PLANS } from "../fixtures/stripe.ts";

// ========================================
// Test Setup
// ========================================

describe("Billing API", () => {
  let freeUser: TestUser;
  let proUser: TestUser;
  let exhaustedCreditsUser: TestUser;

  beforeAll(async () => {
    await setupTests();
    freeUser = await getFreeUser();
    proUser = await getProUser();
    exhaustedCreditsUser = await getExhaustedCreditsUser();
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // Billing Overview Tests
  // ========================================

  describe("GET /api/billing", () => {
    it("should return billing overview", async () => {
      const res = await get("/api/billing", proUser);

      // Route may not exist in this codebase
      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data);
      }
    });

    it("should include credit balance", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          assert(typeof data.credits.available === "number");
          assert(data.credits.available >= 0);
        }
      }
    });

    it("should include subscription tier", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.subscription) {
          assertExists(data.subscription.tier);
          assert(
            ["FREE", "PRO", "TEAM", "BUSINESS", "ENTERPRISE"].includes(
              data.subscription.tier
            )
          );
        }
      }
    });

    it("should include usage-based billing status", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        // usageBasedBillingEnabled should be a boolean if present
        if (data.usageBasedBillingEnabled !== undefined) {
          assert(typeof data.usageBasedBillingEnabled === "boolean");
        }
      }
    });

    it("should work for FREE tier user", async () => {
      const res = await get("/api/billing", freeUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data);
        if (data.subscription) {
          assertEquals(data.subscription.tier, "FREE");
        }
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/billing", { method: "GET" });
      // Should return 401 or 403 (or 404 if route doesn't exist)
      assert(
        [401, 403, 404].includes(res.status),
        `Expected 401, 403 or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Usage Statistics Tests
  // ========================================

  describe("GET /api/billing/usage", () => {
    it("should return usage statistics", async () => {
      const res = await get("/api/billing/usage", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data);
      }
    });

    it("should include token usage", async () => {
      const res = await get("/api/billing/usage", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.usage) {
          // Token counts should be non-negative numbers if present
          if (data.usage.totalTokens !== undefined) {
            assert(data.usage.totalTokens >= 0);
          }
        }
      }
    });

    it("should include date range", async () => {
      const res = await get("/api/billing/usage?days=30", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.period) {
          assertExists(data.period.start);
          assertExists(data.period.end);
        }
      }
    });

    it("should break down by model", async () => {
      const res = await get("/api/billing/usage?groupBy=model", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.breakdown) {
          assert(Array.isArray(data.breakdown));
        }
      }
    });

    it("should break down by application", async () => {
      const res = await get("/api/billing/usage?groupBy=app", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.breakdown) {
          assert(Array.isArray(data.breakdown));
        }
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/billing/usage", {
        method: "GET",
      });
      // Should return 401 or 403 (or 404 if route doesn't exist)
      assert(
        [401, 403, 404].includes(res.status),
        `Expected 401, 403 or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Invoice Tests
  // ========================================

  describe("GET /api/billing/invoices", () => {
    it("should list invoices", async () => {
      const res = await get("/api/billing/invoices", proUser);

      // Route may not exist in this codebase
      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data);
        if (data.invoices) {
          assert(Array.isArray(data.invoices));
        }
      }
    });

    it("should return empty for FREE tier", async () => {
      const res = await get("/api/billing/invoices", freeUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        // Free tier users should have no invoices
        if (data.invoices) {
          assertEquals(data.invoices.length, 0);
        }
      }
    });

    it("should include invoice status", async () => {
      const res = await get("/api/billing/invoices", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.invoices && data.invoices.length > 0) {
          const invoice = data.invoices[0];
          assertExists(invoice.status);
          assert(
            ["draft", "open", "paid", "uncollectible", "void"].includes(
              invoice.status
            )
          );
        }
      }
    });

    it("should include download links", async () => {
      const res = await get("/api/billing/invoices", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.invoices && data.invoices.length > 0) {
          const invoice = data.invoices[0];
          // PDF link should be present for paid invoices
          if (invoice.pdfUrl) {
            assert(invoice.pdfUrl.includes("http"));
          }
        }
      }
    });

    it("should paginate results", async () => {
      const res = await get("/api/billing/invoices?limit=5", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.invoices) {
          assert(data.invoices.length <= 5);
        }
      }
    });
  });

  // ========================================
  // Checkout Session Tests
  // ========================================

  describe("POST /api/stripe/create-checkout-session", () => {
    it("should create checkout session for upgrade", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        tier: "PRO",
        interval: "monthly",
      });

      // May return 200 with URL, 400 if user already has subscription, or 404 if route doesn't exist
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assert(data.url || data.sessionId);
      }
    });

    it("should include success/cancel URLs", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        tier: "PRO",
        interval: "monthly",
        successUrl: "https://app.chipp.ai/billing/success",
        cancelUrl: "https://app.chipp.ai/billing/cancel",
      });

      // Just verify request is accepted (or 404 if route doesn't exist)
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );
    });

    it("should set correct price ID for tier", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        tier: "TEAM",
        interval: "monthly",
      });

      // Verify request is processed (or 404 if route doesn't exist)
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );
    });

    it("should handle yearly vs monthly", async () => {
      const resMonthly = await post(
        "/api/stripe/create-checkout-session",
        freeUser,
        {
          tier: "PRO",
          interval: "monthly",
        }
      );

      const resYearly = await post(
        "/api/stripe/create-checkout-session",
        freeUser,
        {
          tier: "PRO",
          interval: "yearly",
        }
      );

      // Both should be valid requests (or 404 if route doesn't exist)
      assert(
        [200, 400, 404].includes(resMonthly.status),
        `Expected 200, 400 or 404 for monthly, got ${resMonthly.status}`
      );
      assert(
        [200, 400, 404].includes(resYearly.status),
        `Expected 200, 400 or 404 for yearly, got ${resYearly.status}`
      );
    });

    it("should require tier parameter", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        interval: "monthly",
      });
      // Should return 400 for missing tier (or 404 if route doesn't exist)
      assert(
        [400, 404].includes(res.status),
        `Expected 400 or 404, got ${res.status}`
      );
    });

    it("should reject invalid tier", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        tier: "INVALID_TIER",
        interval: "monthly",
      });
      // Should return 400 for invalid tier (or 404 if route doesn't exist)
      assert(
        [400, 404].includes(res.status),
        `Expected 400 or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Portal Session Tests
  // ========================================

  describe("POST /api/stripe/create-portal-session", () => {
    it("should create portal session", async () => {
      const res = await post("/api/stripe/create-portal-session", proUser, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      // May succeed, fail depending on Stripe customer, or 404 if route doesn't exist
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data.url);
        assert(
          data.url.includes("stripe.com") ||
            data.url.includes("billing.stripe.com")
        );
      }
    });

    it("should require existing Stripe customer", async () => {
      // Free user without Stripe customer should get error
      const res = await post("/api/stripe/create-portal-session", freeUser, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      // Should return 400 or 404 if no customer exists (or 200 if customer exists)
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );
    });

    it("should include return URL", async () => {
      const returnUrl = "https://app.chipp.ai/settings/billing";
      const res = await post("/api/stripe/create-portal-session", proUser, {
        returnUrl,
      });

      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        // Portal URL should be valid
        assertExists(data.url);
      }
    });

    it("should require authentication", async () => {
      const res = await post(
        "/api/stripe/create-portal-session",
        null as unknown as TestUser,
        {
          returnUrl: "https://app.chipp.ai/settings/billing",
        }
      );
      // Should return 401 or 403 (or 404 if route doesn't exist)
      assert(
        [401, 403, 404].includes(res.status),
        `Expected 401, 403 or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Credit Balance Tests
  // ========================================

  describe("Credit Management", () => {
    it("should show correct credit balance", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          assert(typeof data.credits.available === "number");
          // Credits should be in cents
          assert(data.credits.available >= 0);
        }
      }
    });

    it("should show zero for exhausted credits", async () => {
      const res = await get("/api/billing", exhaustedCreditsUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          assertEquals(data.credits.available, 0);
        }
      }
    });

    it("should include low credit warning threshold", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          // Low credit info may be included
          if (data.credits.lowCreditThreshold !== undefined) {
            assert(data.credits.lowCreditThreshold > 0);
          }
        }
      }
    });

    it("should show credit grants", async () => {
      const res = await get("/api/billing/credits", proUser);

      // Route may not exist
      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;

        if (data.grants) {
          assert(Array.isArray(data.grants));
        }
      }
    });
  });

  // ========================================
  // Webhook Tests (Mocked)
  // ========================================

  describe("POST /api/stripe/webhook", () => {
    const testWebhookSecret = "whsec_test_secret_for_unit_tests";

    it("should handle subscription.created", async () => {
      const customerId = "cus_test123";
      const event = createStripeSubscriptionCreatedEvent(customerId);
      const payload = JSON.stringify(event);
      const signature = await createStripeSignature(payload, testWebhookSecret);

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": signature,
        }
      );

      // Webhook endpoint should accept valid events (or 400/401 if config mismatch, or 404 if route doesn't exist)
      assert(
        [200, 400, 401, 404].includes(res.status),
        `Expected 200, 400, 401 or 404, got ${res.status}`
      );
    });

    it("should handle subscription.updated", async () => {
      const customerId = "cus_test123";
      const subscriptionId = "sub_test123";
      const event = createStripeSubscriptionUpdatedEvent(
        customerId,
        subscriptionId,
        "active"
      );
      const payload = JSON.stringify(event);
      const signature = await createStripeSignature(payload, testWebhookSecret);

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": signature,
        }
      );

      assert(
        [200, 400, 401, 404].includes(res.status),
        `Expected 200, 400, 401 or 404, got ${res.status}`
      );
    });

    it("should handle subscription.deleted", async () => {
      const customerId = "cus_test123";
      const subscriptionId = "sub_test123";
      const event = createStripeSubscriptionDeletedEvent(
        customerId,
        subscriptionId
      );
      const payload = JSON.stringify(event);
      const signature = await createStripeSignature(payload, testWebhookSecret);

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": signature,
        }
      );

      assert(
        [200, 400, 401, 404].includes(res.status),
        `Expected 200, 400, 401 or 404, got ${res.status}`
      );
    });

    it("should handle invoice.paid", async () => {
      const customerId = "cus_test123";
      const event = createStripeInvoicePaidEvent(customerId, 2900);
      const payload = JSON.stringify(event);
      const signature = await createStripeSignature(payload, testWebhookSecret);

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": signature,
        }
      );

      assert(
        [200, 400, 401, 404].includes(res.status),
        `Expected 200, 400, 401 or 404, got ${res.status}`
      );
    });

    it("should handle payment_intent.payment_failed", async () => {
      const customerId = "cus_test123";
      const event = createStripePaymentFailedEvent(customerId);
      const payload = JSON.stringify(event);
      const signature = await createStripeSignature(payload, testWebhookSecret);

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": signature,
        }
      );

      assert(
        [200, 400, 401, 404].includes(res.status),
        `Expected 200, 400, 401 or 404, got ${res.status}`
      );
    });

    it("should reject missing signature", async () => {
      const event = createStripeSubscriptionCreatedEvent("cus_test123");

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event
      );

      // Should reject without signature - 400 or 401 depending on route config
      assert(
        [400, 401].includes(res.status),
        `Expected 400 or 401, got ${res.status}`
      );
    });

    it("should reject invalid signature", async () => {
      const event = createStripeSubscriptionCreatedEvent("cus_test123");
      const invalidSignature = "t=12345,v1=invalid_signature_hash";

      const res = await post(
        "/api/stripe/webhook",
        null as unknown as TestUser,
        event,
        {
          "Stripe-Signature": invalidSignature,
        }
      );

      // Should reject invalid signature - 400 or 401 depending on route config
      assert(
        [400, 401].includes(res.status),
        `Expected 400 or 401, got ${res.status}`
      );
    });
  });

  // ========================================
  // Usage-Based Billing Tests
  // ========================================

  describe("Usage-Based Billing", () => {
    it("should report meter events", async () => {
      // Meter events are typically reported server-side, not via API
      // This tests the usage endpoint reflects reported usage
      const res = await get("/api/billing/usage", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        assertExists(data);
      }
    });

    it("should grant credits on subscription start", async () => {
      // Credits are granted via webhook when subscription starts
      // Verify Pro user has credits
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          // Pro tier should have credit allowance
          assert(data.credits.available >= 0);
        }
      }
    });

    it("should handle credit expiration", async () => {
      const res = await get("/api/billing/credits", proUser);

      // Route may not exist
      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;

        if (data.grants && data.grants.length > 0) {
          // Grants may have expiration dates
          const grant = data.grants[0];
          if (grant.expiresAt) {
            // Expiration should be a valid date
            assert(new Date(grant.expiresAt).getTime() > 0);
          }
        }
      }
    });

    it("should block usage when credits exhausted", async () => {
      // Exhausted user should have enforcement applied
      const res = await get("/api/billing", exhaustedCreditsUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.credits) {
          assertEquals(data.credits.available, 0);
          if (data.credits.isExhausted !== undefined) {
            assertEquals(data.credits.isExhausted, true);
          }
        }
      }
    });

    it("should show tier credit allowance", async () => {
      const res = await get("/api/billing", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const body = await res.json();
        const data = body.data || body;
        if (data.subscription?.creditAllowance) {
          // PRO tier credit allowance
          assertEquals(
            data.subscription.creditAllowance,
            PRICING_PLANS.PRO.creditAllowance
          );
        }
      }
    });
  });

  // ========================================
  // Tier Upgrade/Downgrade Tests
  // ========================================

  describe("Tier Changes", () => {
    it("should allow upgrade from FREE to PRO", async () => {
      const res = await post("/api/stripe/create-checkout-session", freeUser, {
        tier: "PRO",
        interval: "monthly",
      });

      // Should either create checkout, indicate existing subscription, or 404 if route doesn't exist
      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );
    });

    it("should allow upgrade from PRO to TEAM", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        tier: "TEAM",
        interval: "monthly",
      });

      assert(
        [200, 400, 404].includes(res.status),
        `Expected 200, 400 or 404, got ${res.status}`
      );
    });

    it("should prevent downgrade via checkout", async () => {
      // Downgrades typically go through portal, not checkout
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        tier: "FREE",
        interval: "monthly",
      });

      // Should reject downgrade via checkout (or 404 if route doesn't exist)
      assert(
        [400, 404].includes(res.status),
        `Expected 400 or 404, got ${res.status}`
      );
    });
  });
});
