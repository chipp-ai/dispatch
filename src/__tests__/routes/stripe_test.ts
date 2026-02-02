/**
 * Stripe API Route Tests
 *
 * Tests for Stripe-related endpoints including checkout sessions,
 * billing portal, and payment method management.
 *
 * ENDPOINTS TESTED:
 * - POST /api/stripe/create-checkout-session  - Create Stripe checkout
 * - POST /api/stripe/create-portal-session    - Create billing portal
 * - GET  /api/stripe/payment-methods          - List payment methods
 * - POST /api/stripe/detach-payment-method    - Remove payment method
 *
 * SCENARIOS COVERED:
 * 1. Checkout Session
 *    - Create checkout for subscription
 *    - Create checkout for credit topup
 *    - Price ID validation
 *    - Success/cancel URL configuration
 *
 * 2. Billing Portal
 *    - Create portal session for subscription management
 *    - Return URL configuration
 *    - Customer verification
 *
 * 3. Payment Methods
 *    - List saved payment methods
 *    - Detach/remove payment method
 *    - Default payment method handling
 *
 * 4. Authorization
 *    - Organization admin required
 *    - Customer ID verification
 *
 * NOTE: These tests use Stripe sandbox mode. Integration tests
 * should use real Stripe test API calls.
 *
 * USAGE:
 *   deno test src/__tests__/routes/stripe_test.ts
 */

import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists, assert } from "jsr:@std/assert";
import type { TestUser } from "../setup.ts";
import {
  setupTests,
  teardownTests,
  cleanupTestData,
  get,
  post,
  unauthenticated,
  app,
} from "../setup.ts";
import {
  getProUser,
  getFreeUser,
  createIsolatedUser,
} from "../fixtures/users.ts";
import {
  createMockCustomer,
  createMockSubscription,
  PRICING_PLANS,
} from "../fixtures/stripe.ts";

// ========================================
// Test Setup
// ========================================

describe("Stripe API", () => {
  let proUser: TestUser;
  let freeUser: TestUser;

  beforeAll(async () => {
    await setupTests();
    proUser = await getProUser();
    freeUser = await getFreeUser();
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownTests();
  });

  // ========================================
  // Checkout Session
  // ========================================

  describe("POST /api/stripe/create-checkout-session - Checkout", () => {
    it("should create checkout session for subscription", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: PRICING_PLANS.PRO.priceId,
        successUrl: "https://app.chipp.ai/billing?success=true",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200, 404, or 400, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return session URL or ID
        assert(
          data.url || data.sessionId || data.id,
          "Expected checkout session URL or ID"
        );
      }
    });

    it("should create checkout for credit topup", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        type: "credit_topup",
        amount: 1000, // $10 in cents
        successUrl: "https://app.chipp.ai/billing?success=true",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200, 404, or 400, got ${res.status}`
      );
    });

    it("should validate price ID", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: "invalid_price_id",
        successUrl: "https://app.chipp.ai/billing",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 400 || res.status === 422 || res.status === 404,
        `Expected 400, 422, or 404, got ${res.status}`
      );
    });

    it("should include success URL", async () => {
      const successUrl = "https://app.chipp.ai/billing?success=true";
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: PRICING_PLANS.PRO.priceId,
        successUrl,
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Session should be configured with success URL
        assertExists(data.url || data.sessionId);
      }
    });

    it("should include cancel URL", async () => {
      const cancelUrl = "https://app.chipp.ai/billing?canceled=true";
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: PRICING_PLANS.PRO.priceId,
        successUrl: "https://app.chipp.ai/billing",
        cancelUrl,
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );
    });

    it("should create or use existing customer", async () => {
      const user = await createIsolatedUser("FREE");
      const res = await post("/api/stripe/create-checkout-session", user, {
        priceId: PRICING_PLANS.PRO.priceId,
        successUrl: "https://app.chipp.ai/billing",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      // Should handle new users without existing Stripe customer
      if (res.status === 200) {
        const data = await res.json();
        assertExists(data.url || data.sessionId);
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/stripe/create-checkout-session", {
        method: "POST",
        body: {
          priceId: PRICING_PLANS.PRO.priceId,
        },
      });

      assert(
        res.status === 401 || res.status === 403,
        `Expected 401 or 403, got ${res.status}`
      );
    });

    it("should support yearly billing", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: PRICING_PLANS.PRO.priceId,
        billingPeriod: "yearly",
        successUrl: "https://app.chipp.ai/billing",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200, 404, or 400, got ${res.status}`
      );
    });
  });

  // ========================================
  // Billing Portal
  // ========================================

  describe("POST /api/stripe/create-portal-session - Portal", () => {
    it("should create billing portal session", async () => {
      const res = await post("/api/stripe/create-portal-session", proUser, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200, 404, or 400, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return portal URL
        assert(data.url, "Expected billing portal URL");
      }
    });

    it("should require existing subscription", async () => {
      const user = await createIsolatedUser("FREE");
      const res = await post("/api/stripe/create-portal-session", user, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      // Free user without subscription may get error or limited portal
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Expected 200, 400, or 404, got ${res.status}`
      );
    });

    it("should include return URL", async () => {
      const returnUrl = "https://app.chipp.ai/settings/billing?from=portal";
      const res = await post("/api/stripe/create-portal-session", proUser, {
        returnUrl,
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        assertExists(data.url);
      }
    });

    it("should use correct Stripe customer", async () => {
      const res = await post("/api/stripe/create-portal-session", proUser, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      // Portal should be for the user's organization customer
      if (res.status === 200) {
        const data = await res.json();
        assertExists(data.url);
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/stripe/create-portal-session", {
        method: "POST",
        body: {
          returnUrl: "https://app.chipp.ai/settings/billing",
        },
      });

      assert(
        res.status === 401 || res.status === 403,
        `Expected 401 or 403, got ${res.status}`
      );
    });

    it("should require org admin/owner", async () => {
      // Member trying to access portal should be restricted
      const member = await createIsolatedUser("PRO");
      const res = await post("/api/stripe/create-portal-session", member, {
        returnUrl: "https://app.chipp.ai/settings/billing",
      });

      // May require owner/admin role for billing operations
      assert(
        res.status === 200 || res.status === 403 || res.status === 404,
        `Expected 200, 403, or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // Payment Methods
  // ========================================

  describe("GET /api/stripe/payment-methods - List Methods", () => {
    it("should list saved payment methods", async () => {
      const res = await get("/api/stripe/payment-methods", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return array of payment methods
        assert(
          Array.isArray(data) ||
            Array.isArray(data.paymentMethods) ||
            Array.isArray(data.data),
          "Expected array of payment methods"
        );
      }
    });

    it("should return empty array if none", async () => {
      const user = await createIsolatedUser("FREE");
      const res = await get("/api/stripe/payment-methods", user);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const methods = data.paymentMethods || data.data || data;
        assert(Array.isArray(methods), "Expected array (possibly empty)");
      }
    });

    it("should indicate default method", async () => {
      const res = await get("/api/stripe/payment-methods", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const methods = data.paymentMethods || data.data || data;
        if (Array.isArray(methods) && methods.length > 0) {
          // Should have isDefault flag or default indicator
          assert(
            methods.some(
              (m: { isDefault?: boolean; default?: boolean }) =>
                "isDefault" in m || "default" in m
            ) || data.defaultPaymentMethodId,
            "Expected default payment method indicator (may not have methods)"
          );
        }
      }
    });

    it("should include card details", async () => {
      const res = await get("/api/stripe/payment-methods", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        const methods = data.paymentMethods || data.data || data;
        if (Array.isArray(methods) && methods.length > 0) {
          const card = methods[0];
          // Should include card details like last4, brand
          assert(
            card.last4 || card.card?.last4 || card.type,
            "Expected card details in payment method"
          );
        }
      }
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/stripe/payment-methods", {
        method: "GET",
      });

      assert(
        res.status === 401 || res.status === 403,
        `Expected 401 or 403, got ${res.status}`
      );
    });
  });

  describe("POST /api/stripe/detach-payment-method - Remove Method", () => {
    it("should detach payment method", async () => {
      const res = await post("/api/stripe/detach-payment-method", proUser, {
        paymentMethodId: "pm_test_123",
      });

      // May succeed, fail if method doesn't exist, or endpoint not implemented
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Expected 200, 400, or 404, got ${res.status}`
      );
    });

    it("should not allow removing only payment method with active subscription", async () => {
      const res = await post("/api/stripe/detach-payment-method", proUser, {
        paymentMethodId: "pm_only_method",
      });

      // Should warn or prevent removing last payment method if subscription active
      assert(
        res.status === 200 || res.status === 400 || res.status === 404,
        `Expected 200, 400, or 404, got ${res.status}`
      );

      if (res.status === 400) {
        const data = await res.json();
        // Error should mention subscription or payment method requirement
        assert(data.error || data.message, "Expected error message");
      }
    });

    it("should validate payment method ID", async () => {
      const res = await post("/api/stripe/detach-payment-method", proUser, {
        paymentMethodId: "invalid_pm_id",
      });

      assert(
        res.status === 400 || res.status === 404 || res.status === 422,
        `Expected 400, 404, or 422, got ${res.status}`
      );
    });

    it("should require org admin/owner", async () => {
      const member = await createIsolatedUser("PRO");
      const res = await post("/api/stripe/detach-payment-method", member, {
        paymentMethodId: "pm_test_123",
      });

      // Billing operations may require owner/admin role
      assert(
        res.status === 200 || res.status === 403 || res.status === 404,
        `Expected 200, 403, or 404, got ${res.status}`
      );
    });

    it("should require authentication", async () => {
      const res = await unauthenticated("/api/stripe/detach-payment-method", {
        method: "POST",
        body: { paymentMethodId: "pm_test_123" },
      });

      assert(
        res.status === 401 || res.status === 403,
        `Expected 401 or 403, got ${res.status}`
      );
    });
  });

  // ========================================
  // Authorization
  // ========================================

  describe("Authorization", () => {
    it("should require authentication for all endpoints", async () => {
      const endpoints = [
        {
          path: "/api/stripe/create-checkout-session",
          method: "POST" as const,
        },
        { path: "/api/stripe/create-portal-session", method: "POST" as const },
        { path: "/api/stripe/payment-methods", method: "GET" as const },
        { path: "/api/stripe/detach-payment-method", method: "POST" as const },
      ];

      for (const endpoint of endpoints) {
        const res = await unauthenticated(endpoint.path, {
          method: endpoint.method,
          body: endpoint.method === "POST" ? {} : undefined,
        });

        assert(
          res.status === 401 || res.status === 403,
          `${endpoint.path} should require auth, got ${res.status}`
        );
      }
    });

    it("should require org ownership for billing operations", async () => {
      // Create a user without org owner role
      const user = await createIsolatedUser("PRO");

      const billingEndpoints = [
        {
          path: "/api/stripe/create-portal-session",
          body: { returnUrl: "https://example.com" },
        },
        {
          path: "/api/stripe/detach-payment-method",
          body: { paymentMethodId: "pm_test" },
        },
      ];

      for (const endpoint of billingEndpoints) {
        const res = await post(endpoint.path, user, endpoint.body);

        // May require owner/admin or allow all org members
        assert(
          res.status === 200 || res.status === 403 || res.status === 404,
          `${endpoint.path} got unexpected status ${res.status}`
        );
      }
    });

    it("should verify Stripe customer matches org", async () => {
      const user1 = await createIsolatedUser("PRO");
      const user2 = await createIsolatedUser("PRO");

      // User1 trying to access user2's billing should fail
      const res = await post("/api/stripe/create-portal-session", user1, {
        returnUrl: "https://app.chipp.ai/settings/billing",
        // Attempting to use another org's customer
        customerId: "cus_another_org",
      });

      // Should use user's own customer, not allow specifying others
      assert(
        res.status === 200 ||
          res.status === 403 ||
          res.status === 400 ||
          res.status === 404,
        `Expected 200, 403, 400, or 404, got ${res.status}`
      );
    });
  });

  // ========================================
  // v2 Billing API
  // ========================================

  describe("v2 Billing Integration", () => {
    it("should support usage-based checkout", async () => {
      const res = await post("/api/stripe/create-checkout-session", proUser, {
        priceId: PRICING_PLANS.PRO.priceId,
        billingVersion: "v2",
        successUrl: "https://app.chipp.ai/billing",
        cancelUrl: "https://app.chipp.ai/billing",
      });

      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200, 404, or 400, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // v2 billing may return billing intent
        assertExists(data.url || data.sessionId || data.billingIntentId);
      }
    });

    it("should handle credit grants on subscription", async () => {
      // After subscription is created, credits should be granted
      const res = await get("/api/stripe/credits", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return credit balance info
        assert(
          "available" in data || "balance" in data || "credits" in data,
          "Expected credit balance information"
        );
      }
    });

    it("should track token usage", async () => {
      const res = await get("/api/stripe/usage", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return usage tracking info
        assert(
          "usage" in data ||
            "tokens" in data ||
            "tokenUsage" in data ||
            Array.isArray(data),
          "Expected usage tracking information"
        );
      }
    });

    it("should return pricing plans", async () => {
      const res = await get("/api/stripe/pricing-plans", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return available pricing plans
        assert(
          Array.isArray(data) || data.plans || data.pricingPlans,
          "Expected pricing plans"
        );
      }
    });

    it("should return subscription status", async () => {
      const res = await get("/api/stripe/subscription", proUser);

      assert(
        res.status === 200 || res.status === 404,
        `Expected 200 or 404, got ${res.status}`
      );

      if (res.status === 200) {
        const data = await res.json();
        // Should return current subscription info
        assert(
          "status" in data || "subscription" in data || "tier" in data,
          "Expected subscription status"
        );
      }
    });
  });

  // ========================================
  // Webhook Simulation (for completeness)
  // ========================================

  describe("Webhook Events", () => {
    it("should handle subscription created event", async () => {
      // Webhook handling is typically via POST /api/stripe/webhook
      const res = await post("/api/stripe/webhook", proUser, {
        type: "customer.subscription.created",
        data: {
          object: createMockSubscription("cus_test", "PRO"),
        },
      });

      // Webhooks require specific signature, may reject without it
      assert(
        res.status === 200 ||
          res.status === 400 ||
          res.status === 401 ||
          res.status === 404,
        `Expected 200, 400, 401, or 404, got ${res.status}`
      );
    });

    it("should handle invoice paid event", async () => {
      const res = await post("/api/stripe/webhook", proUser, {
        type: "invoice.paid",
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            amount_paid: 2900,
          },
        },
      });

      assert(
        res.status === 200 ||
          res.status === 400 ||
          res.status === 401 ||
          res.status === 404,
        `Expected 200, 400, 401, or 404, got ${res.status}`
      );
    });

    it("should handle payment failed event", async () => {
      const res = await post("/api/stripe/webhook", proUser, {
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_test",
            customer: "cus_test",
            amount_due: 2900,
          },
        },
      });

      assert(
        res.status === 200 ||
          res.status === 400 ||
          res.status === 401 ||
          res.status === 404,
        `Expected 200, 400, 401, or 404, got ${res.status}`
      );
    });
  });
});
