/**
 * Onboarding V2 Store
 *
 * Manages state for the onboarding V2 flow with localStorage persistence.
 */

import { writable, derived, get } from "svelte/store";
import type { OnboardingStep, TrainSubStep } from "$lib/onboarding-v2/flow";
import { ONBOARDING_TEMPLATES } from "$lib/onboarding-v2/flow";
import { captureException } from "$lib/sentry";

const PERSISTENCE_KEY = "onboarding-v2-storage-v1";

export interface OnboardingV2State {
  // Application IDs from template creation
  templateApplicationIds: Record<string, string>;
  templateAppNameIds: Record<string, string>; // Stores the slug/appNameId
  templateChatSessions: Record<string, string>;

  // Custom app data (when building your own)
  customAppData: {
    applicationId: string;
    appNameId: string;
    chatSessionId: string;
    name: string;
  } | null;

  // Selection state
  selectedTemplate: string | null;
  customPrompt: string;
  isCustomApp: boolean;

  // Navigation state
  currentStep: OnboardingStep;
  trainSubStep: TrainSubStep;
  completedSteps: OnboardingStep[];
  skippedSubSteps: TrainSubStep[];

  // Train step data
  websiteUrl: string;
  uploadedFileIds: string[];
  connectedIntegrations: string[];

  // Generation state (for Build Your Own)
  isGenerating: boolean;
  generationStep: string | null;
  generationError: string | null;

  // Hydration state
  isHydrated: boolean;
}

const defaultState: OnboardingV2State = {
  templateApplicationIds: {},
  templateAppNameIds: {},
  templateChatSessions: {},
  customAppData: null,
  selectedTemplate: null,
  customPrompt: "",
  isCustomApp: false,
  currentStep: "build",
  trainSubStep: "website",
  completedSteps: [],
  skippedSubSteps: [],
  websiteUrl: "",
  uploadedFileIds: [],
  connectedIntegrations: [],
  isGenerating: false,
  generationStep: null,
  generationError: null,
  isHydrated: false,
};

// Create the main store
function createOnboardingV2Store() {
  const { subscribe, set, update } = writable<OnboardingV2State>(defaultState);

  // Load from localStorage
  function loadFromStorage(): Partial<OnboardingV2State> {
    if (typeof window === "undefined") return {};

    try {
      const stored = localStorage.getItem(PERSISTENCE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      captureException(error, { tags: { source: "onboarding-store" }, extra: { action: "loadFromStorage" } });
    }
    return {};
  }

  // Save to localStorage
  function saveToStorage(state: OnboardingV2State) {
    if (typeof window === "undefined") return;

    try {
      // Don't persist transient state
      const persistedState = {
        templateApplicationIds: state.templateApplicationIds,
        templateAppNameIds: state.templateAppNameIds,
        templateChatSessions: state.templateChatSessions,
        customAppData: state.customAppData,
        selectedTemplate: state.selectedTemplate,
        customPrompt: state.customPrompt,
        isCustomApp: state.isCustomApp,
        currentStep: state.currentStep,
        trainSubStep: state.trainSubStep,
        completedSteps: state.completedSteps,
        skippedSubSteps: state.skippedSubSteps,
        websiteUrl: state.websiteUrl,
        uploadedFileIds: state.uploadedFileIds,
        connectedIntegrations: state.connectedIntegrations,
      };
      localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(persistedState));
    } catch (error) {
      captureException(error, { tags: { source: "onboarding-store" }, extra: { action: "saveToStorage" } });
    }
  }

  return {
    subscribe,

    // Hydrate from localStorage
    hydrate: () => {
      const stored = loadFromStorage();
      update((state) => {
        const newState = {
          ...state,
          ...stored,
          isHydrated: true,
        };
        return newState;
      });
    },

    // Template selection
    selectTemplate: (templateId: string) => {
      update((state) => {
        const newState = {
          ...state,
          selectedTemplate: templateId,
          isCustomApp: false,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setCustomPrompt: (prompt: string) => {
      update((state) => {
        const newState = {
          ...state,
          customPrompt: prompt,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setIsCustomApp: (isCustom: boolean) => {
      update((state) => {
        const newState = {
          ...state,
          isCustomApp: isCustom,
          selectedTemplate: isCustom ? null : state.selectedTemplate,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    // Application data
    setTemplateApplicationIds: (ids: Record<string, string>) => {
      update((state) => {
        const newState = {
          ...state,
          templateApplicationIds: ids,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setTemplateAppNameIds: (ids: Record<string, string>) => {
      update((state) => {
        const newState = {
          ...state,
          templateAppNameIds: ids,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setTemplateChatSessions: (sessions: Record<string, string>) => {
      update((state) => {
        const newState = {
          ...state,
          templateChatSessions: sessions,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setTemplateChatSession: (templateId: string, sessionId: string) => {
      update((state) => {
        const newState = {
          ...state,
          templateChatSessions: {
            ...state.templateChatSessions,
            [templateId]: sessionId,
          },
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setCustomAppData: (data: {
      applicationId: string;
      appNameId: string;
      chatSessionId: string;
      name: string;
    }) => {
      update((state) => {
        const newState = {
          ...state,
          customAppData: data,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    // Navigation
    setCurrentStep: (step: OnboardingStep) => {
      update((state) => {
        const newState = {
          ...state,
          currentStep: step,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    setTrainSubStep: (subStep: TrainSubStep) => {
      update((state) => {
        const newState = {
          ...state,
          trainSubStep: subStep,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    markStepCompleted: (step: OnboardingStep) => {
      update((state) => {
        if (state.completedSteps.includes(step)) {
          return state;
        }
        const newState = {
          ...state,
          completedSteps: [...state.completedSteps, step],
        };
        saveToStorage(newState);
        return newState;
      });
    },

    markSubStepSkipped: (subStep: TrainSubStep) => {
      update((state) => {
        if (state.skippedSubSteps.includes(subStep)) {
          return state;
        }
        const newState = {
          ...state,
          skippedSubSteps: [...state.skippedSubSteps, subStep],
        };
        saveToStorage(newState);
        return newState;
      });
    },

    // Train step actions
    setWebsiteUrl: (url: string) => {
      update((state) => {
        const newState = {
          ...state,
          websiteUrl: url,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    addUploadedFile: (fileId: string) => {
      update((state) => {
        if (state.uploadedFileIds.includes(fileId)) {
          return state;
        }
        const newState = {
          ...state,
          uploadedFileIds: [...state.uploadedFileIds, fileId],
        };
        saveToStorage(newState);
        return newState;
      });
    },

    removeUploadedFile: (fileId: string) => {
      update((state) => {
        const newState = {
          ...state,
          uploadedFileIds: state.uploadedFileIds.filter((id) => id !== fileId),
        };
        saveToStorage(newState);
        return newState;
      });
    },

    toggleIntegration: (integrationId: string) => {
      update((state) => {
        const newConnected = state.connectedIntegrations.includes(integrationId)
          ? state.connectedIntegrations.filter((id) => id !== integrationId)
          : [...state.connectedIntegrations, integrationId];
        const newState = {
          ...state,
          connectedIntegrations: newConnected,
        };
        saveToStorage(newState);
        return newState;
      });
    },

    // Generation state (not persisted)
    setIsGenerating: (isGenerating: boolean) => {
      update((state) => ({
        ...state,
        isGenerating,
      }));
    },

    setGenerationStep: (step: string | null) => {
      update((state) => ({
        ...state,
        generationStep: step,
      }));
    },

    setGenerationError: (error: string | null) => {
      update((state) => ({
        ...state,
        generationError: error,
      }));
    },

    // Reset
    reset: () => {
      const newState = { ...defaultState, isHydrated: true };
      saveToStorage(newState);
      set(newState);
    },
  };
}

// Export the store instance
export const onboardingV2Store = createOnboardingV2Store();

// Derived stores for computed values
export const currentApplicationId = derived(
  onboardingV2Store,
  ($store): string | null => {
    if ($store.isCustomApp && $store.customAppData) {
      return $store.customAppData.applicationId;
    }
    if (
      $store.selectedTemplate &&
      $store.templateApplicationIds[$store.selectedTemplate]
    ) {
      return $store.templateApplicationIds[$store.selectedTemplate];
    }
    return null;
  }
);

export const currentAppNameId = derived(
  onboardingV2Store,
  ($store): string | null => {
    if ($store.isCustomApp && $store.customAppData) {
      return $store.customAppData.appNameId;
    }
    if (
      $store.selectedTemplate &&
      $store.templateAppNameIds[$store.selectedTemplate]
    ) {
      return $store.templateAppNameIds[$store.selectedTemplate];
    }
    return null;
  }
);

export const currentChatSessionId = derived(
  onboardingV2Store,
  ($store): string | null => {
    if ($store.isCustomApp && $store.customAppData) {
      return $store.customAppData.chatSessionId;
    }
    if (
      $store.selectedTemplate &&
      $store.templateChatSessions[$store.selectedTemplate]
    ) {
      return $store.templateChatSessions[$store.selectedTemplate];
    }
    return null;
  }
);

export const currentAppName = derived(
  onboardingV2Store,
  ($store): string | null => {
    if ($store.isCustomApp && $store.customAppData) {
      return $store.customAppData.name;
    }
    if ($store.selectedTemplate) {
      const template = ONBOARDING_TEMPLATES.find(
        (t) => t.id === $store.selectedTemplate
      );
      return template?.name ?? null;
    }
    return null;
  }
);

export const hasSelection = derived(onboardingV2Store, ($store): boolean => {
  return (
    !!$store.selectedTemplate ||
    ($store.isCustomApp && !!$store.customPrompt.trim())
  );
});

export const currentTemplate = derived(onboardingV2Store, ($store) => {
  if (!$store.selectedTemplate) return null;
  return (
    ONBOARDING_TEMPLATES.find((t) => t.id === $store.selectedTemplate) || null
  );
});
