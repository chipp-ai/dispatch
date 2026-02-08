/**
 * Dev Panel Store
 *
 * Manages developer panel visibility and state.
 *
 * Visibility rules:
 * - Local dev (import.meta.env.DEV): Always visible
 * - Staging: Hidden by default, enable via ?devPanel=<secret> or window.enableDevPanel('<secret>')
 * - Production: Never visible
 */

import { writable, derived, get } from "svelte/store";

const DEV_PANEL_SECRET = "chipp-dev-2024";
const STORAGE_KEY = "chipp_dev_panel_enabled";

interface DevPanelState {
  isEnabled: boolean;
  isOpen: boolean;
  environment: "development" | "staging" | "production";
}

function getEnvironment(): "development" | "staging" | "production" {
  if (import.meta.env.DEV) {
    return "development";
  }
  // Check if we're on staging domain
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname.includes("staging") || hostname.includes("localhost")) {
      return "staging";
    }
  }
  return "production";
}

function checkUrlParam(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("devPanel") === DEV_PANEL_SECRET;
}

function checkLocalStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveToLocalStorage(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function createDevPanelStore() {
  const environment = getEnvironment();

  // Determine initial enabled state
  let initialEnabled = false;
  if (environment === "development") {
    initialEnabled = true;
  } else if (environment === "staging") {
    initialEnabled = checkUrlParam() || checkLocalStorage();
    // If enabled via URL param, persist to localStorage
    if (checkUrlParam()) {
      saveToLocalStorage(true);
    }
  }
  // Production: always false

  const store = writable<DevPanelState>({
    isEnabled: initialEnabled,
    isOpen: false,
    environment,
  });

  return {
    subscribe: store.subscribe,

    /**
     * Initialize the store (call on mount)
     */
    init() {
      const state = get(store);
      // Re-check URL params on init in case they changed
      if (state.environment === "staging" && checkUrlParam()) {
        saveToLocalStorage(true);
        store.update((s) => ({ ...s, isEnabled: true }));
      }
    },

    /**
     * Enable dev panel via secret (for console usage)
     */
    enable(secret: string): boolean {
      const state = get(store);
      if (state.environment === "production") {
        console.warn("Dev panel is not available in production");
        return false;
      }
      if (secret !== DEV_PANEL_SECRET) {
        console.warn("Invalid secret");
        return false;
      }
      saveToLocalStorage(true);
      store.update((s) => ({ ...s, isEnabled: true }));
      console.log("Dev panel enabled");
      return true;
    },

    /**
     * Disable dev panel
     */
    disable() {
      saveToLocalStorage(false);
      store.update((s) => ({ ...s, isEnabled: false, isOpen: false }));
    },

    /**
     * Toggle panel open/closed
     */
    toggle() {
      store.update((s) => ({ ...s, isOpen: !s.isOpen }));
    },

    /**
     * Open the panel
     */
    open() {
      store.update((s) => ({ ...s, isOpen: true }));
    },

    /**
     * Close the panel
     */
    close() {
      store.update((s) => ({ ...s, isOpen: false }));
    },
  };
}

export const devPanel = createDevPanelStore();

// Derived stores for convenience
export const isDevPanelEnabled = derived(devPanel, ($store) => $store.isEnabled);
export const isDevPanelOpen = derived(devPanel, ($store) => $store.isOpen);
export const devPanelEnvironment = derived(
  devPanel,
  ($store) => $store.environment
);

// Expose enableDevPanel function globally for console access
if (typeof window !== "undefined") {
  (window as unknown as { enableDevPanel: (secret: string) => boolean }).enableDevPanel =
    (secret: string) => devPanel.enable(secret);
}
