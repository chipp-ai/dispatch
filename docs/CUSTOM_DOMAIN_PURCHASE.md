# Custom Domain Purchase System

## Overview

Enable Chipp builders to purchase custom domains directly within the platform using Stripe Checkout, with automatic DNS configuration via Cloudflare Registrar.

**Key insight:** This is a multi-tenant system. One Svelte bundle serves all custom domains, with a Cloudflare Worker injecting tenant-specific configuration based on the incoming hostname.

## Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Multi-Tenant Hosting Flow                            │
└─────────────────────────────────────────────────────────────────────────────┘

  mychat.com                    theirchat.ai                 anotherchat.io
       │                              │                             │
       └──────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   Cloudflare Worker    │
                         │   (Config Injection)   │
                         └────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            1. Read hostname   2. Lookup config   3. Inject into HTML
               from request       from KV/API        before serving
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   Cloudflare Pages     │
                         │   (Static Svelte SPA)  │
                         └────────────────────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   Chipp Deno API       │
                         │   (Chat, Auth, Data)   │
                         └────────────────────────┘
```

### How Config Injection Works

**Cloudflare Worker** intercepts every request and:

1. Extracts `hostname` from the request
2. Looks up tenant config from Cloudflare KV (or API fallback)
3. Fetches the static HTML from Pages
4. Injects a `<script>` tag with tenant config
5. Returns the modified HTML

```typescript
// Cloudflare Worker: workers/tenant-config.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Lookup tenant config from KV
    const configJson = await env.TENANT_CONFIG.get(hostname);

    if (!configJson) {
      // Unknown domain - could redirect to main site or show error
      return new Response("Domain not configured", { status: 404 });
    }

    const config = JSON.parse(configJson);

    // Fetch the static asset from Pages
    const pageResponse = await env.ASSETS.fetch(request);

    // Only inject config into HTML pages
    const contentType = pageResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return pageResponse;
    }

    // Read and modify HTML
    let html = await pageResponse.text();

    // Inject tenant config before </head>
    const configScript = `
      <script>
        window.__CHIPP_CONFIG__ = ${JSON.stringify(config)};
      </script>
    `;
    html = html.replace("</head>", `${configScript}</head>`);

    return new Response(html, {
      headers: {
        ...Object.fromEntries(pageResponse.headers),
        "content-type": "text/html; charset=utf-8",
      },
    });
  },
};
```

### Tenant Config Structure

```typescript
interface TenantConfig {
  appId: string; // The Chipp application ID
  apiUrl: string; // API endpoint (could vary per tenant)

  // Branding
  appName: string;
  logoUrl?: string;
  faviconUrl?: string;

  // Theming (CSS variables)
  theme: {
    primaryColor: string; // e.g., "#6366f1"
    backgroundColor: string;
    textColor: string;
    fontFamily?: string;
  };

  // Features
  features: {
    showPoweredBy: boolean; // "Powered by Chipp" badge
    allowFileUploads: boolean;
    enableVoice: boolean;
  };
}
```

### Svelte App Reads Config

```typescript
// web/src/lib/config.ts
export function getTenantConfig(): TenantConfig {
  // In production: injected by Cloudflare Worker
  if (typeof window !== "undefined" && window.__CHIPP_CONFIG__) {
    return window.__CHIPP_CONFIG__;
  }

  // Development fallback
  return {
    appId: import.meta.env.VITE_APP_ID || "dev-app",
    apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
    appName: "Chipp Chat",
    theme: {
      primaryColor: "#6366f1",
      backgroundColor: "#ffffff",
      textColor: "#1f2937",
    },
    features: {
      showPoweredBy: true,
      allowFileUploads: true,
      enableVoice: false,
    },
  };
}

// Type augmentation
declare global {
  interface Window {
    __CHIPP_CONFIG__?: TenantConfig;
  }
}
```

### Cloudflare KV for Config Storage

When a domain is purchased/configured, we store the config in Cloudflare KV:

```typescript
// After domain purchase webhook
await env.TENANT_CONFIG.put(
  "mychat.com",
  JSON.stringify({
    appId: "app_abc123",
    apiUrl: "https://api.chipp.ai",
    appName: "My Cool Chat",
    theme: {
      primaryColor: "#10b981",
      backgroundColor: "#f9fafb",
      textColor: "#111827",
    },
    features: {
      showPoweredBy: false, // Premium feature
      allowFileUploads: true,
      enableVoice: true,
    },
  })
);
```

## White-Label Multi-Tenancy

Both the **builder admin panel** and **consumer chat** need white-labeling. Currently this exists only for single-tenant (enterprise) deployments. The goal is to offer white-labeling in a multi-tenant way by injecting config into the static bundle at the edge.

### What Gets White-Labeled

| Component                | Example Domains                         | White-Label Features                               |
| ------------------------ | --------------------------------------- | -------------------------------------------------- |
| **Builder Admin Panel**  | `admin.acme.com`, `dashboard.agency.io` | Logo, colors, favicon, app name, OAuth branding    |
| **Consumer Chat Widget** | `chat.acme.com`, `support.agency.io`    | Logo, colors, "Powered by" removal, custom welcome |

### Architecture: Both SPAs Use Same Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Cloudflare Multi-Tenant Stack                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Custom Admin Domains              Custom Chat Domains                      │
│   ─────────────────────             ────────────────────                     │
│   admin.acme.com                    chat.acme.com                            │
│   dashboard.agency.io               support.agency.io                        │
│   app.bigcorp.ai                    help.bigcorp.ai                          │
│          │                                  │                                │
│          ▼                                  ▼                                │
│   ┌─────────────────────┐          ┌─────────────────────┐                  │
│   │  Cloudflare Worker  │          │  Cloudflare Worker  │                  │
│   │  (Admin Config)     │          │  (Chat Config)      │                  │
│   └─────────────────────┘          └─────────────────────┘                  │
│          │                                  │                                │
│          ▼                                  ▼                                │
│   ┌─────────────────────┐          ┌─────────────────────┐                  │
│   │  Cloudflare Pages   │          │  Cloudflare Pages   │                  │
│   │  (Admin SPA)        │          │  (Chat SPA)         │                  │
│   │  web/dist/          │          │  chat-widget/dist/  │                  │
│   └─────────────────────┘          └─────────────────────┘                  │
│          │                                  │                                │
│          └──────────────┬───────────────────┘                                │
│                         ▼                                                    │
│              ┌─────────────────────────┐                                     │
│              │   Cloudflare KV         │                                     │
│              │   TENANT_CONFIG         │                                     │
│              │   ───────────────       │                                     │
│              │   admin.acme.com → {}   │                                     │
│              │   chat.acme.com → {}    │                                     │
│              └─────────────────────────┘                                     │
│                         │                                                    │
│                         ▼                                                    │
│              ┌─────────────────────────┐                                     │
│              │     Chipp Deno API      │                                     │
│              │         (GKE)           │                                     │
│              └─────────────────────────┘                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Admin Panel Config (Organization-Level)

```typescript
interface AdminTenantConfig {
  // Organization identity
  organizationId: string;
  organizationSlug: string;

  // API endpoints
  apiUrl: string;

  // Branding
  branding: {
    appName: string; // "Acme AI Platform"
    logoUrl: string; // Organization logo
    faviconUrl: string;
    supportEmail?: string;
  };

  // Theming (CSS variables)
  theme: {
    primaryColor: string; // Main brand color
    accentColor: string;
    backgroundColor: string;
    sidebarColor: string;
    textColor: string;
    fontFamily?: string;
  };

  // OAuth customization
  oauth: {
    googleEnabled: boolean;
    microsoftEnabled: boolean;
    // Custom OIDC for enterprise SSO
    customOidc?: {
      issuer: string;
      clientId: string;
      buttonText: string; // "Sign in with Acme SSO"
    };
  };

  // Feature flags
  features: {
    showChippBranding: boolean; // "Powered by Chipp" in footer
    marketplaceEnabled: boolean;
    voiceAgentsEnabled: boolean;
    customActionsEnabled: boolean;
  };
}
```

### Chat Widget Config (App-Level)

```typescript
interface ChatTenantConfig {
  // App identity
  appId: string;
  organizationId: string;

  // API endpoints
  apiUrl: string;
  wsUrl: string;

  // Branding
  branding: {
    appName: string; // "Acme Support Bot"
    logoUrl?: string;
    avatarUrl?: string; // Bot avatar
    welcomeMessage?: string;
  };

  // Theming
  theme: {
    primaryColor: string;
    backgroundColor: string;
    userBubbleColor: string;
    botBubbleColor: string;
    fontFamily?: string;
  };

  // Features
  features: {
    showPoweredBy: boolean;
    allowFileUploads: boolean;
    enableVoice: boolean;
    enableFeedback: boolean; // Thumbs up/down
  };
}
```

### KV Key Structure

```
TENANT_CONFIG KV Namespace:
├── admin:admin.acme.com     → AdminTenantConfig (JSON)
├── admin:dashboard.agency.io → AdminTenantConfig (JSON)
├── chat:chat.acme.com       → ChatTenantConfig (JSON)
├── chat:support.agency.io   → ChatTenantConfig (JSON)
└── ...
```

### Unified Worker (Handles Both)

```typescript
// workers/tenant-router.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Determine if this is an admin or chat domain
    // Option 1: Check KV for both prefixes
    let config = await env.TENANT_CONFIG.get(`admin:${hostname}`);
    let appType: "admin" | "chat" = "admin";

    if (!config) {
      config = await env.TENANT_CONFIG.get(`chat:${hostname}`);
      appType = "chat";
    }

    if (!config) {
      // Unknown domain - redirect to main site or show error
      return Response.redirect("https://chipp.ai", 302);
    }

    // Fetch from the appropriate Pages project
    const pagesProject =
      appType === "admin"
        ? env.ADMIN_ASSETS // Binding to admin Pages project
        : env.CHAT_ASSETS; // Binding to chat Pages project

    const pageResponse = await pagesProject.fetch(request);

    // Only inject config into HTML
    const contentType = pageResponse.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return pageResponse;
    }

    let html = await pageResponse.text();

    // Inject tenant config
    const configScript = `
      <script>
        window.__CHIPP_CONFIG__ = ${config};
        window.__CHIPP_APP_TYPE__ = "${appType}";
      </script>
    `;
    html = html.replace("</head>", `${configScript}</head>`);

    return new Response(html, {
      headers: {
        ...Object.fromEntries(pageResponse.headers),
        "content-type": "text/html; charset=utf-8",
      },
    });
  },
};
```

### Migration from Per-Customer Instances

**Current architecture (chipp-admin):**

- Each white-label customer gets their own GKE deployment
- Separate Next.js instance, separate env vars, separate maintenance
- Expensive: N customers = N deployments
- Slow to update: Must deploy to each instance

**New architecture (chipp-deno + Cloudflare):**

- Single static SPA on Cloudflare Pages
- Single API on GKE (shared)
- Config injected at edge via Cloudflare Worker
- Cheap: N customers = 1 deployment + N KV entries
- Instant updates: Change KV, instantly live

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BEFORE: Per-Instance                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   admin.acme.com        admin.bigcorp.com       admin.agency.io             │
│         │                      │                      │                      │
│         ▼                      ▼                      ▼                      │
│   ┌───────────┐          ┌───────────┐          ┌───────────┐               │
│   │ GKE Pod   │          │ GKE Pod   │          │ GKE Pod   │               │
│   │ Next.js   │          │ Next.js   │          │ Next.js   │               │
│   │ + API     │          │ + API     │          │ + API     │               │
│   │ + DB      │          │ + DB      │          │ + DB      │               │
│   └───────────┘          └───────────┘          └───────────┘               │
│                                                                              │
│   Cost: $$$  Maintenance: High  Deploy time: Slow                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            AFTER: Multi-Tenant Edge                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   admin.acme.com        admin.bigcorp.com       admin.agency.io             │
│         │                      │                      │                      │
│         └──────────────────────┼──────────────────────┘                      │
│                                ▼                                             │
│                    ┌─────────────────────┐                                   │
│                    │  Cloudflare Worker  │  ← Config from KV                 │
│                    └─────────────────────┘                                   │
│                                │                                             │
│                                ▼                                             │
│                    ┌─────────────────────┐                                   │
│                    │  Cloudflare Pages   │  ← Single static bundle           │
│                    │  (Svelte SPA)       │                                   │
│                    └─────────────────────┘                                   │
│                                │                                             │
│                                ▼                                             │
│                    ┌─────────────────────┐                                   │
│                    │    GKE (Single)     │  ← Shared API                     │
│                    │    Deno API + DB    │                                   │
│                    └─────────────────────┘                                   │
│                                                                              │
│   Cost: $  Maintenance: Low  Deploy time: Instant                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Migration steps:**

1. Deploy chipp-deno API to GKE (shared instance)
2. Deploy Svelte SPA to Cloudflare Pages
3. Set up Cloudflare Worker with KV bindings
4. For each existing white-label customer:
   - Extract their config from current deployment
   - Store in Cloudflare KV: `admin:{domain}` → config JSON
   - Update DNS to point to Cloudflare Worker
5. Decommission old per-customer GKE deployments

## Domain Purchase Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Custom Domain Purchase Flow                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────────────┐
│  Builder │───▶│ Domain Search │───▶│   Stripe    │───▶│ Cloudflare Purchase│
│   (UI)   │    │     API      │    │  Checkout   │    │    + DNS Setup     │
└──────────┘    └──────────────┘    └─────────────┘    └────────────────────┘
                       │                    │                     │
                       ▼                    ▼                     ▼
              ┌────────────────┐   ┌──────────────┐    ┌──────────────────┐
              │   Cloudflare   │   │   Webhook    │    │  Domain Record   │
              │  Registrar API │   │   Handler    │    │   in Database    │
              └────────────────┘   └──────────────┘    └──────────────────┘
```

## Why Cloudflare Registrar?

1. **At-cost pricing** - No markup on domains (~$10.11/year for .com)
2. **Unified platform** - Same provider for hosting, DNS, and SSL
3. **Automatic SSL** - Universal SSL certificates included
4. **Excellent API** - Full programmatic control
5. **No transfer fees** - Easy domain management
6. **Cloudflare Pages integration** - Seamless with our Svelte SPA hosting

## Components

### 1. Domain Search & Availability

**Endpoint:** `GET /api/domains/search?query=mydomain`

```typescript
interface DomainSearchResult {
  domain: string;
  available: boolean;
  premium: boolean;
  price: {
    registration: number; // First year price in cents
    renewal: number; // Annual renewal price in cents
  };
  tlds: DomainTLD[];
}

interface DomainTLD {
  tld: string; // e.g., ".com", ".ai", ".io"
  available: boolean;
  price: number; // in cents
}
```

**Cloudflare API:**

```bash
# Check domain availability
GET https://api.cloudflare.com/client/v4/accounts/{account_id}/registrar/domains/check?domain=example.com
```

### 2. Stripe Product Configuration

Create Stripe products for domain purchases:

```typescript
// Domain registration products (one per TLD pricing tier)
const DOMAIN_PRODUCTS = {
  com: {
    priceId: "price_domain_com",
    registrationPrice: 1499, // $14.99 (includes our markup)
    renewalPrice: 1499,
    cloudflarePrice: 1011, // Cloudflare at-cost: $10.11
  },
  ai: {
    priceId: "price_domain_ai",
    registrationPrice: 9999, // $99.99
    renewalPrice: 9999,
    cloudflarePrice: 8000,
  },
  io: {
    priceId: "price_domain_io",
    registrationPrice: 4999, // $49.99
    renewalPrice: 4999,
    cloudflarePrice: 4000,
  },
};
```

**Stripe Checkout Session:**

```typescript
const session = await stripe.checkout.sessions.create({
  mode: "subscription", // Annual renewal
  line_items: [
    {
      price: DOMAIN_PRODUCTS[tld].priceId,
      quantity: 1,
    },
  ],
  metadata: {
    type: "domain_purchase",
    domain: "mychat.com",
    applicationId: "app_123",
    userId: "user_456",
  },
  subscription_data: {
    metadata: {
      domain: "mychat.com",
      applicationId: "app_123",
    },
  },
  success_url: `${APP_URL}/settings/domain?success=true`,
  cancel_url: `${APP_URL}/settings/domain?canceled=true`,
});
```

### 3. Webhook Handler

**Stripe Webhook Events:**

```typescript
// checkout.session.completed - Initial purchase
async function handleDomainPurchase(session: Stripe.Checkout.Session) {
  const { domain, applicationId, userId } = session.metadata;

  // 1. Register domain with Cloudflare
  const registration = await cloudflare.registrar.domains.register({
    account_id: CLOUDFLARE_ACCOUNT_ID,
    domain: domain,
    auto_renew: false, // We handle renewal via Stripe
  });

  // 2. Create DNS zone
  const zone = await cloudflare.zones.create({
    account_id: CLOUDFLARE_ACCOUNT_ID,
    name: domain,
  });

  // 3. Configure DNS records for chat widget
  await configureDNSRecords(zone.id, applicationId);

  // 4. Store in database
  await db.insert(customDomains).values({
    id: generateId(),
    applicationId,
    userId,
    domain,
    cloudflareZoneId: zone.id,
    stripeSubscriptionId: session.subscription,
    status: "provisioning",
    expiresAt: addYears(new Date(), 1),
  });
}

// invoice.payment_succeeded - Annual renewal
async function handleDomainRenewal(invoice: Stripe.Invoice) {
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription
  );
  const { domain } = subscription.metadata;

  // Renew with Cloudflare
  await cloudflare.registrar.domains.renew({
    account_id: CLOUDFLARE_ACCOUNT_ID,
    domain: domain,
    years: 1,
  });

  // Update expiration in database
  await db
    .update(customDomains)
    .set({ expiresAt: addYears(new Date(), 1) })
    .where(eq(customDomains.domain, domain));
}

// customer.subscription.deleted - Cancellation
async function handleDomainCancellation(subscription: Stripe.Subscription) {
  const { domain, applicationId } = subscription.metadata;

  // Mark as expiring (don't delete immediately - domain stays until expiry)
  await db
    .update(customDomains)
    .set({ status: "expiring", autoRenew: false })
    .where(eq(customDomains.domain, domain));

  // Notify user
  await sendDomainExpirationNotice(applicationId, domain);
}
```

### 4. DNS Configuration

**Records for Chat Widget:**

```typescript
async function configureDNSRecords(zoneId: string, applicationId: string) {
  // Point to Cloudflare Pages (our Svelte SPA hosting)
  await cloudflare.dns.records.create({
    zone_id: zoneId,
    type: "CNAME",
    name: "@",
    content: "chipp-chat.pages.dev", // Our Cloudflare Pages project
    proxied: true,
  });

  // WWW redirect
  await cloudflare.dns.records.create({
    zone_id: zoneId,
    type: "CNAME",
    name: "www",
    content: "chipp-chat.pages.dev",
    proxied: true,
  });

  // TXT record for verification
  await cloudflare.dns.records.create({
    zone_id: zoneId,
    type: "TXT",
    name: "_chipp",
    content: `app=${applicationId}`,
  });
}
```

**Cloudflare Pages Custom Domain:**

```typescript
// Add custom domain to our Pages project
await cloudflare.pages.projects.domains.create({
  account_id: CLOUDFLARE_ACCOUNT_ID,
  project_name: "chipp-chat",
  domain: purchasedDomain,
});
```

### 5. Database Schema

```sql
-- migrations/XXX_custom_domains.sql

CREATE TABLE custom_domains (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  domain TEXT NOT NULL UNIQUE,

  -- Cloudflare
  cloudflare_zone_id TEXT,
  cloudflare_domain_id TEXT,

  -- Stripe
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, provisioning, active, expiring, expired
  auto_renew BOOLEAN NOT NULL DEFAULT true,

  -- Dates
  purchased_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_domains_application ON custom_domains(application_id);
CREATE INDEX idx_custom_domains_user ON custom_domains(user_id);
CREATE INDEX idx_custom_domains_status ON custom_domains(status);
CREATE INDEX idx_custom_domains_expires ON custom_domains(expires_at);
```

```typescript
// db/schema.ts addition
export const customDomains = pgTable("custom_domains", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  domain: text("domain").notNull().unique(),

  cloudflareZoneId: text("cloudflare_zone_id"),
  cloudflareDomainId: text("cloudflare_domain_id"),

  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),

  status: text("status").notNull().default("pending"),
  autoRenew: boolean("auto_renew").notNull().default(true),

  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

## API Endpoints

### Domain Search

```typescript
// GET /api/domains/search?query=mycoolchat
router.get("/domains/search", async (c) => {
  const query = c.req.query("query");

  // Clean the query (remove invalid characters, extract base name)
  const baseName = sanitizeDomainName(query);

  // Check multiple TLDs in parallel
  const tlds = ["com", "ai", "io", "co", "app"];
  const results = await Promise.all(
    tlds.map((tld) => checkDomainAvailability(`${baseName}.${tld}`))
  );

  return c.json({
    query: baseName,
    results: results.filter((r) => r.available),
    unavailable: results.filter((r) => !r.available),
  });
});
```

### Purchase Domain

```typescript
// POST /api/domains/purchase
router.post("/domains/purchase", authMiddleware, async (c) => {
  const { domain, applicationId } = await c.req.json();
  const user = c.get("user");

  // Validate domain is available
  const availability = await checkDomainAvailability(domain);
  if (!availability.available) {
    return c.json({ error: "Domain not available" }, 400);
  }

  // Validate user owns the application
  const app = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
  });
  if (!app || app.userId !== user.id) {
    return c.json({ error: "Application not found" }, 404);
  }

  // Create Stripe Checkout session
  const tld = domain.split(".").pop();
  const session = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId,
    mode: "subscription",
    line_items: [
      {
        price: DOMAIN_PRODUCTS[tld].priceId,
        quantity: 1,
      },
    ],
    metadata: {
      type: "domain_purchase",
      domain,
      applicationId,
      userId: user.id,
    },
    success_url: `${APP_URL}/builder/${applicationId}/settings?domain=success`,
    cancel_url: `${APP_URL}/builder/${applicationId}/settings?domain=canceled`,
  });

  return c.json({ checkoutUrl: session.url });
});
```

### Domain Status

```typescript
// GET /api/domains/:domain/status
router.get("/domains/:domain/status", authMiddleware, async (c) => {
  const domain = c.req.param("domain");
  const user = c.get("user");

  const domainRecord = await db.query.customDomains.findFirst({
    where: and(
      eq(customDomains.domain, domain),
      eq(customDomains.userId, user.id)
    ),
  });

  if (!domainRecord) {
    return c.json({ error: "Domain not found" }, 404);
  }

  // Check SSL status from Cloudflare
  const sslStatus = await cloudflare.ssl.verification.get({
    zone_id: domainRecord.cloudflareZoneId,
  });

  return c.json({
    domain: domainRecord.domain,
    status: domainRecord.status,
    ssl: sslStatus.status,
    expiresAt: domainRecord.expiresAt,
    autoRenew: domainRecord.autoRenew,
  });
});
```

## UI Components

### Domain Search Component

```svelte
<!-- DomainSearch.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  let query = '';
  let results: DomainResult[] = [];
  let loading = false;

  const dispatch = createEventDispatcher();

  async function searchDomains() {
    if (query.length < 2) return;

    loading = true;
    const response = await fetch(`/api/domains/search?query=${encodeURIComponent(query)}`);
    results = await response.json();
    loading = false;
  }

  function selectDomain(domain: string, price: number) {
    dispatch('select', { domain, price });
  }
</script>

<div class="domain-search">
  <input
    type="text"
    bind:value={query}
    on:input={debounce(searchDomains, 300)}
    placeholder="Search for your perfect domain..."
    class="domain-input"
  />

  {#if loading}
    <div class="loading">Checking availability...</div>
  {/if}

  {#if results.length > 0}
    <div class="results">
      {#each results as result}
        <div class="domain-result" class:available={result.available}>
          <span class="domain-name">{result.domain}</span>
          {#if result.available}
            <span class="price">${(result.price / 100).toFixed(2)}/year</span>
            <button on:click={() => selectDomain(result.domain, result.price)}>
              Select
            </button>
          {:else}
            <span class="unavailable">Unavailable</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

### Domain Settings Panel

```svelte
<!-- DomainSettings.svelte -->
<script lang="ts">
  export let applicationId: string;

  let customDomain: CustomDomain | null = null;
  let searching = false;
  let purchasing = false;

  async function purchaseDomain(domain: string) {
    purchasing = true;
    const response = await fetch('/api/domains/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, applicationId }),
    });

    const { checkoutUrl } = await response.json();
    window.location.href = checkoutUrl;
  }
</script>

<div class="domain-settings">
  <h2>Custom Domain</h2>

  {#if customDomain}
    <div class="current-domain">
      <div class="domain-info">
        <span class="domain">{customDomain.domain}</span>
        <span class="status" class:active={customDomain.status === 'active'}>
          {customDomain.status}
        </span>
      </div>
      <div class="domain-meta">
        <span>Expires: {formatDate(customDomain.expiresAt)}</span>
        <span>Auto-renew: {customDomain.autoRenew ? 'On' : 'Off'}</span>
      </div>
    </div>
  {:else}
    <p>Get a custom domain for your chat - no technical setup required!</p>

    <DomainSearch on:select={(e) => purchaseDomain(e.detail.domain)} />

    <div class="features">
      <div class="feature">
        <span class="icon">🔒</span>
        <span>Free SSL certificate included</span>
      </div>
      <div class="feature">
        <span class="icon">⚡</span>
        <span>Instant setup - no DNS configuration needed</span>
      </div>
      <div class="feature">
        <span class="icon">🔄</span>
        <span>Annual billing with easy cancellation</span>
      </div>
    </div>
  {/if}
</div>
```

## Cloudflare Service

```typescript
// services/cloudflare.service.ts
import Cloudflare from "cloudflare";

const cf = new Cloudflare({
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const PAGES_PROJECT = "chipp-chat";

export const cloudflareService = {
  async checkDomainAvailability(domain: string) {
    const result = await cf.registrar.domains.check(ACCOUNT_ID, {
      domains: [domain],
    });

    return {
      domain,
      available: result[0].available,
      premium: result[0].premium,
      price: result[0].price,
    };
  },

  async registerDomain(domain: string) {
    // Register the domain
    const registration = await cf.registrar.domains.register(ACCOUNT_ID, {
      domain,
      auto_renew: false, // We handle via Stripe
    });

    // Create DNS zone
    const zone = await cf.zones.create({
      account: { id: ACCOUNT_ID },
      name: domain,
    });

    return { registration, zone };
  },

  async configureDNS(zoneId: string, applicationId: string) {
    // Root domain -> Cloudflare Pages
    await cf.dns.records.create({
      zone_id: zoneId,
      type: "CNAME",
      name: "@",
      content: `${PAGES_PROJECT}.pages.dev`,
      proxied: true,
    });

    // WWW subdomain
    await cf.dns.records.create({
      zone_id: zoneId,
      type: "CNAME",
      name: "www",
      content: `${PAGES_PROJECT}.pages.dev`,
      proxied: true,
    });

    // Verification record
    await cf.dns.records.create({
      zone_id: zoneId,
      type: "TXT",
      name: "_chipp-verify",
      content: `app=${applicationId}`,
    });
  },

  async addCustomDomainToPages(domain: string) {
    await cf.pages.projects.domains.create(
      {
        account_id: ACCOUNT_ID,
        project_name: PAGES_PROJECT,
      },
      {
        name: domain,
      }
    );
  },

  async renewDomain(domain: string) {
    return cf.registrar.domains.update(ACCOUNT_ID, domain, {
      // Trigger renewal
    });
  },

  async getSSLStatus(zoneId: string) {
    const verification = await cf.ssl.verification.get({
      zone_id: zoneId,
    });
    return verification;
  },
};
```

## Environment Variables

```bash
# Cloudflare
CLOUDFLARE_API_TOKEN=xxx          # API token with Registrar + DNS permissions
CLOUDFLARE_ACCOUNT_ID=xxx         # Account ID
CLOUDFLARE_PAGES_PROJECT=chipp-chat

# Stripe
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_DOMAIN_COM_PRICE_ID=price_xxx
STRIPE_DOMAIN_AI_PRICE_ID=price_xxx
STRIPE_DOMAIN_IO_PRICE_ID=price_xxx
```

## Pricing Strategy

| TLD  | Cloudflare Cost | Our Price | Margin |
| ---- | --------------- | --------- | ------ |
| .com | $10.11          | $14.99    | $4.88  |
| .ai  | ~$80.00         | $99.99    | $19.99 |
| .io  | ~$40.00         | $49.99    | $9.99  |
| .co  | ~$12.00         | $19.99    | $7.99  |
| .app | ~$16.00         | $24.99    | $8.99  |

## Implementation Phases

### Phase 1: Core Infrastructure

- [ ] Cloudflare API integration (domain check, register)
- [ ] Database schema for custom domains
- [ ] Basic domain search endpoint

### Phase 2: Stripe Integration

- [ ] Create Stripe products for each TLD
- [ ] Checkout session creation
- [ ] Webhook handler for purchase completion

### Phase 3: DNS Automation

- [ ] Auto-configure DNS records on purchase
- [ ] Add domain to Cloudflare Pages project
- [ ] SSL verification polling

### Phase 4: UI Components

- [ ] Domain search component
- [ ] Domain settings panel in builder
- [ ] Purchase flow with Stripe Checkout redirect

### Phase 5: Lifecycle Management

- [ ] Annual renewal via Stripe subscription
- [ ] Cancellation handling
- [ ] Expiration notifications
- [ ] Domain transfer out (if requested)

## Error Handling

```typescript
// Domain registration can fail for various reasons
const DOMAIN_ERRORS = {
  UNAVAILABLE: "Domain is no longer available",
  PREMIUM_NOT_SUPPORTED: "Premium domains not supported",
  INVALID_TLD: "This TLD is not available for purchase",
  CLOUDFLARE_ERROR: "Unable to register domain. Please try again.",
  PAYMENT_FAILED: "Payment failed. Please check your payment method.",
  ALREADY_OWNED: "You already own this domain",
};

async function handleRegistrationError(
  error: any,
  domain: string,
  userId: string
) {
  // Log for debugging
  console.error("Domain registration failed:", { error, domain, userId });

  // Refund if payment was taken
  if (error.paymentIntent) {
    await stripe.refunds.create({
      payment_intent: error.paymentIntent,
      reason: "Domain registration failed",
    });
  }

  // Notify user
  await sendDomainRegistrationFailedEmail(userId, domain, error.message);
}
```

## Security Considerations

1. **Domain ownership verification** - Ensure user owns the application before allowing domain attachment
2. **Rate limiting** - Limit domain searches to prevent abuse
3. **Payment validation** - Verify Stripe webhook signatures
4. **DNS record protection** - Don't allow users to modify critical DNS records
5. **Audit logging** - Log all domain operations for compliance

## Future Enhancements

- **Subdomain support** - Allow `chat.existingdomain.com` with DNS verification
- **Domain transfer in** - Let users bring existing domains
- **Email forwarding** - Forward `@domain.com` emails to user's email
- **Multiple domains** - Allow multiple domains per application
- **Domain marketplace** - Let users sell/transfer domains to other Chipp users
