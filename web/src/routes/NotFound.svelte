<script lang="ts">
  import { Button, Card } from "$lib/design-system";
  import { link } from "svelte-spa-router";
</script>

<div class="not-found">
  <Card padding="lg">
    <div class="content">
      <h1>404</h1>
      <h2>Page Not Found</h2>
      <p>The page you're looking for doesn't exist or has been moved.</p>
      <Button variant="primary">
        <a href="/" use:link>Go Home</a>
      </Button>
    </div>
  </Card>
</div>

<style>
  .not-found {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-4);
    background-color: var(--bg-secondary);
  }

  .content {
    text-align: center;
    padding: var(--space-8);
  }

  h1 {
    font-size: 6rem;
    font-weight: var(--font-bold);
    color: var(--color-primary);
    margin-bottom: var(--space-2);
    line-height: 1;
  }

  h2 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-4);
  }

  p {
    color: var(--text-secondary);
    margin-bottom: var(--space-6);
  }

  a {
    color: inherit;
    text-decoration: none;
  }
</style>
