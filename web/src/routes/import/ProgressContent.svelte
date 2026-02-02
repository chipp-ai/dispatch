<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { Button, Progress, Spinner } from "$lib/design-system";
  import {
    CheckCircle2,
    Circle,
    XCircle,
    Loader2,
    AlertTriangle,
    ArrowRight,
  } from "lucide-svelte";

  export let importSessionId: string;

  const dispatch = createEventDispatcher<{
    complete: void;
    error: { message: string };
  }>();

  interface ImportProgress {
    entityType: string;
    totalCount: number;
    completedCount: number;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
    errorMessage: string | null;
  }

  interface ImportSession {
    id: string;
    status: "pending" | "running" | "completed" | "failed";
    currentPhase: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }

  let session: ImportSession | null = null;
  let progress: ImportProgress[] = [];
  let loading = true;
  let error = "";
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Entity type labels for display
  const ENTITY_LABELS: Record<string, string> = {
    organization: "Organization",
    workspace: "Workspace",
    application: "Apps",
    knowledge_source: "Knowledge Sources",
    text_chunk: "Text Chunks",
    custom_action: "Custom Actions",
    consumer: "Users",
    chat_session: "Conversations",
    message: "Messages",
  };

  // Order for display
  const ENTITY_ORDER = [
    "organization",
    "workspace",
    "application",
    "knowledge_source",
    "custom_action",
    "consumer",
    "chat_session",
    "message",
  ];

  onMount(() => {
    loadStatus();
    // Poll for updates every 2 seconds
    pollInterval = setInterval(loadStatus, 2000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  async function loadStatus() {
    try {
      const res = await fetch(`/api/import/status/${importSessionId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load import status");
      }

      const { data } = await res.json();
      session = data.session;
      progress = data.progress;

      // Stop polling when complete or failed
      if (session?.status === "completed" || session?.status === "failed") {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }

        if (session.status === "completed") {
          // Small delay before dispatching complete
          setTimeout(() => dispatch("complete"), 1000);
        }
      }

      error = "";
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load status";
      // Stop polling on error
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    } finally {
      loading = false;
    }
  }

  function getEntityStatus(entityType: string): ImportProgress | undefined {
    return progress.find((p) => p.entityType === entityType);
  }

  function calculateOverallProgress(): number {
    if (progress.length === 0) return 0;

    const totalItems = progress.reduce((sum, p) => sum + p.totalCount, 0);
    const completedItems = progress.reduce((sum, p) => sum + p.completedCount, 0);

    if (totalItems === 0) return 0;
    return Math.round((completedItems / totalItems) * 100);
  }

  function getStatusIcon(status: ImportProgress["status"]) {
    switch (status) {
      case "completed":
        return CheckCircle2;
      case "running":
        return Loader2;
      case "failed":
        return XCircle;
      case "skipped":
        return Circle;
      default:
        return Circle;
    }
  }

  function getStatusColor(status: ImportProgress["status"]): string {
    switch (status) {
      case "completed":
        return "var(--color-success, #22c55e)";
      case "running":
        return "var(--brand-color)";
      case "failed":
        return "hsl(var(--destructive))";
      case "skipped":
        return "hsl(var(--muted-foreground))";
      default:
        return "hsl(var(--muted-foreground))";
    }
  }

  function handleContinue() {
    dispatch("complete");
  }
</script>

<div class="progress-content">
  {#if loading}
    <div class="loading-state">
      <Spinner size="lg" />
      <p>Loading import status...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <AlertTriangle size={48} />
      <h1>Something went wrong</h1>
      <p class="subtitle">{error}</p>
      <Button variant="outline" on:click={loadStatus}>Try again</Button>
    </div>
  {:else if session}
    <div class="progress-header">
      {#if session.status === "completed"}
        <div class="status-icon success">
          <CheckCircle2 size={48} />
        </div>
        <h1>Import Complete!</h1>
        <p class="subtitle">Your data has been successfully imported.</p>
      {:else if session.status === "failed"}
        <div class="status-icon error">
          <XCircle size={48} />
        </div>
        <h1>Import Failed</h1>
        <p class="subtitle">{session.errorMessage || "An error occurred during import."}</p>
      {:else}
        <h1>Importing your data...</h1>
        <p class="subtitle">This may take a few minutes. You can close this page and we'll continue in the background.</p>
      {/if}
    </div>

    {#if session.status !== "completed"}
      <!-- Overall Progress Bar -->
      <div class="overall-progress">
        <div class="progress-header-row">
          <span>Overall Progress</span>
          <span>{calculateOverallProgress()}%</span>
        </div>
        <Progress value={calculateOverallProgress()} />
      </div>
    {/if}

    <!-- Entity Progress List -->
    <div class="entity-list">
      {#each ENTITY_ORDER as entityType}
        {@const entityProgress = getEntityStatus(entityType)}
        {#if entityProgress && entityProgress.totalCount > 0}
          <div class="entity-item" class:active={entityProgress.status === "running"}>
            <div class="entity-status" style="color: {getStatusColor(entityProgress.status)}">
              <svelte:component
                this={getStatusIcon(entityProgress.status)}
                size={18}
                class={entityProgress.status === "running" ? "spinning" : ""}
              />
            </div>
            <div class="entity-info">
              <span class="entity-name">{ENTITY_LABELS[entityType] || entityType}</span>
              {#if entityProgress.status === "running" || entityProgress.status === "completed"}
                <span class="entity-count">
                  {entityProgress.completedCount} / {entityProgress.totalCount}
                </span>
              {:else if entityProgress.status === "failed"}
                <span class="entity-error">{entityProgress.errorMessage || "Failed"}</span>
              {:else if entityProgress.status === "skipped"}
                <span class="entity-skipped">Skipped</span>
              {/if}
            </div>
            {#if entityProgress.status === "running" || entityProgress.status === "completed"}
              <div class="entity-progress-bar">
                <Progress
                  value={entityProgress.totalCount > 0
                    ? (entityProgress.completedCount / entityProgress.totalCount) * 100
                    : 0}
                />
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    <!-- Actions -->
    {#if session.status === "completed"}
      <div class="actions">
        <Button on:click={handleContinue}>
          Continue to Dashboard
          <ArrowRight size={16} />
        </Button>
      </div>
    {:else if session.status === "failed"}
      <div class="actions">
        <Button variant="outline" on:click={handleContinue}>
          Continue without importing
        </Button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .progress-content {
    max-width: 480px;
    margin: 0 auto;
  }

  .loading-state {
    text-align: center;
    padding: var(--space-8) 0;
  }

  .loading-state p {
    margin-top: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .error-state {
    text-align: center;
    padding: var(--space-8) 0;
  }

  .error-state :global(svg) {
    color: hsl(var(--destructive));
    margin-bottom: var(--space-4);
  }

  .progress-header {
    text-align: center;
    margin-bottom: var(--space-6);
  }

  .status-icon {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-4);
  }

  .status-icon.success :global(svg) {
    color: var(--color-success, #22c55e);
  }

  .status-icon.error :global(svg) {
    color: hsl(var(--destructive));
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .subtitle {
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 360px;
    margin-left: auto;
    margin-right: auto;
  }

  .overall-progress {
    margin-bottom: var(--space-6);
  }

  .progress-header-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .entity-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
    transition: background 0.2s;
  }

  .entity-item.active {
    background: hsl(var(--muted) / 0.5);
  }

  .entity-status {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .entity-status :global(.spinning) {
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

  .entity-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .entity-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .entity-count {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .entity-error {
    font-size: var(--text-xs);
    color: hsl(var(--destructive));
  }

  .entity-skipped {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .entity-progress-bar {
    width: 80px;
  }

  .actions {
    display: flex;
    justify-content: center;
  }

  .actions :global(button) {
    gap: var(--space-2);
  }

  @media (max-width: 480px) {
    .entity-item {
      grid-template-columns: auto 1fr;
    }

    .entity-progress-bar {
      display: none;
    }
  }
</style>
