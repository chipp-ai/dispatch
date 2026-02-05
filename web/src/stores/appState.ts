/**
 * App State Store
 *
 * Collects and reports current application state for debugging.
 * Serializes ALL client-side store data to a file that can be read by MCP tools.
 */

import { get } from "svelte/store";

// Import all stores
import { user, isAuthenticated, isAuthLoading } from "./auth";
import { organization, isOrganizationLoading } from "./organization";
import { currentWorkspace, workspaces, isWorkspaceLoading } from "./workspace";
import { modelOverride } from "./modelOverride";
import { devPanel, isDevPanelEnabled, isDevPanelOpen, devPanelEnvironment } from "./devPanel";
import { appBooted } from "./app";
import { theme } from "./theme";
import { consumerChat } from "./consumerChat";
import { consumerAuth } from "./consumerAuth";
import { whitelabelConfig, isWhitelabelLoading } from "./whitelabel";
import { isSearchOpen, searchQuery, searchResults } from "./globalSearch";
import { onboardingV2Store } from "./onboardingV2";
import { dashboardStore } from "./dashboard";
import { marketplaceStore } from "./marketplace";
import { wsState } from "./websocket";

interface StoreSnapshot {
  name: string;
  value: unknown;
}

// Debounce timer
let debounceTimer: number | null = null;
const DEBOUNCE_MS = 1000;

// Track if we're in dev mode
const isDev = import.meta.env.DEV;

/**
 * Safely get a store value, handling errors
 */
function safeGet<T>(store: { subscribe: (fn: (value: T) => void) => () => void }, defaultValue: T): T {
  try {
    return get(store);
  } catch {
    return defaultValue;
  }
}

/**
 * Serialize a value for JSON, handling special cases
 */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return "[Function]";
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { message: value.message, stack: value.stack };
  if (Array.isArray(value)) {
    // Limit array size for readability
    if (value.length > 20) {
      return [...value.slice(0, 20).map(serialize), `... and ${value.length - 20} more items`];
    }
    return value.map(serialize);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Skip private/internal properties
      if (k.startsWith("_")) continue;
      result[k] = serialize(v);
    }
    return result;
  }
  return value;
}

/**
 * Collect all store snapshots
 */
function collectStores(): StoreSnapshot[] {
  const stores: StoreSnapshot[] = [];

  // Auth stores
  stores.push({ name: "user", value: serialize(safeGet(user, null)) });
  stores.push({ name: "isAuthenticated", value: safeGet(isAuthenticated, false) });
  stores.push({ name: "isAuthLoading", value: safeGet(isAuthLoading, false) });

  // Organization stores
  stores.push({ name: "organization", value: serialize(safeGet(organization, null)) });
  stores.push({ name: "isOrganizationLoading", value: safeGet(isOrganizationLoading, false) });

  // Workspace stores
  stores.push({ name: "currentWorkspace", value: serialize(safeGet(currentWorkspace, null)) });
  stores.push({ name: "workspaces", value: serialize(safeGet(workspaces, [])) });
  stores.push({ name: "isWorkspaceLoading", value: safeGet(isWorkspaceLoading, false) });

  // Dev panel stores
  stores.push({ name: "devPanel", value: serialize(safeGet(devPanel, { isEnabled: false, isOpen: false, environment: "development" })) });
  stores.push({ name: "isDevPanelEnabled", value: safeGet(isDevPanelEnabled, false) });
  stores.push({ name: "isDevPanelOpen", value: safeGet(isDevPanelOpen, false) });
  stores.push({ name: "devPanelEnvironment", value: safeGet(devPanelEnvironment, "development") });

  // Model override
  stores.push({ name: "modelOverride", value: safeGet(modelOverride, null) });

  // App state
  stores.push({ name: "appBooted", value: safeGet(appBooted, false) });
  stores.push({ name: "theme", value: safeGet(theme, null) });

  // Consumer chat state (important for debugging chat issues)
  try {
    const chatState = safeGet(consumerChat, null);
    if (chatState) {
      // Extract key chat state without full message content (too verbose)
      const chatSummary = {
        sessionId: (chatState as unknown as Record<string, unknown>).sessionId,
        messageCount: Array.isArray((chatState as unknown as Record<string, unknown>).messages)
          ? ((chatState as unknown as Record<string, unknown>).messages as unknown[]).length
          : 0,
        isStreaming: (chatState as unknown as Record<string, unknown>).isStreaming,
        responseGenerating: (chatState as unknown as Record<string, unknown>).responseGenerating,
        error: (chatState as unknown as Record<string, unknown>).error,
        lastError: (chatState as unknown as Record<string, unknown>).lastError,
        userCredits: (chatState as unknown as Record<string, unknown>).userCredits,
        subscriptionActive: (chatState as unknown as Record<string, unknown>).subscriptionActive,
        stagedFilesCount: Array.isArray((chatState as unknown as Record<string, unknown>).stagedFiles)
          ? ((chatState as unknown as Record<string, unknown>).stagedFiles as unknown[]).length
          : 0,
        conversationFrozen: (chatState as unknown as Record<string, unknown>).conversationFrozen,
        currentAppId: (chatState as unknown as Record<string, unknown>).currentAppId,
        currentAppNameId: (chatState as unknown as Record<string, unknown>).currentAppNameId,
      };
      stores.push({ name: "consumerChat", value: serialize(chatSummary) });
    }
  } catch {
    stores.push({ name: "consumerChat", value: null });
  }

  // Consumer auth
  stores.push({ name: "consumerAuth", value: serialize(safeGet(consumerAuth, null)) });

  // Whitelabel
  stores.push({ name: "whitelabelConfig", value: serialize(safeGet(whitelabelConfig, null)) });
  stores.push({ name: "isWhitelabelLoading", value: safeGet(isWhitelabelLoading, false) });

  // Global search
  stores.push({ name: "searchQuery", value: safeGet(searchQuery, "") });
  stores.push({ name: "isSearchOpen", value: safeGet(isSearchOpen, false) });
  try {
    const results = safeGet(searchResults, []);
    stores.push({
      name: "searchResults",
      value: Array.isArray(results) ? `${results.length} results` : null,
    });
  } catch {
    stores.push({ name: "searchResults", value: null });
  }

  // Onboarding
  stores.push({ name: "onboardingV2", value: serialize(safeGet(onboardingV2Store, null)) });

  // Dashboard
  try {
    const dashState = safeGet(dashboardStore, null);
    if (dashState) {
      const dashSummary = {
        appsCount: Array.isArray((dashState as unknown as Record<string, unknown>).apps)
          ? ((dashState as unknown as Record<string, unknown>).apps as unknown[]).length
          : 0,
        isLoading: (dashState as unknown as Record<string, unknown>).isLoading,
        error: (dashState as unknown as Record<string, unknown>).error,
      };
      stores.push({ name: "dashboard", value: serialize(dashSummary) });
    }
  } catch {
    stores.push({ name: "dashboard", value: null });
  }

  // Marketplace
  stores.push({ name: "marketplace", value: serialize(safeGet(marketplaceStore, null)) });

  // WebSocket
  try {
    const ws = safeGet(wsState, { connectionState: "disconnected", lastConnected: null, reconnectAttempts: 0 });
    stores.push({ name: "wsState", value: serialize(ws) });
  } catch {
    stores.push({ name: "wsState", value: { connectionState: "disconnected", lastConnected: null, reconnectAttempts: 0 } });
  }

  return stores;
}

/**
 * Collect current app state snapshot
 */
function collectState() {
  const $user = safeGet(user, null);
  const $org = safeGet(organization, null);
  const $workspace = safeGet(currentWorkspace, null);
  const $modelOverride = safeGet(modelOverride, null);

  // Parse hash route
  const hash = window.location.hash || "#/";
  const pathMatch = hash.match(/#([^?]*)/);
  const path = pathMatch ? pathMatch[1] : "/";

  // Parse route params from common patterns
  const params: Record<string, string> = {};
  const appMatch = path.match(/\/apps\/([^/]+)/);
  if (appMatch) params.appId = appMatch[1];
  const chatMatch = path.match(/\/w\/chat\/([^/]+)/);
  if (chatMatch) params.appNameId = chatMatch[1];
  const settingsMatch = path.match(/\/settings\/([^/]+)/);
  if (settingsMatch) params.settingsTab = settingsMatch[1];

  return {
    timestamp: new Date().toISOString(),
    route: {
      hash,
      path,
      params,
    },
    user: $user
      ? {
          id: $user.id,
          email: $user.email,
          name: $user.name,
        }
      : null,
    organization: $org
      ? {
          id: ($org as unknown as Record<string, unknown>).id,
          name: ($org as unknown as Record<string, unknown>).name,
          subscriptionTier: ($org as unknown as Record<string, unknown>).subscriptionTier,
        }
      : null,
    workspace: $workspace
      ? {
          id: ($workspace as unknown as Record<string, unknown>).id,
          name: ($workspace as unknown as Record<string, unknown>).name,
        }
      : null,
    modelOverride: $modelOverride,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    stores: collectStores(),
  };
}

/**
 * Format state as Markdown for MCP consumption
 */
function formatStateAsMarkdown(state: ReturnType<typeof collectState>): string {
  const lines: string[] = [
    "# App State Snapshot",
    "",
    `**Timestamp:** ${state.timestamp}`,
    "",
    "## Route",
    "",
    `- **Path:** \`${state.route.path}\``,
    `- **Hash:** \`${state.route.hash}\``,
  ];

  if (Object.keys(state.route.params).length > 0) {
    lines.push("- **Params:**");
    for (const [key, value] of Object.entries(state.route.params)) {
      lines.push(`  - ${key}: \`${value}\``);
    }
  }

  lines.push(
    "",
    "## User",
    ""
  );

  if (state.user) {
    lines.push(
      `- **ID:** \`${state.user.id}\``,
      `- **Email:** ${state.user.email}`,
      `- **Name:** ${state.user.name || "_not set_"}`
    );
  } else {
    lines.push("_Not logged in_");
  }

  lines.push("", "## Organization", "");

  if (state.organization) {
    lines.push(
      `- **ID:** \`${state.organization.id}\``,
      `- **Name:** ${state.organization.name}`,
      `- **Subscription Tier:** **${state.organization.subscriptionTier}**`
    );
  } else {
    lines.push("_No organization_");
  }

  lines.push("", "## Workspace", "");

  if (state.workspace) {
    lines.push(
      `- **ID:** \`${state.workspace.id}\``,
      `- **Name:** ${state.workspace.name}`
    );
  } else {
    lines.push("_No workspace selected_");
  }

  lines.push(
    "",
    "## Dev Settings",
    "",
    `- **Model Override:** ${state.modelOverride || "_using app default_"}`,
    "",
    "## Viewport",
    "",
    `- **Size:** ${state.viewport.width}x${state.viewport.height}`,
    "",
    "## Store State",
    "",
    "All client-side Svelte stores:",
    "",
    "```json",
    JSON.stringify(
      state.stores.reduce(
        (acc, s) => ({ ...acc, [s.name]: s.value }),
        {} as Record<string, unknown>
      ),
      null,
      2
    ),
    "```",
    ""
  );

  return lines.join("\n");
}

/**
 * Push current state to the dev API endpoint
 */
async function pushState(): Promise<void> {
  if (!isDev) return;

  try {
    const state = collectState();
    const markdown = formatStateAsMarkdown(state);

    await fetch("/api/dev/app-state", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state,
        markdown,
      }),
    });
  } catch {
    // Silently fail - this is just for dev tooling
  }
}

/**
 * Debounced state push
 */
function debouncedPush(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    pushState();
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Initialize app state tracking
 * Call this once on app mount
 */
export function initAppStateTracking(): void {
  if (!isDev) return;

  // Push initial state after a short delay to let stores initialize
  setTimeout(pushState, 500);

  // Track route changes
  window.addEventListener("hashchange", debouncedPush);

  // Track store changes by subscribing to key stores
  user.subscribe(() => debouncedPush());
  organization.subscribe(() => debouncedPush());
  currentWorkspace.subscribe(() => debouncedPush());
  modelOverride.subscribe(() => debouncedPush());
  consumerChat.subscribe(() => debouncedPush());
  devPanel.subscribe(() => debouncedPush());

  // Track viewport changes
  window.addEventListener("resize", debouncedPush);

  // Periodic refresh every 30 seconds to catch any missed updates
  setInterval(pushState, 30000);
}

// Export for manual triggering if needed
export const appState = {
  push: pushState,
  collect: collectState,
  formatMarkdown: formatStateAsMarkdown,
};
