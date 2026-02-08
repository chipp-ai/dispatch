<script lang="ts">
  import { Button, Skeleton, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, toasts } from "$lib/design-system";
  import GlobalNavBar from "$lib/design-system/components/GlobalNavBar.svelte";
  import ApplicationCard from "$lib/design-system/components/ApplicationCard.svelte";
  import { link } from "svelte-spa-router";
  import { onMount, onDestroy } from "svelte";
  import { captureException } from "$lib/sentry";
  import { get } from "svelte/store";
  import { currentWorkspace, type Workspace } from "../stores/workspace";

  interface App {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at?: string;
    picture_url?: string | null;
    workspace_id?: string;
    developer?: {
      username?: string;
    };
  }

  let apps: App[] = [];
  let filteredApps: App[] = [];
  let loading = true;
  let error = "";
  let searchQuery = "";
  let createAppLoading = false;

  // Delete confirmation dialog state
  let deleteDialogOpen = false;
  let appToDelete: App | null = null;
  let deleteLoading = false;

  // Filter apps based on search query
  $: {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredApps = apps.filter(
        (app) =>
          app.name.toLowerCase().includes(query) ||
          (app.description?.toLowerCase().includes(query) ?? false)
      );
    } else {
      filteredApps = apps;
    }
  }

  async function loadApps(workspaceId?: string) {
    try {
      loading = true;
      error = "";
      
      // Build URL with workspace filter
      let url = "/api/applications";
      if (workspaceId) {
        url += `?workspaceId=${encodeURIComponent(workspaceId)}`;
      }
      
      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated - redirect to login
          window.location.hash = "#/login";
          return;
        }
        throw new Error("Failed to load apps");
      }
      const result = await response.json();
      apps = result.data || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load apps";
      toasts.error("Failed to load apps", error);
    } finally {
      loading = false;
    }
  }

  // Subscribe to workspace changes and reload apps
  let unsubscribe: (() => void) | undefined;
  let lastWorkspaceId: string | null | undefined = undefined; // undefined = not yet loaded
  
  onMount(() => {
    // Subscribe to workspace changes
    unsubscribe = currentWorkspace.subscribe((workspace: Workspace | null) => {
      const newWorkspaceId = workspace?.id ?? null;
      
      // Load if: first time (undefined), or workspace actually changed
      if (lastWorkspaceId === undefined || newWorkspaceId !== lastWorkspaceId) {
        lastWorkspaceId = newWorkspaceId;
        loadApps(newWorkspaceId ?? undefined);
      }
    });
  });
  
  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  // Create app immediately (like chipp-admin) and navigate to it
  async function handleCreateApp() {
    console.log("[Apps] handleCreateApp called");

    if (createAppLoading) {
      console.log("[Apps] Already loading, returning");
      return;
    }

    const workspace = get(currentWorkspace);
    console.log("[Apps] Current workspace:", workspace);

    if (!workspace) {
      console.log("[Apps] No workspace, showing error");
      toasts.error("No workspace", "Please select a workspace first");
      return;
    }

    createAppLoading = true;
    console.log("[Apps] Making POST request to /api/applications");

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Untitled App",
          workspaceId: workspace.id,
        }),
      });

      console.log("[Apps] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create app");
      }

      const result = await response.json();
      console.log("[Apps] Created app:", result);

      // Navigate to the new app's builder (like chipp-admin)
      if (result.data?.id) {
        console.log("[Apps] Navigating to app:", result.data.id);
        window.location.hash = `#/apps/${result.data.id}`;
      }
    } catch (e) {
      captureException(e, { tags: { page: "apps", feature: "create-app" } });
      const message = e instanceof Error ? e.message : "Failed to create app";
      toasts.error("Failed to create app", message);
    } finally {
      createAppLoading = false;
    }
  }

  function handleGenerateApp() {
    // TODO: Implement AI app generation
    toasts.info("Coming soon", "AI app generation will be available soon");
  }

  async function handleDuplicate(app: App) {
    try {
      const response = await fetch(`/api/applications/${app.id}/duplicate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${app.name} (Copy)`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to duplicate app");
      }

      const result = await response.json();
      toasts.success("App duplicated", `${app.name} has been duplicated`);
      await loadApps();

      // Navigate to the duplicated app's builder
      if (result.data?.id) {
        window.location.hash = `#/apps/${result.data.id}`;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to duplicate app";
      toasts.error("Failed to duplicate app", message);
    }
  }

  function handleDelete(app: App) {
    appToDelete = app;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!appToDelete) return;

    deleteLoading = true;
    try {
      const response = await fetch(`/api/applications/${appToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete app");
      }

      toasts.success("App deleted", `${appToDelete.name} has been deleted`);
      deleteDialogOpen = false;
      appToDelete = null;
      await loadApps();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete app";
      toasts.error("Failed to delete app", message);
    } finally {
      deleteLoading = false;
    }
  }

  function handleKeyboardShortcut(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      // TODO: Open global search modal
      console.log("Open global search");
    }
  }
</script>

<svelte:window on:keydown={handleKeyboardShortcut} />

<div class="apps-layout">
  <GlobalNavBar sticky />

  <main class="apps-content">
    <header class="page-header">
      <h1>Applications</h1>
    </header>

    <div class="toolbar">
      <div class="search-container">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="Filter apps in this workspace..."
          bind:value={searchQuery}
        />
        <div class="search-shortcut">
          <kbd>&#8984;K</kbd>
          <span>Search all workspaces</span>
        </div>
      </div>

      <div class="toolbar-actions">
        <Button variant="primary" on:click={handleCreateApp} disabled={createAppLoading}>
          {#if createAppLoading}
            <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="31.416" stroke-dashoffset="10" />
            </svg>
            Creating...
          {:else}
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create App
          {/if}
        </Button>

        <button class="generate-btn" on:click={handleGenerateApp}>
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>
          Generate App
        </button>

        <button class="icon-btn" title="Bookmarks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </button>

        <button class="icon-btn" title="Sort">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m21 16-4 4-4-4" />
            <path d="M17 20V4" />
            <path d="m3 8 4-4 4 4" />
            <path d="M7 4v16" />
          </svg>
        </button>
      </div>
    </div>

    {#if loading}
      <div class="apps-grid">
        {#each Array(8) as _, i}
          <div class="skeleton-card" style="animation-delay: {i * 50}ms">
            <Skeleton className="skeleton-icon" />
            <div class="skeleton-text">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-subtitle" />
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div class="error-state">
        <div class="error-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3>Failed to load apps</h3>
        <p>{error}</p>
        <Button variant="outline" on:click={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    {:else if apps.length === 0}
      <div class="empty-state">
        <div class="empty-mascot">
          <img
            src="/assets/mascot/curious-chippy.png"
            alt="Chippy mascot"
            on:error={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <h3>No apps yet</h3>
        <p>Create your first AI application to get started</p>
        <Button variant="primary" on:click={handleCreateApp}>
          Create App
        </Button>
      </div>
    {:else if filteredApps.length === 0}
      <div class="empty-state">
        <h3>No matching apps</h3>
        <p>Try a different search term</p>
        <Button variant="outline" on:click={() => (searchQuery = "")}>
          Clear Search
        </Button>
      </div>
    {:else}
      <div class="apps-grid">
        {#each filteredApps as app (app.id)}
          <ApplicationCard
            application={app}
            onDuplicate={() => handleDuplicate(app)}
            onDelete={() => handleDelete(app)}
          />
        {/each}

        <!-- Create new app card -->
        <button class="create-card" on:click={handleCreateApp}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    {/if}
  </main>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog bind:open={deleteDialogOpen}>
  <DialogHeader>
    <DialogTitle>Delete App</DialogTitle>
    <DialogDescription>
      Are you sure you want to delete "{appToDelete?.name}"? This action cannot be undone.
    </DialogDescription>
  </DialogHeader>

  <DialogFooter>
    <Button
      type="button"
      variant="outline"
      on:click={() => {
        deleteDialogOpen = false;
        appToDelete = null;
      }}
      disabled={deleteLoading}
    >
      Cancel
    </Button>
    <Button
      type="button"
      variant="primary"
      on:click={confirmDelete}
      disabled={deleteLoading}
      style="background-color: var(--color-error);"
    >
      {deleteLoading ? "Deleting..." : "Delete"}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .apps-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .apps-content {
    flex: 1;
    padding: var(--space-8) var(--space-6);
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--text-primary);
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .search-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    width: 18px;
    height: 18px;
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 44px;
    padding: 0 160px 0 44px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: var(--text-primary);
    transition: all var(--transition-fast);
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--brand-color-muted);
  }

  .search-shortcut {
    position: absolute;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .search-shortcut kbd {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .search-shortcut span {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    margin-right: 6px;
  }

  .btn-icon.spinning {
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

  .generate-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 40px;
    padding: var(--space-2) var(--space-4);
    background: var(--color-gray-900);
    color: var(--color-white);
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  :global(.dark) .generate-btn,
  :global([data-theme="dark"]) .generate-btn {
    background: var(--color-gray-100);
    color: var(--color-gray-900);
  }

  .generate-btn:hover {
    background: var(--color-gray-800);
  }

  :global(.dark) .generate-btn:hover,
  :global([data-theme="dark"]) .generate-btn:hover {
    background: var(--color-gray-200);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-secondary);
    color: var(--text-primary);
  }

  .icon-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Apps Grid */
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(1, 1fr);
    gap: var(--space-4);
  }

  @media (min-width: 640px) {
    .apps-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 900px) {
    .apps-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1200px) {
    .apps-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* Create new card */
  .create-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    background: transparent;
    border: 2px dashed var(--border-primary);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .create-card svg {
    width: 24px;
    height: 24px;
    color: var(--text-tertiary);
    transition: color var(--transition-fast);
  }

  .create-card:hover {
    border-color: var(--brand-color);
    background: var(--brand-color-muted);
  }

  .create-card:hover svg {
    color: var(--brand-color);
  }

  /* Skeleton loading states */
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6);
    background: var(--surface-elevated);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    animation: fadeIn 0.3s ease-out forwards;
    opacity: 0;
  }

  @keyframes fadeIn {
    to {
      opacity: 1;
    }
  }

  :global(.skeleton-icon) {
    width: 50px !important;
    height: 50px !important;
    border-radius: var(--radius-full) !important;
  }

  .skeleton-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  :global(.skeleton-title) {
    width: 120px !important;
    height: 20px !important;
  }

  :global(.skeleton-subtitle) {
    width: 80px !important;
    height: 14px !important;
  }

  /* Empty and error states */
  .empty-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16) var(--space-6);
    text-align: center;
  }

  .empty-mascot img {
    width: 200px;
    height: auto;
    margin-bottom: var(--space-6);
  }

  .error-icon svg {
    width: 48px;
    height: 48px;
    color: var(--color-error);
    margin-bottom: var(--space-4);
  }

  .empty-state h3,
  .error-state h3 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin-bottom: var(--space-2);
    color: var(--text-primary);
  }

  .empty-state p,
  .error-state p {
    color: var(--text-secondary);
    margin-bottom: var(--space-6);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .search-shortcut {
      display: none;
    }

    .search-input {
      padding-right: 14px;
    }
  }

  @media (max-width: 768px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .generate-btn span {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .apps-content {
      padding: var(--space-4);
    }

    .page-header h1 {
      font-size: var(--text-2xl);
    }
  }
</style>
