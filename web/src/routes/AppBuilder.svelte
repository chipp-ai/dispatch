<script lang="ts">
  import { link } from "svelte-spa-router";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  // TODO: Implement app builder landing page
</script>

<svelte:head>
  <title>App Builder - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="app-builder-container">
  <div class="app-builder-content">
    <h1>App Builder</h1>
    <p class="subtitle">Create and configure your AI applications</p>
    <p class="coming-soon">Coming soon...</p>
  </div>
</div>

<style>
  .app-builder-container {
    min-height: 100vh;
    padding: var(--space-8);
    background: hsl(var(--background));
  }

  .app-builder-content {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
    padding-top: var(--space-16);
  }

  h1 {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .subtitle {
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .coming-soon {
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
</style>

