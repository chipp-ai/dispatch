<script lang="ts">
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  // TODO: Implement memory settings page
</script>

<svelte:head>
  <title>Memory Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="memory-container">
  <div class="memory-content">
    <h1>Memory Settings</h1>
    <p class="coming-soon">Coming soon...</p>
  </div>
</div>

<style>
  .memory-container {
    min-height: 100vh;
    padding: var(--space-8);
    background: hsl(var(--background));
  }

  .memory-content {
    max-width: 1200px;
    margin: 0 auto;
    padding-top: var(--space-16);
  }

  h1 {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-4);
  }

  .coming-soon {
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }
</style>

