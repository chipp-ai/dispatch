<script lang="ts">
  import { Card } from "$lib/design-system";
  import { user } from "../../../stores/auth";
  import { currentOrganization } from "../../../stores/organization";
  import {
    User,
    Settings,
    Users,
    Home,
    HelpCircle,
    Files,
    Palette,
    ChevronRight,
    CreditCard,
  } from "lucide-svelte";

  // Check if organization is Enterprise tier (for Whitelabel visibility)
  $: isEnterprise = $currentOrganization?.subscriptionTier === "ENTERPRISE";

  // Sections structure matches chipp-admin
  // Billing is part of PERSONAL section, no descriptions
  $: sections = [
    {
      title: "PERSONAL",
      items: [
        { name: "Account", href: "#/settings/account", icon: User },
        { name: "Billing", href: "#/settings/billing", icon: CreditCard },
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
</script>

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
            <svelte:component this={item.icon} size={20} class="nav-icon" />
            <span class="nav-name">{item.name}</span>
            <ChevronRight size={20} class="nav-arrow" />
          </a>
        {/each}
      </Card>
    </div>
  {/each}
</div>

<style>
  .welcome-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-8);
    padding: var(--space-4);
  }

  .welcome-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .welcome-name {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .name-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-style: italic;
    margin: 0;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-4) 0;
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

  .nav-link :global(.nav-icon) {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .nav-name {
    flex: 1;
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .nav-link :global(.nav-arrow) {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .welcome-header {
      margin-bottom: var(--space-6);
      padding: var(--space-2);
    }
  }
</style>
