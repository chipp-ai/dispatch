/**
 * Webhook Routes Tests
 *
 * Comprehensive tests for Stripe and Twilio webhook endpoints.
 * Uses standalone test apps to avoid database dependencies.
 */

import { assertEquals, assertExists } from "@std/assert";
import { Hono } from "hono";

// ========================================
// Test Utilities
// ========================================

/**
 * Compute HMAC-SHA256 signature for Stripe webhooks
 */
async function computeStripeSignature(
  payload: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate Stripe signature header
 */
async function generateStripeSignature(
  payload: string,
  secret: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await computeStripeSignature(payload, timestamp, secret);
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Compute HMAC-SHA1 signature for Twilio webhooks
 */
async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ========================================
// Standalone Test Apps (no database)
// ========================================

/**
 * Create a standalone webhook test app
 * This mirrors the actual webhook routes but uses mocks
 */
function createWebhookTestApp() {
  const app = new Hono();

  // Health check
  app.get("/webhooks/health", (c) => {
    return c.json({
      status: "ok",
      webhooks: ["stripe", "twilio"],
      timestamp: new Date().toISOString(),
    });
  });

  // Stripe webhook middleware
  const stripeMiddleware = async (
    c: {
      req: {
        header: (name: string) => string | undefined;
        text: () => Promise<string>;
        query: (name: string) => string | undefined;
      };
      json: (data: unknown, status?: number) => Response;
    },
    next: () => Promise<void>
  ) => {
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
    }

    const testMode = c.req.query("testMode") === "true";
    const secret = testMode
      ? Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST")
      : Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE");

    if (!secret) {
      return c.json({ error: "Webhook secret not configured" }, 500);
    }

    const payload = await c.req.text();

    // Parse signature header
    const parts = signature.split(",");
    let timestamp = "";
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") signatures.push(value);
    }

    if (!timestamp || signatures.length === 0) {
      return c.json({ error: "Invalid signature format" }, 401);
    }

    // Check timestamp (within 5 minutes)
    const timestampNum = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNum) > 300) {
      return c.json({ error: "Signature expired" }, 401);
    }

    // Verify signature
    const expectedSig = await computeStripeSignature(
      payload,
      timestamp,
      secret
    );
    const isValid = signatures.some((sig) => sig === expectedSig);

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    await next();
  };

  // Stripe webhook handler
  app.post("/webhooks/stripe", stripeMiddleware, async (c) => {
    try {
      const payload = await c.req.text();
      JSON.parse(payload); // Validate JSON
      return c.json({ received: true });
    } catch {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }
  });

  // Twilio webhook middleware
  const twilioMiddleware = async (
    c: {
      req: {
        header: (name: string) => string | undefined;
        parseBody: () => Promise<Record<string, string>>;
        url: string;
      };
      json: (data: unknown, status?: number) => Response;
      set: (key: string, value: Record<string, string>) => void;
    },
    next: () => Promise<void>
  ) => {
    if (Deno.env.get("SKIP_TWILIO_VERIFICATION") === "true") {
      await next();
      return;
    }

    const signature = c.req.header("X-Twilio-Signature");
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
    }

    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      return c.json({ error: "Auth token not configured" }, 500);
    }

    const body = await c.req.parseBody();
    const url = new URL(c.req.url);
    const fullUrl = `http://localhost:8000${url.pathname}`;

    const expectedSig = await computeTwilioSignature(
      fullUrl,
      body as Record<string, string>,
      authToken
    );

    if (signature !== expectedSig) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    c.set("twilioBody", body as Record<string, string>);
    await next();
  };

  // Twilio voice webhook handler
  app.post("/webhooks/twilio", twilioMiddleware, async (c) => {
    const body = await c.req.parseBody();
    const calledNumber = body.Called || body.To;

    if (!calledNumber) {
      const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we could not determine the destination for your call.</Say>
  <Hangup/>
</Response>`;
      return new Response(errorXml, {
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const sipHost = Deno.env.get("LIVEKIT_SIP_HOST");
    const sipPassword = Deno.env.get("LIVEKIT_SIP_PASSWORD");

    if (sipHost && sipPassword) {
      const sipXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>sip:${calledNumber}@${sipHost}</Sip>
  </Dial>
</Response>`;
      return new Response(sipXml, {
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const defaultXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hello, this is a test response.</Say>
</Response>`;
    return new Response(defaultXml, {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  });

  // Twilio status callback handler
  app.post("/webhooks/twilio/status", twilioMiddleware, async (_c) => {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  return app;
}

// ========================================
// Health Check Tests
// ========================================

Deno.test("GET /webhooks/health - returns ok status", async () => {
  const app = createWebhookTestApp();
  const res = await app.request("/webhooks/health");

  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.status, "ok");
  assertEquals(data.webhooks, ["stripe", "twilio"]);
  assertExists(data.timestamp);
});

// ========================================
// Stripe Webhook Tests
// ========================================

Deno.test(
  "POST /webhooks/stripe - valid signature accepts webhook",
  async () => {
    const webhookSecret = "whsec_test123456";
    Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", webhookSecret);

    const app = createWebhookTestApp();

    const event = {
      id: "evt_test123",
      type: "customer.subscription.created",
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_test123",
          customer: "cus_test123",
          status: "active",
          metadata: { organizationId: "org123" },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = await generateStripeSignature(payload, webhookSecret);

    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.received, true);
  }
);

Deno.test("POST /webhooks/stripe - missing signature returns 401", async () => {
  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
  };

  const res = await app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  assertEquals(res.status, 401);
});

Deno.test("POST /webhooks/stripe - invalid signature returns 401", async () => {
  const webhookSecret = "whsec_test123456";
  Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", webhookSecret);

  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
  };

  const payload = JSON.stringify(event);
  const invalidSignature = `t=${Math.floor(Date.now() / 1000)},v1=invalid_signature`;

  const res = await app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": invalidSignature,
    },
    body: payload,
  });

  assertEquals(res.status, 401);
});

Deno.test("POST /webhooks/stripe - expired timestamp returns 401", async () => {
  const webhookSecret = "whsec_test123456";
  Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", webhookSecret);

  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
  };

  const payload = JSON.stringify(event);

  // Use a timestamp from 10 minutes ago (outside 5-minute tolerance)
  const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
  const signature = await computeStripeSignature(
    payload,
    oldTimestamp.toString(),
    webhookSecret
  );
  const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

  const res = await app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signatureHeader,
    },
    body: payload,
  });

  assertEquals(res.status, 401);
});

Deno.test("POST /webhooks/stripe - test mode uses correct secret", async () => {
  const liveSecret = "whsec_live123";
  const testSecret = "whsec_test456";
  Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", liveSecret);
  Deno.env.set("STRIPE_WEBHOOK_SECRET_TEST", testSecret);

  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_test123",
        customer: "cus_test123",
        status: "active",
        metadata: {},
      },
    },
  };

  const payload = JSON.stringify(event);
  const signature = await generateStripeSignature(payload, testSecret);

  const res = await app.request("/webhooks/stripe?testMode=true", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  assertEquals(res.status, 200);
});

Deno.test(
  "POST /webhooks/stripe - handles invalid JSON gracefully",
  async () => {
    const webhookSecret = "whsec_test123456";
    Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", webhookSecret);

    const app = createWebhookTestApp();

    const invalidPayload = "{ invalid json";
    const signature = await generateStripeSignature(
      invalidPayload,
      webhookSecret
    );

    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: invalidPayload,
    });

    assertEquals(res.status, 400);

    const data = await res.json();
    assertEquals(data.error, "Invalid JSON payload");
  }
);

Deno.test("Stripe webhook - malformed signature header format", async () => {
  Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", "whsec_test123");

  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: {} },
  };

  const res = await app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "malformed_header_without_equals",
    },
    body: JSON.stringify(event),
  });

  assertEquals(res.status, 401);
});

Deno.test("Stripe webhook - multiple signatures (one valid)", async () => {
  const webhookSecret = "whsec_test123456";
  Deno.env.set("STRIPE_WEBHOOK_SECRET_LIVE", webhookSecret);

  const app = createWebhookTestApp();

  const event = {
    id: "evt_test123",
    type: "customer.subscription.created",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "sub_test123",
        customer: "cus_test123",
        status: "active",
        metadata: {},
      },
    },
  };

  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const validSig = await computeStripeSignature(
    payload,
    timestamp,
    webhookSecret
  );
  const invalidSig = "invalid_signature_12345";

  // Multiple signatures, one valid
  const signatureHeader = `t=${timestamp},v1=${invalidSig},v1=${validSig}`;

  const res = await app.request("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signatureHeader,
    },
    body: payload,
  });

  assertEquals(res.status, 200);

  const data = await res.json();
  assertEquals(data.received, true);
});

// ========================================
// Twilio Webhook Tests
// ========================================

Deno.test(
  "POST /webhooks/twilio - valid signature accepts webhook",
  async () => {
    const authToken = "test_auth_token_123";
    Deno.env.set("TWILIO_AUTH_TOKEN", authToken);
    Deno.env.delete("SKIP_TWILIO_VERIFICATION");

    const app = createWebhookTestApp();

    const params = {
      CallSid: "CA1234567890",
      AccountSid: "AC1234567890",
      From: "+15551234567",
      To: "+15559876543",
      Called: "+15559876543",
      Caller: "+15551234567",
      CallStatus: "ringing",
      Direction: "inbound",
      ApiVersion: "2010-04-01",
    };

    const body = new URLSearchParams(params).toString();
    const url = "http://localhost:8000/webhooks/twilio";
    const signature = await computeTwilioSignature(url, params, authToken);

    const res = await app.request("/webhooks/twilio", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "text/xml; charset=utf-8");

    const xml = await res.text();
    assertExists(xml);
    assertEquals(xml.includes("<?xml version="), true);
    assertEquals(xml.includes("<Response>"), true);
  }
);

Deno.test("POST /webhooks/twilio - missing signature returns 401", async () => {
  Deno.env.set("TWILIO_AUTH_TOKEN", "test_auth_token_123");
  Deno.env.delete("SKIP_TWILIO_VERIFICATION");

  const app = createWebhookTestApp();

  const params = {
    CallSid: "CA1234567890",
    From: "+15551234567",
    To: "+15559876543",
  };

  const body = new URLSearchParams(params).toString();

  const res = await app.request("/webhooks/twilio", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  assertEquals(res.status, 401);
});

Deno.test("POST /webhooks/twilio - invalid signature returns 401", async () => {
  Deno.env.set("TWILIO_AUTH_TOKEN", "test_auth_token_123");
  Deno.env.delete("SKIP_TWILIO_VERIFICATION");

  const app = createWebhookTestApp();

  const params = {
    CallSid: "CA1234567890",
    From: "+15551234567",
    To: "+15559876543",
  };

  const body = new URLSearchParams(params).toString();

  const res = await app.request("/webhooks/twilio", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": "invalid_signature",
    },
    body,
  });

  assertEquals(res.status, 401);
});

Deno.test(
  "POST /webhooks/twilio - returns error TwiML when missing Called param",
  async () => {
    const authToken = "test_auth_token_123";
    Deno.env.set("TWILIO_AUTH_TOKEN", authToken);
    Deno.env.delete("SKIP_TWILIO_VERIFICATION");

    const app = createWebhookTestApp();

    const params = {
      CallSid: "CA1234567890",
      From: "+15551234567",
      // Missing To/Called parameter
    };

    const body = new URLSearchParams(params).toString();
    const url = "http://localhost:8000/webhooks/twilio";
    const signature = await computeTwilioSignature(url, params, authToken);

    const res = await app.request("/webhooks/twilio", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assertEquals(res.status, 200);

    const xml = await res.text();
    assertEquals(xml.includes("<Say"), true);
    assertEquals(xml.includes("could not determine the destination"), true);
  }
);

Deno.test(
  "POST /webhooks/twilio - routes to LiveKit SIP when configured",
  async () => {
    const authToken = "test_auth_token_123";
    Deno.env.set("TWILIO_AUTH_TOKEN", authToken);
    Deno.env.set("LIVEKIT_SIP_HOST", "sip.example.com");
    Deno.env.set("LIVEKIT_SIP_PASSWORD", "test_password");
    Deno.env.delete("SKIP_TWILIO_VERIFICATION");

    const app = createWebhookTestApp();

    const params = {
      CallSid: "CA1234567890",
      From: "+15551234567",
      To: "+15559876543",
      Called: "+15559876543",
    };

    const body = new URLSearchParams(params).toString();
    const url = "http://localhost:8000/webhooks/twilio";
    const signature = await computeTwilioSignature(url, params, authToken);

    const res = await app.request("/webhooks/twilio", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assertEquals(res.status, 200);

    const xml = await res.text();
    assertEquals(xml.includes("<Dial>"), true);
    assertEquals(xml.includes("<Sip"), true);
    assertEquals(xml.includes("sip.example.com"), true);

    // Clean up
    Deno.env.delete("LIVEKIT_SIP_HOST");
    Deno.env.delete("LIVEKIT_SIP_PASSWORD");
  }
);

Deno.test(
  "POST /webhooks/twilio/status - valid signature accepts callback",
  async () => {
    const authToken = "test_auth_token_123";
    Deno.env.set("TWILIO_AUTH_TOKEN", authToken);
    Deno.env.delete("SKIP_TWILIO_VERIFICATION");

    const app = createWebhookTestApp();

    const params = {
      CallSid: "CA1234567890",
      CallStatus: "completed",
      CallDuration: "42",
    };

    const body = new URLSearchParams(params).toString();
    const url = "http://localhost:8000/webhooks/twilio/status";
    const signature = await computeTwilioSignature(url, params, authToken);

    const res = await app.request("/webhooks/twilio/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assertEquals(res.status, 200);

    const data = await res.json();
    assertEquals(data.received, true);
  }
);
