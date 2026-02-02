/**
 * Toast Store
 *
 * Manages toast notifications with auto-dismiss functionality.
 */

import { writable } from "svelte/store";

export type ToastVariant =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "loading";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
  duration: number; // 0 = persistent (no auto-dismiss)
  dismissible?: boolean; // Whether the toast can be manually dismissed
}

interface ToastState {
  toasts: Toast[];
}

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);

  function generateId(): string {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function add(toast: Omit<Toast, "id">): string {
    const id = generateId();
    const newToast: Toast = { ...toast, id };

    update((toasts) => [...toasts, newToast]);

    return id;
  }

  function dismiss(id: string): void {
    update((toasts) => toasts.filter((t) => t.id !== id));
  }

  function clear(): void {
    update(() => []);
  }

  // Update an existing toast (e.g., transform loading → success)
  function updateToast(id: string, updates: Partial<Omit<Toast, "id">>): void {
    update((toasts) =>
      toasts.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }

  return {
    subscribe,
    add,
    dismiss,
    clear,
    update: updateToast,
    // Convenience methods
    success: (title: string, description?: string, duration = 5000) =>
      add({ title, description, variant: "success", duration }),
    error: (title: string, description?: string, duration = 5000) =>
      add({ title, description, variant: "error", duration }),
    warning: (title: string, description?: string, duration = 5000) =>
      add({ title, description, variant: "warning", duration }),
    info: (title: string, description?: string, duration = 5000) =>
      add({ title, description, variant: "default", duration }),
    // Loading toast - persistent by default, dismissible
    loading: (title: string, description?: string) =>
      add({
        title,
        description,
        variant: "loading",
        duration: 0,
        dismissible: true,
      }),
  };
}

export const toasts = createToastStore();
