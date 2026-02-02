<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { Card, Button, Spinner, Badge, toasts } from "$lib/design-system";
  import { user } from "../../../stores/auth";
  import {
    Bot,
    Database,
    MessageSquare,
    Users,
    Zap,
    Clock,
    AlertTriangle,
    Download,
    ArrowRight,
    CheckCircle,
    XCircle,
  } from "lucide-svelte";

  interface ImportPreview {
    developerId: number;
    email: string;
    name: string | null;
    appsCount: number;
    knowledgeSourcesCount: number;
    customActionsCount: number;
    chatSessionsCount: number;
    messagesCount: number;
    consumersCount: number;
    apps: Array<{
      id: number;
      name: string;
      chatCount: number;
      knowledgeSourceCount: number;
      customActionCount: number;
    }>;
    estimatedTimeMinutes: number;
  }

  interface CheckResult {
    hasExistingData: boolean;
    developerId?: number;
    appsCount?: number;
  }

  type State = "checking" | "no-data" | "preview" | "confirm" | "importing" | "complete" | "error";

  let state: State = "checking";
  let checkResult: CheckResult | null = null;
  let preview: ImportPreview | null = null;
  let error = "";
  let importProgress = 0;
  let showOverwriteWarning = false;

  onMount(async () => {
    await checkForExistingData();
  });

  async function checkForExistingData() {
    try {
      state = "checking";
      error = "";

      const res = await fetch("/api/import/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error("Failed to check for existing data");
      }

      const { data } = await res.json();
      checkResult = data;

      if (data.hasExistingData && data.developerId) {
        await loadPreview(data.developerId);
      } else {
        state = "no-data";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to check for data";
      state = "error";
    }
  }

  async function loadPreview(developerId: number) {
    try {
      const res = await fetch(`/api/import/preview/${developerId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load import preview");
      }

      const { data } = await res.json();
      preview = data;
      state = "preview";
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load preview";
      state = "error";
    }
  }

  function handleImportClick() {
    showOverwriteWarning = true;
    state = "confirm";
  }

  function cancelImport() {
    showOverwriteWarning = false;
    state = "preview";
  }

  async function startImport() {
    if (!checkResult?.developerId) return;

    try {
      state = "importing";
      importProgress = 0;

      const res = await fetch("/api/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ developerId: checkResult.developerId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start import");
      }

      const { data } = await res.json();

      // Navigate to import progress page
      push(`/import/progress?sessionId=${data.importSessionId}`);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to start import";
      state = "error";
      toasts.error("Import failed", error);
    }
  }

  function formatNumber(num: number): string {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Import Data</h1>
  <p class="page-subtitle">Import your existing data from app.chipp.ai.</p>
</div>

<Card padding="lg" class="import-card">
  {#if state === "checking"}
    <div class="centered-state">
      <Spinner size="lg" />
      <p class="state-text">Checking for existing data...</p>
    </div>
  {:else if state === "error"}
    <div class="centered-state error">
      <XCircle size={48} />
      <h2>Something went wrong</h2>
      <p class="state-text">{error}</p>
      <Button variant="outline" on:click={checkForExistingData}>
        Try again
      </Button>
    </div>
  {:else if state === "no-data"}
    <div class="centered-state">
      <CheckCircle size={48} />
      <h2>No data to import</h2>
      <p class="state-text">
        We couldn't find any existing data associated with <strong>{$user?.email}</strong> on the legacy Chipp platform.
      </p>
      <p class="state-text muted">
        If you believe this is incorrect, please contact support.
      </p>
    </div>
  {:else if state === "preview" && preview}
    <div class="preview-section">
      <div class="preview-header">
        <Download size={24} />
        <div>
          <h2>Data available for import</h2>
          <p class="preview-email">From: {preview.email}</p>
        </div>
      </div>

      <!-- Summary Grid -->
      <div class="summary-grid">
        <div class="summary-card">
          <Bot size={20} />
          <div class="summary-info">
            <span class="summary-count">{preview.appsCount}</span>
            <span class="summary-label">Apps</span>
          </div>
        </div>

        <div class="summary-card">
          <Database size={20} />
          <div class="summary-info">
            <span class="summary-count">{preview.knowledgeSourcesCount}</span>
            <span class="summary-label">Knowledge Sources</span>
          </div>
        </div>

        <div class="summary-card">
          <Zap size={20} />
          <div class="summary-info">
            <span class="summary-count">{preview.customActionsCount}</span>
            <span class="summary-label">Custom Actions</span>
          </div>
        </div>

        <div class="summary-card">
          <MessageSquare size={20} />
          <div class="summary-info">
            <span class="summary-count">{formatNumber(preview.chatSessionsCount)}</span>
            <span class="summary-label">Conversations</span>
          </div>
        </div>

        <div class="summary-card">
          <Users size={20} />
          <div class="summary-info">
            <span class="summary-count">{formatNumber(preview.consumersCount)}</span>
            <span class="summary-label">End Users</span>
          </div>
        </div>

        <div class="summary-card time-card">
          <Clock size={20} />
          <div class="summary-info">
            <span class="summary-count">~{preview.estimatedTimeMinutes}</span>
            <span class="summary-label">Minutes</span>
          </div>
        </div>
      </div>

      <!-- Apps list -->
      {#if preview.apps.length > 0}
        <div class="apps-section">
          <h3>Apps to import</h3>
          <div class="apps-list">
            {#each preview.apps.slice(0, 5) as app}
              <div class="app-item">
                <div class="app-icon">
                  <Bot size={14} />
                </div>
                <div class="app-info">
                  <span class="app-name">{app.name}</span>
                  <div class="app-stats">
                    {#if app.chatCount > 0}
                      <Badge variant="outline">{app.chatCount} chats</Badge>
                    {/if}
                    {#if app.knowledgeSourceCount > 0}
                      <Badge variant="outline">{app.knowledgeSourceCount} sources</Badge>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
            {#if preview.apps.length > 5}
              <p class="apps-more">+{preview.apps.length - 5} more apps</p>
            {/if}
          </div>
        </div>
      {/if}

      <div class="actions">
        <Button on:click={handleImportClick}>
          Start Import
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  {:else if state === "confirm"}
    <div class="confirm-section">
      <div class="warning-banner">
        <AlertTriangle size={24} />
        <div>
          <h2>This will overwrite existing data</h2>
          <p>
            Importing will replace any apps, knowledge sources, and conversations
            that were previously imported. Your locally-created data will not be affected.
          </p>
        </div>
      </div>

      <div class="confirm-actions">
        <Button variant="outline" on:click={cancelImport}>
          Cancel
        </Button>
        <Button variant="danger" on:click={startImport}>
          Import and Overwrite
        </Button>
      </div>
    </div>
  {:else if state === "importing"}
    <div class="centered-state">
      <Spinner size="lg" />
      <h2>Starting import...</h2>
      <p class="state-text">You'll be redirected to the progress page.</p>
    </div>
  {/if}
</Card>

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }


  .centered-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-8) 0;
    gap: var(--space-3);
  }

  .centered-state h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .centered-state :global(svg) {
    color: var(--brand-color);
  }

  .centered-state.error :global(svg) {
    color: hsl(var(--destructive));
  }

  .state-text {
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 400px;
  }

  .state-text.muted {
    font-size: var(--text-sm);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .preview-header :global(svg) {
    color: var(--brand-color);
  }

  .preview-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .preview-email {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-md);
  }

  .summary-card :global(svg) {
    color: var(--brand-color);
  }

  .time-card :global(svg) {
    color: hsl(var(--muted-foreground));
  }

  .summary-info {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .summary-count {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .summary-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .apps-section h3 {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
  }

  .apps-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .app-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
  }

  .app-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    border-radius: var(--radius-sm);
  }

  .app-info {
    flex: 1;
    min-width: 0;
  }

  .app-name {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .apps-more {
    text-align: center;
    padding: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .actions :global(button) {
    gap: var(--space-2);
  }

  .confirm-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .warning-banner {
    display: flex;
    gap: var(--space-4);
    padding: var(--space-4);
    background: hsl(var(--warning) / 0.1);
    border: 1px solid hsl(var(--warning) / 0.3);
    border-radius: var(--radius-md);
  }

  .warning-banner :global(svg) {
    color: hsl(var(--warning));
    flex-shrink: 0;
    margin-top: 2px;
  }

  .warning-banner h2 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .warning-banner p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .warning-banner {
      flex-direction: column;
      align-items: flex-start;
    }

    .confirm-actions {
      flex-direction: column-reverse;
    }

    .confirm-actions :global(button) {
      width: 100%;
    }
  }
</style>
