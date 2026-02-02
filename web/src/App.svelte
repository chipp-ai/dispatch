<script lang="ts">
  import Router from "svelte-spa-router";
  import routes from "./routes";
  import { onMount, onDestroy } from "svelte";
  import { checkAuth, isAuthLoading } from "./stores/auth";
  import { initTheme } from "./stores/theme";
  import { initWhitelabel } from "./stores/whitelabel";
  import { initWorkspace } from "./stores/workspace";
  import { initOrganization } from "./stores/organization";
  import { appBooted, markAppBooted } from "./stores/app";
  import { Toaster, ErrorBoundary } from "./lib/design-system";
  import SplashScreen from "./lib/design-system/components/SplashScreen.svelte";
  import { initDevConsoleCapture } from "./lib/debug/devConsoleCapture";
  import ConsumerChat from "./routes/consumer/ConsumerChat.svelte";

  // Dev console capture cleanup
  let cleanupConsoleCapture: (() => void) | null = null;

  // Import design system styles
  import "./lib/design-system/base.css";

  // Detect vanity subdomain to render consumer chat directly.
  // In production, vanity URLs use 4-part slugs (e.g., merry-visiting-quasar-7nee.chipp.ai).
  // In local dev, any subdomain of localhost is treated as a vanity slug.
  const VANITY_PATTERN = /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]*[a-z][a-z0-9]*$/;

  function getVanitySlug(): string | null {
    if (typeof window === "undefined") return null;
    const hostname = window.location.hostname;
    const hostWithoutPort = hostname.split(":")[0];

    // Local dev: any subdomain of localhost (e.g., my-app.localhost)
    if (hostWithoutPort.endsWith(".localhost") && hostWithoutPort !== "localhost") {
      return hostWithoutPort.slice(0, -".localhost".length);
    }

    // Production: vanity subdomain of chipp.ai
    const match = hostWithoutPort.match(/^(.+)\.chipp\.ai$/);
    if (match) {
      const subdomain = match[1];
      if (VANITY_PATTERN.test(subdomain)) {
        return subdomain;
      }
    }

    return null;
  }

  const vanitySlug = getVanitySlug();

  // Track splash animation completion
  let splashAnimationComplete = false;

  function handleSplashComplete() {
    splashAnimationComplete = true;
    // If auth is also done (or skipped for vanity), mark app as booted
    if (vanitySlug || !$isAuthLoading) {
      markAppBooted();
    }
  }

  // When auth loading finishes and splash animation is complete, boot the app
  $: if (!$isAuthLoading && splashAnimationComplete && !$appBooted) {
    markAppBooted();
  }

  // Initialize on mount
  onMount(async () => {
    // Dev console capture - only in development, filter for StreamingMarkdown logs
    if (import.meta.env.DEV) {
      cleanupConsoleCapture = initDevConsoleCapture({
        filterPatterns: ["[StreamingMarkdown]"],
        batchSize: 5,
        flushInterval: 300,
      });
    }

    // Skip all admin initialization for vanity subdomain - consumer auth/theming
    // is handled entirely by ConsumerChat and ConsumerLayout
    if (vanitySlug) {
      markAppBooted();
      return;
    }

    initTheme();
    initWhitelabel();

    const user = await checkAuth();

    // Initialize workspace and organization stores after auth (non-blocking for instant feel)
    if (user) {
      initWorkspace(); // Fire and forget - uses cache for instant display
      initOrganization(); // Fire and forget - uses cache for instant display
    }

    // Add constellation background to body
    document.body.classList.add("constellation-bg");
  });

  onDestroy(() => {
    cleanupConsoleCapture?.();
  });

  // Redirect to login if not authenticated
  function conditionsFailed() {
    window.location.hash = "#/login";
  }
</script>

<ErrorBoundary>
  <Toaster />

  {#if vanitySlug}
    <!-- Vanity subdomain: render consumer chat directly, skip developer auth -->
    <ConsumerChat />
  {:else}
    <!-- Splash screen overlay - only shows on cold start, never again -->
    {#if !$appBooted}
      <SplashScreen onComplete={handleSplashComplete} />
    {/if}

    <!-- Router always renders, splash overlays it during initial load -->
    {#if !$isAuthLoading}
      <Router {routes} on:conditionsFailed={conditionsFailed} />
    {/if}
  {/if}
</ErrorBoundary>

<style>
  /* App shell styles - splash screen handles initial loading UI */
</style>
