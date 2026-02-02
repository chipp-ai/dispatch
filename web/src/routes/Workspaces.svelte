<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import { workspaceStore, workspaces, fetchWorkspaces } from "../stores/workspace";
  import { link } from "svelte-spa-router";
  // TODO: Implement full workspace dashboard with workspace cards, create workspace, etc.
</script>

<svelte:head>
  <title>Workspaces - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="workspaces-container">
  <div class="workspaces-content">
    <div class="header">
      <h1>Workspaces</h1>
      <button class="create-button">Create Workspace</button>
    </div>
    <div class="workspaces-list">
      {#if $workspaces.length === 0}
        <p class="empty-state">No workspaces yet. Create your first workspace to get started.</p>
      {:else}
        {#each $workspaces as workspace}
          <div class="workspace-card">
            <h3>{workspace.name}</h3>
            <p class="workspace-meta">
              {workspace.visibility === "PRIVATE" ? "Private" : "Shared"}
            </p>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .workspaces-container {
    min-height: 100vh;
    padding: var(--space-8);
    background: hsl(var(--background));
  }

  .workspaces-content {
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-8);
  }

  h1 {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .create-button {
    padding: var(--space-2) var(--space-4);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: var(--radius-md);
    font-weight: var(--font-semibold);
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .create-button:hover {
    opacity: 0.9;
  }

  .workspaces-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-4);
  }

  .workspace-card {
    padding: var(--space-6);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  }

  .workspace-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .workspace-card h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .workspace-meta {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: var(--space-16);
    color: hsl(var(--muted-foreground));
  }
</style>

