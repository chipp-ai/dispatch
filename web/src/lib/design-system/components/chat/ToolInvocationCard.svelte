<script lang="ts">
  /**
   * Tool Invocation Card
   *
   * Displays tool calls with status indicators:
   * - partial-call: Tool call in progress (streaming arguments)
   * - call: Tool call complete, waiting for execution
   * - result: Tool execution complete
   * - error: Tool execution failed
   */
  import ToolDebugInfo from "./ToolDebugInfo.svelte";
  import type { ToolDebugInfo as ToolDebugInfoType } from "./types";

  export let toolName: string;
  export let toolCallId: string;
  export let state: "partial-call" | "call" | "result" | "error" = "call";
  export let input: unknown = null;
  export let output: unknown = null;
  export let error: string | null = null;
  export let isExpanded: boolean = false;
  export let debugInfo: ToolDebugInfoType | undefined = undefined;
  export let isBuilder: boolean = false;
  export let executionTime: number | undefined = undefined;

  // Format tool name for display
  function formatToolName(name: string): string {
    return name
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Truncate long content
  function truncate(str: string, maxLength: number = 100): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "...";
  }

  // Format JSON for display
  function formatJson(data: unknown): string {
    try {
      if (typeof data === "string") {
        // Try to parse if it's a JSON string
        try {
          return JSON.stringify(JSON.parse(data), null, 2);
        } catch {
          return data;
        }
      }
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }

  $: displayName = formatToolName(toolName);
  $: inputStr = input ? formatJson(input) : "";
  $: outputStr = output ? formatJson(output) : "";

  // Determine icon based on state
  $: icon = {
    "partial-call": "...",
    call: "...",
    result: "...",
    error: "...",
  }[state];
</script>

<div
  class="tool-card"
  class:partial-call={state === "partial-call"}
  class:call={state === "call"}
  class:result={state === "result"}
  class:error={state === "error"}
>
  <button class="tool-header" on:click={toggleExpand}>
    <div class="tool-status">
      {#if state === "partial-call" || state === "call"}
        <div class="spinner"></div>
      {:else if state === "result"}
        <svg
          class="icon success"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      {:else if state === "error"}
        <svg
          class="icon error"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      {/if}
    </div>

    <div class="tool-info">
      <span class="tool-name">{displayName}</span>
      {#if state === "partial-call"}
        <span class="tool-state">Preparing...</span>
      {:else if state === "call"}
        <span class="tool-state">Running...</span>
      {:else if state === "result"}
        <span class="tool-state">Complete</span>
      {:else if state === "error"}
        <span class="tool-state">Failed</span>
      {/if}
    </div>

    <div class="expand-icon" class:expanded={isExpanded}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  </button>

  {#if isExpanded}
    <div class="tool-details">
      {#if inputStr}
        <div class="detail-section">
          <div class="detail-label">Input</div>
          <pre class="detail-content">{inputStr}</pre>
        </div>
      {/if}

      {#if state === "result" && outputStr}
        <div class="detail-section">
          <div class="detail-label">Output</div>
          <pre class="detail-content">{truncate(outputStr, 500)}</pre>
        </div>
      {/if}

      {#if state === "error" && error}
        <div class="detail-section error">
          <div class="detail-label">Error</div>
          <pre class="detail-content">{error}</pre>
        </div>
      {/if}

      <!-- Debug info (builder mode only) -->
      {#if isBuilder && debugInfo}
        <ToolDebugInfo
          {debugInfo}
          {toolName}
          success={state === "result"}
          {executionTime}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-card {
    border-radius: var(--radius-md);
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border));
    overflow: hidden;
    margin: var(--space-2) 0;
  }

  .tool-card.result {
    border-color: hsl(142 76% 36% / 0.3);
    background: hsl(142 76% 36% / 0.05);
  }

  .tool-card.error {
    border-color: hsl(0 84% 60% / 0.3);
    background: hsl(0 84% 60% / 0.05);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    width: 100%;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font-family: inherit;
  }

  .tool-header:hover {
    background: hsl(var(--muted) / 0.3);
  }

  .tool-status {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid hsl(var(--muted-foreground) / 0.3);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .icon {
    width: 18px;
    height: 18px;
  }

  .icon.success {
    color: hsl(142 76% 36%);
  }

  .icon.error {
    color: hsl(0 84% 60%);
  }

  .tool-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tool-name {
    font-weight: var(--font-medium);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
  }

  .tool-state {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .expand-icon {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s ease;
  }

  .expand-icon.expanded {
    transform: rotate(180deg);
  }

  .expand-icon svg {
    width: 100%;
    height: 100%;
  }

  .tool-details {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--background));
  }

  .detail-section {
    margin-bottom: var(--space-3);
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-section.error .detail-content {
    color: hsl(0 84% 60%);
  }

  .detail-label {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-1);
  }

  .detail-content {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    background: hsl(var(--muted));
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }
</style>
