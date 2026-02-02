<script lang="ts">
  /**
   * GeneratedImageCard
   *
   * Renders generated images inline in chat messages.
   * Uses a single fixed-size container for both loading and result states
   * to prevent content shift. The loading placeholder (animated aurora blobs)
   * sits behind the image, which fades in on top when ready.
   */
  import ImagePreviewModal from "./ImagePreviewModal.svelte";
  import type { ToolState } from "./types";

  export let state: ToolState = "call";
  export let input: unknown = null;
  export let output: unknown = null;
  export let error: string | null = null;

  let previewOpen = false;
  let imageLoaded = false;

  $: isLoading = state === "partial-call" || state === "call";
  $: isError = state === "error";
  $: isResult = state === "result";
  $: imageUrl = extractImageUrl(output);
  $: prompt = extractPrompt(input);
  $: showFrame = isLoading || (isResult && imageUrl);

  function extractImageUrl(out: unknown): string | null {
    if (!out) return null;
    const data = typeof out === "string" ? tryParse(out) : out;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.imageUrl === "string") return record.imageUrl;
      if (typeof record.url === "string") return record.url;
    }
    return null;
  }

  function extractPrompt(inp: unknown): string {
    if (!inp) return "";
    const data = typeof inp === "string" ? tryParse(inp) : inp;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.prompt === "string") return record.prompt;
    }
    return "";
  }

  function tryParse(str: string): unknown {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function openPreview() {
    if (imageUrl) {
      previewOpen = true;
    }
  }

  function handleImageLoad() {
    imageLoaded = true;
  }
</script>

<div class="generated-image-card">
  {#if isError}
    <div class="error-container">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span class="error-text">{error || "Image generation failed"}</span>
    </div>
  {:else if isResult && !imageUrl}
    <div class="error-container">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span class="error-text">No image returned</span>
    </div>
  {:else if showFrame}
    <!--
      Single container with fixed aspect ratio for both states.
      The aurora placeholder sits behind; the image fades in on top.
      No layout shift because the container never changes size.
    -->
    <div class="frame">
      <!-- Aurora placeholder (visible while loading, hides behind image) -->
      <div class="aurora" class:fade-out={imageLoaded}>
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
        <div class="sparkle sparkle-1">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.5 9.5 L21 8 L14.5 12 L18 19 L12 14 L6 19 L9.5 12 L3 8 L10.5 9.5 Z"/></svg>
        </div>
        <div class="sparkle sparkle-2">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.5 9.5 L21 8 L14.5 12 L18 19 L12 14 L6 19 L9.5 12 L3 8 L10.5 9.5 Z"/></svg>
        </div>
        <div class="sparkle sparkle-3">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 L13.5 9.5 L21 8 L14.5 12 L18 19 L12 14 L6 19 L9.5 12 L3 8 L10.5 9.5 Z"/></svg>
        </div>
      </div>

      <!-- Label overlay -->
      {#if isLoading}
        <div class="label-overlay">
          <span class="loading-label">Generating image...</span>
        </div>
      {/if}

      <!-- Image (loads on top, fades in) -->
      {#if isResult && imageUrl}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img
          src={imageUrl}
          alt={prompt || "Generated image"}
          class="generated-image"
          class:loaded={imageLoaded}
          on:click={openPreview}
          on:load={handleImageLoad}
        />
        <ImagePreviewModal
          src={imageUrl}
          alt={prompt || "Generated image"}
          bind:isOpen={previewOpen}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .generated-image-card {
    padding: 4px 0;
  }

  /* Stable container -- same dimensions in both states */
  .frame {
    position: relative;
    width: 320px;
    max-width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    background: hsl(var(--muted) / 0.3);
  }

  /* =========================================
   * AURORA PLACEHOLDER
   * Three soft blurred blobs that drift and
   * pulse, creating a lava-lamp / paint-mixing
   * feel while the image generates.
   * ========================================= */
  .aurora {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      hsl(250 40% 16%) 0%,
      hsl(270 30% 12%) 50%,
      hsl(220 35% 14%) 100%
    );
    transition: opacity 0.5s ease;
  }

  .aurora.fade-out {
    opacity: 0;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(40px);
    opacity: 0.7;
    mix-blend-mode: screen;
  }

  .blob-1 {
    width: 60%;
    height: 60%;
    top: 10%;
    left: 5%;
    background: radial-gradient(circle, hsl(280 70% 55% / 0.8), transparent 70%);
    animation: drift-1 6s ease-in-out infinite;
  }

  .blob-2 {
    width: 50%;
    height: 50%;
    top: 30%;
    right: 5%;
    background: radial-gradient(circle, hsl(200 80% 55% / 0.8), transparent 70%);
    animation: drift-2 7s ease-in-out infinite;
  }

  .blob-3 {
    width: 45%;
    height: 45%;
    bottom: 5%;
    left: 25%;
    background: radial-gradient(circle, hsl(330 65% 55% / 0.7), transparent 70%);
    animation: drift-3 8s ease-in-out infinite;
  }

  @keyframes drift-1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(15%, 20%) scale(1.1); }
    66% { transform: translate(-10%, 5%) scale(0.95); }
  }

  @keyframes drift-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(-20%, -10%) scale(1.15); }
    66% { transform: translate(10%, 15%) scale(0.9); }
  }

  @keyframes drift-3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(20%, -15%) scale(1.05); }
    66% { transform: translate(-15%, 10%) scale(1.1); }
  }

  /* Sparkle stars */
  .sparkle {
    position: absolute;
    color: white;
    opacity: 0;
    pointer-events: none;
  }

  .sparkle svg {
    width: 100%;
    height: 100%;
  }

  .sparkle-1 {
    width: 14px;
    height: 14px;
    top: 22%;
    left: 65%;
    animation: twinkle 3s ease-in-out 0.5s infinite;
  }

  .sparkle-2 {
    width: 10px;
    height: 10px;
    top: 55%;
    left: 30%;
    animation: twinkle 3s ease-in-out 1.5s infinite;
  }

  .sparkle-3 {
    width: 12px;
    height: 12px;
    top: 38%;
    left: 78%;
    animation: twinkle 3s ease-in-out 2.5s infinite;
  }

  @keyframes twinkle {
    0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
    15% { opacity: 0.9; transform: scale(1) rotate(20deg); }
    30% { opacity: 0; transform: scale(0.5) rotate(40deg); }
  }

  /* Label centered at bottom */
  .label-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: 12px;
    background: linear-gradient(transparent, hsl(250 30% 10% / 0.6));
    z-index: 1;
  }

  .loading-label {
    font-size: var(--text-xs, 12px);
    font-weight: var(--font-medium, 500);
    color: hsl(0 0% 85%);
    letter-spacing: 0.02em;
    animation: pulse-opacity 2s ease-in-out infinite;
  }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Image sits on top, fades in over the placeholder */
  .generated-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.4s ease, box-shadow 0.2s ease;
    z-index: 2;
  }

  .generated-image.loaded {
    opacity: 1;
  }

  .generated-image:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  /* Error state */
  .error-container {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
  }

  .error-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: hsl(0 84% 60%);
  }

  .error-text {
    font-size: var(--text-xs, 12px);
    font-weight: var(--font-medium, 500);
    color: hsl(0 84% 60%);
  }
</style>
