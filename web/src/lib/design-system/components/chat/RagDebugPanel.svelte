<script lang="ts">
  /**
   * RagDebugPanel
   *
   * Collapsible panel showing retrieved RAG chunks:
   * - Chunk cards with similarity scores (color-coded)
   * - File name with UUID stripped
   * - Expandable chunk text
   * - Query display in header
   */
  import type { RagDebugInfo, RagDebugChunk } from "./types";

  export let debugInfo: RagDebugInfo;
  export let forceDarkMode: boolean = false;

  let isCollapsed = false;
  let expandedChunks: Set<number> = new Set();

  // Strip UUID prefix from file names
  function cleanFileName(fileName: string): string {
    const uuidPattern =
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/i;
    return fileName.replace(uuidPattern, "");
  }

  function getSimilarityColorClass(score: number, isDark: boolean): string {
    if (score >= 0.7) {
      return isDark ? "similarity-high-dark" : "similarity-high";
    }
    if (score >= 0.5) {
      return isDark ? "similarity-medium-dark" : "similarity-medium";
    }
    if (score >= 0.3) {
      return isDark ? "similarity-low-dark" : "similarity-low";
    }
    return isDark ? "similarity-very-low-dark" : "similarity-very-low";
  }

  function toggleChunk(index: number) {
    if (expandedChunks.has(index)) {
      expandedChunks.delete(index);
    } else {
      expandedChunks.add(index);
    }
    expandedChunks = expandedChunks; // Trigger reactivity
  }

  function toggleCollapsed() {
    isCollapsed = !isCollapsed;
  }

  $: hasChunks = debugInfo?.chunks && debugInfo.chunks.length > 0;
  $: queryPreview =
    debugInfo?.query?.length > 30
      ? debugInfo.query.slice(0, 30) + "..."
      : debugInfo?.query || "";
</script>

<div class="rag-debug-panel" class:dark={forceDarkMode}>
  {#if !hasChunks}
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
      <span>No knowledge chunks retrieved for this response</span>
    </div>
  {:else}
    <!-- Header -->
    <button class="panel-header" on:click={toggleCollapsed}>
      <div class="header-left">
        <svg class="database-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
        <span class="header-title">
          {debugInfo.chunks.length} Knowledge Chunk{debugInfo.chunks.length !== 1 ? "s" : ""} Retrieved
        </span>
      </div>
      <div class="header-right">
        <span class="query-preview">Query: "{queryPreview}"</span>
        <svg class="chevron" class:collapsed={isCollapsed} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </button>

    <!-- Chunk list -->
    {#if !isCollapsed}
      <div class="chunk-list">
        {#each debugInfo.chunks as chunk, index}
          {@const truncatedText = chunk.text.length > 200 ? chunk.text.slice(0, 200) + "..." : chunk.text}
          {@const needsTruncation = chunk.text.length > 200}
          {@const isExpanded = expandedChunks.has(index)}
          {@const similarityClass = getSimilarityColorClass(chunk.score, forceDarkMode)}

          <div class="chunk-card">
            <div class="chunk-badges">
              <span class="badge index">#{index + 1}</span>
              <span class="badge similarity {similarityClass}">
                {(chunk.score * 100).toFixed(1)}% match
              </span>
            </div>

            {#if chunk.fileName}
              <div class="file-name">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>{cleanFileName(chunk.fileName)}</span>
              </div>
            {/if}

            <div class="chunk-text">
              {isExpanded ? chunk.text : truncatedText}
            </div>

            {#if needsTruncation}
              <button class="expand-btn" on:click={() => toggleChunk(index)}>
                {#if isExpanded}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  Show less
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  Show full chunk
                {/if}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .rag-debug-panel {
    border-radius: var(--radius-lg);
    border: 1px solid #fde68a;
    background: rgba(254, 243, 199, 0.5);
    overflow: hidden;
  }

  .rag-debug-panel.dark {
    border-color: rgba(180, 83, 9, 0.5);
    background: rgba(69, 26, 3, 0.2);
  }

  .empty-state {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .empty-state svg {
    width: 16px;
    height: 16px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .panel-header:hover {
    background: rgba(251, 191, 36, 0.1);
  }

  .dark .panel-header:hover {
    background: rgba(180, 83, 9, 0.2);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .database-icon {
    width: 16px;
    height: 16px;
    color: #d97706;
  }

  .dark .database-icon {
    color: #f59e0b;
  }

  .header-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: #b45309;
  }

  .dark .header-title {
    color: #fbbf24;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .query-preview {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .chevron {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s ease;
  }

  .chevron.collapsed {
    transform: rotate(-180deg);
  }

  .chunk-list {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-top: 1px solid inherit;
  }

  .chunk-card {
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    font-size: var(--text-sm);
  }

  .dark .chunk-card {
    border-color: #374151;
    background: rgba(31, 41, 55, 0.5);
  }

  .chunk-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-2);
  }

  .badge {
    display: inline-flex;
    padding: 2px 8px;
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    border: 1px solid;
  }

  .badge.index {
    font-family: ui-monospace, monospace;
    background: hsl(var(--muted));
    border-color: hsl(var(--border));
    color: hsl(var(--foreground));
  }

  .badge.similarity {
    font-weight: 500;
  }

  /* Similarity colors */
  .similarity-high {
    background: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }
  .similarity-high-dark {
    background: rgba(22, 101, 52, 0.5);
    border-color: #22c55e;
    color: #86efac;
  }

  .similarity-medium {
    background: #fef9c3;
    border-color: #fde047;
    color: #854d0e;
  }
  .similarity-medium-dark {
    background: rgba(133, 77, 14, 0.5);
    border-color: #eab308;
    color: #fde047;
  }

  .similarity-low {
    background: #ffedd5;
    border-color: #fdba74;
    color: #9a3412;
  }
  .similarity-low-dark {
    background: rgba(154, 52, 18, 0.5);
    border-color: #f97316;
    color: #fdba74;
  }

  .similarity-very-low {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #991b1b;
  }
  .similarity-very-low-dark {
    background: rgba(153, 27, 27, 0.5);
    border-color: #ef4444;
    color: #fca5a5;
  }

  .file-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-2);
  }

  .file-name svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .file-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chunk-text {
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: hsl(var(--muted) / 0.5);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  .dark .chunk-text {
    background: rgba(17, 24, 39, 0.5);
  }

  .expand-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: var(--space-2);
    padding: 0;
    background: transparent;
    border: none;
    font-size: var(--text-xs);
    color: hsl(217 91% 60%);
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .expand-btn:hover {
    color: hsl(217 91% 50%);
    text-decoration: underline;
  }

  .expand-btn svg {
    width: 12px;
    height: 12px;
  }
</style>
