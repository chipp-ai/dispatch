<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card } from "$lib/design-system";
  import { user } from "../stores/auth";
  import {
    User,
    CreditCard,
    Settings,
    Users,
    Home,
    HelpCircle,
    Files,
    Palette,
    ChevronRight,
  } from "lucide-svelte";

  // Sections for mobile view (cards with navigation)
  const sections = [
    {
      title: "PERSONAL",
      items: [
        { name: "Account", href: "#/settings/account", icon: User, description: "Manage your profile and preferences" },
        { name: "Billing", href: "#/settings/billing", icon: CreditCard, description: "View plans, credits, and payment methods" },
      ],
    },
    {
      title: "WORKSPACE",
      items: [
        { name: "HQ", href: "#/settings/hq", icon: Home, description: "Configure your workspace's public page" },
        { name: "Settings", href: "#/settings/workspace-settings", icon: Settings, description: "Workspace configuration and options" },
        { name: "Members", href: "#/settings/workspace-members", icon: Users, description: "Manage workspace members and roles" },
        { name: "Sources", href: "#/settings/sources", icon: Files, description: "Manage knowledge sources" },
      ],
    },
    {
      title: "ORGANIZATION",
      items: [
        { name: "Settings", href: "#/settings/organization-settings", icon: Settings, description: "Organization-wide configuration" },
        { name: "Team", href: "#/settings/team", icon: Users, description: "Manage organization team members" },
        { name: "Whitelabel", href: "#/settings/whitelabel", icon: Palette, description: "Customize branding and appearance" },
      ],
    },
    {
      title: "SUPPORT",
      items: [
        { name: "Help Center", href: "#/settings/help-center", icon: HelpCircle, description: "Get help and support" },
      ],
    },
  ];
</script>

<svelte:head>
  <title>Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <!-- Welcome header -->
      <div class="welcome-header">
        <p class="welcome-label">Welcome Back,</p>
        <h1 class="welcome-name">{$user?.name || "Anonymous"}</h1>
        {#if !$user?.name}
          <p class="name-hint">Please set a name under account</p>
        {/if}
      </div>

      <!-- Navigation cards for mobile and main content -->
      <div class="sections">
        {#each sections as section}
          <div class="section">
            <h3 class="section-title">{section.title}</h3>
            <Card padding="none" class="section-card">
              {#each section.items as item, i}
                <a href={item.href} class="nav-link" class:first={i === 0} class:last={i === section.items.length - 1}>
                  <div class="nav-icon">
                    <svelte:component this={item.icon} size={20} />
                  </div>
                  <div class="nav-info">
                    <span class="nav-name">{item.name}</span>
                    <span class="nav-description">{item.description}</span>
                  </div>
                  <ChevronRight size={20} class="nav-arrow" />
                </a>
              {/each}
            </Card>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 64px; /* Height of GlobalNavBar */
  }

  .settings-main {
    flex: 1;
    overflow-y: auto;
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .welcome-header {
    margin-bottom: var(--space-8);
    padding: var(--space-4);
  }

  .welcome-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .welcome-name {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    font-family: var(--font-serif, Georgia, serif);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .name-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-style: italic;
    margin: var(--space-2) 0 0 0;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    padding: 0 var(--space-3);
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-card :global(.card) {
    overflow: hidden;
    border-radius: var(--radius-xl);
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    text-decoration: none;
    color: hsl(var(--foreground));
    transition: background 0.2s;
    border-bottom: 1px solid hsl(var(--border));
  }

  .nav-link:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .nav-link.last {
    border-bottom: none;
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .nav-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
  }

  .nav-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .nav-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .nav-link :global(.nav-arrow) {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  /* On desktop, hide the card navigation since we have sidebar */
  @media (min-width: 769px) {
    .settings-layout {
      padding-left: 256px; /* Width of sidebar */
    }

    .sections {
      display: none;
    }

    .welcome-header {
      margin-bottom: var(--space-4);
    }
  }

  /* Show cards on mobile */
  @media (max-width: 768px) {
    .settings-content {
      padding: var(--space-4);
    }

    .welcome-header {
      margin-bottom: var(--space-6);
      padding: var(--space-2);
    }
  }
</style>
