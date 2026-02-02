<script lang="ts">
  /**
   * VideoPlayer Component
   *
   * Renders embedded video players for YouTube, Vimeo, and direct video files.
   * Uses native iframe embeds for YouTube/Vimeo and HTML5 video for direct files.
   */
  import { getVideoType, getEmbedUrl, getYouTubeVideoId } from "../utils/videoUtils";

  export let url: string;

  $: videoType = getVideoType(url);
  $: embedUrl = getEmbedUrl(url);
  $: youtubeId = getYouTubeVideoId(url);
  $: thumbnailUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;

  let hasError = false;

  function handleError() {
    hasError = true;
  }
</script>

<div class="video-player">
  {#if hasError}
    <div class="error-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>Video unavailable</span>
      <a href={url} target="_blank" rel="noopener noreferrer" class="video-link">
        Open video link
      </a>
    </div>
  {:else if videoType === 'youtube' || videoType === 'vimeo'}
    <div class="iframe-wrapper">
      <iframe
        src={embedUrl}
        title={videoType === 'youtube' ? 'YouTube video player' : 'Vimeo video player'}
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        on:error={handleError}
      ></iframe>
    </div>
  {:else if videoType === 'direct'}
    <video
      controls
      preload="metadata"
      on:error={handleError}
    >
      <source src={url} />
      Your browser does not support video playback.
    </video>
  {:else}
    <div class="error-state">
      <span>Unknown video format</span>
      <a href={url} target="_blank" rel="noopener noreferrer" class="video-link">
        Open video link
      </a>
    </div>
  {/if}
</div>

<style>
  .video-player {
    width: 100%;
    max-width: 640px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: hsl(var(--muted));
  }

  .iframe-wrapper {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
  }

  .iframe-wrapper iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  video {
    width: 100%;
    display: block;
    border-radius: var(--radius-md);
    background: #000;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-8);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .error-state svg {
    width: 48px;
    height: 48px;
    opacity: 0.5;
  }

  .video-link {
    color: hsl(var(--primary));
    text-decoration: underline;
    font-size: var(--text-sm);
  }

  .video-link:hover {
    opacity: 0.8;
  }
</style>
