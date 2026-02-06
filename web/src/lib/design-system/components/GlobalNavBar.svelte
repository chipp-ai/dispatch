<script lang="ts">
  import { link } from "svelte-spa-router";
  import SmallChippLogo from "./SmallChippLogo.svelte";
  import OrganizationSwitcher from "./OrganizationSwitcher.svelte";
  import WorkspaceSwitcher from "./WorkspaceSwitcher.svelte";
  import UserMenu from "./UserMenu.svelte";
  import Avatar from "./Avatar.svelte";
  import { user, isAuthenticated } from "../../../stores/auth";
  import { currentOrganization, organizations } from "../../../stores/organization";
  import { currentWorkspace } from "../../../stores/workspace";
  import { isWhitelabeled } from "../../../stores/whitelabel";

  export let sticky: boolean = false;

  let userMenuOpen = false;
  let addBorder = false;

  // Handle scroll for sticky nav
  function handleScroll() {
    if (sticky) {
      addBorder = window.scrollY > 20;
    }
  }

  function getInitial(name: string | undefined): string {
    return name?.charAt(0).toUpperCase() || "?";
  }

  function generateColor(email: string): string {
    const hash = Array.from(email).reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc),
      0
    );
    return `#${((hash & 0x00ffffff) | 0x1000000).toString(16).substring(1)}`;
  }

  function shouldUseLightText(color: string): boolean {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }

  $: userColor = $user?.email ? generateColor($user.email) : "#000000";
  $: useLightText = shouldUseLightText(userColor);
  $: hqSlug = $currentWorkspace?.slug || "";
</script>

<svelte:window on:scroll={handleScroll} />

<nav class="navbar" class:sticky class:add-border={addBorder}>
  <div class="navbar-content">
    <div class="left">
      <a href="/apps" use:link class="logo-link">
        <SmallChippLogo />
      </a>

      {#if $isAuthenticated && $currentWorkspace && $organizations.length > 0}
        <div class="context-switchers">
          <OrganizationSwitcher />
          <span class="nav-separator">/</span>
          <WorkspaceSwitcher />
        </div>
      {/if}
    </div>

    {#if !$isAuthenticated}
      <div class="mobile-get-started">
        <a href="/signup" use:link class="get-started-btn-mobile">Get Started</a>
      </div>
    {/if}

    <div class="right">
      {#if $isAuthenticated}
        <nav class="nav-links hide-mobile">
          <a href="/hq/{hqSlug}" use:link class="nav-link-text">HQ</a>
          <a href="/workspaces" use:link class="nav-link-text">Workspaces</a>
          <a href="/apps" use:link class="nav-link-text">Apps</a>
          {#if !$isWhitelabeled}
            <a href="/plans" use:link class="upgrade-btn">Upgrade</a>
          {/if}
        </nav>
      {/if}

      {#if $isAuthenticated}
        <!-- User Menu -->
        <div class="user-menu-container">
          <button
            class="avatar-button"
            on:click={() => (userMenuOpen = !userMenuOpen)}
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
          >
            <Avatar
              size="sm"
              src={$user?.picture}
              fallback={getInitial($user?.name)}
              backgroundColor={userColor}
              textColor={useLightText ? "white" : "black"}
            />
          </button>

          <UserMenu bind:open={userMenuOpen} onClose={() => (userMenuOpen = false)} />
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>
  .navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    transition: opacity 300ms ease-in-out;
    width: 100%;
    border-bottom: 1px solid hsl(var(--border));
  }

  .navbar.sticky {
    position: sticky;
    top: 0;
    z-index: 50;
    background: hsl(var(--background) / 0.6);
    backdrop-filter: blur(8px);
  }

  .navbar.add-border {
    border-bottom: 1px solid hsl(var(--border));
  }

  .navbar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 10px;
  }

  .left {
    flex-grow: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .context-switchers {
    display: none;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  @media (min-width: 768px) {
    .context-switchers {
      display: flex;
    }
  }

  .logo-link {
    display: flex;
    align-items: center;
    text-decoration: none;
  }

  .nav-separator {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 20px;
  }

  .mobile-get-started {
    display: block;
  }

  @media (min-width: 768px) {
    .mobile-get-started {
      display: none;
    }
  }

  .nav-links {
    display: none;
    align-items: center;
    gap: 20px;
  }

  @media (min-width: 768px) {
    .nav-links {
      display: flex;
    }
  }

  .nav-link-text {
    font-size: 14px;
    color: hsl(var(--foreground));
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .nav-link-text:hover {
    color: hsl(var(--foreground) / 0.8);
  }

  .upgrade-btn {
    padding: 8px 16px;
    border-radius: 8px;
    background: #f9db00;
    color: black;
    font-size: 14px;
    font-weight: 700;
    font-family: var(--font-sans);
    line-height: 20px;
    text-decoration: none;
    white-space: nowrap;
    box-shadow:
      0px 0.48px 1.25px -1.17px rgba(0, 0, 0, 0.05),
      0px 1.83px 4.76px -2.33px rgba(0, 0, 0, 0.06),
      0px 4px 10.8px -3.5px rgba(0, 0, 0, 0.05),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.29),
      0px 0px 0px 2px rgba(0, 0, 0, 0.08);
    border: 0;
    transition: background-color var(--transition-fast);
  }

  .upgrade-btn:hover {
    background: #f9db00e6;
  }

  .get-started-btn-mobile {
    margin-left: 16px;
    padding: 8px 20px;
    border-radius: 10px;
    background: black;
    color: white;
    font-size: 16px;
    font-weight: 700;
    font-family: var(--font-sans);
    line-height: 24px;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
  }

  .user-menu-container {
    position: relative;
  }

  .avatar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    cursor: pointer;
    border-radius: 50%;
    transition: all 300ms;
  }

  .avatar-button:hover {
    filter: brightness(0.9);
  }
</style>
