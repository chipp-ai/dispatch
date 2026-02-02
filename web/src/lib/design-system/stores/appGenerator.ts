/**
 * App Generator Store
 *
 * Manages the AI-powered app generation flow.
 * Port of useAppGeneration from chipp-admin.
 */

import { writable, derived, get } from "svelte/store";

// ========================================
// Types
// ========================================

export type TaskStatus = "pending" | "active" | "completed";

export interface TaskItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: TaskStatus;
  preview?: string;
  completedAt?: Date;
}

export interface AppDetails {
  title?: string;
  description?: string;
  primaryColor?: string;
  logoUrl?: string;
  conversationStarters?: string[];
  systemPrompt?: string;
  logoDescription?: string;
  startingMessage?: string;
  shouldHaveStartingMessage?: boolean;
}

export interface CompanyDomainInfo {
  isCompanyEmail: boolean;
  companyWebsite?: string;
  domain?: string;
}

export interface AppGeneratorState {
  isCreating: boolean;
  error: string | null;
  statusMessage: string;
  currentStageIndex: number;
  appDetails: AppDetails;
  tasks: TaskItem[];
  showSuccess: boolean;
  createdApplicationId: string | null;
  appFacts: string[];
  generationStartTime: number | null;
  generationEndTime: number | null;
}

// ========================================
// Constants
// ========================================

export const ANIMATION_TIMING = {
  STAGE_TRANSITION: 1500,
  STAGE_ACTIVE_DURATION: 1000,
  STAGE_COMPLETED_HOLD: 2500,
  LOGO_GENERATION_DELAY: 2000,
  CONFETTI_DELAY: 100,
};

const DEFAULT_TASKS: TaskItem[] = [
  {
    id: "analyze",
    name: "Analyze Your Idea",
    description: "Understanding your vision",
    icon: "💡",
    status: "pending",
  },
  {
    id: "design",
    name: "Design Logo Concept",
    description: "Creating visual identity",
    icon: "🎨",
    status: "pending",
  },
  {
    id: "personality",
    name: "Craft AI Personality",
    description: "Defining capabilities",
    icon: "🤖",
    status: "pending",
  },
  {
    id: "starters",
    name: "Add Conversation Starters",
    description: "Suggested questions",
    icon: "💬",
    status: "pending",
  },
  {
    id: "welcome",
    name: "Create Welcome Message",
    description: "First impression",
    icon: "👋",
    status: "pending",
  },
  {
    id: "logo",
    name: "Generate Logo",
    description: "AI-powered design",
    icon: "✨",
    status: "pending",
  },
  {
    id: "finalize",
    name: "Finalize Your App",
    description: "Bringing it all together",
    icon: "🚀",
    status: "pending",
  },
];

const DEFAULT_STATE: AppGeneratorState = {
  isCreating: false,
  error: null,
  statusMessage: "Ready to create something amazing",
  currentStageIndex: -1,
  appDetails: {},
  tasks: [...DEFAULT_TASKS],
  showSuccess: false,
  createdApplicationId: null,
  appFacts: [],
  generationStartTime: null,
  generationEndTime: null,
};

// ========================================
// API Functions
// ========================================

const API_BASE = "/generate";

async function generateAppDetails(userInput: string): Promise<{
  appTitle: string;
  appDescription: string;
  primaryColor: string;
}> {
  const response = await fetch(`${API_BASE}/app-details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ userInput }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate app details");
  }

  return response.json();
}

async function generateLogoDescription(params: {
  userInput: string;
  appName: string;
  appDescription: string;
  primaryColor: string;
}): Promise<{ logoDescription: string }> {
  const response = await fetch(`${API_BASE}/logo-description`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error("Failed to generate logo description");
  }

  return response.json();
}

async function generateSystemPrompt(userInput: string): Promise<{
  prompt: string;
}> {
  const response = await fetch(`${API_BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ userInput }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate system prompt");
  }

  return response.json();
}

async function generateConversationStarters(params: {
  userInput: string;
  appName: string;
  appDescription: string;
  systemPrompt: string;
}): Promise<{ conversationStarters: string[] }> {
  const response = await fetch(`${API_BASE}/conversation-starters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error("Failed to generate conversation starters");
  }

  return response.json();
}

async function generateStartingMessage(params: {
  userInput: string;
  appName: string;
  appDescription: string;
  systemPrompt: string;
}): Promise<{
  shouldHaveStartingMessage: boolean;
  startingMessage?: string;
}> {
  const response = await fetch(`${API_BASE}/starting-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { shouldHaveStartingMessage: false };
  }

  return response.json();
}

async function generateAppFacts(params: {
  name: string;
  description: string;
  systemPrompt?: string;
  hasCompanyKnowledge: boolean;
}): Promise<{ facts: string[] }> {
  const response = await fetch(`${API_BASE}/app-facts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    return { facts: [] };
  }

  return response.json();
}

async function createApplication(params: {
  name: string;
  description: string;
  workspaceId: string;
  systemPrompt: string;
  suggestions?: string[];
}): Promise<{ id: string; [key: string]: any }> {
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      workspaceId: params.workspaceId,
      systemPrompt: params.systemPrompt,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create application");
  }

  const data = await response.json();
  return data.data;
}

// ========================================
// Store
// ========================================

function createAppGeneratorStore() {
  const { subscribe, set, update } = writable<AppGeneratorState>({
    ...DEFAULT_STATE,
  });

  function reset(): void {
    set({
      ...DEFAULT_STATE,
      tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    });
  }

  function setError(error: string): void {
    update((state) => ({
      ...state,
      isCreating: false,
      error,
    }));
  }

  function updateTask(
    taskId: string,
    status: TaskStatus,
    preview?: string
  ): void {
    update((state) => ({
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              preview,
              completedAt:
                status === "completed" ? new Date() : task.completedAt,
            }
          : task
      ),
    }));
  }

  function advanceToStage(stageIndex: number): void {
    update((state) => {
      const newTasks = state.tasks.map((task, index) => {
        if (index < stageIndex) {
          return { ...task, status: "completed" as TaskStatus };
        } else if (index === stageIndex) {
          return { ...task, status: "active" as TaskStatus };
        }
        return task;
      });

      return {
        ...state,
        currentStageIndex: stageIndex,
        tasks: newTasks,
      };
    });
  }

  function updateAppDetails(details: Partial<AppDetails>): void {
    update((state) => ({
      ...state,
      appDetails: { ...state.appDetails, ...details },
    }));
  }

  function setStatusMessage(message: string): void {
    update((state) => ({ ...state, statusMessage: message }));
  }

  async function startGeneration(
    userPrompt: string,
    workspaceId: string,
    onComplete?: (applicationId: string) => void
  ): Promise<void> {
    update((state) => ({
      ...state,
      isCreating: true,
      error: null,
      generationStartTime: Date.now(),
      tasks: DEFAULT_TASKS.map((t) => ({ ...t })),
    }));

    try {
      // Step 1: Analyze the idea
      setStatusMessage("Analyzing your idea...");
      advanceToStage(0);

      const appDetailsData = await generateAppDetails(userPrompt);
      updateAppDetails({
        title: appDetailsData.appTitle,
        description: appDetailsData.appDescription,
        primaryColor: appDetailsData.primaryColor,
      });
      updateTask("analyze", "completed", appDetailsData.appTitle);

      // Step 2: Design logo concept
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Designing your logo...");
      advanceToStage(1);

      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.LOGO_GENERATION_DELAY)
      );
      const logoDesc = await generateLogoDescription({
        userInput: userPrompt,
        appName: appDetailsData.appTitle,
        appDescription: appDetailsData.appDescription,
        primaryColor: appDetailsData.primaryColor,
      });
      updateAppDetails({ logoDescription: logoDesc.logoDescription });
      updateTask("design", "completed");

      // Step 3: Craft AI personality
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Crafting AI personality...");
      advanceToStage(2);

      const promptData = await generateSystemPrompt(userPrompt);
      updateAppDetails({ systemPrompt: promptData.prompt });
      updateTask("personality", "completed");

      // Step 4: Conversation starters
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Creating conversation starters...");
      advanceToStage(3);

      const starters = await generateConversationStarters({
        userInput: userPrompt,
        appName: appDetailsData.appTitle,
        appDescription: appDetailsData.appDescription,
        systemPrompt: promptData.prompt,
      });
      updateAppDetails({ conversationStarters: starters.conversationStarters });
      updateTask("starters", "completed");

      // Step 5: Welcome message
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Creating welcome message...");
      advanceToStage(4);

      const messageData = await generateStartingMessage({
        userInput: userPrompt,
        appName: appDetailsData.appTitle,
        appDescription: appDetailsData.appDescription,
        systemPrompt: promptData.prompt,
      });
      updateAppDetails({
        startingMessage: messageData.startingMessage,
        shouldHaveStartingMessage: messageData.shouldHaveStartingMessage,
      });
      updateTask("welcome", "completed");

      // Step 6: Create the app
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Generating your app...");
      advanceToStage(5);

      const newApp = await createApplication({
        name: appDetailsData.appTitle,
        description: appDetailsData.appDescription,
        workspaceId,
        systemPrompt: promptData.prompt,
        suggestions: starters.conversationStarters,
      });

      updateTask("logo", "completed");

      // Step 7: Finalize
      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_TRANSITION)
      );
      setStatusMessage("Finalizing...");
      advanceToStage(6);

      // Generate app facts
      const factsData = await generateAppFacts({
        name: appDetailsData.appTitle,
        description: appDetailsData.appDescription,
        systemPrompt: promptData.prompt,
        hasCompanyKnowledge: false,
      });

      updateTask("finalize", "completed");

      await new Promise((r) =>
        setTimeout(r, ANIMATION_TIMING.STAGE_COMPLETED_HOLD)
      );

      update((state) => ({
        ...state,
        isCreating: false,
        showSuccess: true,
        createdApplicationId: newApp.id,
        appFacts: factsData.facts || [],
        generationEndTime: Date.now(),
        statusMessage: "Your app is ready!",
      }));

      if (onComplete) {
        onComplete(newApp.id);
      }
    } catch (error) {
      console.error("App generation error:", error);
      setError(
        error instanceof Error ? error.message : "Failed to generate app"
      );
    }
  }

  function getGenerationTime(): string {
    const state = get({ subscribe });
    if (!state.generationStartTime || !state.generationEndTime) return "";
    const seconds = Math.round(
      (state.generationEndTime - state.generationStartTime) / 1000
    );
    return seconds.toString();
  }

  return {
    subscribe,
    reset,
    startGeneration,
    getGenerationTime,
    advanceToStage,
    updateAppDetails,
    setStatusMessage,
    setError,
  };
}

export const appGenerator = createAppGeneratorStore();
