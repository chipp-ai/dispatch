<script lang="ts">
  import { onMount } from "svelte";
  import { user } from "../../stores/auth";
  import { currentWorkspace } from "../../stores/workspace";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { toasts } from "$lib/design-system";
  import { formatDistanceToNow } from "date-fns";

  interface Source {
    id: string;
    name: string;
    type: string;
    status: string;
    url: string | null;
    chunkCount: number;
    applicationId: string;
    applicationName: string;
    createdAt: string;
    updatedAt: string;
  }

  let sources: Source[] = [];
  let isLoading = true;
  let error: string | null = null;

  // Filtering and sorting
  let searchQuery = "";
  let selectedType = "All";
  let sortColumn: "name" | "type" | "updatedAt" | "applicationName" = "updatedAt";
  let sortDirection: "asc" | "desc" = "desc";

  // Selection for bulk actions
  let selectedIds: Set<string> = new Set();
  let selectAll = false;

  // Modal states
  let showDeleteModal = false;
  let deleteSourceId: string | null = null;
  let deleteSourceName: string | null = null;
  let isDeleting = false;

  let showBulkDeleteModal = false;
  let isBulkDeleting = false;

  // Refreshing
  let refreshingIds: Set<string> = new Set();

  // Get unique source types for filter dropdown
  $: sourceTypes = [...new Set(sources.map((s) => s.type))].sort();

  // Filtered and sorted sources
  $: filteredSources = sources
    .filter((source) => {
      const matchesSearch =
        source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        source.applicationName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === "All" || source.type === selectedType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortColumn === "type") {
        comparison = a.type.localeCompare(b.type);
      } else if (sortColumn === "applicationName") {
        comparison = a.applicationName.localeCompare(b.applicationName);
      } else if (sortColumn === "updatedAt") {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  // Check if current user is a viewer (viewers can't manage sources)
  $: isViewer = $currentWorkspace?.role === "viewer";

  // Handle select all checkbox
  $: {
    if (selectAll) {
      selectedIds = new Set(filteredSources.map((s) => s.id));
    }
  }

  $: anySelected = selectedIds.size > 0;

  async function loadSources() {
    if (!$currentWorkspace?.id) return;

    isLoading = true;
    error = null;

    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/sources`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load sources");
      }

      const data = await response.json();
      sources = data.data || [];
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load sources";
      console.error("Error loading sources:", err);
    } finally {
      isLoading = false;
    }
  }

  async function handleRefresh(sourceId: string) {
    if (!$currentWorkspace?.id) return;

    refreshingIds.add(sourceId);
    refreshingIds = refreshingIds;

    try {
      const response = await fetch(
        `/api/workspaces/${$currentWorkspace.id}/sources/${sourceId}/refresh`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to refresh source");
      }

      // Update local state
      sources = sources.map((s) =>
        s.id === sourceId ? { ...s, status: "pending" } : s
      );
    } catch (err) {
      console.error("Error refreshing source:", err);
      toasts.error("Error", "Failed to refresh source");
    } finally {
      refreshingIds.delete(sourceId);
      refreshingIds = refreshingIds;
    }
  }

  function openDeleteModal(source: Source) {
    deleteSourceId = source.id;
    deleteSourceName = source.name;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (!$currentWorkspace?.id || !deleteSourceId) return;

    isDeleting = true;

    try {
      const response = await fetch(
        `/api/workspaces/${$currentWorkspace.id}/sources/${deleteSourceId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete source");
      }

      sources = sources.filter((s) => s.id !== deleteSourceId);
      selectedIds.delete(deleteSourceId);
      selectedIds = selectedIds;
      showDeleteModal = false;
      deleteSourceId = null;
      deleteSourceName = null;
    } catch (err) {
      console.error("Error deleting source:", err);
      toasts.error("Error", "Failed to delete source");
    } finally {
      isDeleting = false;
    }
  }

  async function confirmBulkDelete() {
    if (!$currentWorkspace?.id || selectedIds.size === 0) return;

    isBulkDeleting = true;

    try {
      const deletePromises = Array.from(selectedIds).map((id) =>
        fetch(`/api/workspaces/${$currentWorkspace.id}/sources/${id}`, {
          method: "DELETE",
          credentials: "include",
        })
      );

      await Promise.all(deletePromises);

      sources = sources.filter((s) => !selectedIds.has(s.id));
      selectedIds.clear();
      selectedIds = selectedIds;
      selectAll = false;
      showBulkDeleteModal = false;
    } catch (err) {
      console.error("Error deleting sources:", err);
      toasts.error("Error", "Failed to delete some sources");
    } finally {
      isBulkDeleting = false;
    }
  }

  async function handleBulkRefresh() {
    if (!$currentWorkspace?.id) return;

    const idsToRefresh = Array.from(selectedIds);

    for (const id of idsToRefresh) {
      await handleRefresh(id);
    }

    selectedIds.clear();
    selectedIds = selectedIds;
    selectAll = false;
  }

  function toggleSelection(id: string) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = selectedIds;
    selectAll = selectedIds.size === filteredSources.length && filteredSources.length > 0;
  }

  function toggleSelectAll() {
    if (selectAll) {
      selectedIds.clear();
      selectAll = false;
    } else {
      selectedIds = new Set(filteredSources.map((s) => s.id));
      selectAll = true;
    }
    selectedIds = selectedIds;
  }

  function toggleSort(column: typeof sortColumn) {
    if (sortColumn === column) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortDirection = "asc";
    }
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case "completed":
        return "badge-success";
      case "processing":
      case "pending":
        return "badge-warning";
      case "failed":
        return "badge-error";
      default:
        return "badge-neutral";
    }
  }

  function getTypeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case "url":
        return "link";
      case "file":
        return "file-text";
      case "youtube":
        return "video";
      case "sitemap":
        return "map";
      case "google_drive":
        return "hard-drive";
      case "notion":
        return "book-open";
      case "confluence":
        return "file-text";
      case "text":
        return "type";
      case "qa":
        return "help-circle";
      default:
        return "file";
    }
  }

  onMount(() => {
    loadSources();
  });

  // Reload when workspace changes
  $: if ($currentWorkspace?.id) {
    loadSources();
  }
</script>

<svelte:head>
  <title>Sources - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <main class="settings-content">
    {#if isViewer}
      <div class="viewer-restriction">
        <h2>Uh Oh!</h2>
        <p>
          Looks like you are a viewer in this workspace. Only workspace owners
          and editors can manage sources.
        </p>
      </div>
    {:else}
      <header class="settings-header">
        <div>
          <h1>Sources</h1>
          <p class="subtitle">
            {#if sources.length > 0}
              {sources.length} source{sources.length !== 1 ? "s" : ""} in this workspace
            {:else}
              Manage knowledge sources for apps in this workspace
            {/if}
          </p>
        </div>
      </header>

      <div class="card">
        {#if isLoading}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading sources...</p>
          </div>
        {:else if error}
          <div class="error-state">
            <p>{error}</p>
            <button class="btn btn-secondary" on:click={loadSources}>
              Try Again
            </button>
          </div>
        {:else if sources.length === 0}
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
            </div>
            <h3>No sources yet</h3>
            <p>Knowledge sources added to apps in this workspace will appear here.</p>
          </div>
        {:else}
          <!-- Filters -->
          <div class="filters-row">
            <div class="filters-left">
              <input
                type="text"
                class="search-input"
                placeholder="Search sources..."
                bind:value={searchQuery}
              />
              <select class="type-filter" bind:value={selectedType}>
                <option value="All">All Types</option>
                {#each sourceTypes as type}
                  <option value={type}>{type}</option>
                {/each}
              </select>
            </div>
          </div>

          <!-- Table -->
          <div class="table-container">
            <table class="sources-table">
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      on:change={toggleSelectAll}
                    />
                  </th>
                  <th class="sortable" on:click={() => toggleSort("name")}>
                    Name
                    {#if sortColumn === "name"}
                      <span class="sort-icon">{sortDirection === "asc" ? "^" : "v"}</span>
                    {/if}
                  </th>
                  <th class="sortable" on:click={() => toggleSort("applicationName")}>
                    App
                    {#if sortColumn === "applicationName"}
                      <span class="sort-icon">{sortDirection === "asc" ? "^" : "v"}</span>
                    {/if}
                  </th>
                  <th class="sortable" on:click={() => toggleSort("type")}>
                    Type
                    {#if sortColumn === "type"}
                      <span class="sort-icon">{sortDirection === "asc" ? "^" : "v"}</span>
                    {/if}
                  </th>
                  <th>Status</th>
                  <th class="sortable" on:click={() => toggleSort("updatedAt")}>
                    Updated
                    {#if sortColumn === "updatedAt"}
                      <span class="sort-icon">{sortDirection === "asc" ? "^" : "v"}</span>
                    {/if}
                  </th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredSources as source (source.id)}
                  <tr class:selected={selectedIds.has(source.id)}>
                    <td class="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(source.id)}
                        on:change={() => toggleSelection(source.id)}
                      />
                    </td>
                    <td class="name-cell">
                      <div class="source-name">{source.name}</div>
                      {#if source.url}
                        <a href={source.url} target="_blank" rel="noopener noreferrer" class="source-url">
                          {source.url.length > 50 ? source.url.substring(0, 50) + "..." : source.url}
                        </a>
                      {/if}
                    </td>
                    <td>
                      <span class="app-name">{source.applicationName}</span>
                    </td>
                    <td>
                      <span class="type-badge">{source.type}</span>
                    </td>
                    <td>
                      <span class="status-badge {getStatusBadgeClass(source.status)}">
                        {source.status}
                      </span>
                    </td>
                    <td class="date-cell">
                      {formatDistanceToNow(new Date(source.updatedAt), { addSuffix: true })}
                    </td>
                    <td class="actions-col">
                      <div class="actions-menu">
                        <button
                          class="action-btn"
                          title="Refresh"
                          on:click={() => handleRefresh(source.id)}
                          disabled={refreshingIds.has(source.id)}
                        >
                          {#if refreshingIds.has(source.id)}
                            <div class="btn-spinner"></div>
                          {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                            </svg>
                          {/if}
                        </button>
                        <button
                          class="action-btn action-btn-danger"
                          title="Delete"
                          on:click={() => openDeleteModal(source)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Selection summary -->
          <div class="table-footer">
            <span class="selection-count">
              {selectedIds.size} of {filteredSources.length} selected
            </span>
          </div>

          <!-- Bulk Actions -->
          {#if anySelected}
            <div class="bulk-actions" class:visible={anySelected}>
              <div class="bulk-actions-card">
                <span class="bulk-label">Bulk Actions</span>
                <div class="bulk-buttons">
                  <button class="btn btn-secondary" on:click={handleBulkRefresh}>
                    Refresh Selected
                  </button>
                  <button class="btn btn-danger" on:click={() => (showBulkDeleteModal = true)}>
                    Delete Selected
                  </button>
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </main>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
  <div class="modal-overlay" on:click={() => (showDeleteModal = false)}>
    <div class="modal" on:click|stopPropagation>
      <h2>Delete Source</h2>
      <p>
        Are you sure you want to delete <strong>{deleteSourceName}</strong>?
        This will also delete all associated text chunks.
      </p>
      <div class="modal-actions">
        <button
          class="btn btn-secondary"
          on:click={() => (showDeleteModal = false)}
          disabled={isDeleting}
        >
          Cancel
        </button>
        <button
          class="btn btn-danger"
          on:click={confirmDelete}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Delete Confirmation Modal -->
{#if showBulkDeleteModal}
  <div class="modal-overlay" on:click={() => (showBulkDeleteModal = false)}>
    <div class="modal" on:click|stopPropagation>
      <h2>Delete {selectedIds.size} Sources</h2>
      <p>
        Are you sure you want to delete {selectedIds.size} source{selectedIds.size !== 1 ? "s" : ""}?
        This will also delete all associated text chunks.
      </p>
      <div class="modal-actions">
        <button
          class="btn btn-secondary"
          on:click={() => (showBulkDeleteModal = false)}
          disabled={isBulkDeleting}
        >
          Cancel
        </button>
        <button
          class="btn btn-danger"
          on:click={confirmBulkDelete}
          disabled={isBulkDeleting}
        >
          {isBulkDeleting ? "Deleting..." : "Delete All"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .settings-content {
    flex: 1;
    padding: var(--space-8);
    max-width: 1200px;
  }

  .settings-header {
    margin-bottom: var(--space-6);
  }

  .settings-header h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .subtitle {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: 0;
  }

  .card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }

  .viewer-restriction {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    gap: var(--space-4);
  }

  .viewer-restriction h2 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .viewer-restriction p {
    color: hsl(var(--muted-foreground));
    max-width: 400px;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    text-align: center;
    gap: var(--space-4);
  }

  .empty-icon {
    color: hsl(var(--muted-foreground));
    opacity: 0.5;
  }

  .empty-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state p {
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid hsl(var(--muted));
    border-top-color: hsl(var(--foreground));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .filters-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .filters-left {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .search-input {
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    width: 200px;
  }

  .search-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
  }

  .type-filter {
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    min-width: 140px;
  }

  .table-container {
    overflow-x: auto;
  }

  .sources-table {
    width: 100%;
    border-collapse: collapse;
  }

  .sources-table th,
  .sources-table td {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    border-bottom: 1px solid hsl(var(--border));
  }

  .sources-table th {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: hsl(var(--muted) / 0.3);
  }

  .sources-table th.sortable {
    cursor: pointer;
    user-select: none;
  }

  .sources-table th.sortable:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .sort-icon {
    margin-left: var(--space-1);
    font-size: var(--text-xs);
  }

  .sources-table tbody tr:hover {
    background: hsl(var(--muted) / 0.3);
  }

  .sources-table tbody tr.selected {
    background: hsl(var(--primary) / 0.05);
  }

  .checkbox-col {
    width: 40px;
  }

  .actions-col {
    width: 100px;
    text-align: right;
  }

  .name-cell {
    max-width: 300px;
  }

  .source-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .source-url {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-url:hover {
    color: hsl(var(--primary));
    text-decoration: underline;
  }

  .app-name {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
  }

  .type-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: hsl(var(--muted));
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    text-transform: capitalize;
  }

  .status-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    text-transform: capitalize;
  }

  .badge-success {
    background: hsl(142 76% 36% / 0.1);
    color: hsl(142 76% 36%);
  }

  .badge-warning {
    background: hsl(45 93% 47% / 0.1);
    color: hsl(45 93% 37%);
  }

  .badge-error {
    background: hsl(0 84% 60% / 0.1);
    color: hsl(0 84% 60%);
  }

  .badge-neutral {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .date-cell {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
  }

  .actions-menu {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn-danger:hover:not(:disabled) {
    background: hsl(0 84% 60% / 0.1);
    border-color: hsl(0 84% 60%);
    color: hsl(0 84% 60%);
  }

  .table-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    margin-top: var(--space-4);
  }

  .selection-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .bulk-actions {
    position: fixed;
    bottom: var(--space-8);
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    opacity: 0;
    transition: all 0.3s ease-out;
    z-index: 50;
  }

  .bulk-actions.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }

  .bulk-actions-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1);
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .bulk-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .bulk-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .btn-secondary:hover:not(:disabled) {
    background: hsl(var(--muted) / 0.8);
  }

  .btn-danger {
    background: hsl(0 84% 60%);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: hsl(0 84% 50%);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .modal {
    background: hsl(var(--card));
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 400px;
    width: 100%;
  }

  .modal h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .modal p {
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6) 0;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .settings-layout {
      flex-direction: column;
    }

    .settings-content {
      padding: var(--space-4);
    }

    .filters-row {
      flex-direction: column;
      align-items: stretch;
    }

    .filters-left {
      flex-direction: column;
    }

    .search-input,
    .type-filter {
      width: 100%;
    }

    .sources-table th,
    .sources-table td {
      padding: var(--space-2);
    }

    .name-cell {
      max-width: 150px;
    }

    .bulk-actions-card {
      flex-direction: column;
      align-items: stretch;
    }

    .bulk-buttons {
      flex-direction: column;
    }
  }
</style>
