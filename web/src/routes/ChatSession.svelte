<script lang="ts">
  /**
   * ChatSession Component
   *
   * View an existing chat session with full message history.
   * Allows continuing the conversation from where it left off.
   */
  import { Input, Button, Markdown } from "$lib/design-system";
  import { ToolInvocationCard } from "$lib/design-system/components/chat";
  import type {
    ChatMessage,
    MessagePart,
    ToolInvocation,
    SSEEvent,
  } from "$lib/design-system/components/chat/types";
  import { link } from "svelte-spa-router";
  import { onMount, tick } from "svelte";
  import { captureException } from "$lib/sentry";

  export let params: { appId: string; sessionId: string } = {
    appId: "",
    sessionId: "",
  };

  let message = "";
  let messages: ChatMessage[] = [];
  let sessionId: string | null = null;
  let isStreaming = false;
  let isLoading = true;
  let loadError: string | null = null;
  let appName = "Chat";
  let messagesContainer: HTMLDivElement;

  // Load session and app details on mount
  onMount(async () => {
    sessionId = params.sessionId;

    try {
      // Load app details and session in parallel
      const [appResponse, sessionResponse] = await Promise.all([
        fetch(`/api/applications/${params.appId}`, { credentials: "include" }),
        fetch(`/api/chat/sessions/${params.sessionId}`, {
          credentials: "include",
        }),
      ]);

      if (appResponse.ok) {
        const appResult = await appResponse.json();
        appName = appResult.data.name;
      }

      if (!sessionResponse.ok) {
        if (sessionResponse.status === 404) {
          loadError = "Chat session not found";
        } else {
          loadError = "Failed to load chat session";
        }
        return;
      }

      const sessionResult = await sessionResponse.json();
      const session = sessionResult.data;

      // Transform messages to expected format
      messages = (session.messages || []).map((msg: any) => {
        const chatMsg: ChatMessage = {
          id: msg.id,
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content || "",
        };

        // Parse tool calls if present
        if (msg.toolCalls) {
          try {
            const toolCalls =
              typeof msg.toolCalls === "string"
                ? JSON.parse(msg.toolCalls)
                : msg.toolCalls;

            const toolResults =
              msg.toolResults &&
              (typeof msg.toolResults === "string"
                ? JSON.parse(msg.toolResults)
                : msg.toolResults);

            chatMsg.parts = [];

            // Add text part if there's content
            if (msg.content) {
              chatMsg.parts.push({ type: "text" as const, text: msg.content });
            }

            // Add tool invocation parts
            for (const call of toolCalls) {
              const result = toolResults?.find(
                (r: any) => r.toolCallId === call.id
              );
              chatMsg.parts.push({
                type: "tool-invocation" as const,
                toolInvocation: {
                  id: call.id,
                  name: call.name || call.function?.name,
                  state: result ? "result" : "call",
                  input: call.arguments || call.function?.arguments,
                  output: result?.result,
                },
              });
            }
          } catch {
            // Ignore parse errors, just show text content
          }
        }

        return chatMsg;
      });
    } catch (e) {
      captureException(e, { tags: { page: "chat-session", feature: "load-session" } });
      loadError = "Failed to load chat session";
    } finally {
      isLoading = false;
      scrollToBottom();
    }
  });

  // Auto-scroll to bottom when messages change
  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  $: if (messages.length) {
    scrollToBottom();
  }

  async function sendMessage() {
    if (!message.trim() || isStreaming || !sessionId) return;

    const userMessage = message;
    message = "";
    isStreaming = true;

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
    };
    messages = [...messages, userMsg];

    // Add empty assistant message that we'll stream into
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      parts: [],
    };
    messages = [...messages, assistantMsg];
    const assistantIndex = messages.length - 1;

    // Track pending tool calls by ID
    const pendingToolCalls = new Map<
      string,
      { id: string; name: string; input: unknown }
    >();
    let currentTextContent = "";

    try {
      const response = await fetch(`/api/chat/${params.appId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          message: userMessage,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);

            // Check for [DONE] marker
            if (dataStr === "[DONE]") {
              continue;
            }

            try {
              const event = JSON.parse(dataStr) as
                | SSEEvent
                | { sessionId?: string; error?: string };

              // Handle errors
              if ("error" in event && event.error) {
                messages[assistantIndex].content = `Error: ${event.error}`;
                messages = [...messages];
                continue;
              }

              // Handle AI SDK event types
              if ("type" in event) {
                handleSSEEvent(
                  event as SSEEvent,
                  assistantIndex,
                  pendingToolCalls,
                  () => currentTextContent,
                  (text) => {
                    currentTextContent = text;
                  }
                );
              }
            } catch {
              // Ignore parse errors for incomplete data
            }
          }
        }
      }

      // Finalize the message content
      if (currentTextContent) {
        updateMessageText(assistantIndex, currentTextContent, false);
      }
    } catch (e) {
      captureException(e, { tags: { page: "chat-session", feature: "send-message" } });
      messages[assistantIndex].content = `Error: ${e instanceof Error ? e.message : "Failed to send message"}`;
      messages = [...messages];
    } finally {
      isStreaming = false;
    }
  }

  function handleSSEEvent(
    event: SSEEvent,
    assistantIndex: number,
    pendingToolCalls: Map<string, { id: string; name: string; input: unknown }>,
    getCurrentText: () => string,
    setCurrentText: (text: string) => void
  ) {
    switch (event.type) {
      case "text-delta": {
        const currentText = getCurrentText();
        setCurrentText(currentText + event.delta);
        updateMessageText(assistantIndex, getCurrentText(), true);
        break;
      }

      case "tool-input-start": {
        pendingToolCalls.set(event.toolCallId, {
          id: event.toolCallId,
          name: event.toolName,
          input: null,
        });
        addOrUpdateToolPart(assistantIndex, {
          id: event.toolCallId,
          name: event.toolName,
          state: "partial-call",
          input: null,
        });
        break;
      }

      case "tool-input-available": {
        const toolCall = pendingToolCalls.get(event.toolCallId);
        if (toolCall) {
          toolCall.input = event.input;
        }
        addOrUpdateToolPart(assistantIndex, {
          id: event.toolCallId,
          name: event.toolName,
          state: "call",
          input: event.input,
        });
        break;
      }

      case "tool-output-available": {
        const toolCall = pendingToolCalls.get(event.toolCallId);
        addOrUpdateToolPart(assistantIndex, {
          id: event.toolCallId,
          name: toolCall?.name || "unknown",
          state: "result",
          input: toolCall?.input,
          output: event.output,
        });
        break;
      }

      case "message-metadata": {
        if (event.messageMetadata?.annotations) {
          messages[assistantIndex].annotations =
            event.messageMetadata.annotations;
          messages = [...messages];
        }
        break;
      }

      case "start":
      case "start-step":
      case "finish-step":
      case "text-start":
      case "text-end":
      case "finish":
        // Structural events, no action needed
        break;
    }
  }

  function updateMessageText(
    assistantIndex: number,
    text: string,
    isStreaming: boolean
  ) {
    const msg = messages[assistantIndex];

    if (!msg.parts) {
      msg.parts = [];
    }

    const textPartIndex = msg.parts.findIndex((p) => p.type === "text");
    if (textPartIndex >= 0) {
      (msg.parts[textPartIndex] as { type: "text"; text: string }).text = text;
    } else {
      msg.parts.unshift({ type: "text", text });
    }

    msg.content = text;
    messages = [...messages];
  }

  function addOrUpdateToolPart(
    assistantIndex: number,
    tool: ToolInvocation
  ) {
    const msg = messages[assistantIndex];

    if (!msg.parts) {
      msg.parts = [];
    }

    const toolPartIndex = msg.parts.findIndex(
      (p) => p.type === "tool-invocation" && p.toolInvocation.id === tool.id
    );

    if (toolPartIndex >= 0) {
      (
        msg.parts[toolPartIndex] as {
          type: "tool-invocation";
          toolInvocation: ToolInvocation;
        }
      ).toolInvocation = tool;
    } else {
      msg.parts.push({
        type: "tool-invocation",
        toolInvocation: tool,
      });
    }

    messages = [...messages];
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function isMessageStreaming(msg: ChatMessage, index: number): boolean {
    return (
      isStreaming && msg.role === "assistant" && index === messages.length - 1
    );
  }
</script>

<div class="chat-page">
  <header class="chat-header">
    <a href="/apps/{params.appId}" use:link class="back-link">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="back-icon"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to App
    </a>
    <h1>{appName}</h1>
    <span class="session-badge">Session</span>
  </header>

  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading conversation...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h2>Unable to load session</h2>
      <p>{loadError}</p>
      <a href="/apps/{params.appId}/chat" use:link class="start-new-link">
        Start a new conversation
      </a>
    </div>
  {:else}
    <div class="messages" bind:this={messagesContainer}>
      {#each messages as msg, index}
        <div class="message {msg.role}">
          {#if msg.role === "user"}
            <div class="message-content">{msg.content}</div>
          {:else if msg.parts && msg.parts.length > 0}
            {#each msg.parts as part}
              {#if part.type === "text" && part.text}
                <div class="message-content">
                  <Markdown
                    content={part.text}
                    streaming={isMessageStreaming(msg, index)}
                  />
                </div>
              {:else if part.type === "tool-invocation"}
                <ToolInvocationCard
                  toolName={part.toolInvocation.name}
                  toolCallId={part.toolInvocation.id}
                  state={part.toolInvocation.state}
                  input={part.toolInvocation.input}
                  output={part.toolInvocation.output}
                  error={part.toolInvocation.error || null}
                />
              {/if}
            {/each}
          {:else if msg.content}
            <div class="message-content">
              <Markdown
                content={msg.content}
                streaming={isMessageStreaming(msg, index)}
              />
            </div>
          {/if}
        </div>
      {/each}

      {#if messages.length === 0}
        <div class="empty-chat">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p>This session has no messages yet.</p>
        </div>
      {/if}
    </div>

    <div class="input-area">
      <Input
        bind:value={message}
        placeholder="Continue the conversation..."
        on:keydown={handleKeydown}
        disabled={isStreaming}
      />
      <Button variant="primary" on:click={sendMessage} disabled={isStreaming}>
        {#if isStreaming}
          <span class="sending-indicator"></span>
        {:else}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="send-icon"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        {/if}
      </Button>
    </div>
  {/if}
</div>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 800px;
    margin: 0 auto;
    background: hsl(var(--background));
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .back-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .back-link:hover {
    color: hsl(var(--foreground));
  }

  .back-icon {
    width: 16px;
    height: 16px;
  }

  h1 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
    flex: 1;
  }

  .session-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .loading-state,
  .error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: var(--space-8);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-icon {
    width: 48px;
    height: 48px;
    color: hsl(var(--destructive));
  }

  .error-icon svg {
    width: 100%;
    height: 100%;
  }

  .error-state h2 {
    font-size: 18px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .error-state p {
    margin: 0;
    max-width: 300px;
  }

  .start-new-link {
    margin-top: var(--space-2);
    color: hsl(var(--primary));
    font-weight: 500;
    text-decoration: none;
  }

  .start-new-link:hover {
    text-decoration: underline;
  }

  .messages {
    flex: 1;
    padding: var(--space-4);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .message {
    max-width: 85%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .message.user {
    align-self: flex-end;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .message-content {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    word-break: break-word;
  }

  .message.user .message-content {
    background-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-bottom-right-radius: var(--radius-sm);
  }

  .message.assistant .message-content {
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
    border-bottom-left-radius: var(--radius-sm);
  }

  .empty-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-chat p {
    font-size: var(--text-lg);
    margin: 0;
  }

  .input-area {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--background));
  }

  .input-area :global(.input-wrapper) {
    flex: 1;
  }

  .send-icon {
    width: 18px;
    height: 18px;
  }

  .sending-indicator {
    width: 18px;
    height: 18px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (max-width: 640px) {
    .chat-page {
      max-width: 100%;
    }

    .message {
      max-width: 90%;
    }

    .chat-header {
      padding: var(--space-3);
    }

    .messages {
      padding: var(--space-3);
    }

    .input-area {
      padding: var(--space-3);
    }
  }
</style>
