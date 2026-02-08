<script lang="ts">
  import {
    MessageCircle,
    Send,
    ChevronUp,
    ChevronDown,
    Sparkles,
    Loader2,
    RotateCcw,
  } from "lucide-svelte";
  import { captureException } from "$lib/sentry";
  import { ONBOARDING_TEMPLATES } from "$lib/onboarding-v2/flow";
  import {
    onboardingV2Store,
    currentApplicationId,
    currentAppNameId,
    currentTemplate,
    hasSelection,
  } from "../../stores/onboardingV2";

  export let compact: boolean = false;
  export let isExpanded: boolean = true;

  interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
  }

  let messages: Message[] = [];
  let input = "";
  let isLoading = false;
  let hasStarted = false;
  let chatSessionId: string | null = null;
  let messagesEndRef: HTMLDivElement;

  $: template = $currentTemplate;
  $: appId = $currentApplicationId;
  // Use appNameId if available, otherwise fall back to appId (UUID) - consumer routes accept both
  $: appIdentifier = $currentAppNameId || $currentApplicationId;
  $: canSend = $hasSelection && input.trim() && !isLoading && appIdentifier;

  // Show initial message when template is selected
  $: if ($hasSelection && !hasStarted && messages.length === 0) {
    const startingMessage =
      template?.startingMessage ||
      ($onboardingV2Store.isCustomApp && $onboardingV2Store.customPrompt
        ? "Hi! I'm your custom AI assistant. How can I help you today?"
        : null);

    if (startingMessage) {
      messages = [
        {
          id: "initial",
          role: "assistant",
          content: startingMessage,
        },
      ];
      hasStarted = true;
    }
  }

  // Reset messages when template changes
  $: if ($onboardingV2Store.selectedTemplate || $onboardingV2Store.isCustomApp) {
    // Only reset if this is a different selection
    const needsReset =
      messages.length > 0 &&
      ((template && messages[0]?.content !== template.startingMessage) ||
        ($onboardingV2Store.isCustomApp &&
          messages[0]?.content !==
            "Hi! I'm your custom AI assistant. How can I help you today?"));

    if (needsReset) {
      messages = [];
      hasStarted = false;
      chatSessionId = null;
    }
  }

  // Auto-scroll to bottom
  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  $: if (messages.length) {
    scrollToBottom();
  }

  // Create chat session using consumer endpoint
  async function createChatSession(): Promise<string | null> {
    if (!appIdentifier) return null;

    try {
      // Use consumer chat endpoint - anonymous chat is allowed for onboarding preview
      // appIdentifier can be either appNameId (slug) or app UUID - consumer routes accept both
      const response = await fetch(`/consumer/${appIdentifier}/chat/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "Onboarding Preview" }),
      });

      if (!response.ok) {
        captureException(new Error("Failed to create chat session"), { tags: { feature: "onboarding-chat-preview" }, extra: { action: "create-session", appIdentifier } });
        return null;
      }

      const data = await response.json();
      if (data?.data?.id) {
        chatSessionId = data.data.id;
        // Store session for persistence
        if ($onboardingV2Store.selectedTemplate) {
          onboardingV2Store.setTemplateChatSession(
            $onboardingV2Store.selectedTemplate,
            data.data.id
          );
        }
        return data.data.id;
      }
      return null;
    } catch (error) {
      captureException(error, { tags: { feature: "onboarding-chat-preview" }, extra: { action: "create-session", appIdentifier } });
      return null;
    }
  }

  // Send message
  async function handleSend() {
    if (!canSend || !appIdentifier) return;

    const userMessage = input.trim();
    input = "";

    // Add user message immediately
    messages = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMessage,
      },
    ];

    isLoading = true;

    try {
      // Create session if needed
      let sessionId = chatSessionId;
      if (!sessionId) {
        sessionId = await createChatSession();
        if (!sessionId) {
          throw new Error("Failed to create chat session");
        }
      }

      // Send to consumer chat stream endpoint
      const response = await fetch(`/consumer/${appIdentifier}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let assistantMessage = "";
      const assistantMessageId = `assistant-${Date.now()}`;
      messages = [
        ...messages,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
        },
      ];

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // Parse SSE data
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              // Backend sends: { type: "text-delta", delta: "..." } for text chunks
              if ((data.type === "text-delta" || data.type === "text") && data.delta) {
                assistantMessage += data.delta;
                // Update the message
                messages = messages.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: assistantMessage }
                    : m
                );
              }
            } catch {
              // Skip non-JSON lines like [DONE]
            }
          }
        }
      }
    } catch (error) {
      captureException(error, { tags: { feature: "onboarding-chat-preview" }, extra: { action: "send-message", appIdentifier, sessionId: chatSessionId } });
      // Add error message
      messages = [
        ...messages,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ];
    } finally {
      isLoading = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSuggestionClick(suggestion: string) {
    // Set input and immediately submit
    input = suggestion;
    handleSend();
  }

  function handleReset() {
    messages = [];
    hasStarted = false;
    chatSessionId = null;
    input = "";
  }

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }

  // Show suggestions only after initial message and no user messages yet
  $: showSuggestions =
    template && messages.length === 1 && messages[0]?.role === "assistant";
</script>

{#if compact}
  <!-- Compact mode for mobile -->
  <div class="compact-preview">
    <button class="expand-toggle" on:click={toggleExpanded}>
      <span class="toggle-label">
        <MessageCircle size={16} />
        Preview your AI
      </span>
      {#if isExpanded}
        <ChevronDown size={16} />
      {:else}
        <ChevronUp size={16} />
      {/if}
    </button>
    {#if isExpanded}
      <div class="compact-chat">
        <!-- Compact chat content -->
        <div class="chat-container compact">
          <!-- Chat header -->
          <div
            class="chat-header"
            style:--header-bg={template?.brandColor
              ? `${template.brandColor}10`
              : "hsl(var(--muted))"}
          >
            <div
              class="header-avatar"
              style:background={template?.brandColor || "var(--brand-color)"}
            >
              {#if template?.logoUrl}
                <img src={template.logoUrl} alt={template.name} />
              {:else if template}
                <Sparkles size={20} />
              {:else}
                <MessageCircle size={20} />
              {/if}
            </div>
            <div class="header-text">
              <h4 class="header-title">
                {template?.name ||
                  ($onboardingV2Store.isCustomApp
                    ? "Custom Assistant"
                    : "Your AI Assistant")}
              </h4>
            </div>
          </div>

          <!-- Chat messages -->
          <div class="chat-messages compact">
            {#if $hasSelection}
              <div class="messages-list">
                {#each messages as message (message.id)}
                  <div class="message" class:user={message.role === "user"}>
                    {#if message.role === "assistant"}
                      <div
                        class="message-avatar"
                        style:background={template?.brandColor || "var(--brand-color)"}
                      >
                        {#if template?.logoUrl}
                          <img src={template.logoUrl} alt="" />
                        {:else}
                          <Sparkles size={16} />
                        {/if}
                      </div>
                    {/if}
                    <div
                      class="message-bubble"
                      class:assistant={message.role === "assistant"}
                      class:user={message.role === "user"}
                      style:--user-bg={template?.brandColor || "var(--brand-color)"}
                    >
                      <p class="message-content">{message.content}</p>
                    </div>
                  </div>
                {/each}
                <div bind:this={messagesEndRef}></div>
              </div>
            {:else}
              <div class="empty-state">
                <p class="empty-text">Select a template to preview</p>
              </div>
            {/if}
          </div>

          <!-- Chat input -->
          <div class="chat-input">
            <div class="input-row">
              <input
                type="text"
                placeholder={$hasSelection ? "Type a message..." : "Select a template..."}
                bind:value={input}
                on:keydown={handleKeyDown}
                disabled={!$hasSelection || isLoading}
                class="message-input"
              />
              <button
                class="send-button"
                on:click={handleSend}
                disabled={!canSend}
                style:--send-bg={template?.brandColor || "var(--brand-color)"}
              >
                {#if isLoading}
                  <Loader2 size={16} class="spinning" />
                {:else}
                  <Send size={16} />
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <!-- Full mode for desktop -->
  <div class="chat-container">
    <!-- Chat header -->
    <div
      class="chat-header"
      style:--header-bg={template?.brandColor
        ? `${template.brandColor}10`
        : "hsl(var(--muted))"}
    >
      <div
        class="header-avatar"
        style:background={template?.brandColor || "var(--brand-color)"}
      >
        {#if template?.logoUrl}
          <img src={template.logoUrl} alt={template.name} />
        {:else if template}
          <Sparkles size={20} />
        {:else}
          <MessageCircle size={20} />
        {/if}
      </div>
      <div class="header-text">
        <h4 class="header-title">
          {template?.name ||
            ($onboardingV2Store.isCustomApp
              ? "Custom Assistant"
              : "Your AI Assistant")}
        </h4>
        <p class="header-subtitle">
          {template?.subtitle || "Preview mode"}
        </p>
      </div>
      <div class="header-actions">
        {#if messages.length > 1}
          <button class="reset-button" on:click={handleReset} title="Reset conversation">
            <RotateCcw size={16} />
          </button>
        {/if}
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span class="status-text">Online</span>
        </div>
      </div>
    </div>

    <!-- Chat messages -->
    <div class="chat-messages">
      {#if $hasSelection}
        <div class="messages-list">
          {#each messages as message (message.id)}
            <div class="message" class:user={message.role === "user"}>
              {#if message.role === "assistant"}
                <div
                  class="message-avatar"
                  style:background={template?.brandColor || "var(--brand-color)"}
                >
                  {#if template?.logoUrl}
                    <img src={template.logoUrl} alt="" />
                  {:else}
                    <Sparkles size={16} />
                  {/if}
                </div>
              {/if}
              <div
                class="message-bubble"
                class:assistant={message.role === "assistant"}
                class:user={message.role === "user"}
                style:--user-bg={template?.brandColor || "var(--brand-color)"}
              >
                <p class="message-content">{message.content}</p>
                {#if isLoading && message.id === messages[messages.length - 1]?.id && message.role === "assistant"}
                  <span class="typing-cursor"></span>
                {/if}
              </div>
            </div>
          {/each}

          <!-- Suggestions -->
          {#if showSuggestions && template?.suggestions}
            <div class="suggestions">
              {#each template.suggestions.slice(0, 4) as suggestion}
                <button
                  class="suggestion-chip"
                  on:click={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          {/if}

          <div bind:this={messagesEndRef}></div>
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-icon">
            <MessageCircle size={32} />
          </div>
          <p class="empty-text">Select a template to preview your AI</p>
        </div>
      {/if}
    </div>

    <!-- Chat input -->
    <div class="chat-input">
      <div class="input-row">
        <input
          type="text"
          placeholder={$hasSelection
            ? "Type a message..."
            : "Select a template first..."}
          bind:value={input}
          on:keydown={handleKeyDown}
          disabled={!$hasSelection || isLoading}
          class="message-input"
        />
        <button
          class="send-button"
          on:click={handleSend}
          disabled={!canSend}
          style:--send-bg={template?.brandColor || "var(--brand-color)"}
        >
          {#if isLoading}
            <Loader2 size={16} class="spinning" />
          {:else}
            <Send size={16} />
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .compact-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .expand-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    transition: color 0.2s;
  }

  .expand-toggle:hover {
    color: hsl(var(--foreground));
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .compact-chat {
    height: 256px;
  }

  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--card));
    border-radius: var(--radius-2xl);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    overflow: hidden;
  }

  .chat-container.compact {
    height: 100%;
  }

  /* Header */
  .chat-header {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
    background: var(--header-bg);
  }

  .header-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;
  }

  .header-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .header-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--card-foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-subtitle {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .reset-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .reset-button:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
  }

  .status-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Messages */
  .chat-messages {
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
    min-height: 0;
  }

  .chat-messages.compact {
    padding: var(--space-2);
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .message {
    display: flex;
    gap: var(--space-3);
  }

  .message.user {
    justify-content: flex-end;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;
    flex-shrink: 0;
  }

  .message-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .message-bubble {
    max-width: 80%;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-2xl);
  }

  .message-bubble.assistant {
    background: hsl(var(--muted));
    border-top-left-radius: var(--radius-sm);
  }

  .message-bubble.user {
    background: var(--user-bg);
    color: white;
    border-top-right-radius: var(--radius-sm);
  }

  .message-content {
    font-size: var(--text-sm);
    margin: 0;
    white-space: pre-wrap;
  }

  .typing-cursor {
    display: inline-block;
    width: 2px;
    height: 16px;
    background: currentColor;
    margin-left: 2px;
    vertical-align: middle;
    animation: blink 0.5s infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  /* Suggestions */
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: 44px;
  }

  .suggestion-chip {
    padding: var(--space-1-5) var(--space-3);
    font-size: var(--text-xs);
    border-radius: var(--radius-full);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .suggestion-chip:hover {
    background: hsl(var(--muted));
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .empty-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .empty-text {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  /* Input */
  .chat-input {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
    flex-shrink: 0;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .message-input {
    flex: 1;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-full);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    font-size: var(--text-sm);
    outline: none;
    transition: all 0.2s;
  }

  .message-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .message-input:focus {
    border-color: var(--brand-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-color) 20%, transparent);
  }

  .message-input:disabled {
    opacity: 0.5;
  }

  .send-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--send-bg);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .send-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
