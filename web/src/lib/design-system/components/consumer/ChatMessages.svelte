<script lang="ts">
  /**
   * ChatMessages
   *
   * Container for chat messages with:
   * - Auto-scroll to bottom on new messages
   * - Empty state with app welcome
   * - Message rendering with ChatMessage component
   * - Support for bookmarks
   * - Composable theme system
   */
  import { onMount, tick } from "svelte";
  import { createEventDispatcher } from "svelte";
  import type { ChatMessage as ChatMessageType, AnimationConfig } from "$lib/design-system/components/chat/types";
  import type { ChatThemeConfig } from "$lib/design-system/themes/chatThemes";
  import ChatMessage from "../chat/ChatMessage.svelte";
  import AppWelcome from "./AppWelcome.svelte";

  export let messages: ChatMessageType[] = [];
  export let isStreaming: boolean = false;
  export let primaryColor: string = "#4499ff";
  export let forceDarkMode: boolean = false;
  export let appName: string = "Chat";
  export let appLogoUrl: string | null = null;
  export let appDescription: string | null = null;
  export let showBookmarks: boolean = false;
  export let bookmarkedMessageIds: Set<string> = new Set();
  export let headerHeight: number = 64;
  /**
   * Chat theme - can be a theme name (string) or a full ChatThemeConfig object.
   * Built-in themes: 'imessage', 'classic-chipp', 'modern'
   */
  export let theme: string | ChatThemeConfig = "imessage";

  /** Animation configuration for streaming text */
  export let animationConfig: Partial<AnimationConfig> | undefined = undefined;
  /** Whether to show sender attribution (multiplayer) */
  export let showSenderAttribution: boolean = false;

  let messagesContainer: HTMLDivElement;
  let previousMessageCount = 0;

  const dispatch = createEventDispatcher<{
    bookmark: { messageId: string };
    copyMessage: { content: string };
    retry: { messageId: string };
  }>();

  // Scroll to bottom - exported so parent can call it
  export async function scrollToBottom(behavior: ScrollBehavior = "smooth"): Promise<void> {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior,
      });
    }
  }

  // Initial scroll on mount
  onMount(() => {
    previousMessageCount = messages.length;
    scrollToBottom("instant");
  });

  // When a new message is added (user sent or assistant reply created),
  // update the message count tracker. The parent component handles
  // scrolling explicitly via scrollToBottom() on user send.
  $: if (messages.length !== previousMessageCount) {
    previousMessageCount = messages.length;
  }

  function handleBookmark(event: CustomEvent<{ messageId: string }>): void {
    dispatch("bookmark", event.detail);
  }

  function handleCopy(event: CustomEvent<{ content: string }>): void {
    dispatch("copyMessage", event.detail);
  }

  function handleRetry(event: CustomEvent<{ messageId: string }>): void {
    dispatch("retry", event.detail);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="messages-container"
  class:dark={forceDarkMode}
  style="--header-height: {headerHeight}px"
  bind:this={messagesContainer}
>
  {#if messages.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <AppWelcome
        {appName}
        logoUrl={appLogoUrl}
        description={appDescription}
        {primaryColor}
      />
    </div>
  {:else}
    <!-- Messages list -->
    <div class="messages-list">
      {#each messages as message, index (message.id)}
        {#if message.role === "system"}
          <!-- System message (takeover enter/leave, join/leave) -->
          <div class="system-message">
            <span>{@html message.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</span>
          </div>
        {:else}
          <ChatMessage
            {message}
            {isStreaming}
            isLast={index === messages.length - 1}
            {primaryColor}
            {forceDarkMode}
            {theme}
            appLogoUrl={appLogoUrl || ""}
            showBookmark={showBookmarks && message.role === "assistant"}
            isBookmarked={bookmarkedMessageIds.has(message.id)}
            {animationConfig}
            {showSenderAttribution}
            on:bookmark={handleBookmark}
            on:copy={handleCopy}
            on:retry={handleRetry}
          />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .messages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--space-4);
    padding-top: calc(var(--header-height) + var(--space-4));
    scroll-behavior: smooth;
    overscroll-behavior: contain;
  }

  .dark {
    background-color: #1a1a1a;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 800px;
    margin: 0 auto;
    /* Significant bottom padding so new messages appear higher in viewport */
    padding-bottom: 50vh;
    min-height: 100%;
  }

  .system-message {
    display: flex;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
  }

  .system-message span {
    font-size: 13px;
    color: var(--text-tertiary, #888);
    background: var(--bg-tertiary, hsl(0 0% 95%));
    padding: 4px 14px;
    border-radius: var(--radius-full, 999px);
    text-align: center;
    line-height: 1.4;
  }

  .system-message :global(strong) {
    font-weight: 600;
    color: var(--text-secondary, #555);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - var(--header-height) - 200px);
    padding: var(--space-8);
  }

  @media (max-width: 640px) {
    .messages-container {
      padding: var(--space-3);
      padding-top: calc(var(--header-height) + var(--space-3));
    }

    .messages-list {
      gap: var(--space-3);
    }
  }
</style>
