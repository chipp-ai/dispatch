/**
 * Dashboard Store
 *
 * Manages dashboard state including metrics, topics, and search.
 */

import { writable, derived } from "svelte/store";

export interface TopicData {
  id: string;
  topic: string;
  count: number;
  percentage: number;
  sampleQuestions: string[];
  trend: "up" | "down" | "stable";
  trendValue: number;
  applicationId: string;
}

export interface AppData {
  id: string;
  name: string;
  chats: number;
  leads: number;
}

export interface DashboardData {
  totalChats: number;
  totalLeads: number;
  totalConversions: number;
  topTopics: TopicData[];
  appSpecificData: AppData[];
}

export interface ChatSearchResult {
  id: string;
  title: string | null;
  applicationId: string;
  applicationName: string;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
  updatedAt: string;
  messagePreview: string | null;
  messageCount: number;
}

export interface DateRange {
  label: string;
  value: string;
}

interface DashboardState {
  data: DashboardData | null;
  applications: { id: string; name: string }[];
  searchResults: ChatSearchResult[];
  searchTotal: number;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  selectedApp: string;
  selectedDateRange: string;
  searchQuery: string;
}

const defaultState: DashboardState = {
  data: null,
  applications: [],
  searchResults: [],
  searchTotal: 0,
  isLoading: false,
  isSearching: false,
  error: null,
  selectedApp: "all",
  selectedDateRange: "30d",
  searchQuery: "",
};

export const dateRanges: DateRange[] = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "This month", value: "thisMonth" },
  { label: "Last month", value: "lastMonth" },
  { label: "All time", value: "all" },
];

export const dashboardStore = writable<DashboardState>(defaultState);

export const dashboardData = derived(dashboardStore, ($store) => $store.data);
export const dashboardApplications = derived(
  dashboardStore,
  ($store) => $store.applications
);
export const dashboardSearchResults = derived(
  dashboardStore,
  ($store) => $store.searchResults
);
export const isDashboardLoading = derived(
  dashboardStore,
  ($store) => $store.isLoading
);
export const isDashboardSearching = derived(
  dashboardStore,
  ($store) => $store.isSearching
);
export const dashboardError = derived(dashboardStore, ($store) => $store.error);
export const dashboardSelectedApp = derived(
  dashboardStore,
  ($store) => $store.selectedApp
);
export const dashboardSelectedDateRange = derived(
  dashboardStore,
  ($store) => $store.selectedDateRange
);

/**
 * Fetch applications in the current workspace
 */
export async function fetchDashboardApplications(
  workspaceId: string
): Promise<void> {
  try {
    const response = await fetch(
      `/api/dashboard/workspace/applications?workspaceId=${workspaceId}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch applications");
    }

    const data = await response.json();

    dashboardStore.update((state) => ({
      ...state,
      applications: data.applications || [],
    }));
  } catch (error) {
    console.warn("Failed to fetch applications:", error);
  }
}

/**
 * Fetch dashboard data
 */
export async function fetchDashboardData(params?: {
  workspaceId?: string;
  dateRange?: string;
  applicationId?: string;
}): Promise<void> {
  dashboardStore.update((state) => ({
    ...state,
    isLoading: true,
    error: null,
  }));

  try {
    const searchParams = new URLSearchParams();
    if (params?.workspaceId) {
      searchParams.set("workspaceId", params.workspaceId);
    }
    if (params?.dateRange) {
      searchParams.set("dateRange", params.dateRange);
    }
    if (params?.applicationId) {
      searchParams.set("applicationId", params.applicationId);
    }

    const url = `/api/dashboard/v2${searchParams.toString() ? `?${searchParams}` : ""}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch dashboard data");
    }

    const data = await response.json();

    dashboardStore.update((state) => ({
      ...state,
      data,
      isLoading: false,
      selectedDateRange: params?.dateRange || state.selectedDateRange,
      selectedApp: params?.applicationId || state.selectedApp,
    }));
  } catch (error) {
    dashboardStore.update((state) => ({
      ...state,
      isLoading: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
  }
}

/**
 * Search chat history
 */
export async function searchChats(params: {
  workspaceId: string;
  query: string;
  applicationId?: string;
}): Promise<void> {
  if (!params.query || params.query.length < 2) {
    dashboardStore.update((state) => ({
      ...state,
      searchResults: [],
      searchTotal: 0,
      searchQuery: params.query,
    }));
    return;
  }

  dashboardStore.update((state) => ({
    ...state,
    isSearching: true,
    searchQuery: params.query,
  }));

  try {
    const searchParams = new URLSearchParams({
      workspaceId: params.workspaceId,
      q: params.query,
    });

    if (params.applicationId && params.applicationId !== "all") {
      searchParams.set("applicationId", params.applicationId);
    }

    const response = await fetch(`/api/dashboard/search-chats?${searchParams}`);

    if (!response.ok) {
      throw new Error("Failed to search chats");
    }

    const data = await response.json();

    dashboardStore.update((state) => ({
      ...state,
      searchResults: data.results || [],
      searchTotal: data.total || 0,
      isSearching: false,
    }));
  } catch (error) {
    dashboardStore.update((state) => ({
      ...state,
      isSearching: false,
      searchResults: [],
      searchTotal: 0,
    }));
  }
}

/**
 * Set selected app and refetch data
 */
export async function setSelectedApp(
  appId: string,
  workspaceId: string
): Promise<void> {
  dashboardStore.update((state) => ({
    ...state,
    selectedApp: appId,
  }));

  const state = await new Promise<DashboardState>((resolve) => {
    dashboardStore.subscribe((s) => resolve(s))();
  });

  await fetchDashboardData({
    workspaceId,
    dateRange: state.selectedDateRange,
    applicationId: appId,
  });
}

/**
 * Set selected date range and refetch data
 */
export async function setSelectedDateRange(
  dateRange: string,
  workspaceId: string
): Promise<void> {
  dashboardStore.update((state) => ({
    ...state,
    selectedDateRange: dateRange,
  }));

  const state = await new Promise<DashboardState>((resolve) => {
    dashboardStore.subscribe((s) => resolve(s))();
  });

  await fetchDashboardData({
    workspaceId,
    dateRange,
    applicationId: state.selectedApp,
  });
}

/**
 * Initialize dashboard
 */
export async function initDashboard(workspaceId: string): Promise<void> {
  await Promise.all([
    fetchDashboardApplications(workspaceId),
    fetchDashboardData({ workspaceId }),
  ]);
}

/**
 * Clear dashboard state
 */
export function clearDashboard(): void {
  dashboardStore.set(defaultState);
}
