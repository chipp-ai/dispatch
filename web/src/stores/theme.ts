/**
 * Theme Store
 *
 * Manages light/dark mode with system preference detection
 * and manual override capability.
 */

import { writable, derived } from "svelte/store";

export type ThemeMode = "light" | "dark" | "system";

// Detect initial theme from localStorage or system preference
function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";

  const stored = localStorage.getItem("theme") as ThemeMode | null;
  if (stored && ["light", "dark", "system"].includes(stored)) {
    return stored;
  }
  return "system";
}

// Get the actual theme (resolved from system if needed)
function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

// Create the theme mode store
export const themeMode = writable<ThemeMode>(getInitialTheme());

// Derived store for the resolved theme
export const theme = derived(themeMode, ($mode) => resolveTheme($mode));

// Apply theme to document
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  localStorage.setItem("theme", mode);
  themeMode.set(mode);
}

// Toggle between light and dark (skips system)
export function toggleTheme(): void {
  themeMode.update((current) => {
    const resolved = resolveTheme(current);
    const newMode: ThemeMode = resolved === "dark" ? "light" : "dark";
    applyTheme(newMode);
    return newMode;
  });
}

// Set specific theme
export function setTheme(mode: ThemeMode): void {
  applyTheme(mode);
}

// Initialize theme on app start
export function initTheme(): void {
  const mode = getInitialTheme();
  applyTheme(mode);

  // Listen for system theme changes
  if (typeof window !== "undefined") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      themeMode.update((current) => {
        if (current === "system") {
          applyTheme("system");
        }
        return current;
      });
    });
  }
}
