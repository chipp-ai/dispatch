<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ArrowLeft, Loader2 } from 'lucide-svelte';
  import { captureException } from '$lib/sentry';

  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    back: void;
    close: void;
    sourceAdded: { id: string; type: string; name: string; url?: string };
  }>();

  let urlInputValue = '';
  let isProcessing = false;
  let processingStage: 'idle' | 'fetching' | 'transcribing' | 'analyzing' | 'complete' = 'idle';
  let error: string | null = null;
  let videoInfo: { title: string; thumbnail: string; channel: string; duration: string } | null = null;

  const YOUTUBE_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

  function extractVideoId(url: string): string | null {
    const match = url.match(YOUTUBE_URL_REGEX);
    return match ? match[1] : null;
  }

  function isValidYouTubeUrl(url: string): boolean {
    return YOUTUBE_URL_REGEX.test(url);
  }

  function getProcessingMessage(): string {
    switch (processingStage) {
      case 'fetching': return 'Fetching video information...';
      case 'transcribing': return 'Retrieving video transcript...';
      case 'analyzing': return 'Analyzing video content...';
      case 'complete': return 'Video processed successfully!';
      default: return '';
    }
  }

  async function handleAddVideo() {
    const url = urlInputValue.trim();

    if (!url) {
      error = 'Please enter a YouTube URL';
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      error = 'Please enter a valid YouTube URL';
      return;
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      error = 'Could not extract video ID from URL';
      return;
    }

    isProcessing = true;
    error = null;
    processingStage = 'fetching';

    try {
      // For now, we'll use a simplified approach since chipp-deno
      // may not have the full Temporal workflow setup for YouTube
      // This creates a placeholder that can be enhanced later

      // Simulate fetching video metadata
      videoInfo = {
        title: 'Loading video info...',
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channel: '',
        duration: '',
      };

      processingStage = 'transcribing';

      // TODO: When YouTube upload API is available in chipp-deno,
      // implement the actual upload flow similar to WebsiteUploadScreen
      // For now, show a coming soon message

      await new Promise(resolve => setTimeout(resolve, 1500));

      error = 'YouTube integration is being ported from the main app. Please use the main app for now.';
      processingStage = 'idle';
      isProcessing = false;

    } catch (e) {
      captureException(e, {
        tags: { feature: "youtube-upload" },
        extra: { applicationId },
      });
      error = e instanceof Error ? e.message : 'Failed to add YouTube video';
      processingStage = 'idle';
      isProcessing = false;
    }
  }

  function handleBack() {
    dispatch('back');
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="ks-upload-screen">
  <div class="ks-upload-content">
    <!-- Header with back button -->
    <div class="ks-upload-header">
      <button class="ks-back-btn" on:click={handleBack}>
        <ArrowLeft size={20} />
        Back
      </button>
      <h2 class="ks-upload-title">Add YouTube Video</h2>
      <p class="ks-upload-description">
        Extract transcript and metadata from YouTube videos
      </p>
    </div>

    {#if processingStage === 'idle' && !isProcessing}
      <!-- URL Input Form -->
      <div class="ks-form-section">
        <div class="ks-form-group">
          <label for="youtube-url" class="ks-label">YouTube Video URL</label>
          <input
            id="youtube-url"
            type="url"
            class="ks-input"
            placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
            bind:value={urlInputValue}
            on:keydown={(e) => e.key === 'Enter' && handleAddVideo()}
          />
          <p class="ks-input-hint">
            We'll extract the video transcript and metadata to use as a knowledge source
          </p>
        </div>

        {#if error}
          <div class="ks-error-message">
            {error}
          </div>
        {/if}
      </div>
    {:else if isProcessing || processingStage === 'complete'}
      <!-- Processing State -->
      <div class="ks-processing-state">
        <!-- YouTube Icon -->
        <div class="ks-youtube-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>

        <!-- Video Preview -->
        {#if videoInfo}
          <div class="ks-video-preview">
            {#if videoInfo.thumbnail}
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                class="ks-video-thumbnail"
              />
            {/if}
            <div class="ks-video-info">
              <h3 class="ks-video-title">{videoInfo.title}</h3>
              {#if videoInfo.channel}
                <p class="ks-video-channel">
                  {videoInfo.channel}
                  {#if videoInfo.duration}
                    <span class="ks-video-duration">{videoInfo.duration}</span>
                  {/if}
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Progress -->
        <div class="ks-progress-section">
          <p class="ks-processing-message">{getProcessingMessage()}</p>
          {#if isProcessing && processingStage !== 'complete'}
            <div class="ks-progress-bar">
              <div class="ks-progress-fill ks-progress-indeterminate"></div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="ks-upload-footer">
    {#if processingStage === 'complete'}
      <button class="ks-btn ks-btn-primary" on:click={handleClose}>
        Done
      </button>
    {:else}
      <button
        class="ks-btn ks-btn-primary"
        on:click={handleAddVideo}
        disabled={!urlInputValue || isProcessing}
      >
        {#if isProcessing}
          <Loader2 size={16} class="ks-btn-spinner" />
          Processing...
        {:else}
          Add Video
        {/if}
      </button>
    {/if}
  </div>
</div>

<style>
  .ks-upload-screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
  }

  .ks-upload-content {
    flex: 1;
    overflow-y: auto;
  }

  .ks-upload-header {
    margin-bottom: var(--space-6);
  }

  .ks-back-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: var(--space-4);
  }

  .ks-back-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  .ks-upload-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .ks-upload-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .ks-form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ks-form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ks-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ks-input {
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: var(--text-sm);
    transition: all 0.2s ease;
  }

  .ks-input:focus {
    outline: none;
    border-color: #ef4444;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }

  .ks-input::placeholder {
    color: var(--text-tertiary);
  }

  .ks-input-hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin: 0;
  }

  /* Error Message */
  .ks-error-message {
    padding: var(--space-3) var(--space-4);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-lg);
    color: #f87171;
    font-size: var(--text-sm);
  }

  /* Processing State */
  .ks-processing-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-8) 0;
  }

  .ks-youtube-icon {
    color: #ef4444;
  }

  .ks-video-preview {
    width: 100%;
    max-width: 400px;
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-primary);
  }

  .ks-video-thumbnail {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
  }

  .ks-video-info {
    padding: var(--space-3) var(--space-4);
  }

  .ks-video-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .ks-video-channel {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    margin: var(--space-1) 0 0 0;
  }

  .ks-video-duration {
    margin-left: var(--space-2);
  }

  .ks-video-duration::before {
    content: '·';
    margin-right: var(--space-2);
  }

  .ks-progress-section {
    width: 100%;
    max-width: 300px;
    text-align: center;
  }

  .ks-processing-message {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0 0 var(--space-3) 0;
  }

  .ks-progress-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .ks-progress-fill {
    height: 100%;
    background: #ef4444;
    border-radius: 4px;
  }

  .ks-progress-indeterminate {
    width: 30%;
    animation: indeterminate 1.5s infinite ease-in-out;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }

  /* Footer */
  .ks-upload-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-primary);
    margin-top: var(--space-4);
  }

  .ks-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .ks-btn-primary {
    background: #ef4444;
    color: white;
  }

  .ks-btn-primary:hover:not(:disabled) {
    background: #dc2626;
  }

  .ks-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.ks-btn-spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
