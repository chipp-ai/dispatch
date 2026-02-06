<script lang="ts">
  /**
   * ToolDebugInfo
   *
   * Collapsible panel showing tool execution details:
   * - Tool inputs
   * - Internal API calls
   * - HTTP request/response for user-defined tools
   * - Validation errors
   * - Error details with stack traces
   * - Copy buttons for each section
   */
  import { captureException } from "$lib/sentry";
  import type { ToolDebugInfo } from "./types";

  export let debugInfo: ToolDebugInfo | undefined = undefined;
  export let toolName: string = "";
  export let success: boolean = false;
  export let executionTime: number | undefined = undefined;

  let isOpen = false;
  let copiedSection: string | null = null;
  let expandedSections: Set<string> = new Set();

  const MAX_PAYLOAD_LENGTH = 5000;

  $: effectiveExecutionTime = executionTime || debugInfo?.executionTime;
  $: isSuccessful = success === true;

  function toggle() {
    isOpen = !isOpen;
  }

  async function copyToClipboard(text: string, section: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedSection = section;
      setTimeout(() => (copiedSection = null), 2000);
    } catch (err) {
      captureException(err, {
        tags: { feature: "tool-debug-info" },
        extra: { action: "copy-to-clipboard", section },
      });
    }
  }

  function formatJson(obj: unknown): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  function truncateJson(obj: unknown, maxLength: number = MAX_PAYLOAD_LENGTH): { content: string; isTruncated: boolean } {
    const fullContent = formatJson(obj);

    if (fullContent.length <= maxLength) {
      return { content: fullContent, isTruncated: false };
    }

    let truncated = fullContent.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf("\n");
    if (lastNewline > maxLength * 0.8) {
      truncated = truncated.substring(0, lastNewline);
    }

    truncated += `\n\n... [truncated - ${fullContent.length - maxLength} more characters]`;

    return { content: truncated, isTruncated: true };
  }

  function toggleExpanded(sectionId: string) {
    if (expandedSections.has(sectionId)) {
      expandedSections.delete(sectionId);
    } else {
      expandedSections.add(sectionId);
    }
    expandedSections = expandedSections; // Trigger reactivity
  }

  function getDisplayContent(data: unknown, sectionId: string): { content: string; isTruncated: boolean } {
    if (expandedSections.has(sectionId)) {
      return { content: formatJson(data), isTruncated: false };
    }
    return truncateJson(data);
  }

  function isErrorStatus(status: string | number | undefined): boolean {
    if (typeof status === "string") return status === "error";
    if (typeof status === "number") return status >= 400;
    return false;
  }

  // Redact sensitive data
  function redactSensitiveData(obj: unknown): unknown {
    if (!obj || typeof obj !== "object") return obj;
    
    const sensitiveKeys = ["password", "secret", "token", "api_key", "apikey", "authorization", "auth"];
    const result: Record<string, unknown> = { ...obj as Record<string, unknown> };
    
    for (const key of Object.keys(result)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        result[key] = "[REDACTED]";
      } else if (typeof result[key] === "object" && result[key] !== null) {
        result[key] = redactSensitiveData(result[key]);
      }
    }
    
    return result;
  }

  $: redactedDebugInfo = debugInfo ? redactSensitiveData(debugInfo) as ToolDebugInfo : undefined;
</script>

{#if debugInfo}
  <div class="tool-debug-info" class:error={!isSuccessful} class:success={isSuccessful}>
    <!-- Header / Trigger -->
    <button class="debug-header" on:click={toggle}>
      <div class="header-left">
        {#if isSuccessful}
          <svg class="header-icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        {:else}
          <svg class="header-icon bug" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="6" height="6" rx="1" />
            <path d="M5 9h4M15 9h4M5 15h4M15 15h4" />
            <path d="M12 3v3M12 18v3" />
          </svg>
        {/if}
        <span class="header-title">
          {isSuccessful
            ? `Tool Execution Details${toolName ? ` for ${toolName}` : ""}`
            : `Debug Info${toolName ? ` for ${toolName}` : ""}`}
        </span>
        {#if effectiveExecutionTime}
          <span class="execution-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {Math.round(effectiveExecutionTime)}ms
          </span>
        {/if}
      </div>
      <svg class="chevron" class:open={isOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Content -->
    {#if isOpen && redactedDebugInfo}
      <div class="debug-content">
        <!-- Tool Inputs Section -->
        {#if redactedDebugInfo.toolInputs}
          {@const { content, isTruncated } = getDisplayContent(redactedDebugInfo.toolInputs, "toolInputs")}
          <div class="section">
            <div class="section-header">
              <h4>Tool Inputs</h4>
              <button
                class="copy-btn"
                on:click={() => copyToClipboard(formatJson(redactedDebugInfo?.toolInputs), "inputs")}
              >
                {#if copiedSection === "inputs"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="json-content">
              <pre>{content}</pre>
              {#if isTruncated}
                <button class="expand-btn" on:click={() => toggleExpanded("toolInputs")}>
                  Show full content
                </button>
              {:else if expandedSections.has("toolInputs")}
                <button class="expand-btn" on:click={() => toggleExpanded("toolInputs")}>
                  Show less
                </button>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Internal Requests Section -->
        {#if redactedDebugInfo.internalRequests && redactedDebugInfo.internalRequests.length > 0}
          <div class="section">
            <h4>Internal API Calls</h4>
            {#each redactedDebugInfo.internalRequests as req, index}
              {@const isReqError = !!req.response?.error || (typeof req.response?.status === "number" && req.response.status >= 400)}
              <div class="internal-request" class:error={isReqError}>
                <div class="request-badges">
                  <span class="badge">{req.service}</span>
                  {#if req.method}
                    <span class="badge">{req.method}</span>
                  {/if}
                  {#if isReqError}
                    <span class="badge error">Failed</span>
                  {/if}
                </div>
                {#if req.url}
                  <div class="request-url">{req.url}</div>
                {/if}
                {#if req.request}
                  {@const reqContent = getDisplayContent(req.request, `internalRequest-${index}`)}
                  <details>
                    <summary>Request Details</summary>
                    <pre>{reqContent.content}</pre>
                  </details>
                {/if}
                {#if req.response}
                  {@const respContent = getDisplayContent(req.response, `internalResponse-${index}`)}
                  <details>
                    <summary>Response Details</summary>
                    <pre>{respContent.content}</pre>
                  </details>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- HTTP Request Section (user-defined tools) -->
        {#if redactedDebugInfo.request}
          <div class="section">
            <div class="section-header">
              <h4 class:error-text={!isSuccessful}>Request</h4>
              <button
                class="copy-btn"
                on:click={() => copyToClipboard(formatJson(redactedDebugInfo?.request), "request")}
              >
                {#if copiedSection === "request"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="json-content" class:error-border={!isSuccessful}>
              {#if redactedDebugInfo.request.method && redactedDebugInfo.request.url}
                <div class="http-line">
                  <span class="badge">{redactedDebugInfo.request.method}</span>
                  <span class="url">{redactedDebugInfo.request.url}</span>
                </div>
              {/if}
              {#if redactedDebugInfo.request.headers}
                <details>
                  <summary>Headers</summary>
                  <pre>{formatJson(redactedDebugInfo.request.headers)}</pre>
                </details>
              {/if}
              {#if redactedDebugInfo.request.data}
                <details>
                  <summary>Body</summary>
                  <pre>{formatJson(redactedDebugInfo.request.data)}</pre>
                </details>
              {/if}
              {#if redactedDebugInfo.request.params}
                <details>
                  <summary>Query Parameters</summary>
                  <pre>{formatJson(redactedDebugInfo.request.params)}</pre>
                </details>
              {/if}
            </div>
          </div>
        {/if}

        <!-- HTTP Response Section -->
        {#if redactedDebugInfo.response}
          {@const responseError = isErrorStatus(redactedDebugInfo.response.status)}
          <div class="section">
            <div class="section-header">
              <h4 class:error-text={responseError}>Response</h4>
              <button
                class="copy-btn"
                on:click={() => copyToClipboard(formatJson(redactedDebugInfo?.response), "response")}
              >
                {#if copiedSection === "response"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="json-content" class:error-border={responseError}>
              {#if redactedDebugInfo.response.status}
                <div class="status-line">
                  <span class="badge" class:error={responseError} class:success={!responseError}>
                    {redactedDebugInfo.response.status}
                  </span>
                  {#if redactedDebugInfo.response.statusText}
                    <span class="status-text">{redactedDebugInfo.response.statusText}</span>
                  {/if}
                </div>
              {/if}
              {#if redactedDebugInfo.response.headers}
                <details>
                  <summary>Headers</summary>
                  <pre>{formatJson(redactedDebugInfo.response.headers)}</pre>
                </details>
              {/if}
              {#if redactedDebugInfo.response.data}
                <details>
                  <summary>Body</summary>
                  <pre>{formatJson(redactedDebugInfo.response.data)}</pre>
                </details>
              {/if}
              {#if redactedDebugInfo.response.error}
                <details>
                  <summary class="error-text">Error Details</summary>
                  <pre>{formatJson(redactedDebugInfo.response.error)}</pre>
                </details>
              {/if}
              {#if redactedDebugInfo.response.result}
                <details>
                  <summary>Result</summary>
                  <pre>{formatJson(redactedDebugInfo.response.result)}</pre>
                </details>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Error Section -->
        {#if redactedDebugInfo.error}
          <div class="section">
            <div class="section-header">
              <h4 class="error-text">Error Details</h4>
              <button
                class="copy-btn"
                on:click={() => copyToClipboard(formatJson(redactedDebugInfo?.error), "error")}
              >
                {#if copiedSection === "error"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="json-content error-border">
              {#if redactedDebugInfo.error.message}
                <div class="error-message">
                  <strong>Message:</strong> {redactedDebugInfo.error.message}
                </div>
              {/if}
              {#if redactedDebugInfo.error.code}
                <div class="error-code">
                  <strong>Code:</strong> {redactedDebugInfo.error.code}
                </div>
              {/if}
              {#if redactedDebugInfo.error.stack}
                <details>
                  <summary>Stack Trace</summary>
                  <pre>{redactedDebugInfo.error.stack}</pre>
                </details>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Original Error Section -->
        {#if redactedDebugInfo.originalError}
          <div class="section">
            <div class="section-header">
              <h4 class="error-text">Original Error</h4>
              <button
                class="copy-btn"
                on:click={() => copyToClipboard(formatJson(redactedDebugInfo?.originalError), "original")}
              >
                {#if copiedSection === "original"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                {/if}
              </button>
            </div>
            <div class="json-content error-border">
              <details>
                <summary>Full Stack Trace</summary>
                <pre>{redactedDebugInfo.originalError.stack || redactedDebugInfo.originalError.message}</pre>
              </details>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .tool-debug-info {
    margin-top: var(--space-2);
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .tool-debug-info.error {
    border-color: #fecaca;
    background: #fef2f2;
  }

  .debug-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .tool-debug-info.success .debug-header:hover {
    background: hsl(var(--muted));
  }

  .tool-debug-info.error .debug-header:hover {
    background: #fee2e2;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .header-icon {
    width: 16px;
    height: 16px;
  }

  .header-icon.info {
    color: hsl(var(--muted-foreground));
  }

  .header-icon.bug {
    color: #dc2626;
  }

  .header-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .tool-debug-info.error .header-title {
    color: #7f1d1d;
  }

  .execution-time {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: var(--text-xs);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
  }

  .execution-time svg {
    width: 12px;
    height: 12px;
  }

  .chevron {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s ease;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .tool-debug-info.error .chevron {
    color: #dc2626;
  }

  .debug-content {
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .tool-debug-info.error .debug-content {
    border-color: #fecaca;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section h4 {
    font-size: var(--text-sm);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .section h4.error-text {
    color: #7f1d1d;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
  }

  .copy-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .copy-btn svg {
    width: 12px;
    height: 12px;
  }

  .json-content {
    padding: var(--space-3);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
  }

  .json-content.error-border {
    border-color: #fecaca;
  }

  .json-content pre {
    margin: 0;
    font-size: var(--text-xs);
    font-family: ui-monospace, monospace;
    white-space: pre-wrap;
    word-break: break-all;
    color: hsl(var(--foreground));
  }

  .expand-btn {
    margin-top: var(--space-1);
    padding: 0;
    background: transparent;
    border: none;
    font-size: var(--text-xs);
    color: hsl(217 91% 60%);
    cursor: pointer;
  }

  .expand-btn:hover {
    color: hsl(217 91% 50%);
  }

  .internal-request {
    padding: var(--space-3);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .internal-request.error {
    border-color: #fecaca;
  }

  .request-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .badge {
    display: inline-flex;
    padding: 2px 8px;
    font-size: var(--text-xs);
    font-weight: 500;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    color: hsl(var(--foreground));
  }

  .badge.error {
    background: #fee2e2;
    border-color: #fecaca;
    color: #991b1b;
  }

  .badge.success {
    background: #dcfce7;
    border-color: #bbf7d0;
    color: #166534;
  }

  .request-url {
    font-size: var(--text-xs);
    font-family: ui-monospace, monospace;
    word-break: break-all;
    color: hsl(var(--foreground));
  }

  .http-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .http-line .url {
    font-family: ui-monospace, monospace;
    font-size: var(--text-xs);
    word-break: break-all;
    color: hsl(var(--foreground));
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .status-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .error-message,
  .error-code {
    font-size: var(--text-xs);
    font-family: ui-monospace, monospace;
    margin-bottom: var(--space-1);
  }

  .error-message {
    color: #b91c1c;
  }

  .error-code {
    color: hsl(var(--foreground));
  }

  details {
    cursor: pointer;
    margin-top: var(--space-2);
  }

  details summary {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    transition: color 0.15s ease;
  }

  details summary:hover {
    color: hsl(var(--foreground));
  }

  details summary.error-text {
    color: #dc2626;
  }

  details summary.error-text:hover {
    color: #991b1b;
  }

  details[open] summary {
    margin-bottom: var(--space-2);
  }
</style>
