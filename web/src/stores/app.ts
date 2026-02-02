/**
 * App-level state store
 *
 * Tracks global app state like boot status.
 * Once booted, the app never shows the splash screen again.
 */

import { writable } from "svelte/store";

// Has the app completed initial boot?
// This becomes true after the first auth check completes.
// Once true, it stays true for the entire session.
export const appBooted = writable(false);

// Mark the app as booted (called once after initial load)
export function markAppBooted() {
  appBooted.set(true);
}
