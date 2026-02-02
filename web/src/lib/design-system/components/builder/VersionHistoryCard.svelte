<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import BuilderCard from "./BuilderCard.svelte";
  import Button from "../Button.svelte";
  import Badge from "../Badge.svelte";

  export let appId: string;
  export let refreshTrigger: number = 0; // Increment this to trigger a refresh

  interface VersionHistoryItem {
    id: string;
    version: string;
    data: Record<string, unknown>;
    tag: string | null;
    isLaunched: boolean;
    launchedAt: string | null;
    createdAt: string;
    userName?: string;
    userEmail?: string;
  }

  let versions: VersionHistoryItem[] = [];
  let loading = true;
  let error = "";

  const dispatch = createEventDispatcher<{
    openModal: { versionId?: string };
  }>();

  // Fetch recent versions
  async function fetchVersions() {
    try {
      const response = await fetch(`/api/applications/${appId}/versions?limit=5`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load versions");
      const result = await response.json();
      versions = result.data || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load versions";
    } finally {
      loading = false;
    }
  }

  // Run on mount and when refreshTrigger changes
  $: if (appId || refreshTrigger) {
    loading = true;
    fetchVersions();
  }

  function parseData(data: unknown): Record<string, unknown> {
    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return {};
      }
    }
    return (data as Record<string, unknown>) || {};
  }

  function getChangedFields(
    current: unknown,
    previous?: unknown
  ): string[] {
    const currentObj = parseData(current);
    const previousObj = previous ? parseData(previous) : undefined;

    if (!previousObj) return Object.keys(currentObj);
    const changes: string[] = [];
    for (const key of Object.keys(currentObj)) {
      if (JSON.stringify(currentObj[key]) !== JSON.stringify(previousObj[key])) {
        changes.push(key);
      }
    }
    return changes;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function handleVersionClick(versionId: string) {
    dispatch("openModal", { versionId });
  }

  function handleViewFullHistory() {
    dispatch("openModal", {});
  }
</script>

<BuilderCard title="Version History" rightIcon="dropdown">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading versions...</span>
    </div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if versions.length === 0}
    <div class="empty">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>No version history yet</span>
    </div>
  {:else}
    <div class="versions-list">
      {#each versions as version, idx}
        {@const previousVersion = versions[idx + 1]}
        {@const changes = getChangedFields(
          version.data,
          previousVersion?.data
        )}
        <button
          class="version-item"
          on:click={() => handleVersionClick(version.id)}
        >
          <div class="version-header">
            <p class="version-title">
              Changed {#each changes.slice(0, 3) as field, i}
                <span class="field-name">{field}</span>{i < Math.min(changes.length, 3) - 1 ? ", " : ""}
              {/each}
              {#if changes.length > 3}
                <span class="more">+{changes.length - 3} more</span>
              {/if}
            </p>
            <div class="version-badges">
              {#if version.isLaunched}
                <Badge variant="success">Published</Badge>
              {/if}
              {#if version.tag}
                <Badge variant="outline">{version.tag}</Badge>
              {/if}
            </div>
          </div>
          <div class="version-meta">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{formatDate(version.createdAt)}</span>
            {#if version.userName || version.userEmail}
              <span class="separator">•</span>
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span class="user-name">{version.userName || version.userEmail}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>

    <Button variant="outline" size="sm" on:click={handleViewFullHistory}>
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      View Full History
    </Button>
  {/if}
</BuilderCard>

<style>
  .loading,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-primary);
    border-top-color: var(--brand-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .empty-icon {
    width: 32px;
    height: 32px;
    opacity: 0.5;
  }

  .error {
    padding: var(--space-4);
    color: var(--color-error);
    font-size: var(--text-sm);
    text-align: center;
  }

  .versions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .version-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: var(--space-3);
    background: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
    text-align: left;
  }

  .version-item:hover {
    background: var(--bg-secondary);
    border-color: var(--border-secondary);
  }

  .version-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: var(--space-2);
  }

  .version-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    margin: 0;
  }

  .field-name {
    text-transform: capitalize;
  }

  .more {
    color: var(--text-muted);
  }

  .version-badges {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .version-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .separator {
    margin: 0 var(--space-1);
  }

  .user-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    margin-right: var(--space-2);
  }
</style>
