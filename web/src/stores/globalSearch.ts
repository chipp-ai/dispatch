/**
 * Global Search Store
 *
 * Manages state for the Cmd+K application search modal.
 * Provides debounced search with request cancellation.
 */

import { writable, derived } from "svelte/store";
import { captureException } from "$lib/sentry";

export interface SearchResult {
  id: string;
  name: string;
  description: string | null;
  appNameId: string;
  logoUrl: string | null;
  workspaceName: string | null;
}

interface GlobalSearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  selectedIndex: number;
  error: string | null;
}

const initialState: GlobalSearchState = {
  isOpen: false,
  query: "",
  results: [],
  isLoading: false,
  selectedIndex: 0,
  error: null,
};

const state = writable<GlobalSearchState>(initialState);

// Derived stores for individual properties
export const isSearchOpen = derived(state, ($s) => $s.isOpen);
export const searchQuery = derived(state, ($s) => $s.query);
export const searchResults = derived(state, ($s) => $s.results);
export const isSearchLoading = derived(state, ($s) => $s.isLoading);
export const selectedResultIndex = derived(state, ($s) => $s.selectedIndex);
export const searchError = derived(state, ($s) => $s.error);

// AbortController for cancelling in-flight requests
let abortController: AbortController | null = null;

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 200;

/**
 * Open the global search modal
 */
export function openSearch(): void {
  state.update((s) => ({
    ...s,
    isOpen: true,
    query: "",
    results: [],
    selectedIndex: 0,
    error: null,
  }));
}

/**
 * Close the global search modal
 */
export function closeSearch(): void {
  // Cancel any pending requests
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  state.set(initialState);
}

/**
 * Update search query and trigger debounced search
 */
export function setSearchQuery(query: string): void {
  state.update((s) => ({
    ...s,
    query,
    selectedIndex: 0,
  }));

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // If query is empty, clear results
  if (!query.trim()) {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    state.update((s) => ({
      ...s,
      results: [],
      isLoading: false,
      error: null,
    }));
    return;
  }

  // Set loading state
  state.update((s) => ({ ...s, isLoading: true }));

  // Debounce the search
  debounceTimer = setTimeout(() => {
    performSearch(query);
  }, DEBOUNCE_MS);
}

/**
 * Perform the actual search request
 */
async function performSearch(query: string): Promise<void> {
  // Cancel any in-flight request
  if (abortController) {
    abortController.abort();
  }

  abortController = new AbortController();

  try {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: "10",
    });

    const response = await fetch(`/api/applications/search?${params}`, {
      credentials: "include",
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();

    state.update((s) => ({
      ...s,
      results: data.data || [],
      isLoading: false,
      error: null,
    }));
  } catch (err) {
    // Ignore abort errors
    if (err instanceof Error && err.name === "AbortError") {
      return;
    }

    captureException(err, { tags: { source: "global-search" }, extra: { action: "performSearch", query } });
    state.update((s) => ({
      ...s,
      results: [],
      isLoading: false,
      error: err instanceof Error ? err.message : "Search failed",
    }));
  }
}

/**
 * Move selection up in results list
 */
export function selectPrevious(): void {
  state.update((s) => ({
    ...s,
    selectedIndex:
      s.selectedIndex > 0 ? s.selectedIndex - 1 : s.results.length - 1,
  }));
}

/**
 * Move selection down in results list
 */
export function selectNext(): void {
  state.update((s) => ({
    ...s,
    selectedIndex:
      s.selectedIndex < s.results.length - 1 ? s.selectedIndex + 1 : 0,
  }));
}

/**
 * Get the currently selected result
 */
export function getSelectedResult(): SearchResult | null {
  let result: SearchResult | null = null;
  state.subscribe((s) => {
    result = s.results[s.selectedIndex] || null;
  })();
  return result;
}

// Export the full store for components that need direct access
export const globalSearchStore = {
  subscribe: state.subscribe,
  open: openSearch,
  close: closeSearch,
  setQuery: setSearchQuery,
  selectPrevious,
  selectNext,
  getSelectedResult,
};
