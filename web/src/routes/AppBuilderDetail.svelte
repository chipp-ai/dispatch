<script lang="ts">
  import { onMount } from "svelte";
  import { replace } from "svelte-spa-router";

  export let params: { appId?: string } = {};

  // Redirect to build page - AppBuilderDetail is just a redirect
  onMount(() => {
    if (params.appId) {
      replace(`/apps/${params.appId}`);
    } else {
      replace("/apps");
    }
  });
</script>

<svelte:head>
  <title>App Builder - Chipp</title>
</svelte:head>

<div class="loading-container">
  <div class="spinner"></div>
</div>

<style>
  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--bg-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-primary);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
