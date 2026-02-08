<script lang="ts">
  /**
   * ImagePreviewModal
   *
   * Full-screen modal overlay for image preview.
   * Features:
   * - Click outside or X to close
   * - Download button
   * - Keyboard navigation (Escape to close)
   * - Max 90vh/90vw dimensions
   */
  import { createEventDispatcher } from "svelte";
  import { captureException } from "$lib/sentry";

  export let src: string;
  export let alt: string = "";
  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
    download: { src: string };
  }>();

  function close() {
    isOpen = false;
    dispatch("close");
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && isOpen) {
      close();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains("modal-backdrop")) {
      close();
    }
  }

  async function handleDownload() {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      
      // Extract filename from URL or use default
      const urlParts = src.split("/");
      const filename = urlParts[urlParts.length - 1] || "image";
      link.download = filename.split("?")[0]; // Remove query params
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      dispatch("download", { src });
    } catch (err) {
      captureException(err, {
        tags: { feature: "image-preview" },
        extra: { action: "download-image", src },
      });
      // Fallback: open in new tab
      window.open(src, "_blank");
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="Image preview">
      <!-- Close button -->
      <button class="close-button" on:click={close} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <!-- Download button -->
      <button class="download-button" on:click={handleDownload} aria-label="Download image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>

      <!-- Image -->
      <img {src} {alt} class="preview-image" />
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    padding: var(--space-4);
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    animation: scaleIn 0.2s ease;
  }

  @keyframes scaleIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .close-button,
  .download-button {
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 101;
  }

  .close-button {
    top: var(--space-4);
    right: var(--space-4);
  }

  .download-button {
    top: var(--space-4);
    right: calc(var(--space-4) + 52px);
  }

  .close-button:hover,
  .download-button:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.05);
  }

  .close-button svg,
  .download-button svg {
    width: 20px;
    height: 20px;
  }
</style>
