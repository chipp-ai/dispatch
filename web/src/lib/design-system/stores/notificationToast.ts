/**
 * Notification Toast Store
 *
 * Separate store from regular toasts -- different data shape,
 * different render position (top-right vs bottom-right),
 * and category-colored glassmorphic styling.
 */

import { writable } from "svelte/store";

export type NotificationCategory = "engagement" | "billing" | "team";

export interface NotificationToastItem {
  id: string;
  notificationType: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data: Record<string, unknown>;
  actionUrl?: string;
  actionLabel?: string;
  duration: number;
  createdAt: number;
}

const MAX_VISIBLE = 3;

function createNotificationToastStore() {
  const { subscribe, update } = writable<NotificationToastItem[]>([]);

  function generateId(): string {
    return `ntoast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function add(item: Omit<NotificationToastItem, "id" | "createdAt">): string {
    const id = generateId();
    const newItem: NotificationToastItem = {
      ...item,
      id,
      createdAt: Date.now(),
    };

    update((items) => {
      const next = [...items, newItem];
      // Auto-dismiss oldest if over max
      if (next.length > MAX_VISIBLE) {
        return next.slice(next.length - MAX_VISIBLE);
      }
      return next;
    });

    return id;
  }

  function dismiss(id: string): void {
    update((items) => items.filter((t) => t.id !== id));
  }

  function clear(): void {
    update(() => []);
  }

  return {
    subscribe,
    add,
    dismiss,
    clear,
  };
}

export const notificationToasts = createNotificationToastStore();
