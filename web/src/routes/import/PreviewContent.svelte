<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { Button, Spinner, Card, Badge } from "$lib/design-system";
  import {
    Bot,
    Database,
    MessageSquare,
    Users,
    Zap,
    Clock,
    ArrowRight,
    Check,
    Sparkles,
  } from "lucide-svelte";

  export let developerId: number;

  const dispatch = createEventDispatcher<{
    startImport: { developerId: number; appIds: number[] };
    skip: void;
  }>();

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

  let loading = true;
  let preview: ImportPreview | null = null;
  let error = "";
  let isStartingImport = false;

  // Selection state - track selected app IDs
  let selectedAppIds: Set<number> = new Set();

  // Initialize all apps as selected when preview loads
  $: if (preview?.apps && selectedAppIds.size === 0) {
    selectedAppIds = new Set(preview.apps.map((app) => app.id));
  }

  // Computed stats based on selection
  $: selectedApps = preview?.apps.filter((app) => selectedAppIds.has(app.id)) || [];
  $: selectedStats = {
    appsCount: selectedApps.length,
    knowledgeSourcesCount: selectedApps.reduce(
      (sum, app) => sum + app.knowledgeSourceCount,
      0
    ),
    customActionsCount: selectedApps.reduce(
      (sum, app) => sum + app.customActionCount,
      0
    ),
    chatSessionsCount: selectedApps.reduce((sum, app) => sum + app.chatCount, 0),
  };

  // Get display name and initials for avatar
  $: displayName = preview?.name || preview?.email?.split("@")[0] || "User";
  $: initials = getInitials(displayName);

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function toggleApp(appId: number) {
    if (selectedAppIds.has(appId)) {
      selectedAppIds.delete(appId);
    } else {
      selectedAppIds.add(appId);
    }
    selectedAppIds = selectedAppIds; // trigger reactivity
  }

  function selectAll() {
    if (preview?.apps) {
      selectedAppIds = new Set(preview.apps.map((app) => app.id));
    }
  }

  function selectNone() {
    selectedAppIds = new Set();
  }

  onMount(async () => {
    await loadPreview();
  });

  async function loadPreview() {
    try {
      loading = true;
      error = "";

      const res = await fetch(`/api/import/preview/${developerId}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load import preview");
      }

      const { data } = await res.json();
      preview = data;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load preview";
    } finally {
      loading = false;
    }
  }

  async function handleStartImport() {
    isStartingImport = true;
    dispatch("startImport", { developerId, appIds: [...selectedAppIds] });
  }

  function handleSkip() {
    dispatch("skip");
  }

  function formatNumber(num: number): string {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }
</script>

<div class="preview-content">
  {#if loading}
    <div class="loading-state">
      <Spinner size="lg" />
      <p>Loading your data...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <h1>Unable to load preview</h1>
      <p class="subtitle">{error}</p>
      <Button variant="outline" on:click={loadPreview}>Try again</Button>
    </div>
  {:else if preview}
    <div class="preview-header">
      <div class="avatar-container">
        <div class="avatar">
          <span class="avatar-initials">{initials}</span>
        </div>
        <div class="avatar-glow"></div>
      </div>
      <h1>Welcome back, {displayName}!</h1>
      <p class="subtitle">
        We found your existing data from Chipp. Select the apps you'd like to import.
      </p>
    </div>

    <!-- Summary Cards - updates based on selection -->
    <div class="summary-grid">
      <div class="summary-card">
        <Bot size={24} />
        <div class="summary-info">
          <span class="summary-count">{selectedStats.appsCount}</span>
          <span class="summary-label">Apps</span>
        </div>
      </div>

      <div class="summary-card">
        <Database size={24} />
        <div class="summary-info">
          <span class="summary-count">{selectedStats.knowledgeSourcesCount}</span>
          <span class="summary-label">Knowledge Sources</span>
        </div>
      </div>

      <div class="summary-card">
        <Zap size={24} />
        <div class="summary-info">
          <span class="summary-count">{selectedStats.customActionsCount}</span>
          <span class="summary-label">Custom Actions</span>
        </div>
      </div>

      <div class="summary-card">
        <MessageSquare size={24} />
        <div class="summary-info">
          <span class="summary-count">{formatNumber(selectedStats.chatSessionsCount)}</span>
          <span class="summary-label">Conversations</span>
        </div>
      </div>
    </div>

    <!-- App List with Selection -->
    {#if preview.apps.length > 0}
      <div class="apps-section">
        <div class="apps-header">
          <h2>Select apps to import</h2>
          <div class="toggle-buttons">
            <button
              class="toggle-btn"
              on:click={selectAll}
              disabled={selectedAppIds.size === preview.apps.length}
            >
              Select all
            </button>
            <button
              class="toggle-btn"
              on:click={selectNone}
              disabled={selectedAppIds.size === 0}
            >
              Select none
            </button>
          </div>
        </div>
        <div class="apps-list">
          {#each preview.apps as app}
            <label
              class="app-item"
              class:selected={selectedAppIds.has(app.id)}
            >
              <div
                class="app-checkbox"
                class:checked={selectedAppIds.has(app.id)}
                role="checkbox"
                aria-checked={selectedAppIds.has(app.id)}
              >
                {#if selectedAppIds.has(app.id)}
                  <Check size={14} />
                {/if}
              </div>
              <input
                type="checkbox"
                checked={selectedAppIds.has(app.id)}
                on:change={() => toggleApp(app.id)}
                class="sr-only"
              />
              <div class="app-icon">
                <Bot size={16} />
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
                  {#if app.customActionCount > 0}
                    <Badge variant="outline">{app.customActionCount} actions</Badge>
                  {/if}
                </div>
              </div>
            </label>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <Button variant="ghost" on:click={handleSkip} disabled={isStartingImport}>
        Skip, I'll start fresh
      </Button>
      <Button
        on:click={handleStartImport}
        loading={isStartingImport}
        disabled={isStartingImport || selectedAppIds.size === 0}
      >
        Import {selectedAppIds.size} app{selectedAppIds.size !== 1 ? "s" : ""}
        <ArrowRight size={16} />
      </Button>
    </div>
  {/if}
</div>

<style>
  .preview-content {
    max-width: 520px;
    margin: 0 auto;
  }

  .loading-state,
  .error-state {
    text-align: center;
    padding: var(--space-8) 0;
  }

  .loading-state p {
    margin-top: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .preview-header {
    text-align: center;
    margin-bottom: var(--space-8);
  }

  /* Avatar with glow effect */
  .avatar-container {
    position: relative;
    display: inline-block;
    margin-bottom: var(--space-4);
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand-color) 0%, hsl(45 100% 60%) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
    box-shadow: 0 4px 20px hsl(var(--brand-color-hsl, 45 100% 50%) / 0.3);
  }

  .avatar-initials {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(0 0% 10%);
    letter-spacing: 0.5px;
  }

  .avatar-glow {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand-color) 0%, hsl(45 100% 60%) 100%);
    opacity: 0.2;
    filter: blur(16px);
    z-index: 0;
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  h2 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .subtitle {
    color: hsl(var(--muted-foreground));
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  /* Summary cards with gradient borders */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-3);
    background: linear-gradient(
      180deg,
      hsl(var(--muted) / 0.6) 0%,
      hsl(var(--muted) / 0.3) 100%
    );
    border-radius: var(--radius-lg);
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border) / 0.5);
    transition: all 0.2s ease;
  }

  .summary-card:hover {
    background: linear-gradient(
      180deg,
      hsl(var(--muted) / 0.8) 0%,
      hsl(var(--muted) / 0.4) 100%
    );
    border-color: hsl(var(--border));
  }

  .summary-card :global(svg) {
    color: var(--brand-color);
    opacity: 0.9;
  }

  .summary-info {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .summary-count {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .summary-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .apps-section {
    margin-bottom: var(--space-6);
    text-align: left;
  }

  .apps-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .apps-header h2 {
    margin: 0;
  }

  .toggle-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .toggle-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: var(--font-medium);
  }

  .toggle-btn:hover:not(:disabled) {
    background: hsl(var(--muted) / 0.6);
    color: hsl(var(--foreground));
    border-color: hsl(var(--border));
  }

  .toggle-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .apps-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 280px;
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  /* Custom scrollbar */
  .apps-list::-webkit-scrollbar {
    width: 6px;
  }

  .apps-list::-webkit-scrollbar-track {
    background: hsl(var(--muted) / 0.2);
    border-radius: var(--radius-full);
  }

  .apps-list::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: var(--radius-full);
  }

  .apps-list::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.5);
  }

  .app-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: linear-gradient(
      135deg,
      hsl(var(--muted) / 0.4) 0%,
      hsl(var(--muted) / 0.2) 100%
    );
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid hsl(var(--border) / 0.3);
  }

  .app-item:hover {
    background: linear-gradient(
      135deg,
      hsl(var(--muted) / 0.6) 0%,
      hsl(var(--muted) / 0.3) 100%
    );
    border-color: hsl(var(--border) / 0.5);
    transform: translateY(-1px);
  }

  .app-item.selected {
    background: linear-gradient(
      135deg,
      hsl(45 100% 50% / 0.12) 0%,
      hsl(45 100% 50% / 0.05) 100%
    );
    border-color: hsl(45 100% 50% / 0.3);
  }

  .app-item.selected:hover {
    border-color: hsl(45 100% 50% / 0.5);
  }

  .app-checkbox {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition: all 0.2s ease;
    color: hsl(0 0% 10%);
    background: transparent;
  }

  .app-checkbox.checked {
    background: var(--brand-color);
    border-color: var(--brand-color);
    box-shadow: 0 2px 8px hsl(45 100% 50% / 0.3);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .app-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--brand-color) 0%, hsl(45 100% 60%) 100%);
    color: hsl(0 0% 10%);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px hsl(45 100% 50% / 0.2);
  }

  .app-info {
    flex: 1;
    min-width: 0;
  }

  .app-name {
    display: block;
    font-weight: var(--font-semibold);
    font-size: var(--text-base);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }

  .app-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .app-stats :global(.badge) {
    font-size: var(--text-xs);
    padding: 2px 8px;
    background: hsl(var(--muted) / 0.5);
    border-color: transparent;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border) / 0.3);
  }

  .actions :global(button:first-child) {
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
  }

  .actions :global(button:first-child:hover) {
    color: hsl(var(--foreground));
  }

  .actions :global(button:last-child) {
    gap: var(--space-2);
    background: linear-gradient(135deg, var(--brand-color) 0%, hsl(45 100% 55%) 100%);
    color: hsl(0 0% 10%);
    font-weight: var(--font-semibold);
    padding: var(--space-3) var(--space-5);
    box-shadow: 0 4px 16px hsl(45 100% 50% / 0.3);
    transition: all 0.2s ease;
  }

  .actions :global(button:last-child:hover:not(:disabled)) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px hsl(45 100% 50% / 0.4);
  }

  .actions :global(button:last-child:disabled) {
    opacity: 0.5;
    box-shadow: none;
  }

  @media (max-width: 520px) {
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .apps-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .toggle-buttons {
      width: 100%;
    }

    .toggle-btn {
      flex: 1;
      text-align: center;
    }

    .actions {
      flex-direction: column-reverse;
      gap: var(--space-3);
    }

    .actions :global(button) {
      width: 100%;
    }

    .avatar {
      width: 60px;
      height: 60px;
    }

    .avatar-initials {
      font-size: var(--text-lg);
    }
  }
</style>
