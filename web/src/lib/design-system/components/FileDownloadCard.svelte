<script lang="ts">
  /**
   * FileDownloadCard Component
   *
   * Renders a styled download card for generated files.
   * Shows file type icon, name, and download button with loading state.
   */
  import type { FileDownloadInfo } from "../utils/fileUtils";
  import { getFileCategory, getFileTypeColor } from "../utils/fileUtils";

  export let fileInfo: FileDownloadInfo;
  export let onClick: (e: MouseEvent) => void = () => {};

  type DownloadState = "idle" | "downloading" | "success" | "error";
  let downloadState: DownloadState = "idle";

  $: category = getFileCategory(fileInfo.fileExtension);
  $: colors = getFileTypeColor(fileInfo.fileExtension);

  async function handleDownload(e: MouseEvent) {
    e.preventDefault();
    downloadState = "downloading";

    try {
      await onClick(e);
      downloadState = "success";
      setTimeout(() => {
        downloadState = "idle";
      }, 2000);
    } catch {
      downloadState = "error";
      setTimeout(() => {
        downloadState = "idle";
      }, 3000);
    }
  }

  // Get icon based on file category
  function getIcon(cat: string): string {
    const icons: Record<string, string> = {
      document: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      spreadsheet: "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
      presentation: "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
      image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
      code: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
      archive: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
      other: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    };
    return icons[cat] || icons.other;
  }
</script>

<button
  class="file-card"
  class:downloading={downloadState === "downloading"}
  class:success={downloadState === "success"}
  class:error={downloadState === "error"}
  on:click={handleDownload}
  disabled={downloadState === "downloading"}
>
  <div class="icon-wrapper {colors.bg}">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={colors.icon}
    >
      <path d={getIcon(category)}></path>
    </svg>
  </div>

  <div class="file-info">
    <span class="file-name">{fileInfo.fileName}</span>
    <span class="file-type">{fileInfo.fileExtension.toUpperCase()} File</span>
  </div>

  <div class="download-icon">
    {#if downloadState === "downloading"}
      <svg class="spinner" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 11-6.219-8.56"></path>
      </svg>
    {:else if downloadState === "success"}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>
    {:else if downloadState === "error"}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    {/if}
  </div>

  <div class="shine"></div>
</button>

<style>
  .file-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    max-width: 320px;
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
    text-align: left;
  }

  .file-card:hover:not(:disabled) {
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
  }

  .file-card:hover .shine {
    transform: translateX(100%);
  }

  .file-card:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .shine {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--background) / 0.4),
      transparent
    );
    transition: transform 0.5s ease;
    pointer-events: none;
  }

  .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-weight: 500;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-type {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .download-icon {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
  }

  .file-card:hover:not(:disabled) .download-icon {
    color: hsl(var(--primary));
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Tailwind-like utility classes for colors */
  :global(.bg-red-100) { background-color: #fee2e2; }
  :global(.bg-blue-100) { background-color: #dbeafe; }
  :global(.bg-green-100) { background-color: #dcfce7; }
  :global(.bg-orange-100) { background-color: #ffedd5; }
  :global(.bg-purple-100) { background-color: #f3e8ff; }
  :global(.bg-yellow-100) { background-color: #fef9c3; }
  :global(.bg-gray-100) { background-color: #f3f4f6; }
  :global(.bg-cyan-100) { background-color: #cffafe; }

  :global(.text-red-500) { color: #ef4444; }
  :global(.text-blue-500) { color: #3b82f6; }
  :global(.text-green-500) { color: #22c55e; }
  :global(.text-orange-500) { color: #f97316; }
  :global(.text-purple-500) { color: #a855f7; }
  :global(.text-yellow-500) { color: #eab308; }
  :global(.text-gray-500) { color: #6b7280; }
  :global(.text-cyan-500) { color: #06b6d4; }
</style>
