<script lang="ts">
  /**
   * Global Search Modal
   *
   * Cmd+K triggered modal for searching across all applications.
   * Uses portal pattern for proper z-index stacking.
   */
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import { fade, scale } from "svelte/transition";
  import {
    isSearchOpen,
    searchQuery,
    searchResults,
    isSearchLoading,
    selectedResultIndex,
    closeSearch,
    setSearchQuery,
    selectPrevious,
    selectNext,
    getSelectedResult,
    type SearchResult,
  } from "../../../stores/globalSearch";
  import Spinner from "./Spinner.svelte";

  // Portal container
  let portalContainer: HTMLDivElement | null = null;
  let inputElement: HTMLInputElement | null = null;

  // Local state
  let query = "";

  // Subscribe to query changes
  $: query = $searchQuery;

  // Focus input when modal opens
  $: if ($isSearchOpen && inputElement) {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => inputElement?.focus(), 10);
  }

  // Lock body scroll when open
  $: {
    if (typeof document !== "undefined") {
      document.body.style.overflow = $isSearchOpen ? "hidden" : "";
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!$isSearchOpen) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeSearch();
        break;
      case "ArrowDown":
        e.preventDefault();
        selectNext();
        break;
      case "ArrowUp":
        e.preventDefault();
        selectPrevious();
        break;
      case "Enter":
        e.preventDefault();
        handleSelect();
        break;
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    setSearchQuery(target.value);
  }

  function handleSelect(result?: SearchResult) {
    const selected = result || getSelectedResult();
    if (selected) {
      closeSearch();
      push(`/apps/${selected.id}/build`);
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (target === currentTarget) {
      closeSearch();
    }
  }

  function handleResultHover(index: number) {
    // Update selected index on hover for visual feedback
    // We don't update the store to avoid unnecessary re-renders
  }

  // Portal action
  function portal(node: HTMLElement) {
    if (portalContainer) {
      portalContainer.appendChild(node);
    }

    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      },
    };
  }

  onMount(() => {
    portalContainer = document.createElement("div");
    portalContainer.className = "global-search-portal";
    document.body.appendChild(portalContainer);
  });

  onDestroy(() => {
    if (portalContainer && portalContainer.parentNode) {
      portalContainer.parentNode.removeChild(portalContainer);
    }
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $isSearchOpen}
  <div use:portal class="search-wrapper">
    <div
      class="search-overlay"
      transition:fade={{ duration: 150 }}
      on:click={handleOverlayClick}
      role="presentation"
    >
      <div
        class="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Search applications"
        transition:scale={{ duration: 150, start: 0.95 }}
      >
        <!-- Search Input -->
        <div class="search-input-wrapper">
          <svg
            class="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            bind:this={inputElement}
            type="text"
            class="search-input"
            placeholder="Search applications..."
            value={query}
            on:input={handleInput}
            autocomplete="off"
            spellcheck="false"
          />
          {#if $isSearchLoading}
            <div class="loading-indicator">
              <Spinner size="sm" />
            </div>
          {:else if query}
            <button
              class="clear-button"
              on:click={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>

        <!-- Results -->
        <div class="search-results">
          {#if $searchResults.length > 0}
            <ul class="results-list" role="listbox">
              {#each $searchResults as result, index (result.id)}
                <li
                  class="result-item"
                  class:selected={index === $selectedResultIndex}
                  role="option"
                  aria-selected={index === $selectedResultIndex}
                  on:click={() => handleSelect(result)}
                  on:mouseenter={() => handleResultHover(index)}
                >
                  <div class="result-logo">
                    {#if result.logoUrl}
                      <img src={result.logoUrl} alt="" />
                    {:else}
                      <div class="logo-placeholder">
                        {result.name.charAt(0).toUpperCase()}
                      </div>
                    {/if}
                  </div>
                  <div class="result-content">
                    <div class="result-name">{result.name}</div>
                    {#if result.workspaceName}
                      <div class="result-workspace">{result.workspaceName}</div>
                    {/if}
                  </div>
                  <svg
                    class="result-arrow"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </li>
              {/each}
            </ul>
          {:else if query && !$isSearchLoading}
            <div class="no-results">
              <p>No applications found for "{query}"</p>
            </div>
          {:else if !query}
            <div class="empty-state">
              <p>Type to search your applications</p>
              <div class="keyboard-hint">
                <kbd>Esc</kbd> to close
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="search-footer">
          <div class="footer-hints">
            <span class="hint">
              <kbd>↑</kbd><kbd>↓</kbd> to navigate
            </span>
            <span class="hint">
              <kbd>Enter</kbd> to select
            </span>
            <span class="hint">
              <kbd>Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .search-wrapper {
    /* Portal container wrapper */
  }

  .search-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .search-modal {
    width: 100%;
    max-width: 600px;
    margin: 0 var(--space-4);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
  }

  /* Search Input */
  .search-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .search-icon {
    width: 20px;
    height: 20px;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: var(--text-lg);
    color: hsl(var(--foreground));
    outline: none;
  }

  .search-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .loading-indicator {
    flex-shrink: 0;
  }

  .clear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast), background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .clear-button:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .clear-button svg {
    width: 16px;
    height: 16px;
  }

  /* Results */
  .search-results {
    max-height: 400px;
    overflow-y: auto;
  }

  .results-list {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .result-item:hover,
  .result-item.selected {
    background-color: hsl(var(--muted));
  }

  .result-logo {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    overflow: hidden;
    flex-shrink: 0;
  }

  .result-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .logo-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent) / 0.7));
    color: hsl(var(--accent-foreground));
    font-weight: var(--font-semibold);
    font-size: var(--text-lg);
  }

  .result-content {
    flex: 1;
    min-width: 0;
  }

  .result-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-workspace {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-arrow {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .result-item:hover .result-arrow,
  .result-item.selected .result-arrow {
    opacity: 1;
  }

  /* Empty states */
  .no-results,
  .empty-state {
    padding: var(--space-8) var(--space-4);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .empty-state p {
    margin-bottom: var(--space-4);
  }

  .keyboard-hint {
    display: flex;
    justify-content: center;
    gap: var(--space-2);
  }

  /* Footer */
  .search-footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background-color: hsl(var(--muted) / 0.3);
  }

  .footer-hints {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .hint {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    background-color: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
  }
</style>
