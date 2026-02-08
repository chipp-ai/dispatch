<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { captureException } from "$lib/sentry";
  import SetupCard from "../../lib/design-system/components/builder/SetupCard.svelte";
  import TrainCard from "../../lib/design-system/components/builder/TrainCard.svelte";
  import ConnectCard, { type CustomAction, type Parameter } from "../../lib/design-system/components/builder/ConnectCard.svelte";
  import MCPProviderGrid from "../../lib/design-system/components/builder/MCPProviderGrid.svelte";
  import StyleCard from "../../lib/design-system/components/builder/StyleCard.svelte";
  import CustomizeCard from "../../lib/design-system/components/builder/CustomizeCard.svelte";
  import StreamingAnimationCard from "../../lib/design-system/components/builder/StreamingAnimationCard.svelte";
  import ChatPreview from "../../lib/design-system/components/builder/ChatPreview.svelte";
  import type { ChatTheme, AnimationConfig, AnimationType, AnimationTokenize, AnimationTimingFunction } from "../../lib/design-system/components/chat/types";
  import { DEFAULT_ANIMATION_CONFIG } from "../../lib/design-system/components/chat/types";
  import VersionHistoryCard from "../../lib/design-system/components/builder/VersionHistoryCard.svelte";
  import VersionHistoryModal from "../../lib/design-system/components/builder/VersionHistoryModal.svelte";
  import { DEFAULT_MODEL_ID } from "../../lib/design-system/components/builder/modelConfig";
  import { modelSupportsVideoInput } from "../../lib/design-system/utils/modelCapabilities";
  import { toasts } from "../../lib/design-system/stores/toast";

  const dispatch = createEventDispatcher<{ reload: void }>();

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    model: string;
    brandStyles: {
      inputTextHint?: string;
      disclaimerText?: string;
      primaryColor?: string;
      botMessageColor?: string;
      userMessageColor?: string;
      logoUrl?: string;
      theme?: string;
      darkMode?: string;
    } | null;
    welcomeMessages: string[] | null;
    suggestedMessages: string[] | null;
    settings?: {
      temperature?: number;
      maxTokens?: number;
      streamResponses?: boolean;
      requireAuth?: boolean;
      showSources?: boolean;
      multiplayerEnabled?: boolean;
    } | null;
    embeddingConfig?: {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    } | null;
    knowledgeSources?: { id: string; type: 'file' | 'url'; name: string; url?: string }[];
    custom_actions?: CustomAction[];
    capabilities?: {
      animationConfig?: Partial<AnimationConfig>;
    } | null;
  };

  // Bindable props from parent
  export let isSaving = false;
  export let lastSaved: Date | null = null;

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
  let theme: ChatTheme = "default";
  let darkMode = "off";

  // Customize card state
  let temperature = 0.7;
  let maxTokens = 4096;
  let streamResponses = true;
  let requireAuth = false;
  let showSources = true;
  let multiplayerEnabled = false;

  // Animation config state
  let animationEnabled = DEFAULT_ANIMATION_CONFIG.enabled;
  let animationType: AnimationType = DEFAULT_ANIMATION_CONFIG.type;
  let animationDuration = DEFAULT_ANIMATION_CONFIG.duration;
  let animationTokenize: AnimationTokenize = DEFAULT_ANIMATION_CONFIG.tokenize;
  let animationTimingFunction: AnimationTimingFunction = DEFAULT_ANIMATION_CONFIG.timingFunction;
  let animationPreserveNewlines = DEFAULT_ANIMATION_CONFIG.preserveNewlines;

  // Debounce timer for auto-save
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Version history state
  let versionHistoryModalOpen = false;
  let selectedVersionId: string | null = null;
  let versionRefreshTrigger = 0;

  // Initialize form state from app when it changes
  $: if (app) {
    initializeFormState();
  }

  function initializeFormState() {
    name = app?.name || "";
    description = app?.description || "";
    inputTextHint = app?.brandStyles?.inputTextHint || "";
    disclaimerText = app?.brandStyles?.disclaimerText || "";
    startingMessage = app?.welcomeMessages?.[0] || "";

    // Parse suggested messages into conversation starters array
    const suggested = app?.suggestedMessages || [];
    conversationStarters = [
      suggested[0] || "",
      suggested[1] || "",
      suggested[2] || "",
      suggested[3] || "",
    ];

    // Train card state
    model = app?.model || DEFAULT_MODEL_ID;
    systemPrompt = app?.systemPrompt || "";
    embeddingProvider = app?.embeddingConfig?.provider || "local";
    customEmbeddingEndpoint = app?.embeddingConfig?.baseUrl || "";
    customEmbeddingApiKey = app?.embeddingConfig?.apiKey || "";
    customEmbeddingModel = app?.embeddingConfig?.model || "";
    knowledgeSources = app?.knowledgeSources || [];

    // Connect card state
    customActions = app?.custom_actions || [];

    // Style card state
    primaryColor = app?.brandStyles?.primaryColor || "#4F46E5";
    botMessageColor = app?.brandStyles?.botMessageColor || "#F3F4F6";
    userMessageColor = app?.brandStyles?.userMessageColor || "#4F46E5";
    logoUrl = app?.brandStyles?.logoUrl || "";
    theme = (app?.brandStyles?.theme as ChatTheme) || "default";
    darkMode = app?.brandStyles?.darkMode || "off";

    // Customize card state
    temperature = app?.settings?.temperature ?? 0.7;
    maxTokens = app?.settings?.maxTokens ?? 4096;
    streamResponses = app?.settings?.streamResponses ?? true;
    requireAuth = app?.settings?.requireAuth ?? false;
    showSources = app?.settings?.showSources ?? true;
    multiplayerEnabled = app?.settings?.multiplayerEnabled ?? false;

    // Animation config state
    const animConfig = app?.capabilities?.animationConfig;
    animationEnabled = animConfig?.enabled ?? DEFAULT_ANIMATION_CONFIG.enabled;
    animationType = animConfig?.type ?? DEFAULT_ANIMATION_CONFIG.type;
    animationDuration = animConfig?.duration ?? DEFAULT_ANIMATION_CONFIG.duration;
    animationTokenize = animConfig?.tokenize ?? DEFAULT_ANIMATION_CONFIG.tokenize;
    animationTimingFunction = animConfig?.timingFunction ?? DEFAULT_ANIMATION_CONFIG.timingFunction;
    animationPreserveNewlines = animConfig?.preserveNewlines ?? DEFAULT_ANIMATION_CONFIG.preserveNewlines;
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
    if (!appId || isSaving) return;

    isSaving = true;

    try {
      const response = await fetch(`/api/applications/${appId}`, {
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
            theme: theme || undefined,
            darkMode: darkMode || undefined,
          },
          welcomeMessages: startingMessage ? [startingMessage] : [],
          suggestedMessages: conversationStarters.filter(s => s.trim() !== ""),
          settings: {
            temperature,
            maxTokens,
            streamResponses,
            requireAuth,
            showSources,
            multiplayerEnabled,
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
          capabilities: {
            animationConfig: {
              enabled: animationEnabled,
              type: animationType,
              duration: animationDuration,
              tokenize: animationTokenize,
              timingFunction: animationTimingFunction,
              preserveNewlines: animationPreserveNewlines,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save changes");
      }

      hasUnsavedChanges = false;
      lastSaved = new Date();
      versionRefreshTrigger++; // Trigger version history refresh
    } catch (error) {
      captureException(error, { tags: { feature: "builder-build" }, extra: { action: "save-changes", appId } });
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

  function handleThemeChange(value: string) {
    theme = value as ChatTheme;
    scheduleAutoSave();
  }

  function handleDarkModeChange(value: string) {
    darkMode = value;
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

  function handleMultiplayerEnabledChange(value: boolean) {
    multiplayerEnabled = value;
    scheduleAutoSave();
  }

  // Animation config handlers
  function handleAnimationEnabledChange(value: boolean) {
    animationEnabled = value;
    scheduleAutoSave();
  }

  function handleAnimationTypeChange(value: AnimationType) {
    animationType = value;
    scheduleAutoSave();
  }

  function handleAnimationDurationChange(value: number) {
    animationDuration = value;
    scheduleAutoSave();
  }

  function handleAnimationTokenizeChange(value: AnimationTokenize) {
    animationTokenize = value;
    scheduleAutoSave();
  }

  function handleAnimationTimingFunctionChange(value: AnimationTimingFunction) {
    animationTimingFunction = value;
    scheduleAutoSave();
  }

  function handleAnimationPreserveNewlinesChange(value: boolean) {
    animationPreserveNewlines = value;
    scheduleAutoSave();
  }

  async function handlePublishFromModal(event: CustomEvent<{ versionId: string }>) {
    // Publishing from modal - trigger parent to publish
    if (!appId) return;

    // If there are unsaved changes, save first
    if (hasUnsavedChanges) {
      await saveChanges();
    }

    try {
      const response = await fetch(`/api/applications/${appId}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to publish application");
      }

      const result = await response.json();

      if (result.alreadyPublished) {
        toasts.info("Already published", "This version is already live. No changes to publish.");
      } else {
        toasts.success("Published!", "Your app is now live with the latest changes.");
      }

      versionRefreshTrigger++;
    } catch (error) {
      captureException(error, { tags: { feature: "builder-build" }, extra: { action: "publish-app", appId } });
      toasts.error("Failed to publish", "Something went wrong. Please try again.");
    }

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
      const response = await fetch(`/api/applications/${appId}/versions/${versionId}/restore`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to restore version");
      }

      toasts.success("Version restored", "The selected version has been applied to your draft.");

      // Request parent to reload app data
      dispatch("reload");
      versionHistoryModalOpen = false;
      versionRefreshTrigger++; // Refresh version history
    } catch (error) {
      captureException(error, { tags: { feature: "builder-build" }, extra: { action: "restore-version", appId, versionId } });
      toasts.error("Restore failed", "Could not restore the selected version. Please try again.");
    }
  }
</script>

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
        applicationId={appId}
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

      <MCPProviderGrid applicationId={appId} />

      <StyleCard
        applicationId={appId}
        {primaryColor}
        {botMessageColor}
        {userMessageColor}
        {logoUrl}
        {theme}
        {darkMode}
        onPrimaryColorChange={handlePrimaryColorChange}
        onBotMessageColorChange={handleBotMessageColorChange}
        onUserMessageColorChange={handleUserMessageColorChange}
        onLogoChange={handleLogoChange}
        onThemeChange={handleThemeChange}
        onDarkModeChange={handleDarkModeChange}
      />

      <CustomizeCard
        {temperature}
        {maxTokens}
        {streamResponses}
        {requireAuth}
        {showSources}
        {multiplayerEnabled}
        onTemperatureChange={handleTemperatureChange}
        onMaxTokensChange={handleMaxTokensChange}
        onStreamResponsesChange={handleStreamResponsesChange}
        onRequireAuthChange={handleRequireAuthChange}
        onShowSourcesChange={handleShowSourcesChange}
        onMultiplayerEnabledChange={handleMultiplayerEnabledChange}
      />

      <StreamingAnimationCard
        enabled={animationEnabled}
        type={animationType}
        duration={animationDuration}
        tokenize={animationTokenize}
        timingFunction={animationTimingFunction}
        preserveNewlines={animationPreserveNewlines}
        onEnabledChange={handleAnimationEnabledChange}
        onTypeChange={handleAnimationTypeChange}
        onDurationChange={handleAnimationDurationChange}
        onTokenizeChange={handleAnimationTokenizeChange}
        onTimingFunctionChange={handleAnimationTimingFunctionChange}
        onPreserveNewlinesChange={handleAnimationPreserveNewlinesChange}
      />

      <VersionHistoryCard
        {appId}
        refreshTrigger={versionRefreshTrigger}
        on:openModal={handleOpenVersionModal}
      />
    </div>
  </div>

  <div class="preview-panel">
    <ChatPreview
      applicationId={appId}
      appName={name || "App Name"}
      appLogoUrl={logoUrl}
      {startingMessage}
      {conversationStarters}
      inputPlaceholder={inputTextHint || "Type here to chat"}
      {disclaimerText}
      {theme}
      {primaryColor}
      {botMessageColor}
      {userMessageColor}
      showVideoButton={modelSupportsVideoInput(model)}
      animationConfig={{
        enabled: animationEnabled,
        type: animationType,
        duration: animationDuration,
        tokenize: animationTokenize,
        timingFunction: animationTimingFunction,
        preserveNewlines: animationPreserveNewlines,
      }}
    />
  </div>
</div>

{#if versionHistoryModalOpen}
  <VersionHistoryModal
    open={true}
    {appId}
    initialVersionId={selectedVersionId || undefined}
    on:close={handleCloseVersionModal}
    on:restore={handleRestoreVersion}
    on:launch={handlePublishFromModal}
  />
{/if}

<style>
  .builder-layout {
    display: flex;
    height: calc(100vh - 72px);
    overflow: hidden;
  }

  .sidebar-panel {
    width: 100%;
    max-width: 420px;
    padding: var(--space-4);
    background: var(--bg-primary);
    border-right: 1px solid var(--border-primary);
    overflow-y: auto;
    height: 100%;
  }

  .cards-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .preview-panel {
    flex: 1;
    display: none;
    background: var(--bg-secondary);
    height: 100%;
    overflow: hidden;
  }

  @media (min-width: 768px) {
    .preview-panel {
      display: block;
    }
  }
</style>
