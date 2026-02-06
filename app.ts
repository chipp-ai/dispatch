/**
 * Chipp API - Hono Application
 *
 * Central Hono application with all routes and middleware configured.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { prettyJSON } from "hono/pretty-json";
import { compress } from "hono/compress";

import { errorHandler } from "./middleware/error.ts";
import { requestId } from "./middleware/request-id.ts";
import { devLogger } from "./middleware/dev-logger.ts";
import { vanityMiddleware, setVanityAppInstance } from "./middleware/vanity.ts";
import type { AppEnv } from "./types.ts";

// Route imports
import { health } from "./routes/health.ts";
import { auth } from "./routes/auth.ts";
import { webhooks } from "./routes/webhooks.ts";
import { upgradeWebSocket, getWebSocketHealth, upgradeConsumerWebSocket, getConsumerWebSocketHealth } from "./src/websocket/index.ts";

// API route imports
import { workspaceRoutes } from "./src/api/routes/workspace/index.ts";
import { applicationRoutes } from "./src/api/routes/application/index.ts";
import { chatRoutes } from "./src/api/routes/chat/index.ts";
import { billingRoutes } from "./src/api/routes/billing/index.ts";
import { organizationRoutes } from "./src/api/routes/organization/index.ts";
import { knowledgeSourceRoutes } from "./src/api/routes/knowledge-source/index.ts";
import { uploadRoutes } from "./src/api/routes/upload/index.ts";
import { customActionRoutes } from "./src/api/routes/custom-action/index.ts";
import { dashboardRoutes } from "./src/api/routes/dashboard/index.ts";
import { authMiddleware, type AuthContext } from "./src/api/middleware/auth.ts";
import { debugRoutes } from "./src/api/routes/debug.ts";
import { generateRoutes } from "./src/api/routes/generate/index.ts";
import { consumerRoutes } from "./src/api/routes/consumer/index.ts";
import { onboardingRoutes } from "./src/api/routes/onboarding/index.ts";
import { profileRoutes } from "./src/api/routes/profile/index.ts";
import { voiceRoutes } from "./src/api/routes/voice/index.ts";
import { importRoutes } from "./src/api/routes/import/index.ts";
import streamingTestRoutes from "./src/api/routes/dev/streaming-test.ts";
import { integrationRoutes } from "./src/api/routes/integrations/index.ts";
import { devRoutes } from "./src/api/routes/dev/index.ts";
import { stripeRoutes } from "./src/api/routes/stripe/index.ts";
import { webhookRoutes } from "./src/api/routes/webhooks/index.ts";
import { actionCollectionRoutes } from "./src/api/routes/action-collections/index.ts";
import { marketplaceRoutes } from "./src/api/routes/marketplace/index.ts";
import { builderPwaRoutes } from "./src/api/routes/pwa/index.ts";
import { emailTrackingRoutes } from "./src/api/routes/email/tracking.ts";
import {
  domainRoutes,
  internalDomainRoutes,
} from "./src/api/routes/domain/index.ts";
import { whitelabelConfigRoutes } from "./src/api/routes/whitelabel/index.ts";

// Create Hono app with typed environment
export const app = new Hono<AppEnv>();

// Register app instance for vanity URL internal forwarding
setVanityAppInstance(app);

// ====================
// Global Middleware
// ====================

// Vanity URL support (must be first to rewrite paths)
// Production: Cloudflare Worker sets X-Vanity-Slug header for vanity subdomains
// Development: Set LOCAL_VANITY_HOST=localhost for http://myapp.localhost:8000/chat
app.use("*", vanityMiddleware());

// Request ID for tracing
app.use("*", requestId);

// Timing headers (X-Response-Time)
app.use("*", timing());

// Request logging
// Use enhanced dev logger in development, standard logger in production
if (Deno.env.get("ENVIRONMENT") !== "production") {
  app.use("*", devLogger);
} else {
  app.use("*", logger());
}

// Compress responses
app.use("*", compress());

// Pretty JSON in development
if (Deno.env.get("ENVIRONMENT") !== "production") {
  app.use("*", prettyJSON());
}

// Security headers
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    xXssProtection: "1; mode=block",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
  })
);

// CORS configuration
const ALLOWED_ORIGINS = [
  "https://app.chipp.ai",
  "https://staging.chipp.ai",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return "*";

      // Check allowed origins
      if (ALLOWED_ORIGINS.includes(origin)) return origin;

      // Allow any *.chipp.ai subdomain
      if (origin.endsWith(".chipp.ai")) return origin;

      // Allow custom domains: the Cloudflare Worker validates custom domains
      // before proxying, and API auth is independent (session cookies).
      // Accept any HTTPS origin that isn't a known non-custom pattern.
      if (origin.startsWith("https://")) return origin;

      // In development, allow localhost with any port and subdomains
      if (Deno.env.get("ENVIRONMENT") !== "production") {
        if (origin.startsWith("http://localhost:")) return origin;
        // Allow vanity subdomains like http://myapp.localhost:8000
        if (origin.match(/^http:\/\/[\w-]+\.localhost(:\d+)?$/)) return origin;
      }

      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-App-ID", "X-Tenant-ID"],
    exposeHeaders: ["X-Request-ID", "X-Response-Time"],
    credentials: true,
    maxAge: 86400,
  })
);

// Global error handler
app.onError(errorHandler);

// ====================
// Public Routes (no auth)
// ====================

// Health check
app.route("/", health);

// Auth routes (login, callback, etc.)
app.route("/auth", auth);

// Legacy webhook routes - DEPRECATED
// The legacy handler at /webhooks/stripe is kept for backwards compatibility
// during the transition period. New integrations should use /api/webhooks/stripe
// TODO: Remove after confirming all Stripe webhook endpoints are updated
// app.route("/webhooks", webhooks);

// Webhook routes (Stripe, Twilio, etc. - have their own signature auth)
// Primary webhook endpoint: /api/webhooks/stripe
app.route("/api/webhooks", webhookRoutes);

// Debug routes - ONLY available in local development, never in production or staging
const isLocalDev =
  Deno.env.get("ENVIRONMENT") === "development" ||
  Deno.env.get("ENVIRONMENT") === "local";
if (isLocalDev) {
  app.route("/debug", debugRoutes);
  app.route("/dev", streamingTestRoutes);
}

// Dev API routes - available in development and staging, no auth required
// These are called by MCP tools for testing (dev_set_tier, dev_reset_credits, etc.)
const isDevOrStaging =
  Deno.env.get("ENVIRONMENT") === "development" ||
  Deno.env.get("ENVIRONMENT") === "local" ||
  Deno.env.get("ENVIRONMENT") === "staging";
if (isDevOrStaging) {
  app.route("/api/dev", devRoutes);
}

// AI generation routes (public, no auth required)
app.route("/generate", generateRoutes);

// Consumer routes (public, has its own consumer auth)
// End-user authentication and chat for published apps
app.route("/consumer", consumerRoutes);

// Marketplace routes (public, no auth required)
app.route("/api/marketplace", marketplaceRoutes);

// Builder PWA routes (public, no auth - browsers fetch manifest/icons without cookies)
app.route("/api/pwa", builderPwaRoutes);

// Email tracking routes (public, no auth - tracking pixels and redirect links)
app.route("/api/email", emailTrackingRoutes);

// Internal routes (for Cloudflare Worker domain lookup - validated by X-Internal-Request header)
app.route("/api/internal", internalDomainRoutes);

// Whitelabel config (public, no auth - SPA fetches branding before login)
app.route("/api/whitelabel", whitelabelConfigRoutes);

// ====================
// WebSocket Endpoint
// ====================

// WebSocket connections (uses token-based auth in query string)
app.get("/ws", (c) => {
  const response = upgradeWebSocket(c.req.raw);
  if (response) {
    return response;
  }
  return c.json({ error: "WebSocket upgrade required" }, 400);
});

// Consumer WebSocket (multiplayer chat - session-based auth)
app.get("/ws/consumer", (c) => {
  const response = upgradeConsumerWebSocket(c.req.raw);
  if (response) {
    return response;
  }
  return c.json({ error: "WebSocket upgrade required" }, 400);
});

// WebSocket health check
app.get("/ws/health", (c) => {
  return c.json({
    ...getWebSocketHealth(),
    consumer: getConsumerWebSocketHealth(),
  });
});

// ====================
// Protected API Routes
// ====================

// Create sub-app for authenticated routes
const api = new Hono<AuthContext>();

// All API routes require authentication
api.use("*", authMiddleware);

// Mount API routes
api.route("/workspaces", workspaceRoutes);
api.route("/applications", applicationRoutes);
api.route("/chat", chatRoutes);
api.route("/billing", billingRoutes);
api.route("/organization", organizationRoutes);
api.route("/knowledge-sources", knowledgeSourceRoutes);
api.route("/upload", uploadRoutes);
api.route("/dashboard", dashboardRoutes);
api.route("/onboarding", onboardingRoutes);
api.route("/profile", profileRoutes);
api.route("/voice", voiceRoutes);
api.route("/import", importRoutes);
api.route("/integrations", integrationRoutes);
api.route("/stripe", stripeRoutes);
api.route("/action-collections", actionCollectionRoutes);
api.route("/domains", domainRoutes);
api.route("/", customActionRoutes);

// Note: Dev routes (/api/dev/*) are mounted earlier without auth middleware
// so MCP tools can call them directly

// Mount API
app.route("/api", api);

// ====================
// 404 Handler
// ====================

app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
      requestId: c.get("requestId"),
    },
    404
  );
});

export default app;
