<script lang="ts">
  /**
   * Consumer Layout
   *
   * Wrapper component for consumer chat experience.
   * Handles app loading and brand styling.
   *
   * Supports server-injected branding via window.__APP_BRAND__ for instant
   * loading without the flash of default branding.
   *
   * ## IMPORTANT: Branding Separation
   *
   * There are TWO distinct branding contexts in Chipp:
   *
   * 1. **Platform Whitelabeling** (`--brand-color`)
   *    - Used by whitelabel partners to brand the entire Chipp platform
   *    - Applies to admin dashboard, login pages, developer tools
   *    - Set globally in tokens.css, can be overridden per-deployment
   *    - Example: An agency reselling Chipp with their own brand colors
   *
   * 2. **Application Branding** (`--consumer-primary`)
   *    - Used by individual AI applications to brand their consumer chat
   *    - Only applies within consumer chat experience
   *    - Set dynamically per-app based on app's brand settings
   *    - Example: A business's chatbot using their corporate colors
   *
   * This component ONLY sets `--consumer-primary` (and related consumer vars).
   * It must NEVER set `--brand-color` as that would override platform branding.
   *
   * See also: Button.svelte uses `var(--consumer-primary, var(--brand-color))`
   * to respect app branding in consumer context while falling back to platform
   * branding elsewhere.
   */

  import { onMount, onDestroy } from "svelte";
  import { consumerAuth, consumerApp, consumerIsLoading, consumerError } from "../../stores/consumerAuth";
  import SplashScreen from "$lib/design-system/components/SplashScreen.svelte";

  export let appNameId: string;

  let mounted = false;

  // Check for server-injected brand config (set by Cloudflare Worker)
  const injectedBrand = typeof window !== "undefined"
    ? (window as unknown as { __APP_BRAND__?: { slug: string; name: string; color: string; bg?: string; logo: string } }).__APP_BRAND__
    : undefined;

  onMount(async () => {
    // Apply injected brand immediately (no flash)
    if (injectedBrand) {
      applyBrandStyles({
        primaryColor: injectedBrand.color,
        backgroundColor: injectedBrand.bg,
      });
    }

    // Still fetch full app data (needed for chat functionality)
    await consumerAuth.initApp(appNameId);
    mounted = true;

    // Apply full brand styles from API (may override injected)
    applyBrandStyles();
  });

  onDestroy(() => {
    // Clean up brand styles
    document.documentElement.style.removeProperty("--consumer-primary");
    document.documentElement.style.removeProperty("--consumer-background");
    document.documentElement.style.removeProperty("--consumer-foreground");
  });

  function applyBrandStyles(overrides?: { primaryColor?: string; backgroundColor?: string; textColor?: string }) {
    // Use overrides first, then fall back to app brandStyles
    const app = $consumerApp;
    const appStyles = (app?.brandStyles as Record<string, string>) || {};
    const styles = { ...appStyles, ...overrides };

    if (!styles.primaryColor && !styles.backgroundColor && !styles.textColor) return;

    if (styles.primaryColor) {
      document.documentElement.style.setProperty(
        "--consumer-primary",
        styles.primaryColor
      );
      // CRITICAL: Do NOT set --brand-color here!
      // --brand-color is for platform whitelabeling (agency/reseller branding)
      // --consumer-primary is for app-specific branding (individual chatbot colors)
      // Setting --brand-color here would break whitelabel partner branding.
      // Components like Button use var(--consumer-primary, var(--brand-color))
      // to pick up app branding in consumer context while preserving platform
      // branding everywhere else.
    }
    if (styles.backgroundColor) {
      document.documentElement.style.setProperty(
        "--consumer-background",
        styles.backgroundColor
      );
    }
    if (styles.textColor) {
      document.documentElement.style.setProperty(
        "--consumer-foreground",
        styles.textColor
      );
    }
  }

  $: if ($consumerApp) {
    applyBrandStyles();
  }
</script>

{#if $consumerIsLoading && !mounted}
  {@const brandStyles = ($consumerApp?.brandStyles as Record<string, string>) || {}}
  <SplashScreen 
    appLogoUrl={brandStyles.logoUrl || injectedBrand?.logo || null}
    appPrimaryColor={brandStyles.primaryColor || injectedBrand?.color || null}
  />
{:else if $consumerError}
  <div class="error-page">
    <div class="error-content">
      <h1>Oops!</h1>
      <p>{$consumerError}</p>
      <a href="/" class="back-link">Go back</a>
    </div>
  </div>
{:else if $consumerApp}
  <div class="consumer-layout">
    <slot />
  </div>
{:else}
  <div class="loading-page">
    <SplashScreen 
      appLogoUrl={injectedBrand?.logo || null}
      appPrimaryColor={injectedBrand?.color || null}
    />
  </div>
{/if}

<style>
  .consumer-layout {
    min-height: 100vh;
    background: var(--consumer-background, hsl(var(--background)));
    color: var(--consumer-foreground, hsl(var(--foreground)));
  }

  .error-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
    padding: var(--space-4);
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-content h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--destructive));
    margin-bottom: var(--space-2);
  }

  .error-content p {
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .back-link {
    color: hsl(var(--primary));
    text-decoration: underline;
  }

  .loading-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
  }
</style>
