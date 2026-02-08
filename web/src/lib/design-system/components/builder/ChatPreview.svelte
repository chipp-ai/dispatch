<script lang="ts">
  import { onDestroy } from "svelte";
  import { captureException } from "$lib/sentry";
  import ChatMessage from "../chat/ChatMessage.svelte";
  import ChatInput from "../chat/ChatInput.svelte";
  import CreditExhaustedModal from "../consumer/CreditExhaustedModal.svelte";
  import type { ChatTheme, AnimationConfig } from "../chat/types";

  export let applicationId: string = "";
  export let appName: string = "App Name";
  export let appLogoUrl: string = "";
  export let startingMessage: string = "";
  export let conversationStarters: string[] = [];
  export let inputPlaceholder: string = "Type here to chat";
  export let disclaimerText: string = "";
  export let theme: ChatTheme = "default";

  // Brand colors (override theme defaults)
  export let primaryColor: string = "#4F46E5";
  export let botMessageColor: string = "#F3F4F6";
  export let userMessageColor: string = "#4F46E5";

  // Animation configuration
  export let animationConfig: Partial<AnimationConfig> | undefined = undefined;

  // Video recording
  export let showVideoButton: boolean = false;

  const defaultLogo = "/assets/default-app-image.png";

  // View mode: "chat" (expanded) or "widget" (phone mockup)
  type ViewMode = "chat" | "widget";
  let viewMode: ViewMode = "chat";

  // Tool invocation tracking (for debug cards)
  type ToolInvocation = {
    id: string;
    name: string;
    state: "partial-call" | "call" | "result" | "error";
    input: unknown;
    output?: unknown;
    error?: string;
  };

  type MessagePart =
    | { type: "text"; text: string }
    | { type: "tool-invocation"; toolInvocation: ToolInvocation };

  // Chat state
  type Message = {
    id: string;
    role: "user" | "assistant";
    content: string; // Legacy/fallback - we now use parts for rendering
    images?: string[];
    parts?: MessagePart[];
    /** Text currently streaming (not yet finalized into a part). Reactively tracked on the message object because Svelte can't track Map.get() calls. */
    pendingText?: string;
    audioUrl?: string;
    audioDurationMs?: number;
    videoUrl?: string;
    videoMimeType?: string;
  };

  let messages: Message[] = [];
  let isLoading = false;
  let sessionId: string | null = null;
  let abortController: AbortController | null = null;
  let prevApplicationId: string = "";

  // Upload state
  let stagedImages: string[] = [];
  let isUploadingImage = false;
  let showUploadMenu = false;
  let fileInputRef: HTMLInputElement;
  let chatInputRef: { focus(): void } | undefined;
  let chatMessagesRef: HTMLDivElement;

  // Track pending tool calls during streaming
  let pendingToolCalls = new Map<string, { id: string; name: string; input: unknown }>();

  // Track pending text that hasn't been finalized into a part yet
  // This allows us to "seal" text parts when a tool starts, maintaining chronological order
  let pendingTextByMessage = new Map<string, string>();

  // Track the last user message for retry functionality
  let lastUserMessageContent: string = "";
  let lastUserMessageImages: string[] = [];

  // Human-like delay: track if we're waiting to show the assistant message
  let waitingDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingAssistantMessage: Message | null = null;

  // Credit exhaustion modal state
  let showCreditExhausted = false;

  /**
   * Check if an error message indicates credit/usage exhaustion
   */
  function isCreditExhaustionError(errorMsg: string): boolean {
    const errorLower = errorMsg.toLowerCase();
    return (
      (errorLower.includes("credits") && errorLower.includes("exhausted")) ||
      errorLower.includes("credit balance") ||
      errorLower.includes("ai credits balance is exhausted") ||
      errorLower.includes("usage quota") ||
      errorLower.includes("no available balance")
    );
  }

  /**
   * Ensure the assistant message is in the messages array.
   * Called when streaming data arrives - cancels the delay timer if needed.
   */
  function ensureAssistantMessageAdded() {
    if (pendingAssistantMessage) {
      if (waitingDelayTimer) {
        clearTimeout(waitingDelayTimer);
        waitingDelayTimer = null;
      }
      messages = [...messages, pendingAssistantMessage];
      pendingAssistantMessage = null;
    }
  }

  /**
   * Finalize any pending text into a text part.
   * Called before adding a tool invocation to maintain chronological order.
   */
  function finalizePendingText(messageId: string) {
    const pendingText = pendingTextByMessage.get(messageId);
    if (pendingText && pendingText.trim()) {
      messages = messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const parts = msg.parts || [];
        return {
          ...msg,
          parts: [...parts, { type: "text" as const, text: pendingText }],
          pendingText: "",
        };
      });
      pendingTextByMessage.set(messageId, "");
    }
  }

  /**
   * Append text delta to pending text (not yet finalized into a part).
   * This accumulates streaming text until a tool starts or stream ends.
   */
  function appendPendingText(messageId: string, delta: string) {
    const current = pendingTextByMessage.get(messageId) || "";
    const newText = current + delta;
    pendingTextByMessage.set(messageId, newText);

    // Store pendingText on the message object so Svelte can reactively track it.
    // Svelte can't track Map.get() calls in templates — only object property changes
    // on reactively-reassigned arrays trigger re-renders.
    messages = messages.map((msg) =>
      msg.id === messageId
        ? { ...msg, content: msg.content + delta, pendingText: newText }
        : msg
    );
  }

  /**
   * Finalize all pending text and mark stream as complete.
   * Called when stream ends successfully.
   */
  function finalizeMessage(messageId: string) {
    finalizePendingText(messageId);
    pendingTextByMessage.delete(messageId);
  }

  /**
   * Update or add a tool invocation part.
   * Maintains chronological order by finalizing pending text first when adding new tools.
   */
  function updateToolInvocation(messageId: string, tool: ToolInvocation, isNewTool: boolean = false) {
    // If this is a NEW tool (tool-input-start), finalize any pending text first
    // This ensures text appears BEFORE the tool in the parts array
    if (isNewTool) {
      finalizePendingText(messageId);
    }

    messages = messages.map((msg) => {
      if (msg.id !== messageId) return msg;

      const parts = msg.parts || [];
      const existingIndex = parts.findIndex(
        (p) => p.type === "tool-invocation" && p.toolInvocation.id === tool.id
      );

      if (existingIndex >= 0) {
        // Update existing tool invocation in place
        const newParts = [...parts];
        newParts[existingIndex] = { type: "tool-invocation", toolInvocation: tool };
        return { ...msg, parts: newParts };
      } else {
        // Add new tool invocation
        return { ...msg, parts: [...parts, { type: "tool-invocation", toolInvocation: tool }] };
      }
    });
  }

  $: filteredStarters = conversationStarters.filter((s) => s.trim() !== "");

  // Reset chat when applicationId changes
  $: if (applicationId && applicationId !== prevApplicationId) {
    prevApplicationId = applicationId;
    resetChat();
  }

  function resetChat() {
    messages = [];
    sessionId = null;
    isLoading = false;
    stagedImages = [];
    pendingToolCalls.clear();
    pendingTextByMessage.clear();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  // Event handlers for ChatInput
  function handleSend(event: CustomEvent<{ message: string }>) {
    sendMessage(event.detail.message);
  }

  function handleImageUploaded(event: CustomEvent<{ url: string }>) {
    stagedImages = [...stagedImages, event.detail.url];
  }

  function handleRemoveStagedImage(event: CustomEvent<{ url: string }>) {
    stagedImages = stagedImages.filter(u => u !== event.detail.url);
  }

  async function sendMessage(content: string, retryImages?: string[]) {
    if ((!content.trim() && stagedImages.length === 0 && !retryImages?.length) || !applicationId || isLoading) return;

    // Capture and clear staged images (or use retry images)
    const messageImages = retryImages || [...stagedImages];
    stagedImages = [];

    // Store for retry
    lastUserMessageContent = content.trim();
    lastUserMessageImages = messageImages;

    // Build message content with embedded images (markdown format for multimodal parsing)
    let messageContent = content.trim();
    if (messageImages.length > 0) {
      // Append images as markdown: ![](url)
      const imageMarkdown = messageImages.map(url => `![](${url})`).join(" ");
      messageContent = messageContent ? `${messageContent}\n\n${imageMarkdown}` : imageMarkdown;
    }

    // Add user message to UI immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content.trim(),
      images: messageImages.length > 0 ? messageImages : undefined,
    };

    // Create empty assistant message for streaming (shows loading indicator immediately)
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    // Add both messages immediately (matches consumer behavior)
    messages = [...messages, userMessage, assistantMessage];
    isLoading = true;

    // Scroll to bottom so new message is visible and there's room for the AI response
    requestAnimationFrame(() => {
      if (chatMessagesRef) {
        chatMessagesRef.scrollTo({ top: chatMessagesRef.scrollHeight, behavior: "smooth" });
      }
    });

    // Keep input focused for quick follow-up messages
    chatInputRef?.focus();

    try {
      abortController = new AbortController();

      // Send messageContent which includes embedded images for multimodal parsing
      const requestBody: { message: string; sessionId?: string } = {
        message: messageContent,
      };
      if (sessionId) {
        requestBody.sessionId = sessionId;
      }

      const response = await fetch(`/api/chat/${applicationId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        captureException(new Error(`Chat request failed: ${response.status}`), {
          tags: { feature: "builder-chat-preview" },
          extra: { status: response.status, errorText },
        });
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // Next line should be data
            continue;
          }
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              // Handle session event
              if (parsed.sessionId && !sessionId) {
                sessionId = parsed.sessionId;
              }

              // Handle text chunks - accumulate in pending text
              if (parsed.type === "text-delta" && parsed.delta) {
                // Ensure message is visible before updating it
                ensureAssistantMessageAdded();
                appendPendingText(assistantMessage.id, parsed.delta);
              }

              // Handle tool events
              if (parsed.type === "tool-input-start" && parsed.toolCallId && parsed.toolName) {
                // Ensure message is visible before updating it
                ensureAssistantMessageAdded();
                // Start tracking a new tool call
                pendingToolCalls.set(parsed.toolCallId, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  input: undefined,
                });
                // Add tool invocation in "partial-call" state
                // Pass isNewTool=true to finalize pending text first (chronological order)
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  state: "partial-call",
                  input: undefined,
                }, true);
              }

              if (parsed.type === "tool-input-available" && parsed.toolCallId) {
                // Update tool call with input
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                if (toolCall) {
                  toolCall.input = parsed.input;
                }
                // Update tool invocation to "call" state (not a new tool, just updating)
                // Prefer toolName from event, fallback to pendingToolCalls lookup
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "call",
                  input: parsed.input,
                }, false);
              }

              if (parsed.type === "tool-output-available" && parsed.toolCallId) {
                // Update tool invocation to "result" state
                // Prefer toolName from event, fallback to pendingToolCalls lookup
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "result",
                  input: toolCall?.input,
                  output: parsed.output,
                }, false);
              }

              // NOTE: "done"/"finish" SSE events are intentionally ignored here.
              // The backend sends them after each LLM turn (e.g., after the tool call
              // is triggered), but the stream continues with tool output and more text.
              // We finalize when the HTTP stream actually ends (reader.read() done=true).

              // Handle error event
              if (parsed.error) {
                captureException(parsed.error instanceof Error ? parsed.error : new Error(String(parsed.error)), {
                  tags: { feature: "builder-chat-preview" },
                  extra: { parsedError: parsed.error },
                });
                const errorMsg = typeof parsed.error === "string"
                  ? parsed.error
                  : parsed.error?.message || "Something went wrong. Please try again.";

                // Check for credit exhaustion and show modal instead of inline error
                if (isCreditExhaustionError(errorMsg)) {
                  showCreditExhausted = true;
                  // Remove the assistant message since we're showing a modal
                  messages = messages.filter((m) => m.id !== assistantMessage.id);
                } else {
                  messages = messages.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: "", error: true, errorMessage: errorMsg }
                      : m
                  );
                }
                isLoading = false;
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      // Stream complete — finalize any remaining pending text into a part
      // and mark loading as done. This runs when reader.read() returns done=true,
      // which is the true end-of-stream (unlike SSE "done"/"finish" events which
      // can fire mid-stream between LLM turns in tool-using responses).
      finalizeMessage(assistantMessage.id);
      pendingToolCalls.clear();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Request was cancelled, remove empty assistant message
        messages = messages.filter((m) => m.id !== assistantMessage.id);
      } else {
        captureException(error, {
          tags: { feature: "builder-chat-preview" },
          extra: { context: "chat-stream" },
        });
        messages = messages.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: "", error: true, errorMessage: "Something went wrong. Please try again." }
            : m
        );
      }
    } finally {
      isLoading = false;
      abortController = null;
    }
  }

  function handleStarterClick(starter: string) {
    sendMessage(starter);
  }

  function stop() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isLoading = false;
  }

  function handleRetry(event: CustomEvent<{ messageId: string }>) {
    const { messageId } = event.detail;
    // Remove the failed assistant message
    messages = messages.filter((m) => m.id !== messageId);
    // Also remove the associated user message
    messages = messages.slice(0, -1);
    // Resend the last user message
    sendMessage(lastUserMessageContent, lastUserMessageImages);
  }

  async function handleAudioRecorded(event: CustomEvent<{ audioBlob: Blob; durationMs: number; mimeType: string }>) {
    if (!applicationId || isLoading) return;

    const { audioBlob, durationMs, mimeType } = event.detail;

    // Create playable URL for the voice message card
    const audioUrl = URL.createObjectURL(audioBlob);

    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    // Add user message with playable audio
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: "[Voice message]",
      audioUrl,
      audioDurationMs: durationMs,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    messages = [...messages, userMessage, assistantMessage];
    isLoading = true;

    requestAnimationFrame(() => {
      if (chatMessagesRef) {
        chatMessagesRef.scrollTo({ top: chatMessagesRef.scrollHeight, behavior: "smooth" });
      }
    });

    try {
      abortController = new AbortController();

      const requestBody: Record<string, unknown> = {
        message: "",
        audio: { data: base64, mimeType, durationMs },
      };
      if (sessionId) {
        requestBody.sessionId = sessionId;
      }

      const response = await fetch(`/api/chat/${applicationId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (parsed.sessionId && !sessionId) {
                sessionId = parsed.sessionId;
              }

              if (parsed.type === "text-delta" && parsed.delta) {
                ensureAssistantMessageAdded();
                appendPendingText(assistantMessage.id, parsed.delta);
              }

              if (parsed.type === "tool-input-start" && parsed.toolCallId && parsed.toolName) {
                ensureAssistantMessageAdded();
                pendingToolCalls.set(parsed.toolCallId, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  input: undefined,
                });
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  state: "partial-call",
                  input: undefined,
                }, true);
              }

              if (parsed.type === "tool-input-available" && parsed.toolCallId) {
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                if (toolCall) toolCall.input = parsed.input;
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "call",
                  input: parsed.input,
                }, false);
              }

              if (parsed.type === "tool-output-available" && parsed.toolCallId) {
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "result",
                  input: toolCall?.input,
                  output: parsed.output,
                }, false);
              }

              if (parsed.error) {
                const errorMsg = typeof parsed.error === "string"
                  ? parsed.error
                  : parsed.error?.message || "Something went wrong. Please try again.";

                if (isCreditExhaustionError(errorMsg)) {
                  showCreditExhausted = true;
                  messages = messages.filter((m) => m.id !== assistantMessage.id);
                } else {
                  messages = messages.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: "", error: true, errorMessage: errorMsg }
                      : m
                  );
                }
                isLoading = false;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      finalizeMessage(assistantMessage.id);
      pendingToolCalls.clear();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        messages = messages.filter((m) => m.id !== assistantMessage.id);
      } else {
        captureException(error, {
          tags: { feature: "builder-chat-preview" },
          extra: { context: "audio-chat-stream" },
        });
        messages = messages.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: "", error: true, errorMessage: "Something went wrong. Please try again." }
            : m
        );
      }
    } finally {
      isLoading = false;
      abortController = null;
    }
  }

  async function handleVideoRecorded(
    event: CustomEvent<{ videoUrl: string; mimeType: string; durationMs: number }>
  ) {
    if (!applicationId || isLoading) return;
    sendVideoMessage(event.detail.videoUrl, event.detail.mimeType);
  }

  function handleVideoUploaded(event: CustomEvent<{ url: string; mimeType: string }>) {
    if (!applicationId || isLoading) return;
    sendVideoMessage(event.detail.url, event.detail.mimeType);
  }

  async function sendVideoMessage(videoUrl: string, mimeType: string) {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: "[Video message]",
      videoUrl,
      videoMimeType: mimeType,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    messages = [...messages, userMessage, assistantMessage];
    isLoading = true;

    requestAnimationFrame(() => {
      if (chatMessagesRef) {
        chatMessagesRef.scrollTo({ top: chatMessagesRef.scrollHeight, behavior: "smooth" });
      }
    });

    try {
      abortController = new AbortController();

      const requestBody: Record<string, unknown> = {
        message: "",
        video: { url: videoUrl, mimeType },
      };
      if (sessionId) {
        requestBody.sessionId = sessionId;
      }

      const response = await fetch(`/api/chat/${applicationId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              if (parsed.sessionId && !sessionId) {
                sessionId = parsed.sessionId;
              }

              if (parsed.type === "text-delta" && parsed.delta) {
                ensureAssistantMessageAdded();
                appendPendingText(assistantMessage.id, parsed.delta);
              }

              if (parsed.type === "tool-input-start" && parsed.toolCallId && parsed.toolName) {
                ensureAssistantMessageAdded();
                pendingToolCalls.set(parsed.toolCallId, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  input: undefined,
                });
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName,
                  state: "partial-call",
                  input: undefined,
                }, true);
              }

              if (parsed.type === "tool-input-available" && parsed.toolCallId) {
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                if (toolCall) toolCall.input = parsed.input;
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "call",
                  input: parsed.input,
                }, false);
              }

              if (parsed.type === "tool-output-available" && parsed.toolCallId) {
                const toolCall = pendingToolCalls.get(parsed.toolCallId);
                updateToolInvocation(assistantMessage.id, {
                  id: parsed.toolCallId,
                  name: parsed.toolName || toolCall?.name || "unknown",
                  state: "result",
                  input: toolCall?.input,
                  output: parsed.output,
                }, false);
              }

              if (parsed.error) {
                const errorMsg = typeof parsed.error === "string"
                  ? parsed.error
                  : parsed.error?.message || "Something went wrong. Please try again.";

                if (isCreditExhaustionError(errorMsg)) {
                  showCreditExhausted = true;
                  messages = messages.filter((m) => m.id !== assistantMessage.id);
                } else {
                  messages = messages.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: "", error: true, errorMessage: errorMsg }
                      : m
                  );
                }
                isLoading = false;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      finalizeMessage(assistantMessage.id);
      pendingToolCalls.clear();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        messages = messages.filter((m) => m.id !== assistantMessage.id);
      } else {
        captureException(error, {
          tags: { feature: "builder-chat-preview" },
          extra: { context: "video-chat-stream" },
        });
        messages = messages.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: "", error: true, errorMessage: "Something went wrong. Please try again." }
            : m
        );
      }
    } finally {
      isLoading = false;
      abortController = null;
    }
  }

  onDestroy(() => {
    if (abortController) {
      abortController.abort();
    }
  });
</script>

<div class="preview-container" style="--color-primary: {primaryColor}; --bot-message-bg: {botMessageColor}; --user-message-bg: {userMessageColor};">
  <!-- View Mode Toggle -->
  <div class="view-toggle">
    <button
      class="toggle-button"
      class:active={viewMode === "chat"}
      on:click={() => (viewMode = "chat")}
    >
      Chat
    </button>
    <button
      class="toggle-button"
      class:active={viewMode === "widget"}
      on:click={() => (viewMode = "widget")}
    >
      Widget
    </button>
  </div>

  {#if viewMode === "chat"}
    <!-- ChatGPT-style Full Page Chat View -->
    <div class="chat-expanded theme-{theme}">
      {#if messages.length === 0}
        <!-- Empty state: centered welcome -->
        <div class="chat-welcome">
          <div class="welcome-logo-container">
            <div class="welcome-logo-glow"></div>
            <div class="welcome-logo">
              <img src={appLogoUrl || defaultLogo} alt={appName} />
            </div>
          </div>
          <h2 class="welcome-title">{appName}</h2>
          {#if startingMessage}
            <p class="welcome-message">{startingMessage}</p>
          {/if}
          {#if filteredStarters.length > 0}
            <div class="welcome-starters">
              {#each filteredStarters as starter}
                <button class="welcome-starter-chip" on:click={() => handleStarterClick(starter)}>{starter}</button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Messages view -->
        <div class="chat-messages-expanded" bind:this={chatMessagesRef}>
          <div class="chat-messages-inner">
            {#each messages as message, index (message.id)}
              <ChatMessage
                message={message}
                isStreaming={isLoading}
                isLast={index === messages.length - 1}
                {primaryColor}
                {theme}
                appLogoUrl={appLogoUrl || defaultLogo}
                isBuilder={true}
                hideActions={true}
                {animationConfig}
                on:retry={handleRetry}
              />
            {/each}
          </div>
        </div>
      {/if}

      <div class="input-area-expanded">
        <div class="input-wrapper-expanded">
          <ChatInput
            bind:this={chatInputRef}
            placeholder={inputPlaceholder || "Message..."}
            disabled={!applicationId}
            responseGenerating={isLoading}
            imageUploadEnabled={true}
            {showVideoButton}
            {stagedImages}
            {primaryColor}
            hasMessages={messages.length > 0}
            autoFocus={false}
            on:send={handleSend}
            on:stop={stop}
            on:audioRecorded={handleAudioRecorded}
            on:videoRecorded={handleVideoRecorded}
            on:videoUploaded={handleVideoUploaded}
            on:imageUploaded={handleImageUploaded}
            on:removeStagedImage={handleRemoveStagedImage}
          />
        </div>
        {#if disclaimerText}
          <p class="disclaimer-expanded">{disclaimerText}</p>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Widget Phone Mockup View -->
    <div class="preview-phone theme-{theme}">
      <div class="phone-header">
        <div class="header-content">
          <div class="app-info">
            <div class="app-logo">
              <img src={appLogoUrl || defaultLogo} alt={appName} />
            </div>
            <span class="app-name">{appName}</span>
          </div>
          <button class="menu-button" aria-label="Chat menu">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-area">
        {#if startingMessage && messages.length === 0}
          <ChatMessage
            message={{ id: "starting-message", role: "assistant", content: startingMessage }}
            isStreaming={false}
            isLast={false}
            {primaryColor}
            {theme}
            appLogoUrl={appLogoUrl || defaultLogo}
            isBuilder={true}
            hideActions={true}
            {animationConfig}
          />
        {/if}

        {#each messages as message, index (message.id)}
          <ChatMessage
            message={message}
            isStreaming={isLoading}
            isLast={index === messages.length - 1}
            {primaryColor}
            {theme}
            appLogoUrl={appLogoUrl || defaultLogo}
            isBuilder={true}
            hideActions={true}
            {animationConfig}
            on:retry={handleRetry}
          />
        {/each}

        {#if filteredStarters.length > 0 && messages.length === 0}
          <div class="starters">
            {#each filteredStarters as starter}
              <button class="starter-chip" on:click={() => handleStarterClick(starter)}>{starter}</button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="input-area">
        <div class="input-wrapper-widget">
          <ChatInput
            placeholder={inputPlaceholder || "Type here to chat"}
            disabled={!applicationId}
            responseGenerating={isLoading}
            imageUploadEnabled={true}
            {showVideoButton}
            {stagedImages}
            {primaryColor}
            hasMessages={messages.length > 0}
            autoFocus={false}
            on:send={handleSend}
            on:stop={stop}
            on:audioRecorded={handleAudioRecorded}
            on:videoRecorded={handleVideoRecorded}
            on:videoUploaded={handleVideoUploaded}
            on:imageUploaded={handleImageUploaded}
            on:removeStagedImage={handleRemoveStagedImage}
          />
        </div>
        {#if disclaimerText}
          <p class="disclaimer">{disclaimerText}</p>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Credit Exhausted Modal -->
  <CreditExhaustedModal
    open={showCreditExhausted}
    appName={appName}
    primaryColor={primaryColor}
    logoUrl={appLogoUrl || null}
    forceDarkMode={true}
    on:close={() => (showCreditExhausted = false)}
  />
</div>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    background: var(--bg-secondary);
    padding: var(--space-4);
  }

  /* View Mode Toggle */
  .view-toggle {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    margin-bottom: var(--space-4);
    flex-shrink: 0;
  }

  .toggle-button {
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-button:hover {
    color: var(--text-primary);
  }

  .toggle-button.active {
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* ChatGPT-style Full Page Destination */
  .chat-expanded {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  /* Welcome screen - centered like ChatGPT/Chipp Admin */
  .chat-welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    text-align: center;
    gap: var(--space-6);
    animation: fadeInUp 0.5s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }

  .welcome-logo-container {
    position: relative;
  }

  /* Subtle glow effect behind logo */
  .welcome-logo-glow {
    position: absolute;
    inset: -24px;
    border-radius: var(--radius-full);
    background: radial-gradient(circle, var(--color-primary, #4F46E5) 0%, transparent 70%);
    opacity: 0.2;
    filter: blur(20px);
    transition: opacity 0.3s ease;
  }

  .welcome-logo-container:hover .welcome-logo-glow {
    opacity: 0.35;
  }

  .welcome-logo {
    position: relative;
    width: 88px;
    height: 88px;
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow:
      0 0.5px 1.5px rgba(0, 0, 0, 0.1),
      0 2px 6px rgba(0, 0, 0, 0.08),
      0 8px 24px rgba(0, 0, 0, 0.06),
      0 0 0 1px rgba(0, 0, 0, 0.08);
    animation: float 4s ease-in-out infinite;
    transition: transform 0.3s ease;
  }

  .welcome-logo:hover {
    transform: scale(1.02);
  }

  .welcome-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .welcome-title {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .welcome-message {
    font-size: var(--text-base);
    color: var(--text-secondary);
    max-width: 480px;
    margin: 0;
    line-height: 1.7;
  }

  .welcome-starters {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
    max-width: 768px;
  }

  .welcome-starter-chip {
    padding: var(--space-3) var(--space-5);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .welcome-starter-chip:hover {
    background: var(--bg-secondary);
    border-color: var(--color-primary);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  /* Messages area - ChatGPT style */
  .chat-messages-expanded {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-6);
  }

  /* Inner wrapper to constrain message width to match input */
  .chat-messages-inner {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 768px;
    margin: 0 auto;
    /* Bottom padding so new messages appear higher in viewport */
    padding-bottom: 50vh;
  }

  /* Input area - ChatGPT style */
  .input-area-expanded {
    padding: var(--space-4) var(--space-6);
    background: var(--bg-primary);
    border-top: 1px solid var(--border-primary);
  }

  /* Layout wrapper — ChatInput inherits HSL theme vars (--background, --foreground, etc.)
     from tokens.css which already handles light/dark mode. Only layout needs setting here. */
  .input-wrapper-expanded,
  .input-wrapper-widget {
    max-width: 768px;
    margin: 0 auto;
    width: 100%;
  }

  .disclaimer-expanded {
    margin: var(--space-2) auto 0;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: center;
    max-width: 768px;
  }

  /* Widget Phone Mockup View */
  .preview-phone {
    width: 100%;
    max-width: 400px;
    height: 700px;
    background: var(--bg-primary);
    border-radius: var(--radius-2xl);
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px var(--border-primary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .phone-header {
    padding: var(--space-4);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-primary);
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .app-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .app-logo {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .app-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .app-name {
    font-weight: 600;
    font-size: var(--text-base);
    color: var(--text-primary);
  }

  .menu-button {
    padding: var(--space-2);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-lg);
  }

  .menu-button:hover {
    background: var(--bg-secondary);
  }

  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .starters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: auto;
  }

  .starter-chip {
    padding: var(--space-2) var(--space-3);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .starter-chip:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-secondary);
  }

  .input-area {
    padding: var(--space-4);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-primary);
  }

  .disclaimer {
    margin: var(--space-2) 0 0;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: center;
  }
</style>
