<script lang="ts">
  import { slide, fade } from "svelte/transition";
  import { Button } from "$lib/design-system";

  // Props
  export let applicationId: string;
  export let url: string = "";
  export let method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET";
  export let headers: Array<{
    key: string;
    value?: string;
    sampleValue?: string;
    isAIGenerated?: boolean;
    valueSource?: "STATIC" | "AI_GENERATED" | "SYSTEM_VARIABLE" | "VARIABLE";
    variableName?: string;
  }> = [];
  export let queryParams: typeof headers = [];
  export let bodyParams: typeof headers = [];
  export let pathParams: typeof headers = [];

  // State
  type TestStatus = "idle" | "loading" | "success" | "error";
  let status: TestStatus = "idle";
  let testResult: {
    success: boolean;
    response: unknown;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    duration: number;
    request: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: Record<string, string>;
    };
  } | null = null;
  let errorMessage = "";
  let abortController: AbortController | null = null;
  let activeTab: "response" | "headers" | "request" = "response";

  // Storage key for persisting results
  $: storageKey = applicationId
    ? `test-action-result-${applicationId}-${url}`
    : null;

  // Load persisted result on mount
  $: if (storageKey && typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        testResult = parsed.result;
        status = parsed.status;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Save result to localStorage
  function persistResult() {
    if (storageKey && testResult && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ result: testResult, status })
        );
      } catch {
        // Ignore storage errors
      }
    }
  }

  async function runTest() {
    if (!url.trim()) {
      errorMessage = "URL is required";
      status = "error";
      return;
    }

    // Cancel any existing request
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    status = "loading";
    errorMessage = "";
    testResult = null;

    try {
      const response = await fetch(
        `/api/applications/${applicationId}/test-action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          signal: abortController.signal,
          body: JSON.stringify({
            url,
            method,
            headers: headers.filter((h) => h.key.trim()),
            queryParams: queryParams.filter((q) => q.key.trim()),
            bodyParams: bodyParams.filter((b) => b.key.trim()),
            pathParams: pathParams.filter((p) => p.key.trim()),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      testResult = data;
      status = data.success ? "success" : "error";
      if (!data.success && typeof data.response === "string") {
        errorMessage = data.response;
      }
      persistResult();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        status = "idle";
        return;
      }
      errorMessage = err instanceof Error ? err.message : "Request failed";
      status = "error";
    } finally {
      abortController = null;
    }
  }

  function cancelRequest() {
    if (abortController) {
      abortController.abort();
      abortController = null;
      status = "idle";
    }
  }

  function clearResult() {
    testResult = null;
    status = "idle";
    errorMessage = "";
    if (storageKey && typeof localStorage !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }

  function formatJson(value: unknown): string {
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, null, 2);
  }

  // Status colors
  $: statusColor =
    status === "success"
      ? "var(--success)"
      : status === "error"
        ? "var(--destructive)"
        : status === "loading"
          ? "var(--primary)"
          : "var(--muted-foreground)";

  // HTTP status color
  function getHttpStatusColor(code: number): string {
    if (code >= 200 && code < 300) return "var(--success)";
    if (code >= 300 && code < 400) return "var(--warning, #f59e0b)";
    if (code >= 400) return "var(--destructive)";
    return "var(--muted-foreground)";
  }
</script>

<div class="request-tester">
  <div class="tester-header">
    <h4>Test Request</h4>
    <div class="tester-actions">
      {#if status === "loading"}
        <Button variant="ghost" size="sm" on:click={cancelRequest}>
          Cancel
        </Button>
      {:else}
        <Button
          variant="primary"
          size="sm"
          on:click={runTest}
          disabled={!url.trim()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Run Test
        </Button>
      {/if}
    </div>
  </div>

  {#if status === "loading"}
    <div class="loading-state" transition:fade={{ duration: 150 }}>
      <div class="spinner"></div>
      <span>Sending request...</span>
    </div>
  {/if}

  {#if status === "error" && errorMessage && !testResult}
    <div class="error-state" transition:slide={{ duration: 150 }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{errorMessage}</span>
    </div>
  {/if}

  {#if testResult}
    <div class="result-container" transition:slide={{ duration: 200 }}>
      <div class="result-header">
        <div class="status-badge" style="--status-color: {statusColor}">
          <span
            class="http-status"
            style="color: {getHttpStatusColor(testResult.status)}"
          >
            {testResult.status}
          </span>
          <span class="status-text">{testResult.statusText}</span>
        </div>
        <div class="result-meta">
          <span class="duration">{testResult.duration}ms</span>
          <button class="clear-btn" on:click={clearResult} title="Clear result">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div class="result-tabs">
        <button
          class="tab"
          class:active={activeTab === "response"}
          on:click={() => (activeTab = "response")}
        >
          Response
        </button>
        <button
          class="tab"
          class:active={activeTab === "headers"}
          on:click={() => (activeTab = "headers")}
        >
          Headers
        </button>
        <button
          class="tab"
          class:active={activeTab === "request"}
          on:click={() => (activeTab = "request")}
        >
          Request
        </button>
      </div>

      <div class="result-content">
        {#if activeTab === "response"}
          <pre class="result-pre">{formatJson(testResult.response)}</pre>
        {:else if activeTab === "headers"}
          <div class="headers-list">
            {#each Object.entries(testResult.headers) as [key, value]}
              <div class="header-row">
                <span class="header-key">{key}</span>
                <span class="header-value">{value}</span>
              </div>
            {/each}
          </div>
        {:else if activeTab === "request"}
          <div class="request-info">
            <div class="request-row">
              <span class="request-label">Method</span>
              <span class="request-value">{testResult.request.method}</span>
            </div>
            <div class="request-row">
              <span class="request-label">URL</span>
              <span class="request-value url">{testResult.request.url}</span>
            </div>
            {#if testResult.request.headers && Object.keys(testResult.request.headers).length > 0}
              <div class="request-section">
                <span class="request-label">Headers</span>
                <pre class="request-pre">{formatJson(
                    testResult.request.headers
                  )}</pre>
              </div>
            {/if}
            {#if testResult.request.body && Object.keys(testResult.request.body).length > 0}
              <div class="request-section">
                <span class="request-label">Body</span>
                <pre class="request-pre">{formatJson(
                    testResult.request.body
                  )}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .request-tester {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    overflow: hidden;
  }

  .tester-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--muted);
  }

  .tester-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--foreground);
  }

  .tester-actions {
    display: flex;
    gap: 8px;
  }

  .tester-actions :global(button) {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .loading-state {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 24px;
    color: var(--muted-foreground);
    font-size: 14px;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    color: var(--destructive);
    background: color-mix(in srgb, var(--destructive) 10%, transparent);
    font-size: 14px;
  }

  .result-container {
    display: flex;
    flex-direction: column;
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .http-status {
    font-weight: 700;
    font-size: 14px;
    font-family: var(--font-mono, monospace);
  }

  .status-text {
    font-size: 13px;
    color: var(--muted-foreground);
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .duration {
    font-size: 12px;
    color: var(--muted-foreground);
    font-family: var(--font-mono, monospace);
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .clear-btn:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .result-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 16px;
  }

  .tab {
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted-foreground);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--foreground);
  }

  .tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }

  .result-content {
    padding: 16px;
    max-height: 300px;
    overflow: auto;
  }

  .result-pre {
    margin: 0;
    padding: 12px;
    background: var(--muted);
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--foreground);
    line-height: 1.5;
  }

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .header-row {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    background: var(--muted);
    border-radius: 6px;
    font-size: 12px;
  }

  .header-key {
    font-weight: 600;
    color: var(--foreground);
    min-width: 150px;
    font-family: var(--font-mono, monospace);
  }

  .header-value {
    color: var(--muted-foreground);
    word-break: break-all;
    font-family: var(--font-mono, monospace);
  }

  .request-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .request-row {
    display: flex;
    gap: 12px;
    align-items: baseline;
  }

  .request-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted-foreground);
    min-width: 60px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .request-value {
    font-size: 13px;
    color: var(--foreground);
    font-family: var(--font-mono, monospace);
  }

  .request-value.url {
    word-break: break-all;
  }

  .request-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .request-pre {
    margin: 0;
    padding: 12px;
    background: var(--muted);
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--foreground);
    line-height: 1.5;
  }
</style>
