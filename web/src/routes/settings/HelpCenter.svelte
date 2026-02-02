<script lang="ts">
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  // TODO: Implement help center page
</script>

<svelte:head>
  <title>Help Center - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="help-container">
  <div class="help-content">
    <h1>Help Center</h1>
    <p class="coming-soon">Coming soon...</p>
  </div>
</div>

<style>
  .help-container {
    min-height: 100vh;
    padding: var(--space-8);
    background: hsl(var(--background));
  }

  .help-content {
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

