<script lang="ts">
  import ParticleAudioPageLegacy from "./ParticleAudioPageLegacy.svelte";

  // Props
  export let brandColor: string = "#4499ff";
  export let applicationId: string = "";
  export let apiBaseUrl: string = "";
  export let onClose: (() => void) | undefined = undefined;

  /**
   * Voice UI component that conditionally renders based on VITE_LIVEKIT_VOICE_ENABLED.
   *
   * When enabled (true): LiveKit-based voice is intended (for public SaaS)
   * When disabled (false/unset): Uses legacy OpenAI Realtime API (for single-tenant deployments)
   *
   * Note: LiveKit voice is not currently implemented for the Svelte/embedded widget.
   * If enabled, it falls back to legacy with a console warning.
   * This allows single-tenant deployments to continue using the existing OpenAI Realtime voice
   * implementation while the main app (chipp-admin) can use LiveKit.
   */
  const isLiveKitEnabled = import.meta.env.VITE_LIVEKIT_VOICE_ENABLED === "true";

  // Log warning if LiveKit is enabled but not available in Svelte context
  if (isLiveKitEnabled) {
    console.warn(
      "[ParticleAudioPage] LiveKit voice is enabled but not available in embedded widget. Falling back to legacy OpenAI Realtime implementation."
    );
  }
</script>

<!--
  For now, always render the legacy implementation since LiveKit isn't available in Svelte.
  When/if LiveKit is added, this can be updated to conditionally render:

  {#if isLiveKitEnabled}
    <ParticleAudioPageLiveKit {brandColor} {applicationId} {apiBaseUrl} {onClose} />
  {:else}
    <ParticleAudioPageLegacy {brandColor} {applicationId} {apiBaseUrl} {onClose} />
  {/if}
-->
<ParticleAudioPageLegacy {brandColor} {applicationId} {apiBaseUrl} {onClose} />
