<script lang="ts">
  /**
   * VideoGenerationStatus
   *
   * Displays the status of an async video generation job.
   * Polls for progress updates and shows:
   * - Progress bar with percentage
   * - Phase indicator (initializing, queued, generating, downloading, uploading)
   * - Estimated time remaining
   * - Completed video player
   * - Error state with retry button
   */
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import type { VideoGenerationPhase, VideoGenerationStatus as VideoGenStatus } from "./types";

  export let jobId: string;
  export let onComplete: ((videoUrl: string) => void) | undefined = undefined;
  export let onRetry: ((newJobId: string) => void) | undefined = undefined;

  const dispatch = createEventDispatcher<{
    complete: { videoUrl: string };
    retry: { newJobId: string };
  }>();

  // State
  let phase: VideoGenerationPhase = "initializing";
  let progress = 0;
  let estimatedTimeRemaining: number | undefined = undefined;
  let videoUrl: string | undefined = undefined;
  let error: string | undefined = undefined;
  let isConnected = false;
  let isRetrying = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const phaseLabels: Record<VideoGenerationPhase, string> = {
    initializing: "Initializing",
    queued: "Queued",
    generating: "Generating video",
    downloading: "Downloading",
    uploading: "Uploading",
    complete: "Complete",
    failed: "Failed",
  };

  $: isComplete = phase === "complete" && !error && videoUrl;
  $: isFailed = error || phase === "failed";
  $: isInProgress = !isComplete && !isFailed;

  async function pollStatus() {
    try {
      const response = await fetch(`/api/video-generation/${jobId}/status`);
      if (!response.ok) {
        throw new Error("Failed to fetch status");
      }

      const data = await response.json();
      isConnected = true;

      phase = data.phase || "initializing";
      progress = data.progress || 0;
      estimatedTimeRemaining = data.estimatedTimeRemaining;
      videoUrl = data.videoUrl;
      error = data.error;

      // Check if complete
      if (phase === "complete" && videoUrl) {
        stopPolling();
        onComplete?.(videoUrl);
        dispatch("complete", { videoUrl });
      }

      // Check if failed
      if (phase === "failed" || error) {
        stopPolling();
      }
    } catch (err) {
      console.error("Error polling video status:", err);
      isConnected = false;
    }
  }

  function startPolling() {
    // Poll immediately
    pollStatus();
    // Then poll every 2 seconds
    pollInterval = setInterval(pollStatus, 2000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function handleRetry() {
    isRetrying = true;
    try {
      const response = await fetch(`/api/video-generation/${jobId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to retry video generation");
      }

      const data = await response.json();

      // Reset state
      phase = "initializing";
      progress = 0;
      error = undefined;
      videoUrl = undefined;

      // Notify parent
      if (data.newJobId) {
        onRetry?.(data.newJobId);
        dispatch("retry", { newJobId: data.newJobId });
      }

      // Start polling the new job
      startPolling();
    } catch (err) {
      console.error("Error retrying video generation:", err);
      error = err instanceof Error ? err.message : "Failed to retry";
    } finally {
      isRetrying = false;
    }
  }

  onMount(() => {
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });

  function formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return `${Math.ceil(seconds)}s remaining`;
    }
    return `~${Math.ceil(seconds / 60)} min remaining`;
  }
</script>

<div class="video-generation-card" class:error={isFailed} class:complete={isComplete}>
  {#if isComplete && videoUrl}
    <!-- Completed state: show video player -->
    <div class="card-header">
      <div class="status-icon success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <span class="status-text">Video generated successfully</span>
    </div>
    <div class="video-container">
      <video controls preload="metadata" src={videoUrl}>
        Your browser does not support the video tag.
      </video>
    </div>
  {:else if isFailed}
    <!-- Error state -->
    <div class="card-header">
      <div class="status-icon error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <span class="status-text error-text">
        {error || "Video generation failed"}
      </span>
    </div>
    <button
      class="retry-button"
      on:click={handleRetry}
      disabled={isRetrying}
    >
      {#if isRetrying}
        <div class="spinner small"></div>
        <span>Retrying...</span>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
        </svg>
        <span>Retry video generation</span>
      {/if}
    </button>
  {:else}
    <!-- Progress state -->
    <div class="card-header">
      <div class="status-icon" class:spinning={phase !== "generating"}>
        {#if phase === "generating"}
          <svg class="pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        {:else}
          <div class="spinner"></div>
        {/if}
      </div>
      <span class="status-text">{phaseLabels[phase] || "Processing"}</span>
      {#if !isConnected}
        <span class="connecting-text">Connecting...</span>
      {/if}
    </div>

    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress}%"></div>
      </div>
      <div class="progress-info">
        <span class="progress-percent">{Math.round(progress)}%</span>
        {#if estimatedTimeRemaining && estimatedTimeRemaining > 0}
          <span class="progress-time">{formatTimeRemaining(estimatedTimeRemaining)}</span>
        {/if}
      </div>
    </div>

    {#if phase === "generating"}
      <p class="hint-text">
        This may take a few minutes. You can close this and check back later.
      </p>
    {/if}
  {/if}
</div>

<style>
  .video-generation-card {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 640px;
  }

  .video-generation-card.error {
    background: hsl(0 84% 60% / 0.05);
    border-color: hsl(0 84% 60% / 0.2);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .status-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: hsl(var(--foreground));
  }

  .status-icon svg {
    width: 100%;
    height: 100%;
  }

  .status-icon.success {
    color: hsl(142 76% 36%);
  }

  .status-icon.error {
    color: hsl(0 84% 60%);
  }

  .status-icon .pulse {
    animation: pulse 2s ease-in-out infinite;
  }

  .status-text {
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .status-text.error-text {
    color: hsl(0 60% 40%);
  }

  .connecting-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin-left: auto;
  }

  .progress-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .progress-bar {
    height: 8px;
    background: hsl(var(--muted));
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: hsl(var(--primary));
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .video-container {
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #000;
  }

  .video-container video {
    width: 100%;
    display: block;
  }

  .hint-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .retry-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .retry-button:hover:not(:disabled) {
    background: hsl(var(--muted));
  }

  .retry-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .retry-button svg {
    width: 16px;
    height: 16px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid hsl(var(--muted));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .spinner.small {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
</style>
