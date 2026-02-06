/**
 * Thick Client Route Preloader
 *
 * Downloads ALL route chunks during the splash screen so users can
 * navigate the entire app without network-dependent lazy loading.
 * This eliminates chunk loading errors after deployments.
 */

// Discover all route modules at build time via Vite's import.meta.glob.
// Returns lazy import functions that we trigger eagerly during splash.
const routeModules = import.meta.glob("../routes/**/*.svelte");

/**
 * Preload all route modules in parallel.
 * Call during the splash screen to download the entire app bundle.
 * Individual failures are silently ignored - the route will
 * lazy-load on navigation as a fallback.
 */
export async function preloadAllRoutes(): Promise<void> {
  const imports = Object.values(routeModules).map((importFn) =>
    importFn().catch(() => {
      // Silently swallow - chunk will lazy-load on navigation
    })
  );

  await Promise.allSettled(imports);
}
