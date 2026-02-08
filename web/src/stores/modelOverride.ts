/**
 * Model Override Store
 *
 * Allows developers to temporarily override the LLM model used for chat,
 * enabling testing of different providers without changing app settings.
 *
 * The override is persisted in localStorage and sent as X-Dev-Model-Override header.
 * Only works in dev/staging environments (ignored in production).
 */

import { writable, get } from "svelte/store";

const STORAGE_KEY = "chipp_dev_model_override";

export interface ModelOption {
  id: string;
  label: string;
}

export const availableModels: ModelOption[] = [
  { id: "", label: "(Use App Default)" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

function createModelOverrideStore() {
  // Load initial value from localStorage
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY) || ""
      : "";
  const store = writable(stored);

  return {
    subscribe: store.subscribe,

    /**
     * Set the model override
     */
    set: (model: string) => {
      if (typeof localStorage !== "undefined") {
        if (model) {
          localStorage.setItem(STORAGE_KEY, model);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      store.set(model);
    },

    /**
     * Clear the model override
     */
    clear: () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
      store.set("");
    },

    /**
     * Get headers object with X-Dev-Model-Override if set
     * Use this when making chat API requests
     */
    getHeader: (): Record<string, string> => {
      const value = get(store);
      return value ? { "X-Dev-Model-Override": value } : {};
    },

    /**
     * Get the current override value (synchronous)
     */
    getValue: (): string => {
      return get(store);
    },
  };
}

export const modelOverride = createModelOverrideStore();
