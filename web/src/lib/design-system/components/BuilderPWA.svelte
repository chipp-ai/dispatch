<script lang="ts">
  /**
   * BuilderPWA
   *
   * Handles PWA setup for the builder dashboard:
   * - Registers builder-sw.js service worker (production only)
   * - Manages service worker updates
   * - Dynamically updates manifest link for whitelabel tenants
   *
   * Mount this in App.svelte for NON-consumer routes.
   */
  import { onMount } from "svelte";
  import { toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { companyLogoUrl, companyColor, isWhitelabeled } from "../../../stores/whitelabel";

  let registration: ServiceWorkerRegistration | null = null;
  let newWorker: ServiceWorker | null = null;

  onMount(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const isDevelopment =
      window.location.hostname === "localhost" ||
      window.location.hostname.includes("ngrok") ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".localhost");

    if (isDevelopment) {
      console.log("[Builder PWA] Skipping SW registration in development");
      // Unregister any stale builder service workers in dev
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => {
          if (reg.active?.scriptURL.includes("builder-sw")) {
            reg.unregister();
            console.log("[Builder PWA] Unregistered stale builder SW");
          }
        });
      });
      return;
    }

    registerServiceWorker();
    updateManifestForWhitelabel();
  });

  /**
   * Update manifest link and meta tags when whitelabel config loads.
   * The dynamic /api/pwa/manifest.json endpoint already handles hostname-based
   * whitelabel resolution, but we also update theme-color meta for immediate effect.
   */
  function updateManifestForWhitelabel() {
    // When whitelabel store updates, update the theme-color
    const unsubColor = companyColor.subscribe((color) => {
      if (color) {
        const themeColorMeta = document.getElementById("theme-color-meta");
        if (themeColorMeta) {
          themeColorMeta.setAttribute("content", color);
        }
      }
    });

    // Update apple-touch-icon if whitelabel has a logo
    const unsubLogo = companyLogoUrl.subscribe((logoUrl) => {
      if (logoUrl) {
        const appleIcon = document.getElementById("apple-touch-icon");
        if (appleIcon) {
          appleIcon.setAttribute("href", logoUrl);
        }
      }
    });

    // Cleanup subscriptions when component is destroyed
    return () => {
      unsubColor();
      unsubLogo();
    };
  }

  async function registerServiceWorker() {
    try {
      registration = await navigator.serviceWorker.register("/builder-sw.js", {
        scope: "/",
      });

      console.log("[Builder PWA] Service worker registered:", registration.scope);

      // Periodic update check (every hour)
      setInterval(() => {
        registration?.update();
      }, 60 * 60 * 1000);

      // Listen for updates
      registration.addEventListener("updatefound", () => {
        newWorker = registration?.installing || null;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker?.state === "installed" && navigator.serviceWorker.controller) {
            toasts.info("Update available", "Refresh to get the latest version.", 10000);
            // Auto-update after short delay
            setTimeout(() => {
              newWorker?.postMessage({ type: "SKIP_WAITING" });
            }, 2000);
          }
        });
      });

      // Reload when controller changes (new SW takes over)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        window.location.reload();
      });
    } catch (error) {
      captureException(error, {
        tags: { feature: "builder-pwa" },
        extra: { context: "service-worker-registration" },
      });
    }
  }
</script>

<!-- Renderless component - handles PWA setup only -->
