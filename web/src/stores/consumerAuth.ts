/**
 * Consumer Authentication Store
 *
 * Manages authentication state for end-users (consumers) of chat applications.
 * Separate from developer auth - consumers authenticate per-app.
 */

import { writable, derived, get } from "svelte/store";

// Consumer profile
export interface ConsumerProfile {
  id: string;
  email: string;
  name: string | null;
  identifier: string;
  credits: number;
  subscriptionActive: boolean;
}

// App info for consumer context
export interface ConsumerAppInfo {
  id: string;
  name: string;
  appNameId: string;
  brandStyles: Record<string, unknown>;
  pictureUrl?: string;
  /**
   * Public app settings exposed to consumers.
   * Only contains settings relevant for client-side behavior.
   *
   * - requireAuth: If true, users must log in to chat. Controlled by
   *   "User signup" toggle in app builder. When false, anonymous chat is allowed.
   * - redirectAfterSignupUrl: Custom redirect URL after successful signup
   * - signupsRestrictedToDomain: Domain restriction hint to display in signup form
   */
  settings: {
    requireAuth: boolean;
    redirectAfterSignupUrl?: string;
    signupsRestrictedToDomain?: string;
  };
}

// Store state
interface ConsumerAuthState {
  consumer: ConsumerProfile | null;
  app: ConsumerAppInfo | null;
  isLoading: boolean;
  error: string | null;
}

// Create the store
function createConsumerAuthStore() {
  const { subscribe, set, update } = writable<ConsumerAuthState>({
    consumer: null,
    app: null,
    isLoading: false,
    error: null,
  });

  return {
    subscribe,

    /**
     * Initialize consumer context by loading app info
     */
    async initApp(appNameId: string): Promise<boolean> {
      update((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const response = await fetch(`/consumer/${appNameId}/app`, {
          credentials: "include",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "App not found");
        }

        const data = await response.json();

        update((s) => ({
          ...s,
          app: {
            id: data.id,
            name: data.name,
            appNameId: appNameId,
            brandStyles: data.brandStyles || {},
            pictureUrl: data.pictureUrl || data.brandStyles?.logoUrl,
            settings: data.settings || { requireAuth: false },
          },
          consumer: data.consumer || null,
          isLoading: false,
        }));

        return true;
      } catch (err) {
        update((s) => ({
          ...s,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to load app",
        }));
        return false;
      }
    },

    /**
     * Login with email and password
     */
    async login(
      appNameId: string,
      email: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> {
      update((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const response = await fetch(`/consumer/${appNameId}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Login failed");
        }

        update((s) => ({
          ...s,
          consumer: data.consumer,
          isLoading: false,
        }));

        return { success: true };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Login failed";
        update((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },

    /**
     * Resend OTP code
     */
    async resendOtp(
      appNameId: string,
      email: string
    ): Promise<{ success: boolean; error?: string }> {
      try {
        const response = await fetch(`/consumer/${appNameId}/auth/resend-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to resend code");
        }

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to resend code",
        };
      }
    },

    /**
     * Signup with email and optional password
     */
    async signup(
      appNameId: string,
      email: string,
      password?: string,
      name?: string
    ): Promise<{
      success: boolean;
      error?: string;
      requiresVerification?: boolean;
    }> {
      update((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const response = await fetch(`/consumer/${appNameId}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password, name }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Signup failed");
        }

        update((s) => ({ ...s, isLoading: false }));

        return {
          success: true,
          requiresVerification: data.requiresVerification,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Signup failed";
        update((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },

    /**
     * Verify OTP code
     */
    async verifyOtp(
      appNameId: string,
      email: string,
      otpCode: string
    ): Promise<{ success: boolean; error?: string }> {
      update((s) => ({ ...s, isLoading: true, error: null }));

      try {
        const response = await fetch(`/consumer/${appNameId}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, otpCode }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Verification failed");
        }

        update((s) => ({
          ...s,
          consumer: data.consumer,
          isLoading: false,
        }));

        return { success: true };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Verification failed";
        update((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },

    /**
     * Logout
     */
    async logout(appNameId: string): Promise<void> {
      try {
        await fetch(`/consumer/${appNameId}/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Ignore logout errors
      }

      update((s) => ({
        ...s,
        consumer: null,
      }));
    },

    /**
     * Clear error
     */
    clearError(): void {
      update((s) => ({ ...s, error: null }));
    },

    /**
     * Reset store
     */
    reset(): void {
      set({
        consumer: null,
        app: null,
        isLoading: false,
        error: null,
      });
    },
  };
}

export const consumerAuth = createConsumerAuthStore();

// Derived stores
export const isConsumerAuthenticated = derived(
  consumerAuth,
  ($store) => $store.consumer !== null
);

export const consumerProfile = derived(
  consumerAuth,
  ($store) => $store.consumer
);

export const consumerApp = derived(consumerAuth, ($store) => $store.app);

export const consumerIsLoading = derived(
  consumerAuth,
  ($store) => $store.isLoading
);

export const consumerError = derived(consumerAuth, ($store) => $store.error);
