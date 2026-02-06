/**
 * Workspace Store
 *
 * Manages the current workspace state with caching.
 */

import { writable, derived } from "svelte/store";
import { captureException } from "$lib/sentry";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  visibility: "PRIVATE" | "SHARED";
  subscriptionTier?: string;
  memberCount?: number;
  iconUrl?: string;
  role?: "owner" | "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
}

const CACHE_KEY = "chipp_workspaces";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const defaultState: WorkspaceState = {
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,
  error: null,
};

export const workspaceStore = writable<WorkspaceState>(defaultState);

export const workspaces = derived(
  workspaceStore,
  ($store) => $store.workspaces
);
export const currentWorkspace = derived(
  workspaceStore,
  ($store) => $store.currentWorkspace
);
export const currentWorkspaceId = derived(
  workspaceStore,
  ($store) => $store.currentWorkspace?.id || null
);
export const isWorkspaceLoading = derived(
  workspaceStore,
  ($store) => $store.isLoading
);

/**
 * Get cached workspaces if still valid
 */
function getCachedWorkspaces(): Workspace[] | null {
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
 * Cache workspaces
 */
function cacheWorkspaces(workspaces: Workspace[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data: workspaces,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

/**
 * Initialize workspace store
 */
export async function initWorkspace(): Promise<void> {
  // Try to load from cache first
  const cached = getCachedWorkspaces();
  if (cached && cached.length > 0) {
    workspaceStore.update((state) => ({
      ...state,
      workspaces: cached,
      currentWorkspace: cached[0],
    }));
  }

  // Fetch fresh data in background
  await fetchWorkspaces();
}

/**
 * Fetch workspaces from API
 */
export async function fetchWorkspaces(): Promise<void> {
  workspaceStore.update((state) => ({
    ...state,
    isLoading: true,
    error: null,
  }));

  try {
    const response = await fetch("/api/workspaces", {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch workspaces");
    }

    const data = await response.json();
    // Normalize workspaces - default visibility to PRIVATE if not provided
    const workspaces = (data.data || []).map((w: Partial<Workspace>) => ({
      ...w,
      visibility: w.visibility || "PRIVATE",
      slug: w.slug || w.name?.toLowerCase().replace(/\s+/g, "-") || "",
    })) as Workspace[];

    // Cache the results
    cacheWorkspaces(workspaces);

    workspaceStore.update((state) => ({
      ...state,
      workspaces,
      currentWorkspace: state.currentWorkspace || workspaces[0] || null,
      isLoading: false,
    }));
  } catch (error) {
    workspaceStore.update((state) => ({
      ...state,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

/**
 * Set the current workspace
 */
export function setCurrentWorkspace(workspace: Workspace): void {
  workspaceStore.update((state) => ({
    ...state,
    currentWorkspace: workspace,
  }));
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  name: string,
  organizationId: string,
  visibility: "PRIVATE" | "SHARED" = "PRIVATE"
): Promise<Workspace | null> {
  try {
    const response = await fetch("/api/workspaces", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, organizationId, visibility }),
    });

    if (!response.ok) {
      throw new Error("Failed to create workspace");
    }

    const result = await response.json();

    // Extract workspace from response and normalize
    const newWorkspace: Workspace = {
      ...result.data,
      visibility: result.data.visibility || visibility,
      slug: result.data.slug || name.toLowerCase().replace(/\s+/g, "-"),
    };

    // Refresh the list to include the new workspace
    await fetchWorkspaces();

    // Set the new workspace as current (this triggers Apps.svelte to reload)
    setCurrentWorkspace(newWorkspace);

    return newWorkspace;
  } catch (error) {
    captureException(error, { tags: { source: "workspace-store" }, extra: { action: "createWorkspace" } });
    return null;
  }
}

/**
 * Get workspaces filtered by organization
 */
export function getWorkspacesByOrganization(
  organizationId: string
): Workspace[] {
  let result: Workspace[] = [];
  workspaceStore.subscribe((state) => {
    result = state.workspaces.filter(
      (w) => w.organizationId === organizationId
    );
  })();
  return result;
}

/**
 * Derived stores for workspace groups
 */
export const privateWorkspaces = derived(workspaceStore, ($store) =>
  $store.workspaces.filter((w) => w.visibility === "PRIVATE")
);

export const sharedWorkspaces = derived(workspaceStore, ($store) =>
  $store.workspaces.filter((w) => w.visibility === "SHARED")
);

/**
 * Clear workspace cache
 */
export function clearWorkspaceCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
