<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade, fly, scale } from "svelte/transition";
  import Button from "../Button.svelte";
  import Badge from "../Badge.svelte";
  import ScrollArea from "../ScrollArea.svelte";
  import Select from "../Select.svelte";
  import SelectItem from "../SelectItem.svelte";
  import { toasts } from "../../stores/toast";

  export let open: boolean = false;
  export let appId: string;
  export let initialVersionId: string | undefined = undefined;

  interface VersionHistoryItem {
    id: string;
    version: string;
    data: Record<string, unknown>;
    tag: string | null;
    isLaunched: boolean;
    launchedAt: string | null;
    createdAt: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
  }

  interface Change {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }

  let versions: VersionHistoryItem[] = [];
  let selectedVersion: VersionHistoryItem | null = null;
  let loading = true;
  let loadingMore = false;
  let hasMore = false;
  let error = "";

  // Filters
  let dateRange = "all";
  let launchedOnly = false;
  let authorFilter = "all";

  // Track unique authors across all fetches (doesn't reset with filters)
  let knownAuthors: Array<{ id: string; name: string }> = [];

  const dateRangeOptions = [
    { value: "all", label: "All time" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
  ];

  function getDateRangeLabel(value: string): string {
    return dateRangeOptions.find((o) => o.value === value)?.label || value;
  }

  function getAuthorLabel(value: string): string {
    if (value === "all") return "All authors";
    const author = knownAuthors.find((a) => a.id === value);
    return author?.name || "Unknown";
  }

  const dispatch = createEventDispatcher<{
    close: void;
    restore: { versionId: string };
    launch: { versionId: string };
  }>();

  function close() {
    open = false;
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function getDateRangeSince(range: string): string | null {
    if (range === "all") return null;
    const now = new Date();
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
    if (days === 0) return null;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return since.toISOString();
  }

  async function fetchVersions(reset = true) {
    if (reset) {
      loading = true;
      versions = [];
    } else {
      loadingMore = true;
    }

    try {
      const params = new URLSearchParams({
        limit: "30",
        ...(launchedOnly ? { launchedOnly: "true" } : {}),
      });

      const since = getDateRangeSince(dateRange);
      if (since) {
        params.set("since", since);
      }

      if (authorFilter !== "all") {
        params.set("authorId", authorFilter);
      }

      const response = await fetch(
        `/api/applications/${appId}/versions?${params}`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to load versions");
      const result = await response.json();

      if (reset) {
        versions = result.data || [];
      } else {
        versions = [...versions, ...(result.data || [])];
      }
      hasMore = versions.length >= 30; // Simple pagination check

      // Extract unique authors from fetched versions
      const newAuthors = (result.data || [])
        .filter((v: VersionHistoryItem) => v.userId)
        .map((v: VersionHistoryItem) => ({
          id: v.userId || "",
          name: v.userName || v.userEmail?.split("@")[0] || "Unknown",
        }));

      // Merge with existing authors (avoid duplicates)
      const existingIds = new Set(knownAuthors.map((a) => a.id));
      for (const author of newAuthors) {
        if (author.id && !existingIds.has(author.id)) {
          knownAuthors = [...knownAuthors, author];
          existingIds.add(author.id);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load versions";
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  // Track appId to reset authors when it changes
  let prevAppId = appId;

  // Fetch when modal opens
  $: if (open) {
    // Reset authors if viewing a different app
    if (appId !== prevAppId) {
      knownAuthors = [];
      authorFilter = "all";
      prevAppId = appId;
    }
    // Only reset selectedVersion if no initialVersionId is provided
    if (!initialVersionId) {
      selectedVersion = null;
    }
    fetchVersions(true);
  }

  // Auto-select initial version when versions load
  $: if (initialVersionId && versions.length > 0) {
    const found = versions.find((v) => v.id === initialVersionId);
    if (found) selectedVersion = found;
  }

  // Track filter values to detect changes
  let prevDateRange = dateRange;
  let prevLaunchedOnly = launchedOnly;
  let prevAuthorFilter = authorFilter;

  // Refetch when filters change
  $: if (open && (dateRange !== prevDateRange || launchedOnly !== prevLaunchedOnly || authorFilter !== prevAuthorFilter)) {
    prevDateRange = dateRange;
    prevLaunchedOnly = launchedOnly;
    prevAuthorFilter = authorFilter;
    fetchVersions(true);
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
  ): Change[] {
    const currentObj = parseData(current);
    const previousObj = previous ? parseData(previous) : undefined;

    if (!previousObj) {
      return Object.keys(currentObj).map((key) => ({
        field: key,
        oldValue: undefined,
        newValue: currentObj[key],
      }));
    }

    const changes: Change[] = [];
    for (const key of Object.keys(currentObj)) {
      const oldVal = previousObj[key];
      const newVal = currentObj[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, oldValue: oldVal, newValue: newVal });
      }
    }
    return changes;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDateShort(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "(empty)";
    if (value === "") return "(empty)";
    if (Array.isArray(value) && value.length === 0) return "(empty array)";
    if (typeof value === "object" && Object.keys(value as object).length === 0) return "(empty object)";
    return JSON.stringify(value, null, 2);
  }

  function isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined || value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === "object" && Object.keys(value as object).length === 0) return true;
    return false;
  }

  // Find previous version for diff
  $: previousVersion = selectedVersion
    ? versions[versions.findIndex((v) => v.id === selectedVersion?.id) + 1]
    : null;

  // Detect if this is the initial version (no previous to compare against)
  $: isInitialVersion = selectedVersion && !previousVersion;

  $: changes = selectedVersion && previousVersion
    ? getChangedFields(
        selectedVersion.data,
        previousVersion.data
      )
    : [];

  async function handleRestore(useOld: boolean) {
    if (!selectedVersion) return;
    // For now, dispatch event - parent will handle API call
    dispatch("restore", { versionId: selectedVersion.id });
  }

  async function handleLaunch() {
    if (!selectedVersion) return;
    dispatch("launch", { versionId: selectedVersion.id });
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Header -->
      <header class="modal-header">
        <div class="header-left">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="header-text">
            <h2 id="version-history-title">Version History</h2>
            <p class="header-subtitle">{versions.length} versions</p>
          </div>
        </div>

        <div class="header-actions">
          <!-- Filter: Date Range -->
          <Select
            value={getDateRangeLabel(dateRange)}
            on:change={(e) => (dateRange = e.detail.value)}
          >
            <svelte:fragment slot="default" let:handleSelect>
              {#each dateRangeOptions as option}
                <SelectItem
                  value={option.value}
                  selected={dateRange === option.value}
                  on:select={handleSelect}
                >
                  {option.label}
                </SelectItem>
              {/each}
            </svelte:fragment>
          </Select>

          <!-- Filter: Author -->
          {#if knownAuthors.length > 0}
            <Select
              value={getAuthorLabel(authorFilter)}
              on:change={(e) => (authorFilter = e.detail.value)}
            >
              <svelte:fragment slot="default" let:handleSelect>
                <SelectItem
                  value="all"
                  selected={authorFilter === "all"}
                  on:select={handleSelect}
                >
                  All authors
                </SelectItem>
                {#each knownAuthors as author}
                  <SelectItem
                    value={author.id}
                    selected={authorFilter === author.id}
                    on:select={handleSelect}
                  >
                    {author.name}
                  </SelectItem>
                {/each}
              </svelte:fragment>
            </Select>
          {/if}

          <!-- Filter: Published Only -->
          <label class="filter-checkbox">
            <input type="checkbox" bind:checked={launchedOnly} />
            <span>Published only</span>
          </label>

          <!-- Close Button -->
          <button class="close-btn" on:click={close} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="modal-body">
        <!-- Version List (Left) -->
        <div class="versions-panel">
          <ScrollArea maxHeight="calc(85vh - 120px)">
            {#if loading}
              <div class="loading-state">
                <div class="spinner"></div>
              </div>
            {:else if versions.length === 0}
              <div class="empty-state">
                <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p>No versions found</p>
                {#if launchedOnly}
                  <p class="empty-hint">Try removing the "Published only" filter</p>
                {/if}
              </div>
            {:else}
              <div class="versions-list">
                {#each versions as version, idx (version.id)}
                  {@const prevVersion = versions[idx + 1]}
                  {@const isFirstVersion = !prevVersion}
                  {@const versionChanges = isFirstVersion ? [] : getChangedFields(
                    version.data,
                    prevVersion?.data
                  )}
                  <button
                    class="version-item"
                    class:selected={selectedVersion?.id === version.id}
                    on:click={() => (selectedVersion = version)}
                    in:fly={{ y: 10, duration: 200, delay: Math.min(idx * 20, 300) }}
                  >
                    <div class="version-item-header">
                      <span class="version-title">
                        {isFirstVersion
                          ? "Initial version"
                          : versionChanges.length > 0
                            ? versionChanges
                                .slice(0, 3)
                                .map((c) => c.field)
                                .join(", ")
                            : "No changes"}
                        {#if !isFirstVersion && versionChanges.length > 3}
                          <span class="more">+{versionChanges.length - 3}</span>
                        {/if}
                      </span>
                      {#if version.isLaunched}
                        <Badge variant="success">Published</Badge>
                      {/if}
                      {#if version.tag}
                        <Badge variant="outline">{version.tag}</Badge>
                      {/if}
                    </div>
                    <div class="version-item-meta">
                      <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{formatDateShort(version.createdAt)}</span>
                      {#if version.userName || version.userEmail}
                        <span class="meta-separator">-</span>
                        <span class="user">{(version.userName || version.userEmail || "").split("@")[0]}</span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>

              {#if hasMore}
                <div class="load-more">
                  <Button variant="outline" size="sm" loading={loadingMore} on:click={() => fetchVersions(false)}>
                    Load more
                  </Button>
                </div>
              {/if}
            {/if}
          </ScrollArea>
        </div>

        <!-- Detail Panel (Right) -->
        <div class="detail-panel">
          {#if selectedVersion}
            <!-- Version Header -->
            <div class="detail-header">
              <div class="detail-header-info">
                <div class="detail-time">
                  <svg class="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{formatDate(selectedVersion.createdAt)}</span>
                </div>
                {#if selectedVersion.userName || selectedVersion.userEmail}
                  <div class="detail-user">
                    <svg class="detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{selectedVersion.userName || selectedVersion.userEmail}</span>
                  </div>
                {/if}
              </div>
              <div class="detail-actions">
                {#if previousVersion}
                  <Button variant="outline" size="sm" on:click={() => handleRestore(true)}>
                    Restore Previous
                  </Button>
                {/if}
                <Button variant="primary" size="sm" on:click={() => handleRestore(false)}>
                  Apply This Version
                </Button>
              </div>
            </div>

            <!-- Changes List -->
            <ScrollArea maxHeight="calc(85vh - 200px)">
              <div class="changes-list">
                {#if isInitialVersion}
                  <div class="no-changes">
                    <svg class="no-changes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l2 2" />
                    </svg>
                    <p>Initial version</p>
                    <p class="no-changes-hint">This is when the app was first created</p>
                  </div>
                {:else if changes.length === 0}
                  <div class="no-changes">
                    <svg class="no-changes-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M6 3v12" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    <p>No changes in this version</p>
                  </div>
                {:else}
                  {#each changes as change, idx (change.field)}
                    <div
                      class="change-item"
                      in:fly={{ y: 10, duration: 200, delay: idx * 50 }}
                    >
                      <div class="change-header">
                        <span class="change-field">{change.field}</span>
                        <Badge variant="secondary">Modified</Badge>
                      </div>
                      <div class="change-diff">
                        <!-- Old Value -->
                        <div class="diff-column diff-old">
                          <div class="diff-label">
                            <span class="diff-dot old"></span>
                            <span>Previous</span>
                          </div>
                          <pre class="diff-value" class:empty={isEmptyValue(change.oldValue)}>{formatValue(change.oldValue)}</pre>
                        </div>
                        <!-- New Value -->
                        <div class="diff-column diff-new">
                          <div class="diff-label">
                            <span class="diff-dot new"></span>
                            <span>Current</span>
                          </div>
                          <pre class="diff-value" class:empty={isEmptyValue(change.newValue)}>{formatValue(change.newValue)}</pre>
                        </div>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </ScrollArea>
          {:else}
            <!-- No Selection State -->
            <div class="no-selection">
              <div class="no-selection-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 3v12" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </div>
              <p class="no-selection-title">Select a version to view details</p>
              <p class="no-selection-hint">Compare changes and restore previous values</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    width: 95vw;
    max-width: 1200px;
    height: 85vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-2xl);
    overflow: hidden;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(99, 102, 241, 0.1));
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: var(--radius-lg);
  }

  .header-icon svg {
    width: 20px;
    height: 20px;
    color: var(--brand-color);
  }

  .header-text h2 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }

  .header-subtitle {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .filter-checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--brand-color);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Body */
  .modal-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Versions Panel */
  .versions-panel {
    width: 380px;
    border-right: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    color: var(--text-muted);
  }

  .spinner {
    width: 24px;
    height: 24px;
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
    margin-bottom: var(--space-2);
    opacity: 0.5;
  }

  .empty-hint {
    font-size: var(--text-xs);
    margin-top: var(--space-1);
  }

  .versions-list {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .version-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    padding: var(--space-3);
    background: var(--bg-primary);
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .version-item:hover {
    background: var(--bg-tertiary);
  }

  .version-item.selected {
    background: var(--bg-primary);
    border-color: var(--brand-color);
    box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.2);
  }

  .version-item-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .version-title {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    text-transform: capitalize;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .version-title .more {
    color: var(--text-muted);
  }

  .version-item-meta {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .meta-icon {
    width: 12px;
    height: 12px;
  }

  .meta-separator {
    margin: 0 var(--space-1);
  }

  .user {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .load-more {
    padding: var(--space-2) var(--space-3) var(--space-4);
  }

  /* Detail Panel */
  .detail-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .detail-header-info {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .detail-time,
  .detail-user {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .detail-icon {
    width: 16px;
    height: 16px;
    color: var(--text-muted);
  }

  .detail-actions {
    display: flex;
    gap: var(--space-2);
  }

  /* Changes List */
  .changes-list {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .no-changes {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    color: var(--text-muted);
    text-align: center;
  }

  .no-changes-icon {
    width: 32px;
    height: 32px;
    margin-bottom: var(--space-3);
    opacity: 0.5;
  }

  .no-changes-hint {
    font-size: var(--text-xs);
    margin-top: var(--space-1);
    opacity: 0.7;
  }

  .change-item {
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .change-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
  }

  .change-field {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .change-diff {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .diff-column {
    padding: var(--space-4);
  }

  .diff-column.diff-old {
    border-right: 1px solid var(--border-primary);
  }

  .diff-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .diff-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .diff-dot.old {
    background: #ef4444;
  }

  .diff-dot.new {
    background: #22c55e;
  }

  .diff-value {
    margin: 0;
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.5;
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    overflow: auto;
    max-height: 300px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .diff-value.empty {
    color: var(--text-muted);
    font-style: italic;
  }

  .diff-old .diff-value {
    background: #fef2f2;
    color: #991b1b;
  }

  .diff-new .diff-value {
    background: #dcfce7;
    color: #166534;
  }

  /* Dark mode - use lighter text colors for visibility */
  /* Only apply when app explicitly sets dark mode, not based on system preference */
  :global([data-theme="dark"]) .diff-old .diff-value,
  :global(.dark) .diff-old .diff-value {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }

  :global([data-theme="dark"]) .diff-new .diff-value,
  :global(.dark) .diff-new .diff-value {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }

  /* No Selection State */
  .no-selection {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    text-align: center;
  }

  .no-selection-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    margin-bottom: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-2xl);
  }

  .no-selection-icon svg {
    width: 32px;
    height: 32px;
    opacity: 0.5;
  }

  .no-selection-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
    margin: 0;
  }

  .no-selection-hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin: var(--space-1) 0 0;
  }
</style>
