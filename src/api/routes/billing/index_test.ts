/**
 * Billing Routes Integration Tests
 *
 * Tests for billing endpoints including credits, usage, subscription, and portal.
 * Uses Hono's app.request() for testing without HTTP overhead.
 *
 * Note: These tests use a mock billing service to avoid database dependencies.
 * For service-level tests, see services/billing.service_test.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AuthContext, User } from "../../middleware/auth.ts";
import { createPortalSessionSchema } from "../../validators/billing.ts";
import type {
  CreditStatus,
  UsageSummary,
  SubscriptionDetails,
} from "../../../services/billing.service.ts";
import type { SubscriptionTier } from "../../../db/schema.ts";

// ========================================
// Mock Billing Service for Unit Testing Routes
// ========================================

interface MockOrganization {
  id: number;
  userId: string;
  usageBasedBillingEnabled: boolean;
  creditsExhausted: boolean;
  subscriptionTier: SubscriptionTier;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

const mockOrganizations = new Map<number, MockOrganization>();
const mockUsageData = new Map<number, UsageSummary>();

const mockBillingService = {
  getOrganizationIdForUser: async (userId: string): Promise<number> => {
    for (const [orgId, org] of mockOrganizations.entries()) {
      if (org.userId === userId) {
        return orgId;
      }
    }
    throw new Error("Organization not found");
  },

  getCreditStatus: async (organizationId: number): Promise<CreditStatus> => {
    const org = mockOrganizations.get(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    if (!org.usageBasedBillingEnabled) {
      return {
        usageBasedBillingEnabled: false,
        creditBalanceCents: 0,
        isExhausted: false,
        isLow: false,
        showWarning: false,
        warningSeverity: "none",
        creditBalanceFormatted: "$0.00",
      };
    }

    const isExhausted = org.creditsExhausted;
    const isLow = false;
    const warningSeverity: "none" | "low" | "exhausted" = isExhausted
      ? "exhausted"
      : isLow
        ? "low"
        : "none";

    return {
      usageBasedBillingEnabled: true,
      creditBalanceCents: isExhausted ? 0 : -1,
      isExhausted,
      isLow,
      showWarning: isExhausted || isLow,
      warningSeverity,
      creditBalanceFormatted: isExhausted ? "$0.00" : "Unknown",
    };
  },

  getUsageSummary: async (
    organizationId: number,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<UsageSummary> => {
    const org = mockOrganizations.get(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const now = new Date();
    const startDate =
      options?.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = options?.endDate || now;

    const cached = mockUsageData.get(organizationId);
    if (cached) {
      return {
        ...cached,
        periodStart: startDate,
        periodEnd: endDate,
      };
    }

    return {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      byModel: [],
      byApplication: [],
      periodStart: startDate,
      periodEnd: endDate,
    };
  },

  getSubscription: async (
    organizationId: number
  ): Promise<SubscriptionDetails> => {
    const org = mockOrganizations.get(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    return {
      tier: org.subscriptionTier,
      stripeSubscriptionId: org.stripeSubscriptionId,
      stripeCustomerId: org.stripeCustomerId,
      usageBasedBillingEnabled: org.usageBasedBillingEnabled,
      creditsExhausted: org.creditsExhausted,
      organizationName: `Organization ${organizationId}`,
      organizationId,
    };
  },
};

// ========================================
// Test App with Mock Service
// ========================================

function createTestApp() {
  const app = new Hono<AuthContext>();

  // Mock auth middleware that sets a test user
  app.use("*", async (c, next) => {
    const user: User = {
      id: "test-user-123",
      email: "test@example.com",
      name: "Test User",
      organizationId: "org-123",
      activeWorkspaceId: null,
      role: "owner",
    };
    c.set("user", user);
    await next();
  });

  // Billing routes (copied from index.ts with mock service)
  app.get("/billing/credits", async (c) => {
    const user = c.get("user");
    const organizationId = await mockBillingService.getOrganizationIdForUser(
      user.id
    );
    const creditStatus =
      await mockBillingService.getCreditStatus(organizationId);
    return c.json({ data: creditStatus });
  });

  app.get("/billing/usage", async (c) => {
    const user = c.get("user");
    const organizationId = await mockBillingService.getOrganizationIdForUser(
      user.id
    );

    const startDateParam = c.req.query("startDate");
    const endDateParam = c.req.query("endDate");

    const options: { startDate?: Date; endDate?: Date } = {};
    if (startDateParam) {
      options.startDate = new Date(startDateParam);
    }
    if (endDateParam) {
      options.endDate = new Date(endDateParam);
    }

    const usage = await mockBillingService.getUsageSummary(
      organizationId,
      options
    );
    return c.json({ data: usage });
  });

  app.get("/billing/subscription", async (c) => {
    const user = c.get("user");
    const organizationId = await mockBillingService.getOrganizationIdForUser(
      user.id
    );
    const subscription =
      await mockBillingService.getSubscription(organizationId);
    return c.json({ data: subscription });
  });

  app.post(
    "/billing/portal",
    zValidator("json", createPortalSessionSchema),
    async (c) => {
      const body = c.req.valid("json");

      return c.json(
        {
          error: "Not implemented",
          message:
            "Billing portal creation is handled by the main API. Use /api/organization/billing-portal instead.",
          returnUrl: body.returnUrl,
        },
        501
      );
    }
  );

  return app;
}

// Clean up between tests
function resetMocks() {
  mockOrganizations.clear();
  mockUsageData.clear();
}

// Helper to create a test organization
function createTestOrganization(
  orgId: number,
  userId: string,
  config: {
    usageBasedBillingEnabled?: boolean;
    creditsExhausted?: boolean;
    subscriptionTier?: SubscriptionTier;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  } = {}
) {
  mockOrganizations.set(orgId, {
    id: orgId,
    userId,
    usageBasedBillingEnabled: config.usageBasedBillingEnabled ?? false,
    creditsExhausted: config.creditsExhausted ?? false,
    subscriptionTier: config.subscriptionTier ?? "FREE",
    stripeSubscriptionId: config.stripeSubscriptionId ?? null,
    stripeCustomerId: config.stripeCustomerId ?? null,
  });
}

// Helper to set usage data for an organization
function setUsageData(orgId: number, data: Partial<UsageSummary>) {
  mockUsageData.set(orgId, {
    totalTokens: data.totalTokens ?? 0,
    inputTokens: data.inputTokens ?? 0,
    outputTokens: data.outputTokens ?? 0,
    byModel: data.byModel ?? [],
    byApplication: data.byApplication ?? [],
    periodStart: data.periodStart ?? new Date(),
    periodEnd: data.periodEnd ?? new Date(),
  });
}

// ========================================
// GET /billing/credits Tests
// ========================================

Deno.test(
  "GET /billing/credits - returns credits disabled when usage billing not enabled",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      usageBasedBillingEnabled: false,
    });
    const app = createTestApp();

    const res = await app.request("/billing/credits");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.usageBasedBillingEnabled, false);
    assertEquals(data.data.isExhausted, false);
    assertEquals(data.data.isLow, false);
    assertEquals(data.data.showWarning, false);
    assertEquals(data.data.warningSeverity, "none");
    assertEquals(data.data.creditBalanceFormatted, "$0.00");
  }
);

Deno.test(
  "GET /billing/credits - returns exhausted state when credits exhausted",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      usageBasedBillingEnabled: true,
      creditsExhausted: true,
    });
    const app = createTestApp();

    const res = await app.request("/billing/credits");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.usageBasedBillingEnabled, true);
    assertEquals(data.data.isExhausted, true);
    assertEquals(data.data.showWarning, true);
    assertEquals(data.data.warningSeverity, "exhausted");
    assertEquals(data.data.creditBalanceCents, 0);
    assertEquals(data.data.creditBalanceFormatted, "$0.00");
  }
);

Deno.test(
  "GET /billing/credits - returns unknown balance when credits not exhausted",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      usageBasedBillingEnabled: true,
      creditsExhausted: false,
    });
    const app = createTestApp();

    const res = await app.request("/billing/credits");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.usageBasedBillingEnabled, true);
    assertEquals(data.data.isExhausted, false);
    assertEquals(data.data.showWarning, false);
    assertEquals(data.data.warningSeverity, "none");
    assertEquals(data.data.creditBalanceCents, -1);
    assertEquals(data.data.creditBalanceFormatted, "Unknown");
  }
);

Deno.test(
  "GET /billing/credits - returns 500 when organization not found",
  async () => {
    resetMocks();
    // No organization created
    const app = createTestApp();

    const res = await app.request("/billing/credits");

    // Service should throw error, which middleware would convert to 500
    assertEquals(res.status, 500);
  }
);

// ========================================
// GET /billing/usage Tests
// ========================================

Deno.test(
  "GET /billing/usage - returns empty usage summary when no data",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const res = await app.request("/billing/usage");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.totalTokens, 0);
    assertEquals(data.data.inputTokens, 0);
    assertEquals(data.data.outputTokens, 0);
    assertEquals(data.data.byModel.length, 0);
    assertEquals(data.data.byApplication.length, 0);
    assertExists(data.data.periodStart);
    assertExists(data.data.periodEnd);
  }
);

Deno.test("GET /billing/usage - returns usage summary with data", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123");
  setUsageData(1, {
    totalTokens: 150000,
    inputTokens: 100000,
    outputTokens: 50000,
    byModel: [
      {
        model: "gpt-4",
        tokens: 100000,
        inputTokens: 70000,
        outputTokens: 30000,
      },
      {
        model: "gpt-3.5-turbo",
        tokens: 50000,
        inputTokens: 30000,
        outputTokens: 20000,
      },
    ],
    byApplication: [
      { applicationId: 1, applicationName: "Chatbot", tokens: 100000 },
      { applicationId: 2, applicationName: "Assistant", tokens: 50000 },
    ],
  });
  const app = createTestApp();

  const res = await app.request("/billing/usage");

  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.data.totalTokens, 150000);
  assertEquals(data.data.inputTokens, 100000);
  assertEquals(data.data.outputTokens, 50000);
  assertEquals(data.data.byModel.length, 2);
  assertEquals(data.data.byModel[0].model, "gpt-4");
  assertEquals(data.data.byModel[0].tokens, 100000);
  assertEquals(data.data.byApplication.length, 2);
  assertEquals(data.data.byApplication[0].applicationName, "Chatbot");
  assertEquals(data.data.byApplication[0].tokens, 100000);
});

Deno.test(
  "GET /billing/usage - accepts startDate query parameter",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const startDate = "2024-01-01T00:00:00Z";
    const res = await app.request(`/billing/usage?startDate=${startDate}`);

    assertEquals(res.status, 200);
    const data = await res.json();
    assertExists(data.data.periodStart);
    // Should use the provided start date
    assertEquals(
      new Date(data.data.periodStart).getTime(),
      new Date(startDate).getTime()
    );
  }
);

Deno.test("GET /billing/usage - accepts endDate query parameter", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123");
  const app = createTestApp();

  const endDate = "2024-12-31T23:59:59Z";
  const res = await app.request(`/billing/usage?endDate=${endDate}`);

  assertEquals(res.status, 200);
  const data = await res.json();
  assertExists(data.data.periodEnd);
  assertEquals(
    new Date(data.data.periodEnd).getTime(),
    new Date(endDate).getTime()
  );
});

Deno.test(
  "GET /billing/usage - accepts both startDate and endDate",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const startDate = "2024-01-01T00:00:00Z";
    const endDate = "2024-12-31T23:59:59Z";
    const res = await app.request(
      `/billing/usage?startDate=${startDate}&endDate=${endDate}`
    );

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(
      new Date(data.data.periodStart).getTime(),
      new Date(startDate).getTime()
    );
    assertEquals(
      new Date(data.data.periodEnd).getTime(),
      new Date(endDate).getTime()
    );
  }
);

Deno.test(
  "GET /billing/usage - defaults to current month when no dates provided",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const res = await app.request("/billing/usage");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertExists(data.data.periodStart);
    assertExists(data.data.periodEnd);

    // Start should be beginning of current month
    const periodStart = new Date(data.data.periodStart);
    const now = new Date();
    assertEquals(periodStart.getMonth(), now.getMonth());
    assertEquals(periodStart.getFullYear(), now.getFullYear());
    assertEquals(periodStart.getDate(), 1);
  }
);

// ========================================
// GET /billing/subscription Tests
// ========================================

Deno.test(
  "GET /billing/subscription - returns FREE tier subscription",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "FREE",
      usageBasedBillingEnabled: false,
      creditsExhausted: false,
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.tier, "FREE");
    assertEquals(data.data.stripeSubscriptionId, null);
    assertEquals(data.data.stripeCustomerId, null);
    assertEquals(data.data.usageBasedBillingEnabled, false);
    assertEquals(data.data.creditsExhausted, false);
    assertEquals(data.data.organizationId, 1);
    assertExists(data.data.organizationName);
  }
);

Deno.test(
  "GET /billing/subscription - returns PRO tier with Stripe details",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "PRO",
      stripeSubscriptionId: "sub_123456789",
      stripeCustomerId: "cus_123456789",
      usageBasedBillingEnabled: true,
      creditsExhausted: false,
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.tier, "PRO");
    assertEquals(data.data.stripeSubscriptionId, "sub_123456789");
    assertEquals(data.data.stripeCustomerId, "cus_123456789");
    assertEquals(data.data.usageBasedBillingEnabled, true);
    assertEquals(data.data.creditsExhausted, false);
  }
);

Deno.test(
  "GET /billing/subscription - returns TEAM tier subscription",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "TEAM",
      stripeSubscriptionId: "sub_team123",
      stripeCustomerId: "cus_team123",
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.tier, "TEAM");
    assertEquals(data.data.stripeSubscriptionId, "sub_team123");
    assertEquals(data.data.stripeCustomerId, "cus_team123");
  }
);

Deno.test(
  "GET /billing/subscription - returns BUSINESS tier subscription",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "BUSINESS",
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.tier, "BUSINESS");
  }
);

Deno.test(
  "GET /billing/subscription - returns ENTERPRISE tier subscription",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "ENTERPRISE",
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.tier, "ENTERPRISE");
  }
);

Deno.test(
  "GET /billing/subscription - includes credits exhausted flag",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "PRO",
      usageBasedBillingEnabled: true,
      creditsExhausted: true,
    });
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.data.creditsExhausted, true);
    assertEquals(data.data.usageBasedBillingEnabled, true);
  }
);

// ========================================
// POST /billing/portal Tests
// ========================================

Deno.test("POST /billing/portal - returns 501 not implemented", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123");
  const app = createTestApp();

  const res = await app.request("/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      returnUrl: "https://app.example.com/settings",
    }),
  });

  assertEquals(res.status, 501);
  const data = await res.json();
  assertEquals(data.error, "Not implemented");
  assertExists(data.message);
  assertEquals(data.returnUrl, "https://app.example.com/settings");
});

Deno.test(
  "POST /billing/portal - validates returnUrl is required",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const res = await app.request("/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test(
  "POST /billing/portal - validates returnUrl is valid URL",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123");
    const app = createTestApp();

    const res = await app.request("/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        returnUrl: "not-a-valid-url",
      }),
    });

    assertEquals(res.status, 400);
  }
);

Deno.test("POST /billing/portal - accepts valid HTTPS URL", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123");
  const app = createTestApp();

  const res = await app.request("/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      returnUrl: "https://app.example.com/billing/return",
    }),
  });

  assertEquals(res.status, 501);
  const data = await res.json();
  assertEquals(data.returnUrl, "https://app.example.com/billing/return");
});

Deno.test("POST /billing/portal - accepts valid HTTP URL", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123");
  const app = createTestApp();

  const res = await app.request("/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      returnUrl: "http://localhost:3000/settings",
    }),
  });

  assertEquals(res.status, 501);
  const data = await res.json();
  assertEquals(data.returnUrl, "http://localhost:3000/settings");
});

// ========================================
// Error Handling Tests
// ========================================

Deno.test(
  "GET /billing/credits - handles missing organization gracefully",
  async () => {
    resetMocks();
    // No organization created for the user
    const app = createTestApp();

    const res = await app.request("/billing/credits");

    // Should return error when organization not found
    assertEquals(res.status, 500);
  }
);

Deno.test(
  "GET /billing/usage - handles missing organization gracefully",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/billing/usage");

    assertEquals(res.status, 500);
  }
);

Deno.test(
  "GET /billing/subscription - handles missing organization gracefully",
  async () => {
    resetMocks();
    const app = createTestApp();

    const res = await app.request("/billing/subscription");

    assertEquals(res.status, 500);
  }
);

// ========================================
// Integration Tests
// ========================================

Deno.test(
  "Integration - full billing flow for PRO tier with usage",
  async () => {
    resetMocks();
    createTestOrganization(1, "test-user-123", {
      subscriptionTier: "PRO",
      stripeSubscriptionId: "sub_pro123",
      stripeCustomerId: "cus_pro123",
      usageBasedBillingEnabled: true,
      creditsExhausted: false,
    });
    setUsageData(1, {
      totalTokens: 500000,
      inputTokens: 300000,
      outputTokens: 200000,
      byModel: [
        {
          model: "gpt-4",
          tokens: 500000,
          inputTokens: 300000,
          outputTokens: 200000,
        },
      ],
      byApplication: [
        { applicationId: 1, applicationName: "Main App", tokens: 500000 },
      ],
    });
    const app = createTestApp();

    // Check subscription
    const subRes = await app.request("/billing/subscription");
    assertEquals(subRes.status, 200);
    const subData = await subRes.json();
    assertEquals(subData.data.tier, "PRO");

    // Check credits
    const creditsRes = await app.request("/billing/credits");
    assertEquals(creditsRes.status, 200);
    const creditsData = await creditsRes.json();
    assertEquals(creditsData.data.usageBasedBillingEnabled, true);
    assertEquals(creditsData.data.isExhausted, false);

    // Check usage
    const usageRes = await app.request("/billing/usage");
    assertEquals(usageRes.status, 200);
    const usageData = await usageRes.json();
    assertEquals(usageData.data.totalTokens, 500000);
    assertEquals(usageData.data.byModel.length, 1);
  }
);

Deno.test("Integration - exhausted credits scenario", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123", {
    subscriptionTier: "PRO",
    usageBasedBillingEnabled: true,
    creditsExhausted: true,
  });
  const app = createTestApp();

  // Check credits show exhausted
  const creditsRes = await app.request("/billing/credits");
  assertEquals(creditsRes.status, 200);
  const creditsData = await creditsRes.json();
  assertEquals(creditsData.data.isExhausted, true);
  assertEquals(creditsData.data.showWarning, true);
  assertEquals(creditsData.data.warningSeverity, "exhausted");

  // Subscription should also reflect exhausted state
  const subRes = await app.request("/billing/subscription");
  assertEquals(subRes.status, 200);
  const subData = await subRes.json();
  assertEquals(subData.data.creditsExhausted, true);
});

Deno.test("Integration - FREE tier without usage billing", async () => {
  resetMocks();
  createTestOrganization(1, "test-user-123", {
    subscriptionTier: "FREE",
    usageBasedBillingEnabled: false,
    creditsExhausted: false,
  });
  const app = createTestApp();

  // Subscription should show FREE tier
  const subRes = await app.request("/billing/subscription");
  assertEquals(subRes.status, 200);
  const subData = await subRes.json();
  assertEquals(subData.data.tier, "FREE");
  assertEquals(subData.data.usageBasedBillingEnabled, false);

  // Credits should show usage billing not enabled
  const creditsRes = await app.request("/billing/credits");
  assertEquals(creditsRes.status, 200);
  const creditsData = await creditsRes.json();
  assertEquals(creditsData.data.usageBasedBillingEnabled, false);
  assertEquals(creditsData.data.showWarning, false);
});
