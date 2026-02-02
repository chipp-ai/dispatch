<script lang="ts">
  /**
   * VideoPlayer
   *
   * Inline video player for chat messages.
   * Renders a native video element with controls in a compact card.
   */

  export let videoUrl: string;
</script>

<div class="video-player-card">
  <!-- svelte-ignore a11y-media-has-caption -->
  <video
    src={videoUrl}
    controls
    playsinline
    preload="metadata"
    class="video-element"
  ></video>
</div>

<style>
  .video-player-card {
    max-width: 320px;
    border-radius: 12px;
    overflow: hidden;
    background: black;
  }

  .video-element {
    width: 100%;
    display: block;
    border-radius: 12px;
  }
</style>
