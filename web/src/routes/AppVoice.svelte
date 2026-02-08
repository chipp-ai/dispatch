<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import ParticleAudioPage from "$lib/components/ParticleAudioPage.svelte";
  import { captureException } from "$lib/sentry";

  export let params: { appId?: string } = {};

  // App data
  interface AppData {
    id: string;
    name: string;
    brandStyles: {
      primaryColor?: string;
    } | null;
  }

  let app: AppData | null = null;
  let isLoading = true;

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await loadApp();
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          push("/login");
          return;
        }
        if (response.status === 404) {
          push("/apps");
          return;
        }
        throw new Error("Failed to load application");
      }

      const data = await response.json();
      app = data.data;
    } catch (error) {
      captureException(error, { tags: { page: "app-voice", feature: "load-app" }, extra: { appId: params.appId } });
      push("/apps");
    } finally {
      isLoading = false;
    }
  }

  function handleClose() {
    push(`/apps/${params.appId}/voice`);
  }

  // Get brand color from app
  $: brandColor = app?.brandStyles?.primaryColor || "#4499ff";
</script>

<svelte:head>
  <title>{app?.name || "Voice"} - Voice Mode - Chipp</title>
</svelte:head>

<div class="voice-page">
  {#if isLoading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else if app}
    <ParticleAudioPage
      {brandColor}
      applicationId={params.appId || ""}
      onClose={handleClose}
    />
  {/if}
</div>

<style>
  .voice-page {
    position: fixed;
    inset: 0;
    background: black;
    z-index: 100;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: white;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
