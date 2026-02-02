<script lang="ts">
  /**
   * SourceCitation
   *
   * Renders inline citation buttons that open a modal with RAG chunk content.
   * Used for displaying source references in chat messages.
   */
  import { createEventDispatcher } from "svelte";
  import { Markdown } from "$lib/design-system";
  import type { CitationMetadata } from "./types";

  export let id: string;
  export let fileType: "URL" | "Document" = "Document";
  export let faviconUrl: string | null = null;
  export let displayName: string = "";
  export let citationMetadata: CitationMetadata | undefined = undefined;
  export let applicationId: number | undefined = undefined;
  export let isBuilder: boolean = false;

  const dispatch = createEventDispatcher<{
    viewSource: { id: string };
  }>();

  let dialogOpen = false;
  let isLoading = false;
  let textChunk: { content: string; title?: string } | null = null;
  let loadError = false;

  // Get metadata for this citation
  $: metadata = citationMetadata?.[id];
  $: rawDisplayName = displayName || metadata?.displayName || `Source ${id}`;
  $: parsedDisplayName = parseUrlFilename(rawDisplayName);
  $: similarity = metadata?.similarity || 0;
  $: confidencePercentage = Math.round(similarity * 100);

  // Determine if this is a URL citation
  $: isUrlCitation =
    fileType === "URL" ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      id
    ) ||
    (metadata?.fileName && metadata.fileName.startsWith("url_"));

  // Get favicon URL - priority: direct prop > metadata
  $: effectiveFaviconUrl = faviconUrl || metadata?.faviconUrl;
  $: hasValidFavicon =
    isUrlCitation &&
    effectiveFaviconUrl &&
    (effectiveFaviconUrl.startsWith("http://") ||
      effectiveFaviconUrl.startsWith("https://"));

  /**
   * Parse URL filenames to readable format
   */
  function parseUrlFilename(filename: string): string {
    if (!filename) return "Source";

    // If it's a URL, extract domain
    try {
      if (filename.startsWith("http://") || filename.startsWith("https://")) {
        const url = new URL(filename);
        return url.hostname.replace("www.", "");
      }
    } catch {
      // Not a URL, continue
    }

    // Remove UUID prefix if present
    const uuidPattern =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/i;
    filename = filename.replace(uuidPattern, "");

    // Remove url_ prefix
    if (filename.startsWith("url_")) {
      filename = filename.slice(4);
    }

    // Truncate if too long
    if (filename.length > 25) {
      return filename.slice(0, 22) + "...";
    }

    return filename;
  }

  async function handleViewSource() {
    dialogOpen = true;
    isLoading = true;
    loadError = false;

    try {
      const response = await fetch(
        `/api/chunks/${id}?applicationId=${applicationId || 0}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch chunk");
      }
      const data = await response.json();
      textChunk = data;
    } catch (error) {
      console.error("Failed to fetch text chunk:", error);
      loadError = true;
      textChunk = null;
    } finally {
      isLoading = false;
    }

    dispatch("viewSource", { id });
  }

  function closeDialog() {
    dialogOpen = false;
    textChunk = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && dialogOpen) {
      closeDialog();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains("dialog-backdrop")) {
      closeDialog();
    }
  }

  let faviconError = false;
  function handleFaviconError() {
    faviconError = true;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<span class="citation-wrapper">
  <button
    class="citation-button"
    on:click={handleViewSource}
    disabled={isLoading}
    title={isBuilder && metadata
      ? `View source (${confidencePercentage}% confidence)`
      : "View source reference"}
  >
    <span class="citation-shimmer"></span>
    <span class="citation-content">
      {#if hasValidFavicon && !faviconError}
        <img
          src={effectiveFaviconUrl}
          alt=""
          class="citation-favicon"
          on:error={handleFaviconError}
        />
      {:else}
        <svg
          class="citation-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      {/if}
      <span class="citation-name">{parsedDisplayName}</span>
    </span>
  </button>
</span>

{#if dialogOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="dialog-backdrop" on:click={handleBackdropClick}>
    <div class="dialog-content" role="dialog" aria-modal="true">
      {#if isLoading}
        <div class="dialog-loading">
          <div class="loading-header">
            <div class="loading-placeholder"></div>
          </div>
          <div class="loading-divider"></div>
          <div class="loading-body">
            <div class="loading-spinner"></div>
            <p>Loading source...</p>
          </div>
          <div class="loading-footer"></div>
        </div>
      {:else}
        <div class="dialog-scroll">
          <div class="dialog-header">
            <div class="header-title">
              {#if hasValidFavicon && !faviconError}
                <img
                  src={effectiveFaviconUrl}
                  alt=""
                  class="header-favicon"
                />
              {:else}
                <svg
                  class="header-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                  />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              {/if}
              <h2>
                {metadata?.displayName ||
                  textChunk?.title ||
                  rawDisplayName ||
                  `Source ${id}`}
              </h2>
            </div>
            {#if isBuilder && metadata}
              <p class="confidence-score">
                Confidence Score: {confidencePercentage}%
              </p>
            {/if}
            <button class="close-button" on:click={closeDialog} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="dialog-divider"></div>

          <div class="dialog-body">
            {#if loadError}
              <div class="error-message">
                <p>Failed to load source content.</p>
              </div>
            {:else if textChunk}
              <div class="source-content">
                <Markdown content={textChunk.content} />
              </div>
            {:else}
              <div class="empty-message">
                <p>No content available for this source.</p>
              </div>
            {/if}
          </div>
        </div>

        <div class="dialog-footer">
          <button class="close-btn" on:click={closeDialog}>Close</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .citation-wrapper {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    vertical-align: baseline;
  }

  .citation-button {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    margin-left: 4px;
    font-size: 11px;
    font-weight: 500;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .citation-button:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
  }

  .citation-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .citation-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transform: translateX(-100%);
  }

  .citation-button:hover .citation-shimmer {
    transform: translateX(100%);
    transition: transform 0.7s ease;
  }

  .citation-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .citation-favicon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .citation-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .citation-name {
    font-size: 10px;
    font-weight: 500;
  }

  /* Dialog styles */
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: var(--space-4);
  }

  .dialog-content {
    background: hsl(var(--background));
    border-radius: var(--radius-lg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .dialog-scroll {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6);
  }

  .dialog-header {
    position: relative;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .header-title h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
    word-break: break-word;
  }

  .header-favicon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .header-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: hsl(var(--primary));
  }

  .confidence-score {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-1);
  }

  .close-button {
    position: absolute;
    top: 0;
    right: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
  }

  .close-button:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .close-button svg {
    width: 16px;
    height: 16px;
  }

  .dialog-divider {
    height: 1px;
    background: hsl(var(--border));
    margin: var(--space-4) 0;
  }

  .dialog-body {
    min-height: 200px;
  }

  .source-content {
    line-height: 1.6;
  }

  .error-message,
  .empty-message {
    text-align: center;
    padding: var(--space-8) 0;
    color: hsl(var(--muted-foreground));
  }

  .dialog-footer {
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.5);
    display: flex;
    justify-content: flex-end;
  }

  .close-btn {
    padding: var(--space-2) var(--space-4);
    min-width: 100px;
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: hsl(var(--muted));
  }

  /* Loading state */
  .dialog-loading {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .loading-header {
    padding: var(--space-6);
  }

  .loading-placeholder {
    height: 72px;
  }

  .loading-divider {
    height: 1px;
    background: hsl(var(--border));
    margin: 0 var(--space-6);
  }

  .loading-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--muted));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-body p {
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .loading-footer {
    height: 73px;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.5);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
