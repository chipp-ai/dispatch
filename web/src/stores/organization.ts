/**
 * Organization Store
 *
 * Manages organization state with caching.
 * Users belong to a single organization.
 */

import { writable, derived } from "svelte/store";

export interface Organization {
  id: string;
  name: string;
  subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";
  createdAt: string;
  updatedAt: string;
  pictureUrl?: string | null;
}

export interface OrganizationMember {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "member" | "viewer";
  pictureUrl?: string | null;
}

interface OrganizationState {
  organization: Organization | null;
  organizations: Organization[];
  members: OrganizationMember[];
  isLoading: boolean;
  error: string | null;
}

const CACHE_KEY = "chipp_organization";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const defaultState: OrganizationState = {
  organization: null,
  organizations: [],
  members: [],
  isLoading: false,
  error: null,
};

export const organizationStore = writable<OrganizationState>(defaultState);

export const organization = derived(
  organizationStore,
  ($store) => $store.organization
);
export const organizationMembers = derived(
  organizationStore,
  ($store) => $store.members
);
export const isOrganizationLoading = derived(
  organizationStore,
  ($store) => $store.isLoading
);

// Legacy aliases for backwards compatibility
export const organizations = derived(organizationStore, ($store) =>
  $store.organization ? [$store.organization] : []
);
export const currentOrganization = organization;

/**
 * Get cached organization if still valid
 */
function getCachedOrganization(): Organization | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Cache organization
 */
function cacheOrganization(org: Organization): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data: org,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

/**
 * Initialize organization store
 */
export async function initOrganization(): Promise<void> {
  // Try to load from cache first
  const cached = getCachedOrganization();

  if (cached) {
    organizationStore.update((state) => ({
      ...state,
      organization: cached,
    }));
  }

  // Fetch fresh data in background
  await fetchOrganization();
}

/**
 * Fetch organization from API
 */
export async function fetchOrganization(): Promise<void> {
  organizationStore.update((state) => ({
    ...state,
    isLoading: true,
    error: null,
  }));

  try {
    const response = await fetch("/api/organization", {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch organization");
    }

    const data = await response.json();
    const org = data.data;

    // Cache the result
    if (org) {
      cacheOrganization(org);
    }

    organizationStore.update((state) => ({
      ...state,
      organization: org,
      organizations: org ? [org] : [],
      isLoading: false,
    }));
  } catch (error) {
    organizationStore.update((state) => ({
      ...state,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

/**
 * Fetch organization members from API
 */
export async function fetchOrganizationMembers(): Promise<void> {
  try {
    const response = await fetch("/api/organization/members", {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch organization members");
    }

    const data = await response.json();
    const members = data.data || [];

    organizationStore.update((state) => ({
      ...state,
      members,
    }));
  } catch (error) {
    console.error("Failed to fetch organization members:", error);
  }
}

/**
 * Update organization
 */
export async function updateOrganization(params: {
  name?: string;
}): Promise<Organization | null> {
  try {
    const response = await fetch("/api/organization", {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update organization");
    }

    const data = await response.json();
    const org = data.data;

    // Update cache and store
    if (org) {
      cacheOrganization(org);
      organizationStore.update((state) => ({
        ...state,
        organization: org,
      }));
    }

    return org;
  } catch (error) {
    console.error("Failed to update organization:", error);
    throw error;
  }
}

/**
 * Create a new organization
 */
export async function createOrganization(
  name: string
): Promise<Organization | null> {
  try {
    const response = await fetch("/api/organization", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create organization");
    }

    const data = await response.json();
    const org = data.data;

    // Update store with new organization
    if (org) {
      cacheOrganization(org);
      organizationStore.update((state) => ({
        ...state,
        organization: org,
        organizations: [...state.organizations, org],
      }));
    }

    return org;
  } catch (error) {
    console.error("Failed to create organization:", error);
    throw error;
  }
}

/**
 * Clear organization cache
 */
export function clearOrganizationCache(): void {
  localStorage.removeItem(CACHE_KEY);
}

// Legacy exports for backwards compatibility
export const fetchOrganizations = fetchOrganization;
export function setCurrentOrganization(org: Organization): void {
  organizationStore.update((state) => ({
    ...state,
    organization: org,
  }));
}
