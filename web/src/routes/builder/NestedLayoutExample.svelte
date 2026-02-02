<!--
  NESTED SUB-LAYOUT EXAMPLE

  This file demonstrates how to create a content component that acts as a
  sub-layout for deep nesting (3+ levels).

  URL structure: /apps/:appId/example/section/subsection

  The parent AppBuilderLayout parses level 1 ("example") and passes the
  remaining path as subPath. This component then parses level 2 and 3.

  To use this pattern:
  1. Parent layout passes `subPath` prop (remaining path after its level)
  2. This component parses subPath to determine active section
  3. Renders section navigation + conditionally renders section content
  4. Section content can receive further subPath for even deeper nesting
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { push } from "svelte-spa-router";
  import { Card, Button } from "$lib/design-system";
  import { Settings, Bell, Shield, Palette } from "lucide-svelte";

  const dispatch = createEventDispatcher<{ navigate: { path: string } }>();

  // Props from parent layout
  export let appId: string;
  export let subPath: string = ""; // Remaining path after "example/"

  // Parse the active section from subPath
  // e.g., subPath = "notifications/email" → activeSection = "notifications"
  $: segments = subPath.split("/").filter(Boolean);
  $: activeSection = segments[0] || "general";
  $: sectionSubPath = segments.slice(1).join("/");

  // Section configuration
  const SECTIONS = [
    { id: "general", label: "General", icon: Settings },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Palette },
  ] as const;

  // Navigate to a section
  function goToSection(sectionId: string) {
    push(`/apps/${appId}/example/${sectionId}`);
  }

  // Navigate within a section (for deeper nesting)
  function goToSubSection(subSectionPath: string) {
    push(`/apps/${appId}/example/${activeSection}/${subSectionPath}`);
  }
</script>

<div class="sub-layout">
  <!-- Section Navigation (Level 2) -->
  <nav class="section-nav">
    {#each SECTIONS as section}
      <button
        class="section-link"
        class:active={activeSection === section.id}
        on:click={() => goToSection(section.id)}
      >
        <svelte:component this={section.icon} size={18} />
        <span>{section.label}</span>
      </button>
    {/each}
  </nav>

  <!-- Section Content -->
  <div class="section-content">
    {#if activeSection === "general"}
      <GeneralSection />
    {:else if activeSection === "notifications"}
      <!-- Notifications has its own sub-sections (Level 3) -->
      {@render NotificationsSection({ subPath: sectionSubPath, onNavigate: goToSubSection })}
    {:else if activeSection === "security"}
      <SecuritySection />
    {:else if activeSection === "appearance"}
      <AppearanceSection />
    {/if}
  </div>
</div>

<!-- Inline section components for this example -->
<!-- In a real app, these would be separate files -->

{#snippet GeneralSection()}
  <Card padding="lg">
    <h2>General Settings</h2>
    <p>This is the general section content.</p>
    <p class="path-debug">Current path: /apps/{appId}/example/general</p>
  </Card>
{/snippet}

{#snippet SecuritySection()}
  <Card padding="lg">
    <h2>Security Settings</h2>
    <p>This is the security section content.</p>
    <p class="path-debug">Current path: /apps/{appId}/example/security</p>
  </Card>
{/snippet}

{#snippet AppearanceSection()}
  <Card padding="lg">
    <h2>Appearance Settings</h2>
    <p>This is the appearance section content.</p>
    <p class="path-debug">Current path: /apps/{appId}/example/appearance</p>
  </Card>
{/snippet}

<!-- Level 3 sub-layout example -->
{#snippet NotificationsSection({ subPath, onNavigate }: { subPath: string, onNavigate: (path: string) => void })}
  {@const activeSubSection = subPath.split("/")[0] || "email"}

  <div class="sub-section-layout">
    <div class="sub-section-tabs">
      <button
        class="sub-tab"
        class:active={activeSubSection === "email"}
        on:click={() => onNavigate("email")}
      >
        Email
      </button>
      <button
        class="sub-tab"
        class:active={activeSubSection === "push"}
        on:click={() => onNavigate("push")}
      >
        Push
      </button>
      <button
        class="sub-tab"
        class:active={activeSubSection === "slack"}
        on:click={() => onNavigate("slack")}
      >
        Slack
      </button>
    </div>

    <Card padding="lg">
      {#if activeSubSection === "email"}
        <h2>Email Notifications</h2>
        <p>Configure email notification preferences.</p>
        <p class="path-debug">Current path: /apps/{appId}/example/notifications/email</p>
      {:else if activeSubSection === "push"}
        <h2>Push Notifications</h2>
        <p>Configure push notification preferences.</p>
        <p class="path-debug">Current path: /apps/{appId}/example/notifications/push</p>
      {:else if activeSubSection === "slack"}
        <h2>Slack Notifications</h2>
        <p>Configure Slack integration.</p>
        <p class="path-debug">Current path: /apps/{appId}/example/notifications/slack</p>
      {/if}
    </Card>
  </div>
{/snippet}

<style>
  .sub-layout {
    display: flex;
    gap: var(--space-6);
    padding: var(--space-6);
    height: 100%;
  }

  .section-nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 200px;
    flex-shrink: 0;
  }

  .section-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .section-link:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .section-link.active {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    font-weight: var(--font-medium);
  }

  .section-content {
    flex: 1;
    min-width: 0;
  }

  .section-content h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-4) 0;
  }

  .section-content p {
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .path-debug {
    font-family: monospace;
    font-size: var(--text-xs);
    padding: var(--space-2);
    background: hsl(var(--muted));
    border-radius: var(--radius-sm);
    margin-top: var(--space-4);
  }

  /* Level 3 styles */
  .sub-section-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .sub-section-tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: var(--space-2);
  }

  .sub-tab {
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sub-tab:hover {
    color: hsl(var(--foreground));
  }

  .sub-tab.active {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    font-weight: var(--font-medium);
  }

  @media (max-width: 768px) {
    .sub-layout {
      flex-direction: column;
      padding: var(--space-4);
    }

    .section-nav {
      flex-direction: row;
      width: 100%;
      overflow-x: auto;
    }
  }
</style>
