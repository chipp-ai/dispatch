<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import { Card, Input, Button } from "$lib/design-system";
  import { Tag, Plus, Edit2, Trash2, X, Check, MessageSquare, BarChart3 } from "lucide-svelte";

  export let params: { appId?: string } = {};

  interface AppTag {
    id: string;
    name: string;
    color: string;
    count: number;
  }

  let app: { id: string; name: string } | null = null;
  let isLoading = true;

  // Tags state
  let tags: AppTag[] = [];
  let isCreating = false;
  let newTagName = "";
  let newTagColor = "#3B82F6";
  let editingTagId: string | null = null;
  let editTagName = "";
  let editTagColor = "";

  // Selected tag for detail view
  let selectedTagId: string | null = null;
  $: selectedTag = tags.find(t => t.id === selectedTagId) || null;

  // Predefined colors for easy selection
  const colorOptions = [
    "#3B82F6", // Blue
    "#10B981", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#06B6D4", // Cyan
    "#F97316", // Orange
  ];

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await Promise.all([loadApp(), loadTags()]);
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.hash = "#/login";
          return;
        }
        throw new Error("Failed to load app");
      }

      const result = await response.json();
      app = result.data;
    } catch (e) {
      console.error("Failed to load app:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadTags() {
    try {
      const response = await fetch(`/api/applications/${params.appId}/tags`, {
        credentials: "include",
      });
      if (response.ok) {
        const result = await response.json();
        tags = result.data || [];
      }
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  }

  async function createTag() {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch(`/api/applications/${params.appId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });

      if (response.ok) {
        const result = await response.json();
        tags = [...tags, result.data];
        newTagName = "";
        newTagColor = "#3B82F6";
        isCreating = false;
      }
    } catch (e) {
      console.error("Failed to create tag:", e);
    }
  }

  function startEditing(tag: AppTag) {
    editingTagId = tag.id;
    editTagName = tag.name;
    editTagColor = tag.color;
  }

  function cancelEditing() {
    editingTagId = null;
    editTagName = "";
    editTagColor = "";
  }

  async function saveEdit() {
    if (!editTagName.trim() || !editingTagId) return;

    try {
      const response = await fetch(`/api/applications/${params.appId}/tags/${editingTagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: editTagName, color: editTagColor }),
      });

      if (response.ok) {
        tags = tags.map(t =>
          t.id === editingTagId ? { ...t, name: editTagName, color: editTagColor } : t
        );
        cancelEditing();
      }
    } catch (e) {
      console.error("Failed to update tag:", e);
    }
  }

  async function deleteTag(tagId: string) {
    if (!confirm("Are you sure you want to delete this tag? This will remove it from all messages.")) {
      return;
    }

    try {
      const response = await fetch(`/api/applications/${params.appId}/tags/${tagId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        tags = tags.filter(t => t.id !== tagId);
      }
    } catch (e) {
      console.error("Failed to delete tag:", e);
    }
  }

  function getTotalMessages() {
    return tags.reduce((sum, tag) => sum + tag.count, 0);
  }
</script>

<svelte:head>
  <title>Tags - Chipp</title>
</svelte:head>

<div class="app-builder">
  <BuilderSidebar appId={params.appId} activeTab="tags" />

  <div class="main-content">
    <BuilderHeader
      appName={app?.name || "Loading..."}
      lastSaved={null}
      isSaving={false}
      hasUnsavedChanges={false}
      onSave={() => {}}
      onPublish={() => {}}
      isPublishing={false}
      hidePublish={true}
    />

    <div class="split-panel-layout">
      <!-- Left Panel: Tags List -->
      <div class="left-panel">
        <div class="panel-content">
          <div class="panel-header">
            <h2>Tags</h2>
            {#if !isCreating}
              <Button variant="primary" size="sm" on:click={() => isCreating = true}>
                <Plus size={16} />
                Create Tag
              </Button>
            {/if}
          </div>

          {#if isLoading}
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading...</p>
            </div>
          {:else}
            <!-- Create Tag Form -->
            {#if isCreating}
              <div class="create-form">
                <div class="form-row">
                  <Input
                    bind:value={newTagName}
                    placeholder="Tag name (e.g., Important, Follow-up)"
                    autofocus
                  />
                  <div class="color-picker">
                    {#each colorOptions as color}
                      <button
                        class="color-option"
                        class:selected={newTagColor === color}
                        style="background-color: {color}"
                        on:click={() => newTagColor = color}
                      ></button>
                    {/each}
                  </div>
                </div>
                <div class="form-actions">
                  <Button variant="ghost" size="sm" on:click={() => { isCreating = false; newTagName = ""; }}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" on:click={createTag} disabled={!newTagName.trim()}>
                    Create Tag
                  </Button>
                </div>
              </div>
            {/if}

            {#if tags.length === 0 && !isCreating}
              <div class="empty-state">
                <Tag size={48} />
                <p>No tags yet</p>
                <span>Create tags to categorize and organize your chat messages</span>
              </div>
            {:else if tags.length > 0}
              <div class="tags-list">
                {#each tags as tag (tag.id)}
                  <button
                    class="tag-item"
                    class:selected={selectedTagId === tag.id}
                    on:click={() => selectedTagId = tag.id}
                  >
                    <div class="tag-badge" style="background-color: {tag.color}">
                      <Tag size={14} />
                      {tag.name}
                    </div>
                    <span class="tag-count">{tag.count} messages</span>
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <div class="resize-handle"></div>

      <!-- Right Panel: Tag Detail or Empty State -->
      <div class="right-panel">
        {#if selectedTag}
          <div class="detail-view">
            <div class="detail-header">
              <div class="tag-badge large" style="background-color: {selectedTag.color}">
                <Tag size={20} />
                {selectedTag.name}
              </div>
              <div class="detail-actions">
                <Button variant="ghost" size="sm" on:click={() => startEditing(selectedTag)}>
                  <Edit2 size={16} />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" on:click={() => deleteTag(selectedTag.id)}>
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </div>

            {#if editingTagId === selectedTag.id}
              <Card padding="md" class="edit-card">
                <h3>Edit Tag</h3>
                <div class="edit-form">
                  <Input bind:value={editTagName} placeholder="Tag name" />
                  <div class="color-picker">
                    {#each colorOptions as color}
                      <button
                        class="color-option"
                        class:selected={editTagColor === color}
                        style="background-color: {color}"
                        on:click={() => editTagColor = color}
                      ></button>
                    {/each}
                  </div>
                  <div class="form-actions">
                    <Button variant="ghost" size="sm" on:click={cancelEditing}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" on:click={saveEdit}>
                      Save Changes
                    </Button>
                  </div>
                </div>
              </Card>
            {/if}

            <div class="stats-grid">
              <Card padding="md" class="stat-card">
                <div class="stat-icon">
                  <MessageSquare size={20} />
                </div>
                <div class="stat-content">
                  <span class="stat-value">{selectedTag.count}</span>
                  <span class="stat-label">Tagged Messages</span>
                </div>
              </Card>
            </div>

            <!-- How Tags Work -->
            <Card padding="md" class="info-card">
              <h3>How to Use This Tag</h3>
              <div class="features-list">
                <div class="feature-item">
                  <div class="feature-icon">
                    <Tag size={18} />
                  </div>
                  <div>
                    <h4>Apply to Messages</h4>
                    <p>Apply this tag to messages in your chat conversations to categorize them.</p>
                  </div>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <h4>Filter Conversations</h4>
                    <p>Use this tag to filter and search through your chat history.</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        {:else}
          <div class="empty-state-panel">
            <div class="empty-state-content">
              <div class="empty-state-icon">
                <Tag size={48} />
              </div>
              <h3>Select a tag</h3>
              <p>Choose a tag from the list to view details and manage it</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .app-builder {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @media (min-width: 1024px) {
    .main-content {
      margin-left: 100px;
    }
  }

  /* Two-panel layout */
  .split-panel-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .left-panel {
    width: 100%;
    overflow-y: auto;
    border-right: 1px solid var(--border-primary);
    background: hsl(var(--background));
  }

  @media (min-width: 1024px) {
    .left-panel {
      width: 35%;
      min-width: 320px;
      max-width: 450px;
    }
  }

  .panel-content {
    padding: var(--space-4);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .panel-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .resize-handle {
    width: 1px;
    background: var(--border-primary);
    display: none;
  }

  @media (min-width: 1024px) {
    .resize-handle {
      display: block;
    }
  }

  .right-panel {
    display: none;
    flex: 1;
    overflow-y: auto;
    background: hsl(var(--muted) / 0.3);
  }

  @media (min-width: 1024px) {
    .right-panel {
      display: flex;
      flex-direction: column;
    }
  }

  /* Loading state */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Create form */
  .create-form {
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .color-picker {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .color-option {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }

  .color-option:hover {
    transform: scale(1.1);
  }

  .color-option.selected {
    border-color: hsl(var(--foreground));
    transform: scale(1.1);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  /* Empty state in left panel */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-state p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state span {
    font-size: var(--text-sm);
  }

  /* Tags list */
  .tags-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tag-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .tag-item:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .tag-item.selected {
    background: hsl(var(--muted));
    border-color: var(--border-primary);
  }

  .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    color: white;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    width: fit-content;
  }

  .tag-badge.large {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-base);
  }

  .tag-count {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Right panel detail view */
  .detail-view {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .detail-actions {
    display: flex;
    gap: var(--space-2);
  }

  .edit-card {
    margin-bottom: var(--space-2);
  }

  .edit-card h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-3) 0;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  :global(.stat-card) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
  }

  .stat-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .info-card h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-3) 0;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .feature-item {
    display: flex;
    gap: var(--space-3);
  }

  .feature-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .feature-item h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .feature-item p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  /* Empty state panel */
  .empty-state-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: var(--space-8);
  }

  .empty-state-content {
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .empty-state-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-4);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-xl);
  }

  .empty-state-content h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .empty-state-content p {
    font-size: var(--text-sm);
    margin: 0;
  }
</style>
