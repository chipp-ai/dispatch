/**
 * Marketplace Store
 *
 * Manages marketplace applications state with search and filtering.
 */

import { writable, derived } from "svelte/store";

export interface MarketplaceApp {
  id: string;
  applicationId: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  creatorName: string | null;
  creatorPictureUrl: string | null;
  category: string | null;
  tags: string[];
  isFeatured: boolean;
  createdAt: string;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  icon: string;
  count?: number;
}

interface MarketplaceState {
  apps: MarketplaceApp[];
  featuredApps: MarketplaceApp[];
  categories: MarketplaceCategory[];
  total: number;
  isLoading: boolean;
  isFeaturedLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: string | null;
}

const defaultState: MarketplaceState = {
  apps: [],
  featuredApps: [],
  categories: [],
  total: 0,
  isLoading: false,
  isFeaturedLoading: false,
  error: null,
  searchQuery: "",
  selectedCategory: null,
};

export const marketplaceStore = writable<MarketplaceState>(defaultState);

export const marketplaceApps = derived(
  marketplaceStore,
  ($store) => $store.apps
);
export const featuredApps = derived(
  marketplaceStore,
  ($store) => $store.featuredApps
);
export const marketplaceCategories = derived(
  marketplaceStore,
  ($store) => $store.categories
);
export const isMarketplaceLoading = derived(
  marketplaceStore,
  ($store) => $store.isLoading
);
export const marketplaceError = derived(
  marketplaceStore,
  ($store) => $store.error
);
export const marketplaceSearchQuery = derived(
  marketplaceStore,
  ($store) => $store.searchQuery
);
export const marketplaceSelectedCategory = derived(
  marketplaceStore,
  ($store) => $store.selectedCategory
);

/**
 * Fetch marketplace apps with optional filtering
 */
export async function fetchMarketplaceApps(params?: {
  searchQuery?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<void> {
  marketplaceStore.update((state) => ({
    ...state,
    isLoading: true,
    error: null,
  }));

  try {
    const searchParams = new URLSearchParams();
    if (params?.searchQuery) {
      searchParams.set("q", params.searchQuery);
    }
    if (params?.category) {
      searchParams.set("category", params.category);
    }
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.offset) {
      searchParams.set("offset", params.offset.toString());
    }

    const url = `/api/marketplace/apps${searchParams.toString() ? `?${searchParams}` : ""}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch marketplace apps");
    }

    const data = await response.json();

    marketplaceStore.update((state) => ({
      ...state,
      apps: data.data || [],
      total: data.total || 0,
      isLoading: false,
      searchQuery: params?.searchQuery || "",
      selectedCategory: params?.category || null,
    }));
  } catch (error) {
    marketplaceStore.update((state) => ({
      ...state,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

/**
 * Fetch featured apps for the hero section
 */
export async function fetchFeaturedApps(limit = 6): Promise<void> {
  marketplaceStore.update((state) => ({
    ...state,
    isFeaturedLoading: true,
  }));

  try {
    const response = await fetch(
      `/api/marketplace/apps/featured?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch featured apps");
    }

    const data = await response.json();

    marketplaceStore.update((state) => ({
      ...state,
      featuredApps: data.data || [],
      isFeaturedLoading: false,
    }));
  } catch (error) {
    marketplaceStore.update((state) => ({
      ...state,
      isFeaturedLoading: false,
    }));
  }
}

/**
 * Fetch categories with app counts
 */
export async function fetchCategories(): Promise<void> {
  try {
    const response = await fetch("/api/marketplace/categories");

    if (!response.ok) {
      throw new Error("Failed to fetch categories");
    }

    const data = await response.json();

    marketplaceStore.update((state) => ({
      ...state,
      categories: data.data || [],
    }));
  } catch (error) {
    console.warn("Failed to fetch categories:", error);
  }
}

/**
 * Set search query and fetch results
 */
export async function searchMarketplace(query: string): Promise<void> {
  marketplaceStore.update((state) => ({
    ...state,
    searchQuery: query,
  }));

  await fetchMarketplaceApps({ searchQuery: query });
}

/**
 * Set category filter and fetch results
 */
export async function filterByCategory(category: string | null): Promise<void> {
  marketplaceStore.update((state) => ({
    ...state,
    selectedCategory: category,
  }));

  await fetchMarketplaceApps({
    category: category || undefined,
    searchQuery: undefined, // Clear search when filtering by category
  });
}

/**
 * Initialize marketplace (fetch all initial data)
 */
export async function initMarketplace(): Promise<void> {
  await Promise.all([
    fetchFeaturedApps(),
    fetchCategories(),
    fetchMarketplaceApps(),
  ]);
}

/**
 * Clear all filters and reset
 */
export async function clearMarketplaceFilters(): Promise<void> {
  marketplaceStore.update((state) => ({
    ...state,
    searchQuery: "",
    selectedCategory: null,
  }));

  await fetchMarketplaceApps();
}
