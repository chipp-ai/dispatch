<script lang="ts">
  /**
   * ChatInput
   *
   * Rich chat input component with:
   * - Auto-expanding textarea
   * - File/image/video upload support
   * - Staged file preview cards
   * - Voice call button (if enabled)
   * - Send/stop button with states
   * - Enter to send, Shift+Enter for newline
   * - Frozen conversation state
   */
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { StagedFile } from "./types";
  import FileUploader from "./FileUploader.svelte";
  import ImageUploader from "./ImageUploader.svelte";
  import VideoUploader from "./VideoUploader.svelte";
  import AudioRecordButton from "./AudioRecordButton.svelte";
  import VideoRecordButton from "./VideoRecordButton.svelte";

  export let placeholder: string = "Type your message...";
  export let disabled: boolean = false;
  export let responseGenerating: boolean = false;
  export let conversationFrozen: boolean = false;
  export let primaryColor: string = "#4499ff";
  export let forceDarkMode: boolean = false;
  export let showVoiceButton: boolean = false;
  export let fileUploadEnabled: boolean = false;
  export let imageUploadEnabled: boolean = false;
  export let showVideoButton: boolean = false;
  export let appNameId: string = "";
  export let stagedFiles: StagedFile[] = [];
  export let stagedImages: string[] = [];
  export let hasMessages: boolean = false;
  export let autoFocus: boolean = true;

  let textareaElement: HTMLTextAreaElement;
  let inputValue: string = "";
  let isUploading: boolean = false;
  let audioRecordRef: AudioRecordButton;
  let audioSupported = false;
  let audioState: "idle" | "recording" | "processing" = "idle";
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let isHoldRecording = false;
  let isTouchDevice = false;

  const dispatch = createEventDispatcher<{
    send: { message: string };
    stop: void;
    voiceClick: void;
    audioRecorded: { audioBlob: Blob; durationMs: number; mimeType: string };
    videoRecorded: { videoUrl: string; mimeType: string; durationMs: number };
    videoUploaded: { url: string; mimeType: string };
    fileUploadStart: { file: File };
    fileUploaded: { file: StagedFile };
    imageUploadStart: void;
    imageUploaded: { url: string };
    removeStagedFile: { id: string };
    removeStagedImage: { url: string };
  }>();

  $: canSend =
    !disabled &&
    !conversationFrozen &&
    !isUploading &&
    (inputValue.trim().length > 0 ||
      stagedFiles.length > 0 ||
      stagedImages.length > 0);

  $: showAttachmentMenu = fileUploadEnabled || imageUploadEnabled || showVideoButton;
  $: showShortcutHint = !hasMessages && !inputValue.trim() && audioSupported && audioState === "idle" && !disabled && !conversationFrozen && !responseGenerating;

  // Auto-resize textarea
  function resizeTextarea(): void {
    if (textareaElement) {
      textareaElement.style.height = "auto";
      textareaElement.style.height = `${Math.min(textareaElement.scrollHeight, 200)}px`;
    }
  }

  function handleInput(): void {
    resizeTextarea();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (responseGenerating) {
        handleStop();
      } else if (canSend) {
        handleSend();
      }
    }
  }

  // Hold-to-talk: window-level so it works regardless of focus
  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== " ") return;

    // Suppress repeated space while hold-to-talk is active
    if (holdTimer || isHoldRecording) {
      event.preventDefault();
      return;
    }

    // Don't intercept if typing in another input element
    const active = document.activeElement;
    const isOtherInput =
      active &&
      active !== textareaElement &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        (active as HTMLElement).isContentEditable);
    if (isOtherInput) return;

    // Don't intercept if textarea has text
    if (inputValue.trim()) return;

    if (
      !event.repeat &&
      !responseGenerating &&
      !conversationFrozen &&
      !disabled &&
      audioSupported &&
      audioState === "idle" &&
      !holdTimer &&
      !isHoldRecording
    ) {
      event.preventDefault();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        isHoldRecording = true;
        audioRecordRef.startRecording();
      }, 300);
    }
  }

  function handleWindowKeyup(event: KeyboardEvent): void {
    if (event.key !== " ") return;

    if (holdTimer) {
      // Released before 300ms threshold - type a space only if textarea is focused
      clearTimeout(holdTimer);
      holdTimer = null;
      if (document.activeElement === textareaElement) {
        inputValue += " ";
      }
    } else if (isHoldRecording) {
      // Released after recording started - stop and send
      isHoldRecording = false;
      audioRecordRef?.stopRecording();
    }
  }

  function handleSend(): void {
    if (!canSend) return;

    dispatch("send", { message: inputValue });
    inputValue = "";

    // Reset textarea height
    if (textareaElement) {
      textareaElement.style.height = "auto";
    }
  }

  function handleStop(): void {
    dispatch("stop");
  }

  function handleVoiceClick(): void {
    dispatch("voiceClick");
  }

  function handleFileUploadStart(event: CustomEvent<{ file: File }>): void {
    isUploading = true;
    dispatch("fileUploadStart", event.detail);
  }

  function handleFileUploaded(event: CustomEvent<{ file: StagedFile }>): void {
    isUploading = false;
    dispatch("fileUploaded", event.detail);
  }

  function handleImageUploadStart(): void {
    isUploading = true;
    dispatch("imageUploadStart");
  }

  function handleImageUploaded(event: CustomEvent<{ url: string }>): void {
    isUploading = false;
    dispatch("imageUploaded", event.detail);
  }

  function handleRemoveFile(fileId: string): void {
    dispatch("removeStagedFile", { id: fileId });
  }

  function handleRemoveImage(url: string): void {
    dispatch("removeStagedImage", { url });
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

  export function focus(): void {
    textareaElement?.focus();
  }

  onMount(() => {
    isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (autoFocus) {
      textareaElement?.focus();
    }
    window.addEventListener("keydown", handleWindowKeydown);
    window.addEventListener("keyup", handleWindowKeyup);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleWindowKeydown);
    window.removeEventListener("keyup", handleWindowKeyup);
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  });
</script>

<div class="chat-input-container" class:dark={forceDarkMode}>
  {#if conversationFrozen}
    <div class="frozen-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      <span>This conversation has been frozen for safety reasons.</span>
    </div>
  {/if}

  <!-- Staged files preview -->
  {#if stagedFiles.length > 0 || stagedImages.length > 0 || isUploading}
    <div class="staged-items">
      {#each stagedFiles as file (file.id)}
        <div class="staged-file" class:uploading={file.isUploading} class:error={file.hasError}>
          <div class="file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <span class="file-name">{file.rawFileDetails.name}</span>
          {#if file.isUploading}
            <div class="upload-spinner"></div>
          {:else}
            <button
              class="remove-btn"
              on:click={() => handleRemoveFile(file.id)}
              aria-label="Remove file"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          {/if}
        </div>
      {/each}

      {#each stagedImages as imageUrl (imageUrl)}
        <div class="staged-image">
          <img src={imageUrl} alt="Staged upload" />
          <button
            class="remove-btn"
            on:click={() => handleRemoveImage(imageUrl)}
            aria-label="Remove image"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      {/each}

      {#if isUploading}
        <div class="staged-image uploading">
          <div class="upload-spinner"></div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="input-row" style="--primary-color: {primaryColor}">
    <!-- Textarea -->
    <textarea
      bind:this={textareaElement}
      bind:value={inputValue}
      on:input={handleInput}
      on:keydown={handleKeydown}
      {placeholder}
      disabled={disabled || conversationFrozen}
      rows="1"
      class="chat-textarea"
    ></textarea>

    <!-- Action buttons (all on the right) -->
    <div class="action-buttons">
      <!-- Attachment menu -->
      {#if showAttachmentMenu && !conversationFrozen}
        <div class="attachment-menu">
          <button class="icon-btn" aria-label="Add attachment" disabled={disabled}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <div class="attachment-dropdown">
            {#if fileUploadEnabled}
              <FileUploader
                {disabled}
                on:uploadStart={handleFileUploadStart}
                on:uploaded={handleFileUploaded}
              />
            {/if}
            {#if imageUploadEnabled}
              <ImageUploader
                {disabled}
                {appNameId}
                on:uploadStart={handleImageUploadStart}
                on:uploaded={handleImageUploaded}
              />
            {/if}
            {#if showVideoButton}
              <VideoUploader
                {disabled}
                {appNameId}
                on:uploadStart={handleImageUploadStart}
                on:uploaded={handleVideoUploaded}
              />
            {/if}
          </div>
        </div>
      {/if}

      {#if !conversationFrozen && !disabled && !responseGenerating}
        <AudioRecordButton
          bind:this={audioRecordRef}
          bind:supported={audioSupported}
          bind:state={audioState}
          {disabled}
          {primaryColor}
          on:audioRecorded={handleAudioRecorded}
        />
        {#if showVideoButton}
          <VideoRecordButton
            {disabled}
            {primaryColor}
            {appNameId}
            on:videoRecorded={handleVideoRecorded}
          />
        {/if}
      {/if}

      {#if showVoiceButton && !conversationFrozen}
        <button
          class="icon-btn voice-btn"
          on:click={handleVoiceClick}
          disabled={disabled}
          aria-label="Start voice conversation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      {/if}

      <button
        class="send-btn"
        class:stop={responseGenerating}
        on:click={responseGenerating ? handleStop : handleSend}
        disabled={!responseGenerating && !canSend}
        aria-label={responseGenerating ? "Stop response" : "Send message"}
      >
        {#if responseGenerating}
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        {/if}
      </button>
    </div>
  </div>
</div>

{#if showShortcutHint}
  <div class="shortcut-hint" class:dark={forceDarkMode}>
    {#if isTouchDevice}
      Hold mic to record
    {:else}
      Hold <kbd>Space</kbd> to record
    {/if}
  </div>
{/if}

<style>
  .chat-input-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background-color: hsl(var(--background) / 0.8);
    backdrop-filter: blur(8px);
    border-radius: var(--radius-2xl);
    border: 2px solid hsl(var(--border) / 0.5);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .chat-input-container:focus-within {
    border-color: var(--primary-color, hsl(var(--primary)));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color, hsl(var(--primary))) 20%, transparent);
  }

  .chat-input-container.dark {
    background-color: rgba(42, 42, 42, 0.9);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .frozen-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background-color: hsl(350 90% 95%);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: hsl(350 80% 40%);
  }

  .frozen-banner svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .staged-items {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding: var(--space-1);
  }

  .staged-file {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background-color: hsl(var(--muted));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .staged-file.uploading {
    opacity: 0.7;
  }

  .staged-file.error {
    background-color: hsl(350 90% 95%);
    color: hsl(350 80% 40%);
  }

  .dark .staged-file {
    background-color: #3a3a3a;
  }

  .file-icon svg {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
  }

  .file-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .staged-image {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: hsl(var(--muted));
  }

  .staged-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .staged-image.uploading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .upload-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid hsl(var(--border));
    border-top-color: var(--primary-color, hsl(var(--primary)));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background-color: hsl(var(--foreground) / 0.1);
    border-radius: 50%;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .staged-image .remove-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
  }

  .remove-btn:hover {
    background-color: hsl(var(--destructive) / 0.2);
  }

  .remove-btn svg {
    width: 12px;
    height: 12px;
  }

  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: 0 var(--space-1);
  }

  .attachment-menu {
    position: relative;
    flex-shrink: 0;
  }

  .attachment-dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    display: none;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 10;
  }

  .attachment-menu:focus-within .attachment-dropdown {
    display: flex;
  }

  .chat-textarea {
    flex: 1;
    min-height: 44px;
    max-height: 200px;
    padding: var(--space-3);
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-family: inherit;
    font-size: var(--text-base);
    line-height: 1.5;
    color: hsl(var(--foreground));
  }

  .chat-textarea::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .chat-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dark .chat-textarea {
    color: #f0f0f0;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    padding-bottom: var(--space-1);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-btn:hover:not(:disabled) {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon-btn svg {
    width: 20px;
    height: 20px;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background-color: var(--primary-color, hsl(var(--primary)));
    color: white;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: scale(1.05);
  }

  .send-btn:disabled {
    opacity: 0.1;
    cursor: not-allowed;
    transform: none;
  }

  .send-btn.stop {
    background-color: var(--primary-color, hsl(var(--primary)));
  }

  .send-btn svg {
    width: 18px;
    height: 18px;
  }

  .shortcut-hint {
    text-align: right;
    padding: 4px 6px 0;
    font-size: 11px;
    color: hsl(var(--muted-foreground));
    opacity: 0.5;
    pointer-events: none;
    line-height: 1;
  }

  .shortcut-hint.dark {
    color: rgba(255, 255, 255, 0.4);
  }

  .shortcut-hint kbd {
    font-family: inherit;
    font-size: 10px;
    padding: 1px 4px;
    border: 1px solid hsl(var(--border));
    border-radius: 3px;
    background: hsl(var(--muted));
  }

  .shortcut-hint.dark kbd {
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 640px) {
    .chat-input-container {
      border-radius: var(--radius-xl);
    }

    .chat-textarea {
      min-height: 40px;
      padding: var(--space-2);
      font-size: 16px; /* Prevent iOS zoom */
    }
  }
</style>
