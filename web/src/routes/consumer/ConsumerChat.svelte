<script lang="ts">
  /**
   * Consumer Chat Page
   *
   * Main chat interface for end-users (consumers) of published apps.
   * Uses consumer auth and the consumer chat API endpoints.
   *
   * ## Authentication Behavior
   *
   * Apps can be configured with or without required authentication:
   *
   * - `settings.requireAuth = false` (default): Anonymous chat allowed.
   *   Users can chat without logging in. No login button shown.
   *
   * - `settings.requireAuth = true`: Authentication required.
   *   Users are redirected to login page. Login button shown in header.
   *
   * The `settings.requireAuth` field comes from the app's settings, controlled
   * by the "User signup" toggle in the app builder UI. The backend enforces
   * this by returning 401 for unauthenticated requests when requireAuth is true.
   */

  import { onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import {
    consumerAuth,
    consumerApp,
    consumerProfile,
    isConsumerAuthenticated,
  } from "../../stores/consumerAuth";
  import {
    consumerChat,
    chatMessages,
    chatSessionId,
    isStreaming,
    responseGenerating,
    chatError,
    isConversationFrozen,
    stagedFiles,
    stagedImages,
    chatSuggestions,
    chatCTA,
    disclaimerText,
    inputPlaceholder,
    userCredits,
    subscriptionActive,
    type StagedFile,
  } from "../../stores/consumerChat";
  import ConsumerLayout from "./ConsumerLayout.svelte";
  import ChatHeader from "$lib/design-system/components/consumer/ChatHeader.svelte";
  import ChatMessages from "$lib/design-system/components/consumer/ChatMessages.svelte";
  import ChatFooter from "$lib/design-system/components/consumer/ChatFooter.svelte";
  import ConsumerChatMenuSheet from "$lib/design-system/components/consumer/ConsumerChatMenuSheet.svelte";
  import ChatHistorySheet from "$lib/design-system/components/consumer/ChatHistorySheet.svelte";
  import BookmarksSheet from "$lib/design-system/components/consumer/BookmarksSheet.svelte";
  import CustomInstructionsSheet from "$lib/design-system/components/consumer/CustomInstructionsSheet.svelte";
  import CreditExhaustedModal from "$lib/design-system/components/consumer/CreditExhaustedModal.svelte";
  import PackageSelectionModal from "$lib/design-system/components/consumer/PackageSelectionModal.svelte";
  import ParticleAudioPage from "$lib/design-system/components/consumer/ParticleAudioPage.svelte";
  import InstallPrompt from "$lib/design-system/components/consumer/InstallPrompt.svelte";
  import { getAppNameIdFromContext } from "$lib/utils/consumer-context";

  // App is determined by vanity subdomain or injected brand config
  // No longer uses route params
  const appNameId = getAppNameIdFromContext();

  // Extended app type for properties from API that may not be in ConsumerAppInfo
  interface ExtendedAppSettings {
    requireAuth?: boolean;
    disclaimerText?: string;
    inputPlaceholder?: string;
    fileUploadEnabled?: boolean;
    imageUploadEnabled?: boolean;
    videoInputEnabled?: boolean;
    leadGenEnabled?: boolean;
    customInstructionsEnabled?: boolean;
  }

  // UI state
  let menuOpen = false;
  let showHistory = false;
  let showBookmarks = false;
  let showCustomInstructions = false;
  let showCreditExhausted = false;
  let showPackageSelection = false;
  let isVoiceMode = false;
  let bookmarkedMessageIds = new Set<string>();
  let chatMessagesRef: ChatMessages;

  // Menu toggle handler
  function handleMenuToggle() {
    menuOpen = !menuOpen;
  }

  function handleMenuClose() {
    menuOpen = false;
  }

  // Chat sessions state for the menu
  interface ChatSessionSummary {
    id: string;
    title: string;
    updatedAt: string;
  }
  let chatSessions: ChatSessionSummary[] = [];
  let chatSessionsTotal = 0;
  let chatSessionsLoading = false;
  let chatSessionsPage = 1;
  let isLastPage = false;

  // Redirect to login if app requires authentication and user is not logged in
  $: if (
    $consumerApp &&
    !$isConsumerAuthenticated &&
    $consumerApp.settings?.requireAuth
  ) {
    push(`/chat/login`);
  }

  // Get extended settings from app (brandStyles may contain additional settings)
  $: extendedSettings = ($consumerApp?.brandStyles || {}) as Record<string, unknown>;
  $: appSettings = ($consumerApp?.settings || {}) as ExtendedAppSettings;

  // Initialize chat store when app loads
  // Pass isAnonymous flag to enable localStorage persistence for anonymous users
  $: if ($consumerApp && appNameId) {
    const isAnonymous = !$isConsumerAuthenticated;
    consumerChat.initForApp($consumerApp.id, appNameId, isAnonymous);

    // Set app configuration from extended settings
    const suggestions = (extendedSettings.suggestions as Array<{ content: string }>) || [];
    const cta = (extendedSettings.cta as { isActive: boolean; text?: string; link?: string }) || null;

    consumerChat.setAppConfig({
      suggestions,
      cta,
      disclaimerText: (appSettings.disclaimerText as string) || null,
      inputPlaceholder: (appSettings.inputPlaceholder as string) || null,
    });
  }

  // Derived values from app settings
  $: appName = $consumerApp?.name || "Chat";
  $: appId = $consumerApp?.id || "";
  $: logoUrl = extendedSettings.logoUrl ? String(extendedSettings.logoUrl) : null;
  $: primaryColor = (extendedSettings.primaryColor as string) || "#4499ff";
  $: forceDarkMode = Boolean(extendedSettings.forceDarkMode);
  $: monetizationEnabled = Boolean(extendedSettings.monetizationEnabled);
  $: showCreditMeter = monetizationEnabled;
  $: customInstructionsEnabled = Boolean(appSettings.customInstructionsEnabled ?? true);
  $: fileUploadEnabled = Boolean(appSettings.fileUploadEnabled);
  $: imageUploadEnabled = Boolean(appSettings.imageUploadEnabled);
  $: showVoiceButton = Boolean(extendedSettings.voiceEnabled);
  $: showVideoButton = Boolean(appSettings.videoInputEnabled);
  $: showChippBadge = (extendedSettings.subscriptionTier as string) === "FREE";
  $: appDescription = (extendedSettings.description as string) || null;
  // Chat theme: imessage (bubble tails), classic-chipp (plain), modern (rounded bubbles)
  // Allow URL param override for testing: ?theme=modern or ?theme=classic-chipp
  // Use appNameId to trigger reactivity when navigating to different apps
  function getUrlTheme(appNameId: string): string | null {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    const queryStart = hash.indexOf("?");
    if (queryStart === -1) return null;
    const urlParams = new URLSearchParams(hash.slice(queryStart));
    return urlParams.get("theme");
  }
  $: urlTheme = getUrlTheme(appNameId);
  $: chatTheme = (urlTheme || (extendedSettings.theme as string) || "default") as
    | "default"
    | "imessage"
    | "classic-chipp"
    | "modern";

  // Animation config from app capabilities
  $: animationConfig = ($consumerApp as { capabilities?: { animationConfig?: Record<string, unknown> } })?.capabilities?.animationConfig;

  // Credit exhaustion error detection
  // Watch for specific error patterns that indicate the app creator has exhausted their credits
  $: {
    const error = $chatError;
    if (error) {
      const errorLower = error.toLowerCase();
      if (
        (errorLower.includes("credits") && errorLower.includes("exhausted")) ||
        errorLower.includes("credit balance") ||
        errorLower.includes("ai credits balance is exhausted") ||
        errorLower.includes("usage quota") ||
        errorLower.includes("no available balance")
      ) {
        showCreditExhausted = true;
      }
    }
  }

  // Handle credit exhausted modal close
  function handleCreditExhaustedClose() {
    showCreditExhausted = false;
    // Clear the error from the chat store and remove the failed assistant message
    consumerChat.clearError(true);
  }

  // Handle send message
  function handleSend(event: CustomEvent<{ message: string }>) {
    const message = consumerChat.buildMessageWithFiles(event.detail.message);
    consumerChat.sendMessage(message);
    consumerChat.clearStagedFiles();
    consumerChat.clearStagedImages();
    // Scroll to bottom when user sends a message
    chatMessagesRef?.scrollToBottom();
  }

  // Handle audio recording
  async function handleAudioRecorded(
    event: CustomEvent<{ audioBlob: Blob; durationMs: number; mimeType: string }>
  ) {
    const { audioBlob, durationMs, mimeType } = event.detail;

    // Create playable URL for the voice message card
    const audioUrl = URL.createObjectURL(audioBlob);

    // Convert blob to base64 for server transport
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    consumerChat.sendAudioMessage(base64, mimeType, durationMs, audioUrl);
    chatMessagesRef?.scrollToBottom();
  }

  // Handle video recording
  function handleVideoRecorded(
    event: CustomEvent<{ videoUrl: string; mimeType: string; durationMs: number }>
  ) {
    const { videoUrl, mimeType } = event.detail;
    consumerChat.sendVideoMessage(videoUrl, mimeType);
    chatMessagesRef?.scrollToBottom();
  }

  // Handle video file upload
  function handleVideoUploaded(event: CustomEvent<{ url: string; mimeType: string }>) {
    consumerChat.sendVideoMessage(event.detail.url, event.detail.mimeType);
    chatMessagesRef?.scrollToBottom();
  }

  // Handle stop streaming
  function handleStop() {
    consumerChat.stop();
  }

  // Handle retry
  function handleRetry() {
    consumerChat.retry();
  }

  // Handle voice mode
  function handleVoiceClick() {
    isVoiceMode = true;
  }

  function handleVoiceClose() {
    isVoiceMode = false;
  }

  // Menu handlers
  function handleNewChat() {
    consumerChat.clearChat();
  }

  function handleOpenHistory() {
    showHistory = true;
  }

  function handleOpenBookmarks() {
    showBookmarks = true;
  }

  function handleOpenCustomInstructions() {
    showCustomInstructions = true;
  }

  function handleShareChat() {
    // Share is handled by the menu itself (copies link)
  }

  function handleBuyCredits() {
    showPackageSelection = true;
  }

  function handleManageSubscription() {
    // Handled by the menu itself
  }

  async function handleLogout() {
    await consumerAuth.logout(appNameId);
    push(`/chat/login`);
  }

  // Fetch chat sessions for the menu
  // For anonymous users, loads from localStorage; for authenticated users, fetches from server
  async function handleFetchSessions(event: CustomEvent<{ page: number }>) {
    // For anonymous users, load sessions from localStorage
    if (!$isConsumerAuthenticated) {
      const anonSessions = consumerChat.getAnonymousSessions();
      chatSessions = anonSessions.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
      }));
      chatSessionsTotal = anonSessions.length;
      isLastPage = true; // No pagination for localStorage
      return;
    }

    if (!appNameId || chatSessionsLoading) return;

    chatSessionsLoading = true;
    chatSessionsPage = event.detail.page;

    try {
      const response = await fetch(
        `/consumer/${appNameId}/chat/sessions?page=${event.detail.page}&limit=10`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }

      const data = await response.json();
      chatSessions = data.sessions || [];
      chatSessionsTotal = data.total || 0;
      isLastPage = data.isLastPage ?? chatSessions.length < 10;
    } catch (e) {
      console.error("Failed to fetch chat sessions:", e);
      chatSessions = [];
    } finally {
      chatSessionsLoading = false;
    }
  }

  // Delete a chat session
  async function handleDeleteSession(event: CustomEvent<{ sessionId: string }>) {
    if (!appNameId) return;

    // For anonymous users, delete from localStorage
    if (!$isConsumerAuthenticated) {
      consumerChat.deleteAnonymousSession(event.detail.sessionId);
      chatSessions = chatSessions.filter((s) => s.id !== event.detail.sessionId);
      chatSessionsTotal = Math.max(0, chatSessionsTotal - 1);
      return;
    }

    // For authenticated users, delete from server
    try {
      const response = await fetch(
        `/consumer/${appNameId}/chat/sessions/${event.detail.sessionId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete session");
      }

      // Remove from local list
      chatSessions = chatSessions.filter((s) => s.id !== event.detail.sessionId);
      chatSessionsTotal = Math.max(0, chatSessionsTotal - 1);
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  }

  // Update session title
  async function handleUpdateSessionTitle(
    event: CustomEvent<{ sessionId: string; title: string }>
  ) {
    if (!appNameId) return;

    try {
      const response = await fetch(
        `/consumer/${appNameId}/chat/sessions/${event.detail.sessionId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: event.detail.title }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update title");
      }

      // Update local list
      chatSessions = chatSessions.map((s) =>
        s.id === event.detail.sessionId ? { ...s, title: event.detail.title } : s
      );
    } catch (e) {
      console.error("Failed to update session title:", e);
    }
  }

  // File upload handlers
  function handleFileUploadStart(event: CustomEvent<{ file: File }>) {
    const stagedFile: StagedFile = {
      id: crypto.randomUUID(),
      rawFileDetails: event.detail.file,
      isUploading: true,
      hasError: false,
    };
    consumerChat.addStagedFile(stagedFile);
  }

  function handleFileUploaded(event: CustomEvent<{ file: StagedFile }>) {
    consumerChat.updateStagedFile(event.detail.file.id, {
      isUploading: false,
      uploadedFileDetails: event.detail.file.uploadedFileDetails,
    });
  }

  function handleImageUploadStart() {
    // Image upload in progress
  }

  function handleImageUploaded(event: CustomEvent<{ url: string }>) {
    consumerChat.addStagedImage(event.detail.url);
  }

  function handleRemoveStagedFile(event: CustomEvent<{ id: string }>) {
    consumerChat.removeStagedFile(event.detail.id);
  }

  function handleRemoveStagedImage(event: CustomEvent<{ url: string }>) {
    consumerChat.removeStagedImage(event.detail.url);
  }

  // History selection
  async function handleSelectSession(event: CustomEvent<{ sessionId: string }>) {
    // For anonymous users, load from localStorage
    if (!$isConsumerAuthenticated) {
      const loaded = consumerChat.loadAnonymousSession(event.detail.sessionId);
      if (loaded) {
        showHistory = false;
        menuOpen = false;
      }
      return;
    }

    // For authenticated users, load from server
    const loaded = await consumerChat.loadSession(event.detail.sessionId);
    if (loaded) {
      showHistory = false;
      menuOpen = false;
    }
  }

  // Bookmark handler
  function handleBookmark(event: CustomEvent<{ messageId: string }>) {
    if (bookmarkedMessageIds.has(event.detail.messageId)) {
      bookmarkedMessageIds.delete(event.detail.messageId);
    } else {
      bookmarkedMessageIds.add(event.detail.messageId);
    }
    bookmarkedMessageIds = bookmarkedMessageIds;
    // TODO: Persist bookmark via API
  }

  // Cleanup on unmount
  onDestroy(() => {
    consumerChat.reset();
  });
</script>

<ConsumerLayout appNameId={appNameId}>
  <div class="chat-page" class:dark={forceDarkMode}>
    <ChatHeader
      {appName}
      {logoUrl}
      {primaryColor}
      {forceDarkMode}
      {showCreditMeter}
      credits={$userCredits}
      maxCredits={100}
      subscriptionActive={$subscriptionActive}
      {menuOpen}
      on:toggleMenu={handleMenuToggle}
    />

    {#if isVoiceMode}
      <ParticleAudioPage
        brandColor={primaryColor}
        applicationId={appId}
        apiBaseUrl=""
        on:close={handleVoiceClose}
      />
    {:else}
      <ChatMessages
        bind:this={chatMessagesRef}
        messages={$chatMessages}
        isStreaming={$isStreaming}
        {primaryColor}
        {forceDarkMode}
        {appName}
        appLogoUrl={logoUrl}
        {appDescription}
        showBookmarks={$isConsumerAuthenticated}
        {bookmarkedMessageIds}
        theme={chatTheme}
        {animationConfig}
        on:bookmark={handleBookmark}
        on:retry={handleRetry}
      />
    {/if}

    {#if !isVoiceMode}
      <ChatFooter
        disabled={false}
        responseGenerating={$responseGenerating}
        conversationFrozen={$isConversationFrozen}
        error={$chatError}
        {primaryColor}
        {forceDarkMode}
        {showVoiceButton}
        {showVideoButton}
        {fileUploadEnabled}
        {imageUploadEnabled}
        appNameId={appNameId}
        stagedFiles={$stagedFiles}
        stagedImages={$stagedImages}
        inputPlaceholder={$inputPlaceholder || "Type your message..."}
        suggestions={$chatSuggestions}
        showSuggestions={$chatMessages.length === 0}
        cta={$chatCTA}
        disclaimerText={$disclaimerText}
        {showChippBadge}
        hasMessages={$chatMessages.length > 0}
        on:send={handleSend}
        on:stop={handleStop}
        on:retry={handleRetry}
        on:voiceClick={handleVoiceClick}
        on:audioRecorded={handleAudioRecorded}
        on:videoRecorded={handleVideoRecorded}
        on:videoUploaded={handleVideoUploaded}
        on:fileUploadStart={handleFileUploadStart}
        on:fileUploaded={handleFileUploaded}
        on:imageUploadStart={handleImageUploadStart}
        on:imageUploaded={handleImageUploaded}
        on:removeStagedFile={handleRemoveStagedFile}
        on:removeStagedImage={handleRemoveStagedImage}
      />
    {/if}

    <!-- Modals/Sheets -->
    <ChatHistorySheet
      open={showHistory}
      appNameId={appNameId}
      currentSessionId={$chatSessionId}
      on:close={() => (showHistory = false)}
      on:selectSession={handleSelectSession}
    />

    <BookmarksSheet
      open={showBookmarks}
      appNameId={appNameId}
      on:close={() => (showBookmarks = false)}
    />

    <CustomInstructionsSheet
      open={showCustomInstructions}
      appNameId={appNameId}
      on:close={() => (showCustomInstructions = false)}
    />

    <CreditExhaustedModal
      open={showCreditExhausted}
      {appName}
      {primaryColor}
      {logoUrl}
      {forceDarkMode}
      on:close={handleCreditExhaustedClose}
    />

    <PackageSelectionModal
      open={showPackageSelection}
      appNameId={appNameId}
      {appName}
      {primaryColor}
      {logoUrl}
      on:close={() => (showPackageSelection = false)}
    />
  </div>

  <!-- Menu Sheet (rendered at page level to avoid z-index issues with header) -->
  <ConsumerChatMenuSheet
    open={menuOpen}
    isAuthenticated={$isConsumerAuthenticated}
    sessionId={$chatSessionId}
    {appName}
    {appId}
    appNameId={appNameId}
    {primaryColor}
    frozen={$isConversationFrozen}
    subscriptionActive={$subscriptionActive}
    {monetizationEnabled}
    {customInstructionsEnabled}
    userCredits={typeof $userCredits === 'number' ? $userCredits : Number($userCredits) || 0}
    {chatSessions}
    {chatSessionsTotal}
    {chatSessionsLoading}
    {chatSessionsPage}
    {isLastPage}
    on:close={handleMenuClose}
    on:newChat={handleNewChat}
    on:selectSession={handleSelectSession}
    on:deleteSession={handleDeleteSession}
    on:updateSessionTitle={handleUpdateSessionTitle}
    on:fetchSessions={handleFetchSessions}
    on:openBookmarks={handleOpenBookmarks}
    on:openCustomInstructions={handleOpenCustomInstructions}
    on:shareChat={handleShareChat}
    on:buyCredits={handleBuyCredits}
    on:logout={handleLogout}
  />

  <!-- Native PWA install prompt (Chrome/Edge) -->
  <InstallPrompt
    {appName}
    {appId}
    logoUrl={logoUrl || ''}
    {primaryColor}
  />
</ConsumerLayout>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 100%;
    margin: 0 auto;
    background: var(--consumer-background, hsl(var(--background)));
  }

  .chat-page.dark {
    background: #1a1a1a;
  }

  @media (max-width: 640px) {
    .chat-page {
      max-width: 100%;
    }
  }
</style>
