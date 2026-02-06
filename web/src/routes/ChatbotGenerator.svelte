<script lang="ts">
  import { querystring, push } from "svelte-spa-router";
  import AppGenerator from "../lib/design-system/components/AppGenerator.svelte";

  // Extract initial prompt from URL reactively
  $: initialPrompt = (() => {
    if (!$querystring) return "";
    const params = new URLSearchParams($querystring);
    const encodedData = params.get("d");
    if (!encodedData) return "";
    try {
      return decodeURIComponent(atob(encodedData));
    } catch {
      return "";
    }
  })();

  // Redirect if no prompt provided (after initial load)
  $: if ($querystring !== null && !initialPrompt) {
    push("/");
  }
</script>

<svelte:head>
  <title>Create AI Assistant - Chipp</title>
</svelte:head>

{#if initialPrompt}
  <AppGenerator {initialPrompt} />
{:else}
  <!-- Loading state while decoding -->
  <div class="loading">
    <div class="spinner"></div>
  </div>
{/if}

<style>
  .loading {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--muted));
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
