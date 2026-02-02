/**
 * Auth Store
 *
 * Manages authentication state and user session.
 */

import { writable, derived } from "svelte/store";

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  orgId?: string;
}

// Current user state
export const user = writable<User | null>(null);

// Alias for developer context (used by dashboard and other components)
export const developerStore = user;

// Alias for currentUser (used by some components)
export const currentUser = user;

// Derived authenticated state
export const isAuthenticated = derived(user, ($user) => $user !== null);

// Loading state during auth check
export const isAuthLoading = writable(true);

/**
 * Check current authentication status
 */
export async function checkAuth(): Promise<User | null> {
  isAuthLoading.set(true);

  try {
    // Auth routes are at /auth, not /api/auth
    const response = await fetch("/auth/me", {
      credentials: "include",
    });

    if (response.ok) {
      const userData = await response.json();
      user.set(userData);
      return userData;
    }

    user.set(null);
    return null;
  } catch {
    user.set(null);
    return null;
  } finally {
    isAuthLoading.set(false);
  }
}

/**
 * Log out the current user
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } finally {
    user.set(null);
    window.location.hash = "#/login";
  }
}

/**
 * Redirect to login
 */
export function redirectToLogin(): void {
  window.location.hash = "#/login";
}
