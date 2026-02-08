<script lang="ts">
  /**
   * ChatMessage
   *
   * Renders a single chat message with composable theme support.
   * Themes are configuration objects that control visual properties.
   *
   * Features:
   * - User messages (configurable alignment and styling)
   * - Assistant messages (configurable alignment and styling)
   * - Multi-part messages (text, tool invocations, images)
   * - Streaming cursor animation
   * - Bookmark and copy actions
   * - Composable theme system for extensibility
   * - RAG debug panel (builder mode only)
   */
  import { createEventDispatcher } from "svelte";
  import { captureException } from "$lib/sentry";
  import { StreamingMarkdown } from "$lib/design-system";
  import { ToolInvocationCard, RagDebugPanel, WebSourceBricks, GeneratedImageCard, VoiceMessageCard, VideoPlayer } from "$lib/design-system/components/chat";
  import type {
    ChatMessage as ChatMessageType,
    MessagePart,
    RagDebugInfo,
    AnimationConfig,
  } from "$lib/design-system/components/chat/types";
  import BookmarkButton from "./BookmarkButton.svelte";
  import {
    getChatTheme,
    themeToCSS,
    type ChatThemeConfig,
  } from "$lib/design-system/themes/chatThemes";

  export let message: ChatMessageType;
  export let isStreaming: boolean = false;
  export let isLast: boolean = false;
  export let primaryColor: string = "#4499ff";
  export let forceDarkMode: boolean = false;
  export let showBookmark: boolean = false;
  export let isBookmarked: boolean = false;
  /**
   * Chat theme - can be a theme name (string) or a full ChatThemeConfig object.
   * Built-in themes: 'imessage', 'classic-chipp', 'modern'
   * For custom themes, pass a ChatThemeConfig object directly.
   */
  export let theme: string | ChatThemeConfig = "imessage";
  /** App logo URL for avatar display */
  export let appLogoUrl: string = "";
  /** Whether this is in builder mode (shows debug info) */
  export let isBuilder: boolean = false;
  /** RAG debug info to display in builder mode */
  export let ragDebugInfo: RagDebugInfo | undefined = undefined;
  /** Animation configuration for streaming text */
  export let animationConfig: Partial<AnimationConfig> | undefined = undefined;
  /** Hide copy/bookmark action buttons (used in builder preview) */
  export let hideActions: boolean = false;
  /** Whether to show sender attribution (multiplayer mode) */
  export let showSenderAttribution: boolean = false;

  // Resolve theme config from name or use directly if already a config object
  $: themeConfig = typeof theme === "string" ? getChatTheme(theme) : theme;

  // Generate CSS variables from theme config
  $: themeCSS = themeToCSS(themeConfig);
  $: themeCSSString = Object.entries(themeCSS)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  // Computed theme properties for template
  $: showUserAvatar = themeConfig.showUserAvatar;
  $: showAssistantAvatar = themeConfig.showAssistantAvatar;
  $: showBubbleTail = themeConfig.showBubbleTail;
  $: bubbleStyle = themeConfig.bubbleStyle;

  const dispatch = createEventDispatcher<{
    bookmark: { messageId: string };
    copy: { content: string };
    retry: { messageId: string };
  }>();

  function handleRetry(): void {
    dispatch("retry", { messageId: message.id });
  }

  const WEB_TOOL_NAMES = new Set(["browseWeb", "retrieveUrl"]);

  $: isUser = message.role === "user";
  $: isAssistant = message.role === "assistant";
  $: isSystemMessage = message.isSystemMessage === true;
  $: showStreamingCursor = isStreaming && isLast && isAssistant;
  $: textContent = getTextContent(message);

  function getTextContent(msg: ChatMessageType): string {
    // Check parts first for assistant messages
    if (msg.parts && msg.parts.length > 0) {
      const textPart = msg.parts.find((p) => p.type === "text");
      if (textPart && textPart.type === "text") {
        return textPart.text;
      }
    }
    return msg.content || "";
  }

  function getToolParts(msg: ChatMessageType): MessagePart[] {
    if (!msg.parts) return [];
    return msg.parts.filter((p) => p.type === "tool-invocation");
  }

  function hasTextAfterIndex(parts: MessagePart[], index: number): boolean {
    for (let i = index + 1; i < parts.length; i++) {
      if (parts[i].type === "text") return true;
    }
    // Also check for pending streaming text (builder preview)
    if (message.pendingText && message.pendingText.trim()) {
      const hasTextPartAfter = parts.slice(index + 1).some((p) => p.type === "text");
      if (!hasTextPartAfter) return true;
    }
    return false;
  }

  function handleCopy(): void {
    navigator.clipboard.writeText(textContent).catch((err) => {
      captureException(err, {
        tags: { feature: "chat-message" },
        extra: { action: "copy-message" },
      });
    });
    dispatch("copy", { content: textContent });
  }

  function handleBookmark(): void {
    dispatch("bookmark", { messageId: message.id });
  }
</script>

{#if isSystemMessage}
  <!-- System message (join/leave) -->
  <div class="system-message" class:dark={forceDarkMode}>
    <span class="system-text">{message.content}</span>
  </div>
{:else}
<div
  class="message"
  class:user={isUser}
  class:assistant={isAssistant}
  class:dark={forceDarkMode}
  class:user-left={isUser && themeConfig.userMessageAlignment === "left"}
  class:bubble-tail={showBubbleTail}
  class:no-bubble={bubbleStyle === "none"}
  style="--primary-color: {primaryColor}; {themeCSSString}"
>
  <!-- Avatar: conditionally shown based on theme config -->
  {#if (isUser && showUserAvatar) || (isAssistant && showAssistantAvatar)}
    <div
      class="avatar"
      class:user-avatar={isUser}
      class:assistant-avatar={isAssistant}
      class:has-border={themeConfig.avatarBorder}
    >
      {#if isAssistant && message.operatorName}
        <!-- Human operator avatar -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      {:else if isAssistant}
        <!-- Assistant avatar: always show app logo or default app image -->
        <img
          src={appLogoUrl || "/assets/default-app-image.png"}
          alt="Assistant"
          class="avatar-img"
        />
      {:else if isUser}
        <!-- User avatar: show user icon -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      {/if}
    </div>
  {/if}

  <div class="message-body">
    <!-- Sender attribution (multiplayer) -->
    {#if showSenderAttribution && isUser && message.senderName}
      <div class="sender-attribution">
        <span class="sender-dot" style="background-color: {message.senderAvatarColor || 'hsl(var(--muted-foreground))'}"></span>
        <span class="sender-name">{message.senderName}</span>
      </div>
    {/if}
    <!-- Operator attribution (human takeover) -->
    {#if isAssistant && message.operatorName}
      <div class="operator-attribution">
        <span class="operator-name">{message.operatorName}</span>
      </div>
    {/if}

    {#if isUser}
      <!-- User message images -->
      {#if message.images && message.images.length > 0}
        <div class="message-images">
          {#each message.images as imageUrl}
            <img src={imageUrl} alt="Attached" class="message-image" />
          {/each}
        </div>
      {/if}
      <!-- User message -->
      {#if message.videoUrl}
        <div class="message-content user-bubble video-bubble">
          <VideoPlayer videoUrl={message.videoUrl} />
        </div>
      {:else if message.audioUrl}
        <div class="message-content user-bubble voice-bubble">
          <VoiceMessageCard
            audioUrl={message.audioUrl}
            durationMs={message.audioDurationMs || 0}
            {primaryColor}
          />
        </div>
      {:else}
        <div class="message-content user-bubble">
          {message.content}
        </div>
      {/if}
    {:else if isAssistant}
      <!-- Assistant message with parts -->
      <div class="message-wrapper">
        <!-- Error state with retry button -->
        {#if message.error}
          <div class="error-card">
            <div class="error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div class="error-content">
              <p class="error-message">{message.errorMessage || "Something went wrong"}</p>
              <button class="retry-button" on:click={handleRetry}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23,4 23,10 17,10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Retry
              </button>
            </div>
          </div>
        {:else}
        {#each message.parts || [] as part, partIdx}
          {#if part.type === "text" && part.text}
            <div class="message-content assistant-bubble">
              <StreamingMarkdown content={part.text} streaming={showStreamingCursor} {animationConfig} />
            </div>
          {:else if part.type === "tool-invocation" && WEB_TOOL_NAMES.has(part.toolInvocation.name)}
            <div class="tool-card">
              <WebSourceBricks
                toolName={part.toolInvocation.name}
                state={part.toolInvocation.state}
                input={part.toolInvocation.input}
                output={part.toolInvocation.output}
                error={part.toolInvocation.error || null}
                collapsed={hasTextAfterIndex(message.parts || [], partIdx) || (part.toolInvocation.state === "result" && isStreaming)}
              />
            </div>
          {:else if part.type === "tool-invocation" && part.toolInvocation.name === "generateImage"}
            <div class="tool-card">
              <GeneratedImageCard
                state={part.toolInvocation.state}
                input={part.toolInvocation.input}
                output={part.toolInvocation.output}
                error={part.toolInvocation.error || null}
              />
            </div>
          {:else if part.type === "tool-invocation"}
            <div class="tool-card">
              <ToolInvocationCard
                toolName={part.toolInvocation.name}
                toolCallId={part.toolInvocation.id}
                state={part.toolInvocation.state}
                input={part.toolInvocation.input}
                output={part.toolInvocation.output}
                error={part.toolInvocation.error || null}
              />
            </div>
          {/if}
        {/each}

        <!-- Pending text: streaming text not yet finalized into a part -->
        {#if isStreaming && isLast && message.pendingText}
          <div class="message-content assistant-bubble">
            <StreamingMarkdown content={message.pendingText} streaming={true} {animationConfig} />
          </div>
        {/if}

        <!-- Fallback: If no parts but has content -->
        {#if (!message.parts || message.parts.length === 0) && !message.pendingText && message.content}
          <div class="message-content assistant-bubble">
            <StreamingMarkdown content={message.content} streaming={showStreamingCursor} {animationConfig} />
          </div>
        {/if}
        {/if}

        <!-- Loading indicator: Show while streaming (at bottom of message while generating) -->
        {#if showStreamingCursor}
          <div class="pulse-indicator" class:inline={textContent || message.pendingText || (message.parts && message.parts.length > 0)}>
            <span class="ripple"></span>
            <span class="ripple ripple-delayed"></span>
            <span class="core"></span>
          </div>
        {/if}

        <!-- Message actions (only for completed assistant messages) -->
        {#if !hideActions && !isStreaming && textContent}
          <div class="message-actions">
            <button
              class="action-btn"
              on:click={handleCopy}
              title="Copy message"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>

            {#if showBookmark}
              <BookmarkButton
                messageId={message.id}
                {isBookmarked}
                on:click={handleBookmark}
              />
            {/if}
          </div>
        {/if}

        <!-- RAG Debug Panel (builder mode only) -->
        {#if isBuilder && ragDebugInfo && !isStreaming}
          <div class="rag-debug-wrapper">
            <RagDebugPanel debugInfo={ragDebugInfo} {forceDarkMode} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  /* ============================================
   * COMPOSABLE CHAT THEME SYSTEM
   *
   * Uses CSS custom properties from theme config:
   * --chat-avatar-size, --chat-avatar-border-radius,
   * --chat-avatar-margin-top, --chat-max-width,
   * --chat-message-gap, --chat-bubble-radius,
   * --chat-flattened-corner, --chat-bubble-padding,
   * --chat-user-bubble-bg, --chat-user-bubble-color,
   * --chat-assistant-bubble-bg, --chat-assistant-bubble-color,
   * --chat-dark-assistant-bubble-bg, --chat-dark-assistant-bubble-color
   * ============================================ */

  /* === BASE MESSAGE STYLES === */
  .message {
    display: flex;
    gap: var(--chat-message-gap, 8px);
    max-width: var(--chat-max-width, 85%);
    padding: 0 var(--space-2, 8px);
  }

  /* Default: user messages right-aligned */
  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  /* Override: user messages left-aligned (classic-chipp style) */
  .message.user.user-left {
    align-self: flex-start;
    flex-direction: row;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .message-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .message-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  /* === BUBBLE STYLES === */
  .message-content {
    padding: var(--chat-bubble-padding, 12px 16px);
    border-radius: var(--chat-bubble-radius, 18px);
    word-break: break-word;
    line-height: 1.5;
  }

  .user-bubble {
    background: var(
      --chat-user-bubble-bg,
      var(--primary-color, hsl(var(--primary)))
    );
    color: var(--chat-user-bubble-color, white);
  }

  .voice-bubble {
    padding: 4px;
  }

  .assistant-bubble {
    background: var(--chat-assistant-bubble-bg, hsl(var(--muted)));
    color: var(--chat-assistant-bubble-color, hsl(var(--foreground)));
  }

  /* No-bubble style (classic-chipp) */
  .no-bubble .user-bubble,
  .no-bubble .assistant-bubble {
    background: transparent !important;
    color: hsl(var(--foreground)) !important;
    padding: var(--space-2, 8px) 0;
    border-radius: 0;
  }

  .no-bubble .message-body {
    width: 100%;
  }

  .dark .assistant-bubble {
    background: var(--chat-dark-assistant-bubble-bg, #2a2a2a);
    color: var(--chat-dark-assistant-bubble-color, #f0f0f0);
  }

  .dark.no-bubble .user-bubble,
  .dark.no-bubble .assistant-bubble {
    color: #e5e5ea !important;
  }

  .tool-card {
    max-width: 100%;
    padding-left: var(--chat-bubble-padding-x, 16px);
  }

  /* === AVATAR STYLES === */
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--chat-avatar-size, 28px);
    height: var(--chat-avatar-size, 28px);
    min-width: var(--chat-avatar-size, 28px);
    border-radius: var(--chat-avatar-border-radius, 50%);
    overflow: hidden;
    flex-shrink: 0;
    margin-top: var(--chat-avatar-margin-top, 2px);
  }

  .avatar.has-border {
    border: 1px solid hsl(var(--border));
  }

  .avatar svg {
    width: calc(var(--chat-avatar-size, 28px) * 0.57);
    height: calc(var(--chat-avatar-size, 28px) * 0.57);
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar {
    background: var(--primary-color, hsl(var(--primary)));
    color: white;
  }

  .assistant-avatar {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .dark .assistant-avatar {
    background: #2a2a2a;
  }

  /* === BUBBLE TAIL (iMessage style) === */
  .bubble-tail.user .user-bubble {
    position: relative;
    border-bottom-right-radius: 4px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .bubble-tail.user .user-bubble::after {
    content: "";
    position: absolute;
    right: -6px;
    bottom: 0;
    width: 12px;
    height: 12px;
    background: var(
      --chat-user-bubble-bg,
      var(--primary-color, hsl(var(--primary)))
    );
    border-bottom-left-radius: 16px;
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }

  .bubble-tail.assistant .assistant-bubble {
    position: relative;
    border-bottom-left-radius: 4px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .bubble-tail.assistant .assistant-bubble::after {
    content: "";
    position: absolute;
    left: -6px;
    bottom: 0;
    width: 12px;
    height: 12px;
    background: var(--chat-assistant-bubble-bg, hsl(var(--muted)));
    border-bottom-right-radius: 16px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .dark.bubble-tail.assistant .assistant-bubble {
    background: radial-gradient(
      ellipse 150% 100% at center 15%,
      #3a3a3a66 35%,
      #2a2a2a
    );
    background-color: #2a2a2a;
  }

  .dark.bubble-tail.assistant .assistant-bubble::after {
    background: #2a2a2a;
  }

  /* === FLATTENED CORNERS (Modern theme style) === */
  .message.user:not(.bubble-tail):not(.no-bubble) .user-bubble {
    border-top-right-radius: var(--chat-flattened-corner, 18px);
  }

  .message.assistant:not(.bubble-tail):not(.no-bubble) .assistant-bubble {
    border-top-left-radius: var(--chat-flattened-corner, 18px);
  }

  /* === MESSAGE ACTIONS === */
  .message-actions {
    display: flex;
    gap: var(--space-1, 4px);
    opacity: 0;
    transition: opacity 0.2s ease;
    padding-top: var(--space-1, 4px);
  }

  .message:hover .message-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
    transition: all 0.2s;
  }

  .action-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .action-btn svg {
    width: 14px;
    height: 14px;
  }

  /* === PULSE INDICATOR (AI generating) === */
  .pulse-indicator {
    position: relative;
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8px 4px;
    padding-left: var(--chat-bubble-padding-x, 16px);
  }

  /* Inline variant: smaller and at the end of content */
  .pulse-indicator.inline {
    width: 10px;
    height: 10px;
    margin: 4px 0 0 4px;
  }

  .pulse-indicator .core {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--primary-color, hsl(var(--primary)));
    border-radius: 50%;
    animation: pulse-core 1.5s ease-in-out infinite;
    box-shadow: 0 0 8px
      color-mix(
        in srgb,
        var(--primary-color, hsl(var(--primary))) 40%,
        transparent
      );
  }

  .pulse-indicator.inline .core {
    width: 8px;
    height: 8px;
  }

  .pulse-indicator .ripple {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary-color, hsl(var(--primary)));
    animation: pulse-ripple 1.5s ease-out infinite;
  }

  .pulse-indicator.inline .ripple {
    width: 8px;
    height: 8px;
  }

  .pulse-indicator .ripple-delayed {
    animation-delay: 0.75s;
  }

  @keyframes pulse-core {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(0.85);
      opacity: 0.8;
    }
  }

  @keyframes pulse-ripple {
    0% {
      transform: scale(1);
      opacity: 0.4;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  /* === MESSAGE IMAGES === */
  .message-images {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
    margin-bottom: var(--space-2, 8px);
  }

  .message-image {
    max-width: 200px;
    max-height: 200px;
    border-radius: var(--radius-lg, 12px);
    object-fit: cover;
  }

  /* === ERROR CARD === */
  .error-card {
    display: flex;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.2);
    border-radius: var(--radius-lg, 12px);
    align-items: flex-start;
  }

  .error-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    color: hsl(var(--destructive));
  }

  .error-icon svg {
    width: 100%;
    height: 100%;
  }

  .error-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
  }

  .error-message {
    margin: 0;
    font-size: var(--text-sm, 14px);
    color: hsl(var(--foreground));
    line-height: 1.5;
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md, 8px);
    font-size: var(--text-sm, 14px);
    font-weight: 500;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.2s ease;
    width: fit-content;
  }

  .retry-button:hover {
    background: hsl(var(--muted));
    border-color: hsl(var(--border));
  }

  .retry-button svg {
    width: 14px;
    height: 14px;
  }

  /* === RAG DEBUG PANEL === */
  .rag-debug-wrapper {
    margin-top: var(--space-3, 12px);
    width: 100%;
  }

  /* === SYSTEM MESSAGES (join/leave) === */
  .system-message {
    display: flex;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    align-self: center;
    max-width: 100%;
  }

  .system-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .dark .system-text {
    color: rgba(255, 255, 255, 0.4);
  }

  /* === SENDER ATTRIBUTION (multiplayer) === */
  .sender-attribution {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-bottom: 3px;
  }

  .message.user .sender-attribution {
    justify-content: flex-end;
  }

  .message.user.user-left .sender-attribution {
    justify-content: flex-start;
  }

  .sender-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sender-name {
    font-size: 11px;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .dark .sender-name {
    color: rgba(255, 255, 255, 0.5);
  }

  /* === OPERATOR ATTRIBUTION (human takeover) === */
  .operator-attribution {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-bottom: 3px;
  }

  .operator-name {
    font-size: 11px;
    font-weight: 600;
    color: hsl(25, 95%, 45%);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .dark .operator-name {
    color: hsl(25, 95%, 65%);
  }

  /* === MOBILE ADJUSTMENTS === */
  @media (max-width: 640px) {
    .message {
      max-width: 90%;
    }

    .bubble-tail {
      max-width: 85%;
    }

    .bubble-tail.assistant {
      max-width: 90%;
    }

    .message-content {
      padding: var(--space-2, 8px) var(--space-3, 12px);
    }

    .message-actions {
      opacity: 1;
    }
  }
</style>
