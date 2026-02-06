<script lang="ts">
  /**
   * ChatTranscript Component
   *
   * Displays the full message transcript for a selected chat session.
   * Includes header with session metadata, message grouping, and markdown rendering.
   */
  import { afterUpdate, tick } from "svelte";
  import { Globe, Code, Phone, Mail, Clock, User, ArrowLeft, Send, Headset } from "lucide-svelte";
  import Markdown from "../Markdown.svelte";

  interface SlackUser {
    email?: string;
    realName?: string;
    displayName?: string;
    avatar?: string;
  }

  interface Message {
    id: string;
    content: string;
    senderType: string;
    createdAt: string;
    files?: { name: string; type: string }[];
    tags?: { id: string; name: string; instanceId?: string }[];
    isBuilderMessage?: boolean;
  }

  interface ChatUser {
    id: string;
    name: string | null;
    email: string | null;
    identifier: string | null;
    pictureUrl?: string | null;
  }

  export let session: {
    id: string;
    title: string | null;
    source: string;
    createdAt: string;
    messages: Message[];
    user: ChatUser | null;
    slackUser?: SlackUser;
  } | null = null;

  export let onBack: (() => void) | null = null;
  export let isLiveTakeover: boolean = false;
  export let onSendMessage: ((content: string) => void) | null = null;
  export let onRelease: (() => void) | null = null;

  let takeoverInput = "";
  let messagesEl: HTMLDivElement;

  // Auto-scroll to bottom when new messages arrive during takeover
  afterUpdate(() => {
    if (isLiveTakeover && messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  function handleTakeoverSend() {
    const content = takeoverInput.trim();
    if (!content || !onSendMessage) return;
    onSendMessage(content);
    takeoverInput = "";
  }

  function handleTakeoverKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTakeoverSend();
    }
  }

  // Extract phone number for WhatsApp sessions
  function extractPhoneNumber(sessionId: string): string | null {
    const parts = sessionId.split("-");
    if (parts[0] === "whatsapp" && parts.length >= 3) {
      return parts[1];
    }
    return null;
  }

  // Get source info
  function getSourceInfo() {
    if (!session) return { label: "Unknown", colorClass: "source-default" };

    const sources: Record<string, { label: string; colorClass: string }> = {
      APP: { label: "Web", colorClass: "source-web" },
      API: { label: "API", colorClass: "source-api" },
      WHATSAPP: { label: "WhatsApp", colorClass: "source-whatsapp" },
      SLACK: { label: "Slack", colorClass: "source-slack" },
      EMAIL: { label: "Email", colorClass: "source-email" },
    };
    return sources[session.source] || { label: "Unknown", colorClass: "source-default" };
  }

  // Get user display info
  function getUserDisplay() {
    if (!session) return { name: "Anonymous", email: undefined, avatar: undefined };

    if (session.slackUser) {
      return {
        name:
          session.slackUser.realName ||
          session.slackUser.displayName ||
          session.slackUser.email ||
          "Slack User",
        email: session.slackUser.email,
        avatar: session.slackUser.avatar,
      };
    }

    if (session.source === "WHATSAPP") {
      const phoneNumber = session.user?.identifier || extractPhoneNumber(session.id);
      return {
        name: phoneNumber || "WhatsApp User",
        email: undefined,
        avatar: undefined,
      };
    }

    return {
      name: session.user?.name || session.user?.email || "Anonymous",
      email: session.user?.email || undefined,
      avatar: session.user?.pictureUrl || undefined,
    };
  }

  // Calculate session duration
  function getSessionDuration(): string {
    if (!session || session.messages.length === 0) return "< 1 min";

    const firstMsg = new Date(session.messages[0].createdAt);
    const lastMsg = new Date(session.messages[session.messages.length - 1].createdAt);
    const diffMins = Math.floor((lastMsg.getTime() - firstMsg.getTime()) / 60000);

    if (diffMins < 1) return "< 1 min";
    return `${diffMins} min`;
  }

  // Format date
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Format time only
  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Group consecutive messages from same sender
  function groupMessages(messages: Message[]): Message[][] {
    if (!messages || messages.length === 0) return [];

    // Sort by creation date
    const sorted = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const groups: Message[][] = [];

    sorted.forEach((msg, index) => {
      if (index === 0 || msg.senderType !== sorted[index - 1].senderType) {
        groups.push([msg]);
      } else {
        groups[groups.length - 1].push(msg);
      }
    });

    return groups;
  }

  // Check if timestamp gap is > 5 minutes
  function shouldShowTimestamp(
    currentDate: string,
    previousDate: string | null
  ): boolean {
    if (!previousDate) return true;
    const diff = new Date(currentDate).getTime() - new Date(previousDate).getTime();
    return diff > 5 * 60 * 1000; // 5 minutes
  }

  $: sourceInfo = getSourceInfo();
  $: userDisplay = getUserDisplay();
  $: sessionDuration = getSessionDuration();
  $: groupedMessages = session ? groupMessages(session.messages) : [];
</script>

<div class="chat-transcript">
  {#if !session}
    <div class="empty-state">
      <div class="empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <h3>Select a conversation</h3>
      <p>Choose a chat session from the list to view its transcript.</p>
    </div>
  {:else}
    <!-- Header -->
    <div class="transcript-header">
      {#if onBack}
        <button class="back-button" on:click={onBack}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      {/if}

      <div class="header-main">
        <div class="header-left">
          <span class="source-badge {sourceInfo.colorClass}">
            {#if session.source === "APP"}
              <Globe size={14} />
            {:else if session.source === "API"}
              <Code size={14} />
            {:else if session.source === "WHATSAPP"}
              <Phone size={14} />
            {:else if session.source === "SLACK"}
              <img src="/assets/deploy-icons/slack-logo.png" alt="Slack" class="source-icon" />
            {:else if session.source === "EMAIL"}
              <Mail size={14} />
            {:else}
              <Globe size={14} />
            {/if}
            <span>{sourceInfo.label}</span>
          </span>

          {#if session.source !== "SLACK"}
            <div class="user-info">
              {#if userDisplay.avatar}
                <img src={userDisplay.avatar} alt={userDisplay.name} class="user-avatar" />
              {:else}
                <User size={18} />
              {/if}
              <div class="user-details">
                <span class="user-name">{userDisplay.name}</span>
                {#if userDisplay.email}
                  <span class="user-email">{userDisplay.email}</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <span class="session-id">ID: {session.id}</span>
      </div>

      <div class="header-meta">
        <div class="meta-item">
          <Clock size={12} />
          <span>Started {formatDate(session.createdAt)}</span>
        </div>
        <span class="meta-divider">•</span>
        <span class="meta-item">Duration: {sessionDuration}</span>
        <span class="meta-divider">•</span>
        <span class="meta-item">{session.messages.length} messages</span>
      </div>
    </div>

    <!-- Takeover banner -->
    {#if isLiveTakeover}
      <div class="takeover-banner">
        <div class="takeover-banner-content">
          <Headset size={16} />
          <span>You are speaking directly to this user. AI is paused.</span>
        </div>
        {#if onRelease}
          <button class="takeover-release-btn" on:click={onRelease}>
            Release to AI
          </button>
        {/if}
      </div>
    {/if}

    <!-- Messages -->
    <div class="messages-container" bind:this={messagesEl}>
      {#each groupedMessages as messageGroup, groupIndex}
        {@const firstMessage = messageGroup[0]}
        {@const isBot = firstMessage.senderType === "BOT"}
        {@const previousGroup = groupIndex > 0 ? groupedMessages[groupIndex - 1] : null}
        {@const previousTimestamp = previousGroup ? previousGroup[0].createdAt : null}

        <!-- Timestamp divider if > 5 minutes gap -->
        {#if shouldShowTimestamp(firstMessage.createdAt, previousTimestamp)}
          <div class="timestamp-divider">
            <span>{formatDate(firstMessage.createdAt)}</span>
          </div>
        {/if}

        <!-- Message group -->
        <div class="message-group {isBot ? 'bot' : 'user'}">
          {#each messageGroup as message, msgIndex}
            <div class="message-wrapper {isBot ? 'bot' : 'user'}">
              <div class="message-bubble {isBot ? 'bot' : 'user'}">
                {#if msgIndex === 0}
                  <div class="message-meta">
                    <span class="sender-name" class:builder-sender={isBot && message.isBuilderMessage}>
                      {#if isBot && message.isBuilderMessage}
                        You (Human)
                      {:else}
                        {isBot ? "Assistant" : userDisplay.name}
                      {/if}
                    </span>
                    <span class="message-time">{formatTime(message.createdAt)}</span>
                  </div>
                {/if}
                <div class="message-content">
                  <Markdown content={message.content} />
                </div>
                {#if message.tags && message.tags.length > 0}
                  <div class="message-tags">
                    {#each message.tags as tag}
                      <span class="tag">{tag.name}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}

      <!-- Session end indicator (hidden during live takeover) -->
      {#if session.messages.length > 0 && !isLiveTakeover}
        <div class="session-end">
          <span>Conversation ended {formatDate(session.messages[session.messages.length - 1].createdAt)}</span>
        </div>
      {/if}
    </div>

    <!-- Takeover input bar -->
    {#if isLiveTakeover && onSendMessage}
      <div class="takeover-input-bar">
        <input
          type="text"
          class="takeover-input"
          placeholder="Type a message as yourself..."
          bind:value={takeoverInput}
          on:keydown={handleTakeoverKeydown}
        />
        <button
          class="takeover-send-btn"
          disabled={!takeoverInput.trim()}
          on:click={handleTakeoverSend}
        >
          <Send size={18} />
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .chat-transcript {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-4);
    color: var(--text-tertiary);
    text-align: center;
    padding: var(--space-8);
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .empty-state p {
    margin: 0;
    max-width: 300px;
  }

  /* Header */
  .transcript-header {
    padding: var(--space-4);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-primary);
  }

  .back-button {
    display: none;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-3);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .back-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  @media (max-width: 768px) {
    .back-button {
      display: inline-flex;
    }
  }

  .header-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 500;
  }

  .source-icon {
    width: 14px;
    height: 14px;
  }

  .source-web {
    background: hsl(217 91% 60% / 0.1);
    color: hsl(217 91% 50%);
  }

  .source-api {
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 35%);
  }

  .source-whatsapp {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 35%);
  }

  .source-slack {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .source-email {
    background: hsl(263 70% 50% / 0.1);
    color: hsl(263 70% 45%);
  }

  .source-default {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-secondary);
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .user-details {
    display: flex;
    flex-direction: column;
  }

  .user-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .user-email {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .session-id {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--text-tertiary);
    flex-wrap: wrap;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .meta-divider {
    opacity: 0.5;
  }

  /* Messages container */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    background: var(--bg-secondary);
  }

  /* Timestamp divider */
  .timestamp-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: var(--space-4) 0;
  }

  .timestamp-divider span {
    font-size: 12px;
    color: var(--text-tertiary);
    background: var(--bg-primary);
    padding: 4px 12px;
    border-radius: var(--radius-full);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Message groups */
  .message-group {
    margin-bottom: var(--space-4);
  }

  .message-wrapper {
    display: flex;
    margin-bottom: var(--space-2);
  }

  .message-wrapper.bot {
    justify-content: flex-start;
  }

  .message-wrapper.user {
    justify-content: flex-end;
  }

  .message-bubble {
    max-width: 70%;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
  }

  .message-bubble.bot {
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    margin-right: auto;
  }

  .message-bubble.user {
    background: hsl(var(--primary));
    color: white;
    margin-left: auto;
  }

  .message-meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .sender-name {
    font-size: 13px;
    font-weight: 600;
  }

  .message-bubble.user .sender-name {
    color: rgba(255, 255, 255, 0.9);
  }

  .message-time {
    font-size: 11px;
    opacity: 0.7;
  }

  .message-content {
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
  }

  .message-bubble.user .message-content :global(a) {
    color: #bfdbfe;
  }

  .message-bubble.user .message-content :global(a:hover) {
    color: #dbeafe;
  }

  .message-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: var(--space-2);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: linear-gradient(135deg, hsl(0 84% 96%), hsl(25 95% 95%));
    border: 1px solid hsl(0 84% 85%);
    border-radius: var(--radius-full);
    font-size: 10px;
    color: hsl(0 72% 45%);
    font-weight: 500;
  }

  /* Session end */
  .session-end {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: var(--space-4);
    padding: var(--space-2);
  }

  .session-end span {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  /* Builder message attribution */
  .builder-sender {
    color: hsl(36, 100%, 40%) !important;
  }

  /* Takeover banner */
  .takeover-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: hsl(36, 100%, 50%, 0.08);
    border-bottom: 1px solid hsl(36, 100%, 50%, 0.2);
    flex-shrink: 0;
  }

  .takeover-banner-content {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 500;
    color: hsl(36, 80%, 35%);
  }

  .takeover-release-btn {
    padding: 5px 14px;
    border: 1px solid hsl(36, 100%, 50%, 0.3);
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(36, 100%, 35%);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .takeover-release-btn:hover {
    background: hsl(36, 100%, 50%, 0.12);
    border-color: hsl(36, 100%, 50%, 0.5);
  }

  /* Takeover input bar */
  .takeover-input-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-primary);
    flex-shrink: 0;
  }

  .takeover-input {
    flex: 1;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .takeover-input:focus {
    border-color: hsl(36, 100%, 50%, 0.5);
  }

  .takeover-input::placeholder {
    color: var(--text-tertiary);
  }

  .takeover-send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--radius-md);
    background: hsl(36, 100%, 50%);
    color: white;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .takeover-send-btn:hover:not(:disabled) {
    background: hsl(36, 100%, 45%);
  }

  .takeover-send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
