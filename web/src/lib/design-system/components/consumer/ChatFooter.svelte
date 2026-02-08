<script lang="ts">
  /**
   * ChatFooter
   *
   * Footer component for consumer chat with:
   * - Error display with retry button
   * - Desktop/mobile suggestion layouts
   * - CTA badge (if configured)
   * - ChatInput component
   * - Disclaimer text
   * - "Created on Chipp" badge (free tier)
   */
  import { createEventDispatcher } from "svelte";
  import type { StagedFile, Suggestion, CTAConfig } from "../../../../stores/consumerChat";
  import ChatInput from "../chat/ChatInput.svelte";
  import SuggestionButton from "./SuggestionButton.svelte";
  import CTABadge from "./CTABadge.svelte";
  import TypingIndicatorBar from "./TypingIndicatorBar.svelte";

  export let disabled: boolean = false;
  export let responseGenerating: boolean = false;
  export let conversationFrozen: boolean = false;
  export let error: string | null = null;
  export let primaryColor: string = "#4499ff";
  export let forceDarkMode: boolean = false;
  export let showVoiceButton: boolean = false;
  export let showVideoButton: boolean = false;
  export let fileUploadEnabled: boolean = false;
  export let imageUploadEnabled: boolean = false;
  export let appNameId: string = "";
  export let stagedFiles: StagedFile[] = [];
  export let stagedImages: string[] = [];
  export let inputPlaceholder: string = "Type your message...";
  export let suggestions: Suggestion[] = [];
  export let showSuggestions: boolean = true;
  export let cta: CTAConfig | null = null;
  export let disclaimerText: string | null = null;
  export let showChippBadge: boolean = false;
  export let hasMessages: boolean = false;
  /** Multiplayer: names of participants currently typing */
  export let typingNames: string[] = [];
  /** Multiplayer: whether AI is responding (disables input for everyone) */
  export let multiplayerAiResponding: boolean = false;

  let isMobile: boolean = false;

  // Responsive check
  function checkMobile(): void {
    if (typeof window !== "undefined") {
      isMobile = window.innerWidth < 768;
    }
  }

  // Initial check and listener
  if (typeof window !== "undefined") {
    checkMobile();
    window.addEventListener("resize", checkMobile);
  }

  const dispatch = createEventDispatcher<{
    send: { message: string };
    stop: void;
    retry: void;
    voiceClick: void;
    audioRecorded: { audioBlob: Blob; durationMs: number; mimeType: string };
    videoRecorded: { videoUrl: string; mimeType: string; durationMs: number };
    videoUploaded: { url: string; mimeType: string };
    suggestionClick: { content: string };
    fileUploadStart: { file: File };
    fileUploaded: { file: StagedFile };
    imageUploadStart: void;
    imageUploaded: { url: string };
    removeStagedFile: { id: string };
    removeStagedImage: { url: string };
  }>();

  $: visibleSuggestions =
    showSuggestions && !hasMessages && suggestions.length > 0
      ? suggestions.slice(0, 4)
      : [];

  function handleSend(event: CustomEvent<{ message: string }>): void {
    dispatch("send", event.detail);
  }

  function handleStop(): void {
    dispatch("stop");
  }

  function handleRetry(): void {
    dispatch("retry");
  }

  function handleVoiceClick(): void {
    dispatch("voiceClick");
  }

  function handleSuggestionClick(event: CustomEvent<{ content: string }>): void {
    dispatch("suggestionClick", event.detail);
    // Also send the message directly
    dispatch("send", { message: event.detail.content });
  }

  function handleFileUploadStart(event: CustomEvent<{ file: File }>): void {
    dispatch("fileUploadStart", event.detail);
  }

  function handleFileUploaded(event: CustomEvent<{ file: StagedFile }>): void {
    dispatch("fileUploaded", event.detail);
  }

  function handleImageUploadStart(): void {
    dispatch("imageUploadStart");
  }

  function handleImageUploaded(event: CustomEvent<{ url: string }>): void {
    dispatch("imageUploaded", event.detail);
  }

  function handleRemoveStagedFile(event: CustomEvent<{ id: string }>): void {
    dispatch("removeStagedFile", event.detail);
  }

  function handleRemoveStagedImage(event: CustomEvent<{ url: string }>): void {
    dispatch("removeStagedImage", event.detail);
  }

  function handleAudioRecorded(
    event: CustomEvent<{ audioBlob: Blob; durationMs: number; mimeType: string }>
  ): void {
    dispatch("audioRecorded", event.detail);
  }

  function handleVideoRecorded(
    event: CustomEvent<{ videoUrl: string; mimeType: string; durationMs: number }>
  ): void {
    dispatch("videoRecorded", event.detail);
  }

  function handleVideoUploaded(
    event: CustomEvent<{ url: string; mimeType: string }>
  ): void {
    dispatch("videoUploaded", event.detail);
  }
</script>

<footer class="chat-footer" class:dark={forceDarkMode}>
  <div class="footer-container">
    <!-- Error display -->
    {#if error}
      <div class="error-banner">
        <div class="error-content">
          <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span class="error-text">{error}</span>
        </div>
        <button class="retry-btn" on:click={handleRetry}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Retry
        </button>
      </div>
    {/if}

    <!-- Suggestions - Desktop grid -->
    {#if visibleSuggestions.length > 0 && !isMobile}
      <div class="suggestions-grid">
        {#each visibleSuggestions as suggestion (suggestion.id || suggestion.content)}
          <SuggestionButton
            title={suggestion.title || suggestion.content}
            description={suggestion.description || ""}
            iconUrl={suggestion.iconUrl}
            content={suggestion.content}
            {primaryColor}
            variant="desktop"
            {forceDarkMode}
            disabled={disabled || responseGenerating}
            on:click={handleSuggestionClick}
          />
        {/each}
      </div>
    {/if}

    <!-- Typing indicators (multiplayer) -->
    <TypingIndicatorBar {typingNames} {forceDarkMode} />

    <!-- Input area with CTA badge -->
    <div class="input-area">
      {#if cta && cta.isActive}
        <CTABadge
          text={cta.text || ""}
          link={cta.link || ""}
          imgUrl={cta.imgUrl}
          {primaryColor}
        />
      {/if}

      <ChatInput
        placeholder={inputPlaceholder}
        disabled={disabled || multiplayerAiResponding}
        responseGenerating={responseGenerating || multiplayerAiResponding}
        {conversationFrozen}
        {primaryColor}
        {forceDarkMode}
        {showVoiceButton}
        {showVideoButton}
        {fileUploadEnabled}
        {imageUploadEnabled}
        {stagedFiles}
        {stagedImages}
        {hasMessages}
        {appNameId}
        on:send={handleSend}
        on:stop={handleStop}
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
    </div>

    <!-- Suggestions - Mobile pills -->
    {#if visibleSuggestions.length > 0 && isMobile}
      <div class="suggestions-mobile">
        {#each visibleSuggestions as suggestion (suggestion.id || suggestion.content)}
          <SuggestionButton
            title={suggestion.title || suggestion.content}
            content={suggestion.content}
            {primaryColor}
            variant="mobile"
            {forceDarkMode}
            disabled={disabled || responseGenerating}
            on:click={handleSuggestionClick}
          />
        {/each}
      </div>
    {/if}

    <!-- Footer text -->
    <div class="footer-text">
      {#if disclaimerText}
        <p class="disclaimer">{disclaimerText}</p>
      {/if}

      {#if showChippBadge}
        <a
          href="https://chipp.ai"
          target="_blank"
          rel="noopener noreferrer"
          class="chipp-badge"
        >
          <span>Created on</span>
          <svg class="chipp-logo" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span class="chipp-name">Chipp</span>
        </a>
      {/if}
    </div>
  </div>
</footer>

<style>
  .chat-footer {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 40;
    background: linear-gradient(to top, hsl(var(--background)) 80%, transparent);
    padding: var(--space-4);
    padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
  }

  .chat-footer.dark {
    background: linear-gradient(to top, #1a1a1a 80%, transparent);
  }

  .footer-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 800px;
    margin: 0 auto;
  }

  /* Error banner */
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    background-color: hsl(350 90% 95%);
    border: 1px solid hsl(350 90% 85%);
    border-radius: var(--radius-lg);
    animation: slide-up 0.3s ease;
  }

  .dark .error-banner {
    background-color: hsl(350 50% 20%);
    border-color: hsl(350 50% 30%);
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .error-icon {
    width: 18px;
    height: 18px;
    color: hsl(350 80% 45%);
    flex-shrink: 0;
  }

  .error-text {
    font-size: var(--text-sm);
    color: hsl(350 80% 35%);
    line-height: 1.4;
  }

  .dark .error-text {
    color: hsl(350 80% 75%);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    background-color: hsl(350 80% 45%);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.2s;
  }

  .retry-btn:hover {
    background-color: hsl(350 80% 40%);
  }

  .retry-btn svg {
    width: 14px;
    height: 14px;
  }

  /* Suggestions grid (desktop) */
  .suggestions-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  /* Suggestions pills (mobile) */
  .suggestions-mobile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Input area */
  .input-area {
    position: relative;
  }

  /* Footer text */
  .footer-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
  }

  .disclaimer {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    max-width: 400px;
    margin: 0;
  }

  .chipp-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    transition: color 0.2s;
  }

  .chipp-badge:hover {
    color: hsl(var(--foreground));
  }

  .chipp-logo {
    width: 14px;
    height: 14px;
  }

  .chipp-name {
    font-weight: var(--font-semibold);
  }

  @media (max-width: 640px) {
    .chat-footer {
      padding: var(--space-3);
    }

    .suggestions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
