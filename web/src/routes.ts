/**
 * Application Routes
 *
 * Hash-based routing using svelte-spa-router.
 * All routes except /login require authentication.
 */

import { wrap } from "svelte-spa-router/wrap";
import type { WrapOptions } from "svelte-spa-router/wrap";
import type { WrappedComponent } from "svelte-spa-router";
import { get } from "svelte/store";
import { isAuthenticated } from "./stores/auth";

// svelte-spa-router's types are not compatible with Svelte 5's component types
// We create a typed wrapper that accepts Svelte 5 dynamic imports
type Svelte5ImportFn = () => Promise<{ default: unknown }>;

interface RouteWrapOptions extends Omit<WrapOptions, "asyncComponent"> {
  asyncComponent?: Svelte5ImportFn;
}

// Type-safe wrap function that bridges Svelte 5 and svelte-spa-router
function wrapRoute(options: RouteWrapOptions): WrappedComponent {
  return wrap(options as WrapOptions);
}

type RoutesMap = Record<string, WrappedComponent>;

// Lazy-loaded route components using type-safe wrapper
const routes: RoutesMap = {
  // Public routes
  "/login": wrapRoute({
    asyncComponent: () => import("./routes/Login.svelte"),
  }),

  "/signup": wrapRoute({
    asyncComponent: () => import("./routes/Signup.svelte"),
  }),

  "/forgot-password": wrapRoute({
    asyncComponent: () => import("./routes/ForgotPassword.svelte"),
  }),

  "/reset-password": wrapRoute({
    asyncComponent: () => import("./routes/ResetPassword.svelte"),
  }),

  // Debug routes (development only, no auth required)
  "/debug/streaming-test": wrapRoute({
    asyncComponent: () => import("./routes/debug/StreamingTest.svelte"),
  }),

  // Protected routes (require auth)
  "/": wrapRoute({
    asyncComponent: () => import("./routes/Home.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/dashboard": wrapRoute({
    asyncComponent: () => import("./routes/DashboardV2.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/apps": wrapRoute({
    asyncComponent: () => import("./routes/Apps.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Chat route must come before the wildcard
  "/apps/:appId/chat": wrapRoute({
    asyncComponent: () => import("./routes/Chat.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Chat session view - for viewing/continuing existing sessions
  "/apps/:appId/chat/session/:sessionId": wrapRoute({
    asyncComponent: () => import("./routes/ChatSession.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Voice talk page now uses the builder layout (see /apps/:appId/* route)
  // This allows it to keep the sidebar and header visible

  // Job detail page - for viewing async job progress
  "/apps/:appId/jobs/:workflowId": wrapRoute({
    asyncComponent: () => import("./routes/JobDetail.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Debug actions page - for testing action collection flow
  "/apps/:appId/debug-actions": wrapRoute({
    asyncComponent: () => import("./routes/DebugActions.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // App builder uses a single layout with internal tab switching
  // This prevents page refresh when switching tabs
  "/apps/:appId": wrapRoute({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/apps/:appId/*": wrapRoute({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/marketplace": wrapRoute({
    asyncComponent: () => import("./routes/Marketplace.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/marketplace/results": wrapRoute({
    asyncComponent: () => import("./routes/MarketplaceResults.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/workspaces": wrapRoute({
    asyncComponent: () => import("./routes/Workspaces.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/app_builder": wrapRoute({
    asyncComponent: () => import("./routes/AppBuilder.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Legacy app_builder routes - also use persistent layout
  "/app_builder/:appId": wrapRoute({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/app_builder/:appId/*": wrapRoute({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Onboarding uses a single layout with internal step switching
  // This prevents page refresh when switching steps
  "/onboarding": wrapRoute({
    asyncComponent: () => import("./routes/OnboardingLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/onboarding/*": wrapRoute({
    asyncComponent: () => import("./routes/OnboardingLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Onboarding V2 - new 4-step flow (Build → Train → Share → Unlock)
  "/onboarding-v2": wrapRoute({
    asyncComponent: () => import("./routes/OnboardingV2Layout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/onboarding-v2/*": wrapRoute({
    asyncComponent: () => import("./routes/OnboardingV2Layout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Import from v1 (chipp-admin) flow
  "/import": wrapRoute({
    asyncComponent: () => import("./routes/ImportLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/import/*": wrapRoute({
    asyncComponent: () => import("./routes/ImportLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/chatbot-generator": wrapRoute({
    asyncComponent: () => import("./routes/ChatbotGenerator.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/hq/:slug": wrapRoute({
    asyncComponent: () => import("./routes/HQ.svelte"),
  }),

  "/plans": wrapRoute({
    asyncComponent: () => import("./routes/Plans.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Settings uses a single layout with internal page switching
  // This prevents page refresh when switching settings pages
  "/settings": wrapRoute({
    asyncComponent: () => import("./routes/SettingsLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  "/settings/*": wrapRoute({
    asyncComponent: () => import("./routes/SettingsLayout.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Action collection routes
  "/action-collections/:collectionId/contributions": wrapRoute({
    asyncComponent: () => import("./routes/CollectionContributions.svelte"),
    conditions: [() => get(isAuthenticated)],
  }),

  // Consumer routes (public - uses separate consumer auth)
  // End-user chat experience for published applications
  // App is determined by vanity subdomain (e.g., my-app.chipp.ai)
  // The appNameId is extracted from window.__APP_BRAND__.slug or subdomain
  // NOTE: More specific routes must come before /chat to avoid prefix matching
  "/chat/login": wrapRoute({
    asyncComponent: () => import("./routes/consumer/ConsumerLogin.svelte"),
  }),

  "/chat/signup": wrapRoute({
    asyncComponent: () => import("./routes/consumer/ConsumerSignup.svelte"),
  }),

  "/chat/verify": wrapRoute({
    asyncComponent: () => import("./routes/consumer/ConsumerVerify.svelte"),
  }),

  "/chat": wrapRoute({
    asyncComponent: () => import("./routes/consumer/ConsumerChat.svelte"),
  }),

  // 404 fallback
  "*": wrapRoute({
    asyncComponent: () => import("./routes/NotFound.svelte"),
  }),
};

export default routes;
