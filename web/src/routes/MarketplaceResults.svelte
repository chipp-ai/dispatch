<script lang="ts">
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  // TODO: Implement marketplace results page with search results
</script>

<svelte:head>
  <title>Marketplace Results - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="results-container">
  <div class="results-content">
    <h1>Search Results</h1>
    <p class="subtitle">Marketplace search results</p>
    <p class="coming-soon">Coming soon...</p>
  </div>
</div>

<style>
  .results-container {
    min-height: 100vh;
    padding: var(--space-8);
    background: hsl(var(--background));
  }

  .results-content {
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

