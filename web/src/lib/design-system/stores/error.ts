/**
 * Error Store
 *
 * Centralized error state for the ErrorBoundary component.
 * Can be imported anywhere to trigger error display.
 */

import { writable } from "svelte/store";

export interface AppError {
  message: string;
  stack?: string;
}

// Global error state - set this to display an error in the ErrorBoundary
export const errorStore = writable<AppError | null>(null);

// Helper to set an error
export function setError(error: AppError | null) {
  errorStore.set(error);
}

// Helper to clear the error
export function clearError() {
  errorStore.set(null);
}
