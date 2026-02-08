<script lang="ts">
  import { location } from "svelte-spa-router";
  import {
    User,
    CreditCard,
    Settings,
    Users,
    Home,
    HelpCircle,
    Files,
    PanelLeftClose,
    PanelLeftOpen,
    Palette,
    Crown,
    Sun,
    Moon,
    Coins,
    RefreshCw,
    TrendingUp,
    Bell,
  } from "lucide-svelte";
  import { currentOrganization } from "../../../../stores/organization";
  import { theme, toggleTheme } from "../../../../stores/theme";

  export let isCollapsed = false;

  // Check if organization is Enterprise tier (for Whitelabel visibility)
  $: isEnterprise = $currentOrganization?.subscriptionTier === "ENTERPRISE";

  // Build sections dynamically based on organization tier
  $: sections = [
    {
      title: "PERSONAL",
      items: [
        { name: "Account", href: "#/settings/account", icon: User },
        { name: "Notifications", href: "#/settings/notifications", icon: Bell },
      ],
    },
    {
      title: "BILLING",
      items: [
        { name: "Plan", href: "#/settings/billing/plan", icon: Crown },
        { name: "Credits", href: "#/settings/billing/credits", icon: Coins },
        { name: "Payment", href: "#/settings/billing/payment", icon: CreditCard },
        { name: "Auto Top-up", href: "#/settings/billing/auto-topup", icon: RefreshCw },
        { name: "Usage", href: "#/settings/billing/usage", icon: TrendingUp },
        { name: "Notifications", href: "#/settings/billing/notifications", icon: Bell },
      ],
    },
    {
      title: "WORKSPACE",
      items: [
        { name: "HQ", href: "#/settings/hq", icon: Home },
        { name: "Settings", href: "#/settings/workspace-settings", icon: Settings },
        { name: "Members", href: "#/settings/workspace-members", icon: Users },
        { name: "Sources", href: "#/settings/sources", icon: Files },
      ],
    },
    {
      title: "ORGANIZATION",
      items: [
        { name: "Settings", href: "#/settings/organization-settings", icon: Settings },
        { name: "Team", href: "#/settings/team", icon: Users },
        // Only show Whitelabel for Enterprise tier
        ...(isEnterprise ? [{ name: "Whitelabel", href: "#/settings/whitelabel", icon: Palette }] : []),
      ],
    },
    {
      title: "SUPPORT",
      items: [
        { name: "Help Center", href: "#/settings/help-center", icon: HelpCircle },
      ],
    },
  ];

  function isActive(href: string): boolean {
    const currentPath = "#" + $location;
    return currentPath === href;
  }

  function toggleCollapse() {
    isCollapsed = !isCollapsed;
  }
</script>

<div class="sidebar" class:collapsed={isCollapsed}>
  <button class="collapse-toggle" on:click={toggleCollapse} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
    {#if isCollapsed}
      <PanelLeftOpen size={16} />
    {:else}
      <PanelLeftClose size={16} />
    {/if}
  </button>

  <nav class="sidebar-nav">
    {#each sections as section}
      <div class="section">
        {#if !isCollapsed}
          <h3 class="section-title">{section.title}</h3>
        {/if}
        {#each section.items as item}
          <a
            href={item.href}
            class="nav-item"
            class:active={isActive(item.href)}
            title={isCollapsed ? item.name : undefined}
          >
            <svelte:component this={item.icon} size={20} />
            {#if !isCollapsed}
              <span>{item.name}</span>
            {/if}
          </a>
        {/each}
      </div>
    {/each}
  </nav>

  <!-- Theme toggle at bottom of sidebar -->
  <div class="sidebar-footer" class:collapsed={isCollapsed}>
    <button
      class="theme-toggle"
      on:click={toggleTheme}
      title={isCollapsed ? ($theme === "dark" ? "Switch to light mode" : "Switch to dark mode") : undefined}
    >
      {#if $theme === "dark"}
        <Sun size={20} />
      {:else}
        <Moon size={20} />
      {/if}
      {#if !isCollapsed}
        <span>Theme</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .sidebar {
    position: fixed;
    left: 0;
    top: 64px; /* Account for navbar height */
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: 256px;
    background: hsl(var(--background));
    border-right: 1px solid hsl(var(--border));
    transition: width 0.3s ease;
    z-index: 30;
  }

  .sidebar.collapsed {
    width: 80px;
  }

  .collapse-toggle {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 10;
    padding: var(--space-1-5);
    border: none;
    border-radius: var(--radius-md);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.2s, color 0.2s;
  }

  .sidebar:hover .collapse-toggle,
  .collapse-toggle:focus {
    opacity: 1;
  }

  .collapse-toggle:hover {
    background: hsl(var(--muted) / 0.8);
    color: hsl(var(--foreground));
  }

  .sidebar.collapsed .collapse-toggle {
    right: 50%;
    transform: translateX(50%);
  }

  .sidebar-nav {
    flex: 1;
    padding: var(--space-4);
    padding-top: var(--space-6);
    overflow-y: auto;
  }

  .sidebar.collapsed .sidebar-nav {
    padding-top: var(--space-14);
  }

  .section {
    margin-bottom: var(--space-6);
  }

  .section-title {
    padding: 0 var(--space-3);
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
  }

  .nav-item:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .nav-item.active {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .sidebar.collapsed .nav-item {
    justify-content: center;
    padding: var(--space-2);
  }

  /* Sidebar footer with theme toggle */
  .sidebar-footer {
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .sidebar-footer.collapsed {
    display: flex;
    justify-content: center;
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    width: 100%;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .theme-toggle:hover {
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .sidebar-footer.collapsed .theme-toggle {
    width: auto;
    justify-content: center;
    padding: var(--space-2);
  }

  @media (max-width: 768px) {
    .sidebar {
      display: none;
    }
  }
</style>
