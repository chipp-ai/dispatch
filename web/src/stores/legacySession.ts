/**
 * Legacy Session Store
 *
 * Detects if the user has an active session on chipp-admin (app.chipp.ai).
 * Used to show account import prompts on Login/Signup pages.
 */

import { writable, derived } from "svelte/store";

interface LegacySessionState {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  error: Error | null;
}

const initialState: LegacySessionState = {
  isLoggedIn: false,
  isLoading: true,
  user: null,
  error: null,
};

const state = writable<LegacySessionState>(initialState);

export const hasLegacySession = derived(state, ($s) => $s.isLoggedIn);
export const legacyUser = derived(state, ($s) => $s.user);
export const isLegacySessionLoading = derived(state, ($s) => $s.isLoading);

// chipp-admin URL based on environment
const CHIPP_ADMIN_URL = import.meta.env.PROD
  ? "https://app.chipp.ai"
  : "http://localhost:3000";

/**
 * Check if the user has an active session on chipp-admin.
 * This makes a cross-origin request with credentials to detect existing sessions.
 */
export async function checkLegacySession(): Promise<LegacySessionState> {
  state.update((s) => ({ ...s, isLoading: true }));

  try {
    const res = await fetch(`${CHIPP_ADMIN_URL}/api/auth/check-session`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const newState: LegacySessionState = {
      isLoggedIn: data.isLoggedIn,
      isLoading: false,
      user: data.user ?? null,
      error: null,
    };

    state.set(newState);
    return newState;
  } catch (e) {
    // Network errors or CORS failures are expected when not logged in
    const newState: LegacySessionState = {
      isLoggedIn: false,
      isLoading: false,
      user: null,
      error: e as Error,
    };

    state.set(newState);
    return newState;
  }
}

/**
 * Reset the legacy session state.
 * Call this after the user completes import or dismisses the prompt.
 */
export function resetLegacySession(): void {
  state.set(initialState);
}

/**
 * Check if an email has already seen the welcome back screen.
 */
export async function checkWelcomeScreenSeen(email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/welcome-screen/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      console.error("Failed to check welcome screen status");
      return false;
    }

    const data = await res.json();
    return data.data?.hasSeen ?? false;
  } catch (e) {
    console.error("Error checking welcome screen status:", e);
    return false;
  }
}

/**
 * Mark an email as having seen the welcome back screen.
 */
export async function markWelcomeScreenSeen(email: string): Promise<void> {
  try {
    await fetch("/api/auth/welcome-screen/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  } catch (e) {
    console.error("Error marking welcome screen as seen:", e);
  }
}
