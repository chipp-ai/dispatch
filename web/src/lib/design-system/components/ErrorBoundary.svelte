<script lang="ts">
  import { onMount } from "svelte";
  import { AlertTriangle, RefreshCw, Copy, Check } from "lucide-svelte";
  import Button from "./Button.svelte";
  import { errorStore, type AppError } from "../stores/error";
  import { captureException } from "$lib/sentry";

  let error: AppError | null = null;
  let copied = false;

  // Subscribe to error store
  errorStore.subscribe((value) => {
    error = value;
  });

  onMount(() => {
    // Catch unhandled errors
    const handleError = (event: ErrorEvent) => {
      captureException(event.error, {
        tags: { source: "window.onerror" },
        extra: { message: event.message },
      });
      errorStore.set({
        message: event.message || "An unexpected error occurred",
        stack: event.error?.stack,
      });
      event.preventDefault(); // Prevent default error handling
    };

    // Catch unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        tags: { source: "unhandledrejection" },
      });
      const message = event.reason?.message || String(event.reason) || "An unexpected error occurred";
      errorStore.set({
        message,
        stack: event.reason?.stack,
      });
      event.preventDefault();
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  });

  function handleRefresh() {
    errorStore.set(null);
    window.location.reload();
  }

  function handleDismiss() {
    errorStore.set(null);
  }

  async function copyError() {
    if (!error) return;
    const text = `Error: ${error.message}\n\nStack trace:\n${error.stack || "No stack trace available"}`;
    await navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if error}
  <div class="error-overlay">
    <div class="error-container">
      <div class="error-icon">
        <AlertTriangle size={48} />
      </div>

      <h1>Something went wrong</h1>
      <p class="error-message">{error.message}</p>

      {#if error.stack}
        <details class="error-details">
          <summary>Stack trace</summary>
          <pre>{error.stack}</pre>
        </details>
      {/if}

      <div class="error-actions">
        <Button variant="primary" on:click={handleRefresh}>
          <RefreshCw size={16} />
          Refresh Page
        </Button>
        <Button variant="outline" on:click={handleDismiss}>
          Try to Continue
        </Button>
        <Button variant="ghost" on:click={copyError}>
          {#if copied}
            <Check size={16} />
            Copied!
          {:else}
            <Copy size={16} />
            Copy Error
          {/if}
        </Button>
      </div>

      <p class="error-hint">
        If this keeps happening, try clearing your browser cache or contact support.
      </p>
    </div>
  </div>
{/if}

<slot />

<style>
  .error-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background) / 0.95);
    backdrop-filter: blur(4px);
    padding: var(--space-4);
  }

  .error-container {
    max-width: 600px;
    width: 100%;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
  }

  .error-icon {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-4);
    color: hsl(0 84.2% 60.2%);
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .error-message {
    font-size: var(--text-base);
    color: hsl(0 84.2% 60.2%);
    margin: 0 0 var(--space-6) 0;
    word-break: break-word;
  }

  .error-details {
    text-align: left;
    margin-bottom: var(--space-6);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .error-details summary {
    padding: var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
  }

  .error-details summary:hover {
    background: hsl(var(--muted));
  }

  .error-details pre {
    margin: 0;
    padding: var(--space-4);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
    border-top: 1px solid hsl(var(--border));
  }

  .error-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }

  .error-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }
</style>
