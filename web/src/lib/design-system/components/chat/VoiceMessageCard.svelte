<script lang="ts">
  /**
   * VoiceMessageCard
   *
   * Inline audio player for voice messages. Renders a compact card with:
   * - Play/pause toggle
   * - Animated waveform bars (or progress bar)
   * - Duration / elapsed time
   */
  import { onMount, onDestroy } from "svelte";

  export let audioUrl: string;
  export let durationMs: number = 0;
  export let primaryColor: string = "#4499ff";

  let audio: HTMLAudioElement;
  let playing = false;
  let currentTime = 0;
  let duration = 0;
  let progress = 0;
  let animationFrame: number | null = null;

  // Generate static waveform bars (pseudo-random heights for visual interest)
  const BAR_COUNT = 28;
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    // Deterministic pseudo-random based on index
    const h = 0.2 + 0.8 * Math.abs(Math.sin(i * 1.8 + 0.5) * Math.cos(i * 0.7 + 2.1));
    bars.push(h);
  }

  function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  $: displayDuration = duration > 0 ? duration : durationMs / 1000;
  $: timeLabel = playing || currentTime > 0
    ? formatTime(currentTime)
    : formatTime(displayDuration);

  function togglePlay() {
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function updateProgress() {
    if (!audio) return;
    currentTime = audio.currentTime;
    duration = audio.duration || 0;
    progress = duration > 0 ? currentTime / duration : 0;
    if (playing) {
      animationFrame = requestAnimationFrame(updateProgress);
    }
  }

  function handlePlay() {
    playing = true;
    updateProgress();
  }

  function handlePause() {
    playing = false;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function handleEnded() {
    playing = false;
    currentTime = 0;
    progress = 0;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function handleLoadedMetadata() {
    if (audio) {
      duration = audio.duration || 0;
    }
  }

  function handleBarClick(event: MouseEvent) {
    if (!audio || !duration) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const pct = x / rect.width;
    audio.currentTime = pct * duration;
    currentTime = audio.currentTime;
    progress = pct;
  }

  onDestroy(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    if (audio) {
      audio.pause();
    }
  });
</script>

<div class="voice-card" style="--primary: {primaryColor}">
  <audio
    bind:this={audio}
    src={audioUrl}
    preload="metadata"
    on:play={handlePlay}
    on:pause={handlePause}
    on:ended={handleEnded}
    on:loadedmetadata={handleLoadedMetadata}
  ></audio>

  <button class="play-btn" on:click={togglePlay} aria-label={playing ? "Pause" : "Play"}>
    {#if playing}
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.14v14l11-7-11-7z" />
      </svg>
    {/if}
  </button>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="waveform" on:click={handleBarClick} role="slider" tabindex="0" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Audio progress">
    {#each bars as height, i}
      {@const barProgress = (i + 0.5) / BAR_COUNT}
      <div
        class="bar"
        class:played={barProgress <= progress}
        style="height: {height * 100}%; opacity: {barProgress <= progress ? 1 : 0.4}"
      ></div>
    {/each}
  </div>

  <span class="time">{timeLabel}</span>
</div>

<style>
  .voice-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    min-width: 200px;
    max-width: 280px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 16px;
  }

  audio {
    display: none;
  }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    color: white;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .play-btn:hover {
    background: rgba(255, 255, 255, 0.35);
    transform: scale(1.05);
  }

  .play-btn:active {
    transform: scale(0.95);
  }

  .play-btn svg {
    width: 16px;
    height: 16px;
  }

  .waveform {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    cursor: pointer;
    padding: 2px 0;
  }

  .bar {
    flex: 1;
    min-width: 2px;
    max-width: 4px;
    border-radius: 1px;
    background: white;
    transition: opacity 0.1s ease;
  }

  .bar.played {
    opacity: 1 !important;
  }

  .time {
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.8);
    flex-shrink: 0;
    min-width: 30px;
    text-align: right;
  }
</style>
