<script lang="ts">
  import { push } from "svelte-spa-router";
  import ParticleAudioPage from "$lib/components/ParticleAudioPage.svelte";

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    brandStyles?: {
      primaryColor?: string;
    } | null;
  };

  // Get brand color from app
  $: brandColor = app?.brandStyles?.primaryColor || "#4499ff";

  function handleClose() {
    push(`/apps/${appId}/voice`);
  }
</script>

<div class="voice-talk-container">
  <ParticleAudioPage
    {brandColor}
    applicationId={appId}
    onClose={handleClose}
  />
</div>

<style>
  .voice-talk-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: black;
    overflow: hidden;
  }
</style>
