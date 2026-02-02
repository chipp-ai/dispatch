<script lang="ts">
  import { link } from "svelte-spa-router";
  import { fade, scale } from "svelte/transition";
  import Avatar from "./Avatar.svelte";
  import { user, logout } from "../../../stores/auth";
  import { isWhitelabeled } from "../../../stores/whitelabel";
  import { currentWorkspace } from "../../../stores/workspace";
  import { theme, toggleTheme } from "../../../stores/theme";

  export let open: boolean = false;
  export let onClose: () => void = () => {};

  let appVersion = "dev"; // TODO: Get from env var

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

  async function handleLogout() {
    onClose();
    await logout();
  }

  function handleMenuClick() {
    onClose();
  }

  $: userColor = $user?.email ? generateColor($user.email) : "#000000";
  $: useLightText = shouldUseLightText(userColor);
</script>

{#if open}
  <div class="menu-backdrop" on:click={onClose} transition:fade={{ duration: 100 }} />
  <div class="dropdown-menu" transition:scale={{ duration: 150, start: 0.95 }}>
    <!-- User Info -->
    <div class="dropdown-label">
      <span class="user-name">{$user?.name || "User"}</span>
      <span class="user-email">{$user?.email || ""}</span>
    </div>
    <div class="dropdown-separator" />

    <!-- Desktop Menu -->
    <div class="desktop-menu">
      <a href="/settings/account" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Account</span>
      </a>

      <a href="/settings/workspace-members" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>Team</span>
      </a>

      {#if !isWhitelabeled}
        <a href="/settings/billing" use:link class="dropdown-item" on:click={handleMenuClick}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          <span>Billing</span>
        </a>
      {/if}

      <a href="/settings/hq" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>HQ</span>
      </a>

      <a href="/settings/workspace-settings" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
        </svg>
        <span>Workspace Settings</span>
      </a>

      <a href="/settings/sources" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span>Sources</span>
      </a>

      <a href="/settings/organization-settings" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 21h18" />
          <path d="M9 8h1" />
          <path d="M9 12h1" />
          <path d="M9 16h1" />
          <path d="M14 8h1" />
          <path d="M14 12h1" />
          <path d="M14 16h1" />
          <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        </svg>
        <span>Organization</span>
      </a>

      <button class="dropdown-item" on:click={toggleTheme}>
        {#if $theme === "dark"}
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span>Light Mode</span>
        {:else}
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span>Dark Mode</span>
        {/if}
      </button>

      <div class="dropdown-separator" />

      {#if !isWhitelabeled}
        <a href="/settings/help-center" use:link class="dropdown-item" on:click={handleMenuClick}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Help Center</span>
        </a>
      {/if}

      <button class="dropdown-item danger" on:click={handleLogout}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Logout</span>
      </button>

      <!-- Version display -->
      <div class="version">
        Version: {appVersion.slice(0, 7)}
      </div>
    </div>

    <!-- Mobile Menu -->
    <div class="mobile-menu">
      <a href="/apps" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Apps</span>
      </a>

      <a href="/workspaces" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span>Workspaces</span>
      </a>

      <div class="dropdown-separator" />

      <a href="/settings" use:link class="dropdown-item" on:click={handleMenuClick}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
        </svg>
        <span>Settings</span>
      </a>

      <button class="dropdown-item" on:click={toggleTheme}>
        {#if $theme === "dark"}
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <span>Light Mode</span>
        {:else}
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span>Dark Mode</span>
        {/if}
      </button>

      <button class="dropdown-item danger" on:click={handleLogout}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Logout</span>
      </button>

      <!-- Version display -->
      <div class="version">
        Version: {appVersion.slice(0, 7)}
      </div>
    </div>
  </div>
{/if}

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    z-index: 50;
    min-width: 220px;
    max-height: 400px;
    overflow-y: auto;
    padding: var(--space-1);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .dropdown-label {
    display: flex;
    flex-direction: column;
    padding: var(--space-2) var(--space-3);
  }

  .user-name {
    font-weight: var(--font-semibold);
    font-size: var(--text-lg);
    color: hsl(var(--foreground));
  }

  .user-email {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .dropdown-separator {
    height: 1px;
    margin: var(--space-1) 0;
    background: hsl(var(--border));
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    text-decoration: none;
    text-align: left;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .dropdown-item:hover {
    background: hsl(var(--accent) / 0.1);
  }

  .dropdown-item.danger {
    color: hsl(var(--destructive));
  }

  .dropdown-item.danger:hover {
    background: hsl(var(--destructive) / 0.1);
  }

  .icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .version {
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .desktop-menu {
    display: none;
  }

  .mobile-menu {
    display: block;
  }

  @media (min-width: 768px) {
    .desktop-menu {
      display: block;
    }

    .mobile-menu {
      display: none;
    }
  }
</style>
