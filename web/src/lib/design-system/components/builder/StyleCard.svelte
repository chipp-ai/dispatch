<script lang="ts">
  import BuilderCard from "./BuilderCard.svelte";
  import { Input, Select, SelectItem, toasts } from "$lib/design-system";
  import { getChatTheme, themeToCSS } from "$lib/design-system/themes/chatThemes";

  export let primaryColor: string = "#4F46E5";
  export let botMessageColor: string = "#F3F4F6";
  export let userMessageColor: string = "#4F46E5";
  export let logoUrl: string = "";
  export let applicationId: string = "";
  export let theme: string = "default";
  export let darkMode: string = "off";

  export let onPrimaryColorChange: (value: string) => void = () => {};
  export let onBotMessageColorChange: (value: string) => void = () => {};
  export let onUserMessageColorChange: (value: string) => void = () => {};
  export let onLogoChange: (url: string) => void = () => {};
  export let onThemeChange: (value: string) => void = () => {};
  export let onDarkModeChange: (value: string) => void = () => {};

  const themeOptions = [
    { value: "default", label: "Default" },
    { value: "imessage", label: "iMessage" },
    { value: "classic-chipp", label: "Classic Chipp" },
  ];

  const darkModeOptions = [
    { value: "off", label: "Off" },
    { value: "on", label: "On" },
    { value: "auto", label: "Auto" },
  ];

  function getThemeLabel(value: string): string {
    return themeOptions.find((o) => o.value === value)?.label || value;
  }

  function getDarkModeLabel(value: string): string {
    return darkModeOptions.find((o) => o.value === value)?.label || value;
  }

  let fileInput: HTMLInputElement;
  let isUploading = false;

  function handleColorInput(handler: (value: string) => void) {
    return (e: Event) => {
      const target = e.currentTarget as HTMLInputElement;
      if (target) handler(target.value);
    };
  }

  /**
   * Calculate whether text should be light or dark based on background color.
   * Uses relative luminance formula.
   */
  function getContrastTextColor(hexColor: string): string {
    // Remove # if present
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Use dark text on light backgrounds, light text on dark backgrounds
    return luminance > 0.5 ? "#1f2937" : "#ffffff";
  }

  // Get theme configuration and CSS
  $: themeConfig = getChatTheme(theme);
  $: themeCSS = themeToCSS(themeConfig);

  // Reactive text colors based on message backgrounds
  // For no-bubble themes (classic-chipp), text color is based on dark mode, not background
  $: userTextColor = themeConfig.bubbleStyle === "none"
    ? (darkMode === "on" ? "#e5e5ea" : "#1f2937")
    : getContrastTextColor(userMessageColor);
  // Bot text color depends on theme - transparent bg themes use foreground color
  $: botTextColor = themeConfig.assistantBubbleBackground === "transparent"
    ? (darkMode === "on" ? "#e5e5ea" : "#1f2937")
    : getContrastTextColor(botMessageColor);

  // Preview background based on dark mode setting
  $: previewBgColor = darkMode === "on" ? "#1f2937" : "#f9fafb";
  $: previewBorderColor = darkMode === "on" ? "#374151" : "#e5e7eb";
  $: previewTextColor = darkMode === "on" ? "#9ca3af" : "#6b7280";

  // Bot message background - use theme default or custom color
  // Default/modern themes have transparent assistant bubble
  $: effectiveBotBgColor = themeConfig.assistantBubbleBackground === "transparent"
    ? "transparent"
    : botMessageColor;

  function handleUploadClick() {
    if (isUploading) return;
    fileInput?.click();
  }

  async function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toasts.error("Please upload an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toasts.error("Image must be less than 2MB");
      return;
    }

    // Upload to server
    isUploading = true;
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/upload/logo?applicationId=${encodeURIComponent(applicationId)}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      const result = await response.json();
      const permanentUrl = result.data.url;

      // Update with permanent URL
      onLogoChange(permanentUrl);
      toasts.success("Logo uploaded!");
    } catch (error) {
      console.error("Error uploading logo:", error);
      toasts.error(
        error instanceof Error ? error.message : "Failed to upload logo"
      );
    } finally {
      isUploading = false;
      // Reset input so same file can be uploaded again
      target.value = "";
    }
  }
</script>

<BuilderCard title="Appearance" rightIcon="dropdown">
  <div class="form">
    <div class="field">
      <div class="label-row">
        <label>Logo</label>
        <span class="tooltip" title="Your app's logo displayed in the chat header">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <div class="logo-upload">
        <input
          type="file"
          accept="image/*"
          bind:this={fileInput}
          on:change={handleFileChange}
          class="hidden-input"
        />
        {#if logoUrl}
          <div class="logo-preview">
            <img src={logoUrl} alt="Logo preview" />
            <button
              type="button"
              class="remove-logo"
              on:click={() => onLogoChange("")}
              aria-label="Remove logo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="upload-placeholder"
            class:uploading={isUploading}
            on:click={handleUploadClick}
            disabled={isUploading}
          >
            {#if isUploading}
              <div class="spinner"></div>
              <span>Uploading...</span>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Upload Logo</span>
            {/if}
          </button>
        {/if}
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label>Theme</label>
        <span class="tooltip" title="Visual style for chat messages">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Select
        value={getThemeLabel(theme)}
        placeholder="Select theme"
        on:change={(e) => onThemeChange(e.detail.value)}
      >
        <svelte:fragment slot="default" let:handleSelect>
          {#each themeOptions as option}
            <SelectItem
              value={option.value}
              selected={theme === option.value}
              data-label={option.label}
              on:select={handleSelect}
            >
              {option.label}
            </SelectItem>
          {/each}
        </svelte:fragment>
      </Select>
    </div>

    <div class="field">
      <div class="label-row">
        <label>Dark Mode</label>
        <span class="tooltip" title="Enable dark theme for the chat interface">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Select
        value={getDarkModeLabel(darkMode)}
        placeholder="Select dark mode"
        on:change={(e) => onDarkModeChange(e.detail.value)}
      >
        <svelte:fragment slot="default" let:handleSelect>
          {#each darkModeOptions as option}
            <SelectItem
              value={option.value}
              selected={darkMode === option.value}
              data-label={option.label}
              on:select={handleSelect}
            >
              {option.label}
            </SelectItem>
          {/each}
        </svelte:fragment>
      </Select>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="primaryColor">Primary Color</label>
        <span class="tooltip" title="Main brand color used for buttons and accents">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <div class="color-input-row">
        <input
          type="color"
          value={primaryColor}
          on:input={handleColorInput(onPrimaryColorChange)}
          class="color-picker"
        />
        <Input
          value={primaryColor}
          placeholder="#4F46E5"
          on:input={(e) => {
            const target = e.currentTarget as HTMLInputElement;
            if (target && target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
              onPrimaryColorChange(target.value);
            }
          }}
        />
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="botMessageColor">Bot Message Background</label>
        <span class="tooltip" title="Background color for AI responses">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <div class="color-input-row">
        <input
          type="color"
          value={botMessageColor}
          on:input={handleColorInput(onBotMessageColorChange)}
          class="color-picker"
        />
        <Input
          value={botMessageColor}
          placeholder="#F3F4F6"
          on:input={(e) => {
            const target = e.currentTarget as HTMLInputElement;
            if (target && target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
              onBotMessageColorChange(target.value);
            }
          }}
        />
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="userMessageColor">User Message Background</label>
        <span class="tooltip" title="Background color for user messages">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <div class="color-input-row">
        <input
          type="color"
          value={userMessageColor}
          on:input={handleColorInput(onUserMessageColorChange)}
          class="color-picker"
        />
        <Input
          value={userMessageColor}
          placeholder="#4F46E5"
          on:input={(e) => {
            const target = e.currentTarget as HTMLInputElement;
            if (target && target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
              onUserMessageColorChange(target.value);
            }
          }}
        />
      </div>
    </div>

    <div
      class="color-preview"
      class:dark={darkMode === "on"}
      style="background-color: {previewBgColor}; border-color: {previewBorderColor}; --primary-color: {userMessageColor}"
    >
      <p class="preview-label" style="color: {previewTextColor}">
        PREVIEW {darkMode === "on" ? "(Dark Mode)" : darkMode === "auto" ? "(Auto)" : ""}
      </p>
      <div
        class="preview-messages"
        class:theme-default={theme === "default"}
        class:theme-imessage={theme === "imessage"}
        class:theme-classic={theme === "classic-chipp"}
      >
        <!-- User message first (conversation starts with user) -->
        <div
          class="message user"
          class:bubble-tail={themeConfig.showBubbleTail}
          class:user-left={themeConfig.userMessageAlignment === "left"}
          class:no-bubble={themeConfig.bubbleStyle === "none"}
          style="background-color: {userMessageColor}; color: {userTextColor}; border-radius: {themeConfig.bubbleBorderRadius}px"
        >
          {#if themeConfig.showUserAvatar}
            <div class="avatar user-avatar" style="background-color: {userMessageColor}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          {/if}
          <p>Hi there!</p>
        </div>
        <!-- Bot response -->
        <div
          class="message bot"
          class:bubble-tail={themeConfig.showBubbleTail}
          class:no-bubble={themeConfig.bubbleStyle === "none"}
          style="background-color: {effectiveBotBgColor}; color: {botTextColor}; border-radius: {themeConfig.bubbleBorderRadius}px"
        >
          {#if themeConfig.showAssistantAvatar}
            <div class="avatar bot-avatar">
              {#if logoUrl}
                <img src={logoUrl} alt="Bot" />
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <circle cx="8" cy="16" r="1" fill="currentColor" />
                  <circle cx="16" cy="16" r="1" fill="currentColor" />
                </svg>
              {/if}
            </div>
          {/if}
          <p>Hello! How can I help you today?</p>
        </div>
      </div>
    </div>
  </div>
</BuilderCard>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .tooltip {
    color: var(--text-tertiary);
    cursor: help;
    display: flex;
    align-items: center;
  }

  .tooltip:hover {
    color: var(--text-secondary);
  }

  .logo-upload {
    width: 100%;
  }

  .hidden-input {
    display: none;
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-6);
    border: 2px dashed var(--border-primary);
    border-radius: var(--radius-xl);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .upload-placeholder:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-alpha);
  }

  .upload-placeholder:disabled,
  .upload-placeholder.uploading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-placeholder:disabled:hover,
  .upload-placeholder.uploading:hover {
    border-color: var(--border-primary);
    color: var(--text-secondary);
    background: transparent;
  }

  .upload-placeholder span {
    font-size: var(--text-sm);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-primary);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .logo-preview {
    position: relative;
    display: inline-block;
  }

  .logo-preview img {
    max-width: 100px;
    max-height: 100px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-primary);
  }

  .remove-logo {
    position: absolute;
    top: -8px;
    right: -8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 50%;
    color: var(--text-secondary);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }

  .remove-logo:hover {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .color-input-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .color-picker {
    width: 40px;
    height: 40px;
    padding: 0;
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    background: none;
  }

  .color-picker::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker::-webkit-color-swatch {
    border-radius: var(--radius-md);
    border: none;
  }

  .color-preview {
    padding: var(--space-4);
    border-radius: var(--radius-xl);
    border: 1px solid;
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .preview-label {
    font-size: var(--text-xs);
    font-weight: 500;
    margin: 0 0 var(--space-3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-messages {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .message {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: 10px 18px;
    max-width: 85%;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .message p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  /* Default alignment: bot left, user right */
  .message.bot {
    align-self: flex-start;
  }

  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  /* User-left alignment (classic-chipp style) */
  .message.user.user-left {
    align-self: flex-start;
    flex-direction: row;
  }

  /* No-bubble style (classic-chipp) */
  .message.no-bubble {
    background: transparent !important;
    padding: 8px 0;
    border-radius: 0 !important;
    max-width: 100%;
  }

  .color-preview.dark .message.no-bubble {
    color: #e5e5ea !important;
  }

  /* Bubble tail (iMessage style) */
  .message.user.bubble-tail {
    border-bottom-right-radius: 4px !important;
    position: relative;
  }

  .message.user.bubble-tail::after {
    content: "";
    position: absolute;
    right: -6px;
    bottom: 0;
    width: 12px;
    height: 12px;
    background: inherit;
    border-bottom-left-radius: 16px;
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }

  .message.bot.bubble-tail {
    border-bottom-left-radius: 4px !important;
    position: relative;
  }

  .message.bot.bubble-tail::after {
    content: "";
    position: absolute;
    left: -6px;
    bottom: 0;
    width: 12px;
    height: 12px;
    background: inherit;
    border-bottom-right-radius: 16px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  /* Avatar styles */
  .avatar {
    width: 24px;
    height: 24px;
    min-width: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar svg {
    width: 14px;
    height: 14px;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar {
    color: white;
  }

  .bot-avatar {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border));
  }

  .color-preview.dark .bot-avatar {
    background: #2a2a2a;
    border-color: #374151;
  }

  /* Theme-specific message widths */
  .theme-default .message,
  .theme-classic .message {
    max-width: 100%;
  }

  .theme-imessage .message {
    max-width: 75%;
  }
</style>
