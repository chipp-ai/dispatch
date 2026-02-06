/**
 * Version Check
 *
 * Polls for new deployments and shows a subtle persistent toast
 * when a new version is available. Part of the thick client architecture:
 * users run a fully cached version and get a gentle nudge to refresh.
 */

import { toasts } from "$lib/design-system";

declare const __APP_VERSION__: string;

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const VERSION_URL = "/version.json";

let currentVersion: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let updateToastShown = false;

async function fetchVersion(): Promise<string | null> {
  try {
    // Cache-bust to always get the latest from the server
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

async function checkForUpdate(): Promise<void> {
  if (updateToastShown) return;

  const latestVersion = await fetchVersion();
  if (!latestVersion || !currentVersion) return;

  if (latestVersion !== currentVersion) {
    updateToastShown = true;
    toasts.add({
      title: "New version available",
      description: "Refresh to get the latest updates",
      variant: "default",
      duration: 0, // Persistent until dismissed
      dismissible: true,
    });
  }
}

/**
 * Start polling for new versions.
 * Call after the app has booted. Returns a cleanup function.
 */
export function startVersionCheck(): () => void {
  // In dev mode, version.json doesn't exist - skip polling
  if (import.meta.env.DEV) return () => {};

  // Version is embedded at build time by the Vite plugin
  try {
    currentVersion = __APP_VERSION__;
  } catch {
    // __APP_VERSION__ not defined (dev mode fallback)
    return () => {};
  }

  pollTimer = setInterval(checkForUpdate, POLL_INTERVAL);

  // Also check when user returns to the tab after being away
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      checkForUpdate();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    if (pollTimer) clearInterval(pollTimer);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
