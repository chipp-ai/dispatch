<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import SetupCard from "../lib/design-system/components/builder/SetupCard.svelte";
  import TrainCard from "../lib/design-system/components/builder/TrainCard.svelte";
  import ConnectCard from "../lib/design-system/components/builder/ConnectCard.svelte";
  import type { CustomAction } from "../lib/design-system/components/builder/types";
  import StyleCard from "../lib/design-system/components/builder/StyleCard.svelte";
  import CustomizeCard from "../lib/design-system/components/builder/CustomizeCard.svelte";
  import ChatPreview from "../lib/design-system/components/builder/ChatPreview.svelte";
  import VersionHistoryCard from "../lib/design-system/components/builder/VersionHistoryCard.svelte";
  import VersionHistoryModal from "../lib/design-system/components/builder/VersionHistoryModal.svelte";
  import { DEFAULT_MODEL_ID } from "../lib/design-system/components/builder/modelConfig";
  import { captureException } from "$lib/sentry";

  export let params: { appId?: string } = {};

  // App data state (snake_case to match API response from database)
  let app: {
    id: string;
    name: string;
    description: string | null;
    system_prompt: string | null;
    model: string;
    brand_styles: {
      inputTextHint?: string;
      disclaimerText?: string;
      primaryColor?: string;
      botMessageColor?: string;
      userMessageColor?: string;
      logoUrl?: string;
    } | null;
    welcome_messages: string[] | null;
    suggested_messages: string[] | null;
    settings?: {
      temperature?: number;
      maxTokens?: number;
      streamResponses?: boolean;
      requireAuth?: boolean;
      showSources?: boolean;
    } | null;
    embedding_config?: {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    } | null;
    knowledgeSources?: { id: string; type: 'file' | 'url'; name: string; url?: string }[];
    custom_actions?: { id: string; name: string; description: string; endpoint: string; method: "GET" | "POST" | "PUT" | "DELETE" }[];
  } | null = null;

  let isLoading = true;
  let isSaving = false;
  let isPublishing = false;
  let lastSaved: Date | null = null;
  let hasUnsavedChanges = false;

  // Setup card state
  let name = "";
  let description = "";
  let inputTextHint = "";
  let disclaimerText = "";
  let startingMessage = "";
  let conversationStarters: string[] = ["", "", "", ""];

  // Train card state
  let model = DEFAULT_MODEL_ID;
  let systemPrompt = "";
  let embeddingProvider = "local";
  let customEmbeddingEndpoint = "";
  let customEmbeddingApiKey = "";
  let customEmbeddingModel = "";
  let knowledgeSources: { id: string; type: 'file' | 'url'; name: string; url?: string }[] = [];

  // Connect card state
  let customActions: CustomAction[] = [];

  // Style card state
  let primaryColor = "#4F46E5";
  let botMessageColor = "#F3F4F6";
  let userMessageColor = "#4F46E5";
  let logoUrl = "";

  // Customize card state
  let temperature = 0.7;
  let maxTokens = 4096;
  let streamResponses = true;
  let requireAuth = false;
  let showSources = true;

  // Debounce timer for auto-save
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Version history state
  let versionHistoryModalOpen = false;
  let selectedVersionId: string | null = null;
  let versionRefreshTrigger = 0;

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await loadApp();
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated - redirect to login
          push("/login");
          return;
        }
        if (response.status === 404) {
          push("/apps");
          return;
        }
        throw new Error("Failed to load application");
      }

      const data = await response.json();
      app = data.data;

      // Initialize form state from app data
      name = app?.name || "";
      description = app?.description || "";
      inputTextHint = app?.brand_styles?.inputTextHint || "";
      disclaimerText = app?.brand_styles?.disclaimerText || "";
      startingMessage = app?.welcome_messages?.[0] || "";

      // Parse suggested messages into conversation starters array
      const suggested = app?.suggested_messages || [];
      conversationStarters = [
        suggested[0] || "",
        suggested[1] || "",
        suggested[2] || "",
        suggested[3] || "",
      ];

      // Train card state
      model = app?.model || DEFAULT_MODEL_ID;
      systemPrompt = app?.system_prompt || "";
      embeddingProvider = app?.embedding_config?.provider || "local";
      customEmbeddingEndpoint = app?.embedding_config?.baseUrl || "";
      customEmbeddingApiKey = app?.embedding_config?.apiKey || "";
      customEmbeddingModel = app?.embedding_config?.model || "";
      knowledgeSources = app?.knowledgeSources || [];

      // Connect card state
      customActions = app?.custom_actions || [];

      // Style card state
      primaryColor = app?.brand_styles?.primaryColor || "#4F46E5";
      botMessageColor = app?.brand_styles?.botMessageColor || "#F3F4F6";
      userMessageColor = app?.brand_styles?.userMessageColor || "#4F46E5";
      logoUrl = app?.brand_styles?.logoUrl || "";

      // Customize card state
      temperature = app?.settings?.temperature ?? 0.7;
      maxTokens = app?.settings?.maxTokens ?? 4096;
      streamResponses = app?.settings?.streamResponses ?? true;
      requireAuth = app?.settings?.requireAuth ?? false;
      showSources = app?.settings?.showSources ?? true;
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-build", feature: "load-app" }, extra: { appId: params.appId } });
    } finally {
      isLoading = false;
    }
  }

  function scheduleAutoSave() {
    hasUnsavedChanges = true;

    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      saveChanges();
    }, 1500); // Auto-save after 1.5 seconds of inactivity
  }

  async function saveChanges() {
    if (!params.appId || isSaving) return;

    isSaving = true;

    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name,
          description: description || null,
          systemPrompt: systemPrompt || null,
          modelId: model,
          brandStyles: {
            inputTextHint: inputTextHint || undefined,
            disclaimerText: disclaimerText || undefined,
            primaryColor: primaryColor || undefined,
            botMessageColor: botMessageColor || undefined,
            userMessageColor: userMessageColor || undefined,
            logoUrl: logoUrl || undefined,
          },
          welcomeMessages: startingMessage ? [startingMessage] : [],
          suggestedMessages: conversationStarters.filter(s => s.trim() !== ""),
          settings: {
            temperature,
            maxTokens,
            streamResponses,
            requireAuth,
            showSources,
          },
          embeddingConfig: {
            provider: embeddingProvider,
            ...(embeddingProvider === "custom" && {
              baseUrl: customEmbeddingEndpoint || undefined,
              apiKey: customEmbeddingApiKey || undefined,
              model: customEmbeddingModel || undefined,
            }),
          },
          knowledgeSources,
          customActions,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save changes");
      }

      hasUnsavedChanges = false;
      lastSaved = new Date();
      versionRefreshTrigger++; // Trigger version history refresh
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-build", feature: "save-changes" }, extra: { appId: params.appId } });
    } finally {
      isSaving = false;
    }
  }

  // Form change handlers
  function handleNameChange(value: string) {
    name = value;
    scheduleAutoSave();
  }

  function handleDescriptionChange(value: string) {
    description = value;
    scheduleAutoSave();
  }

  function handleInputTextHintChange(value: string) {
    inputTextHint = value;
    scheduleAutoSave();
  }

  function handleDisclaimerTextChange(value: string) {
    disclaimerText = value;
    scheduleAutoSave();
  }

  function handleStartingMessageChange(value: string) {
    startingMessage = value;
    scheduleAutoSave();
  }

  function handleConversationStarterChange(index: number, value: string) {
    conversationStarters[index] = value;
    conversationStarters = [...conversationStarters]; // Trigger reactivity
    scheduleAutoSave();
  }

  // Train card handlers
  function handleModelChange(value: string) {
    model = value;
    scheduleAutoSave();
  }

  function handleSystemPromptChange(value: string) {
    systemPrompt = value;
    scheduleAutoSave();
  }

  function handleKnowledgeSourcesChange(sources: { id: string; type: 'file' | 'url'; name: string; url?: string }[]) {
    knowledgeSources = sources;
    scheduleAutoSave();
  }

  function handleEmbeddingProviderChange(config: {
    value: string;
    customEndpoint?: string;
    customApiKey?: string;
    customModel?: string;
  }) {
    embeddingProvider = config.value;
    if (config.customEndpoint !== undefined) customEmbeddingEndpoint = config.customEndpoint;
    if (config.customApiKey !== undefined) customEmbeddingApiKey = config.customApiKey;
    if (config.customModel !== undefined) customEmbeddingModel = config.customModel;
    scheduleAutoSave();
  }

  // Connect card handlers
  function handleActionsChange(actions: CustomAction[]) {
    customActions = actions;
    scheduleAutoSave();
  }

  // Style card handlers
  function handlePrimaryColorChange(value: string) {
    primaryColor = value;
    scheduleAutoSave();
  }

  function handleBotMessageColorChange(value: string) {
    botMessageColor = value;
    scheduleAutoSave();
  }

  function handleUserMessageColorChange(value: string) {
    userMessageColor = value;
    scheduleAutoSave();
  }

  function handleLogoChange(url: string) {
    logoUrl = url;
    scheduleAutoSave();
  }

  // Customize card handlers
  function handleTemperatureChange(value: number) {
    temperature = value;
    scheduleAutoSave();
  }

  function handleMaxTokensChange(value: number) {
    maxTokens = value;
    scheduleAutoSave();
  }

  function handleStreamResponsesChange(value: boolean) {
    streamResponses = value;
    scheduleAutoSave();
  }

  function handleRequireAuthChange(value: boolean) {
    requireAuth = value;
    scheduleAutoSave();
  }

  function handleShowSourcesChange(value: boolean) {
    showSources = value;
    scheduleAutoSave();
  }

  function handleShare() {
    // TODO: Implement share functionality
    push(`/apps/${params.appId}/share`);
  }

  async function handlePublish() {
    if (!params.appId || isPublishing) return;

    // If there are unsaved changes, save first
    if (hasUnsavedChanges) {
      await saveChanges();
    }

    isPublishing = true;
    try {
      const response = await fetch(`/api/applications/${params.appId}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to publish application");
      }

      // Refresh version history to show the new published version
      versionRefreshTrigger++;
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-build", feature: "publish" }, extra: { appId: params.appId } });
    } finally {
      isPublishing = false;
    }
  }

  async function handlePublishFromModal(event: CustomEvent<{ versionId: string }>) {
    // Publishing from modal - same as regular publish for now
    // Could be extended to publish a specific version
    await handlePublish();
    versionHistoryModalOpen = false;
  }

  // Version history handlers
  function handleOpenVersionModal(event: CustomEvent<{ versionId?: string }>) {
    selectedVersionId = event.detail?.versionId || null;
    versionHistoryModalOpen = true;
  }

  function handleCloseVersionModal() {
    versionHistoryModalOpen = false;
    selectedVersionId = null;
  }

  async function handleRestoreVersion(event: CustomEvent<{ versionId: string }>) {
    const { versionId } = event.detail;
    try {
      const response = await fetch(`/api/applications/${params.appId}/versions/${versionId}/restore`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to restore version");
      }

      // Reload the app to get restored state
      await loadApp();
      versionHistoryModalOpen = false;
      versionRefreshTrigger++; // Refresh version history
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-build", feature: "restore-version" }, extra: { appId: params.appId, versionId } });
    }
  }
</script>

<svelte:head>
  <title>{name || "Build"} - Chipp</title>
</svelte:head>

{#if isLoading}
  <div class="loading-container">
    <div class="spinner"></div>
  </div>
{:else if app}
  <BuilderSidebar appId={params.appId || ""} activeTab="build" />
  <BuilderHeader
    appName={name}
    currentPage="Build"
    onShare={handleShare}
    onPublish={handlePublish}
    {isSaving}
    {isPublishing}
    {lastSaved}
  />

  <div class="builder-layout">
    <div class="sidebar-panel">
      <div class="cards-container">
        <SetupCard
          {name}
          {description}
          {inputTextHint}
          {disclaimerText}
          {startingMessage}
          {conversationStarters}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
          onInputTextHintChange={handleInputTextHintChange}
          onDisclaimerTextChange={handleDisclaimerTextChange}
          onStartingMessageChange={handleStartingMessageChange}
          onConversationStarterChange={handleConversationStarterChange}
        />

        <TrainCard
          applicationId={params.appId || ""}
          {model}
          {systemPrompt}
          {embeddingProvider}
          {customEmbeddingEndpoint}
          {customEmbeddingApiKey}
          {customEmbeddingModel}
          {knowledgeSources}
          onModelChange={handleModelChange}
          onSystemPromptChange={handleSystemPromptChange}
          onEmbeddingProviderChange={handleEmbeddingProviderChange}
          onKnowledgeSourcesChange={handleKnowledgeSourcesChange}
        />

        <ConnectCard
          actions={customActions}
          onActionsChange={handleActionsChange}
        />

        <StyleCard
          applicationId={params.appId || ""}
          {primaryColor}
          {botMessageColor}
          {userMessageColor}
          {logoUrl}
          onPrimaryColorChange={handlePrimaryColorChange}
          onBotMessageColorChange={handleBotMessageColorChange}
          onUserMessageColorChange={handleUserMessageColorChange}
          onLogoChange={handleLogoChange}
        />

        <CustomizeCard
          {temperature}
          {maxTokens}
          {streamResponses}
          {requireAuth}
          {showSources}
          onTemperatureChange={handleTemperatureChange}
          onMaxTokensChange={handleMaxTokensChange}
          onStreamResponsesChange={handleStreamResponsesChange}
          onRequireAuthChange={handleRequireAuthChange}
          onShowSourcesChange={handleShowSourcesChange}
        />

        <VersionHistoryCard
          appId={params.appId || ""}
          refreshTrigger={versionRefreshTrigger}
          on:openModal={handleOpenVersionModal}
        />
      </div>
    </div>

    <div class="preview-panel">
      <ChatPreview
        applicationId={params.appId || ""}
        appName={name || "App Name"}
        appLogoUrl={logoUrl}
        {startingMessage}
        {conversationStarters}
        inputPlaceholder={inputTextHint || "Type here to chat"}
        {disclaimerText}
      />
    </div>
  </div>
{:else}
  <div class="error-container">
    <p>Application not found</p>
  </div>
{/if}

{#if versionHistoryModalOpen}
  <VersionHistoryModal
    open={true}
    appId={params.appId || ""}
    initialVersionId={selectedVersionId || undefined}
    on:close={handleCloseVersionModal}
    on:restore={handleRestoreVersion}
    on:launch={handlePublishFromModal}
  />
{/if}

<style>
  .loading-container,
  .error-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--bg-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-primary);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-container p {
    color: var(--text-secondary);
    font-size: var(--text-lg);
  }

  .builder-layout {
    display: flex;
    min-height: 100vh;
    padding-top: 56px; /* Header height on mobile */
  }

  @media (min-width: 1024px) {
    .builder-layout {
      padding-left: 100px; /* Sidebar width on desktop */
      padding-top: 72px; /* Header height on desktop */
    }
  }

  .sidebar-panel {
    width: 100%;
    max-width: 420px;
    padding: var(--space-4);
    background: var(--bg-primary);
    border-right: 1px solid var(--border-primary);
    overflow-y: auto;
    max-height: calc(100vh - 56px);
  }

  .cards-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  @media (min-width: 1024px) {
    .sidebar-panel {
      max-height: calc(100vh - 72px);
    }
  }

  .preview-panel {
    flex: 1;
    display: none;
    background: var(--bg-secondary);
  }

  @media (min-width: 768px) {
    .preview-panel {
      display: block;
    }
  }
</style>
