<script lang="ts">
  import { link } from "svelte-spa-router";
  import { location } from "svelte-spa-router";
  import { isAuthenticated } from "../../../stores/auth";
  import { currentWorkspace } from "../../../stores/workspace";

  $: hqSlug = $currentWorkspace?.slug || "";
  $: currentPath = $location || "/";

  // Hide bottom nav on pages that have their own navigation
  $: shouldHide = isFullscreenRoute(currentPath);

  function isFullscreenRoute(path: string): boolean {
    // App builder has its own tab nav
    if (/^\/apps\/[^/]+/.test(path)) return true;
    // Onboarding has its own flow
    if (path.startsWith("/onboarding")) return true;
    // Chat pages
    if (path.startsWith("/chat")) return true;
    // Consumer pages
    if (path.startsWith("/consumer")) return true;
    return false;
  }

  function isActive(path: string): boolean {
    if (path === "/dashboard") {
      return currentPath === "/" || currentPath === "/dashboard";
    }
    return currentPath.startsWith(path);
  }
</script>

{#if $isAuthenticated && !shouldHide}
  <nav class="mobile-bottom-nav">
    <a
      href="/dashboard"
      use:link
      class="nav-item"
      class:active={isActive("/dashboard")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <span>Home</span>
    </a>

    <a
      href="/apps"
      use:link
      class="nav-item"
      class:active={isActive("/apps")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <span>Apps</span>
    </a>

    <a
      href="/hq/{hqSlug}"
      use:link
      class="nav-item"
      class:active={isActive("/hq")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <span>HQ</span>
    </a>

    <a
      href="/settings"
      use:link
      class="nav-item"
      class:active={isActive("/settings")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    </a>
  </nav>
{/if}

<style>
  .mobile-bottom-nav {
    display: none;
  }

  @media (max-width: 767px) {
    .mobile-bottom-nav {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 50;
      height: calc(56px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0);
      background: hsl(var(--background) / 0.85);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border-top: 1px solid hsl(var(--border));
      align-items: flex-start;
      justify-content: space-around;
    }
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex: 1;
    padding: 8px 0 4px;
    text-decoration: none;
    color: hsl(var(--muted-foreground));
    transition: color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-item svg {
    width: 22px;
    height: 22px;
  }

  .nav-item span {
    font-size: 10px;
    font-weight: 500;
    font-family: var(--font-sans);
    letter-spacing: 0.01em;
  }

  .nav-item.active {
    color: hsl(var(--foreground));
  }

  .nav-item.active svg {
    stroke-width: 2.5;
  }
</style>
