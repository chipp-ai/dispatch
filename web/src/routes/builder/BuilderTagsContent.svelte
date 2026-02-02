<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Input, Button, toasts } from "$lib/design-system";
  import { Tag, Plus, Edit2, Trash2, X, Check, MessageSquare, BarChart3 } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  // Selected tag for detail view
  let selectedTagId: string | null = null;
  $: selectedTag = tags.find(t => t.id === selectedTagId) || null;

  interface AppTag {
    id: string;
    name: string;
    color: string;
    count: number;
  }

  // Tags state
  let tags: AppTag[] = [];
  let isCreating = false;
  let newTagName = "";
  let newTagColor = "#3B82F6";
  let editingTagId: string | null = null;
  let editTagName = "";
  let editTagColor = "";

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
    await loadTags();
  });

  async function loadTags() {
    try {
      const response = await fetch(`/api/applications/${appId}/tags`, {
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
      const response = await fetch(`/api/applications/${appId}/tags`, {
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
        toasts.success("Created", "Tag created successfully");
      }
    } catch (e) {
      console.error("Failed to create tag:", e);
      toasts.error("Error", "Failed to create tag");
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
      const response = await fetch(`/api/applications/${appId}/tags/${editingTagId}`, {
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
        toasts.success("Updated", "Tag updated successfully");
      }
    } catch (e) {
      console.error("Failed to update tag:", e);
      toasts.error("Error", "Failed to update tag");
    }
  }

  async function deleteTag(tagId: string) {
    if (!confirm("Are you sure you want to delete this tag? This will remove it from all messages.")) {
      return;
    }

    try {
      const response = await fetch(`/api/applications/${appId}/tags/${tagId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        tags = tags.filter(t => t.id !== tagId);
        toasts.success("Deleted", "Tag deleted");
      }
    } catch (e) {
      console.error("Failed to delete tag:", e);
      toasts.error("Error", "Failed to delete tag");
    }
  }

  function getTotalMessages() {
    return tags.reduce((sum, tag) => sum + tag.count, 0);
  }
</script>

<div class="split-panel-layout">
  <!-- Left Panel: Tag List -->
  <div class="left-panel">
    <div class="panel-header">
      <h2>Tags</h2>
      <Button variant="primary" size="sm" on:click={() => isCreating = true}>
        <Plus size={16} />
        Create
      </Button>
    </div>

    <!-- Create Tag Form -->
    {#if isCreating}
      <div class="create-form">
        <Input
          bind:value={newTagName}
          placeholder="Tag name"
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
        <div class="form-actions">
          <Button variant="ghost" size="sm" on:click={() => { isCreating = false; newTagName = ""; }}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" on:click={createTag} disabled={!newTagName.trim()}>
            Create
          </Button>
        </div>
      </div>
    {/if}

    <!-- Tag List -->
    <div class="tag-list">
      {#if tags.length === 0}
        <div class="empty-list">
          <Tag size={32} />
          <p>No tags yet</p>
          <span>Create your first tag to get started</span>
        </div>
      {:else}
        {#each tags as tag (tag.id)}
          <button
            class="tag-item"
            class:selected={selectedTagId === tag.id}
            on:click={() => selectedTagId = tag.id}
          >
            <div class="tag-badge" style="background-color: {tag.color}">
              <Tag size={12} />
            </div>
            <div class="tag-info">
              <span class="tag-name">{tag.name}</span>
              <span class="tag-count">{tag.count} messages</span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Stats -->
    {#if tags.length > 0}
      <div class="stats-section">
        <div class="stat-row">
          <span class="stat-label">Total Tags</span>
          <span class="stat-value">{tags.length}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Tagged Messages</span>
          <span class="stat-value">{getTotalMessages()}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Right Panel: Tag Detail or Empty State -->
  <div class="right-panel">
    {#if selectedTag}
      <div class="tag-detail">
        <div class="detail-header">
          {#if editingTagId === selectedTag.id}
            <div class="edit-form-inline">
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
              <div class="edit-actions">
                <Button variant="ghost" size="sm" on:click={cancelEditing}>Cancel</Button>
                <Button variant="primary" size="sm" on:click={saveEdit}>Save</Button>
              </div>
            </div>
          {:else}
            <div class="detail-title">
              <div class="tag-badge large" style="background-color: {selectedTag.color}">
                <Tag size={18} />
                {selectedTag.name}
              </div>
              <div class="detail-actions">
                <Button variant="ghost" size="sm" on:click={() => startEditing(selectedTag)}>
                  <Edit2 size={14} />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" on:click={() => deleteTag(selectedTag.id)}>
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </div>
          {/if}
        </div>

        <Card padding="md" class="detail-card">
          <div class="detail-stat">
            <MessageSquare size={20} />
            <div>
              <span class="detail-stat-value">{selectedTag.count}</span>
              <span class="detail-stat-label">messages with this tag</span>
            </div>
          </div>
        </Card>

        <Card padding="md" class="info-card">
          <h3>How to use this tag</h3>
          <ul class="usage-list">
            <li>Apply to messages in the Chat interface</li>
            <li>Filter conversations by this tag</li>
            <li>Track usage in the Metrics dashboard</li>
          </ul>
        </Card>
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">
          <Tag size={48} />
        </div>
        <h3>Select a tag</h3>
        <p>Choose a tag from the list to view details and manage it</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .split-panel-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Left Panel */
  .left-panel {
    width: 320px;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid hsl(var(--border));
    background: hsl(var(--background));
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .panel-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .create-form {
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .color-picker {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .color-option {
    width: 24px;
    height: 24px;
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

  .tag-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .empty-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8) var(--space-4);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-list p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-list span {
    font-size: var(--text-sm);
  }

  .tag-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .tag-item:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .tag-item.selected {
    background: hsl(var(--primary) / 0.1);
  }

  .tag-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    color: white;
    flex-shrink: 0;
  }

  .tag-badge.large {
    width: auto;
    height: auto;
    padding: var(--space-2) var(--space-3);
    gap: var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
  }

  .tag-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .tag-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-count {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .stats-section {
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) 0;
  }

  .stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .stat-value {
    font-weight: var(--font-semibold);
  }

  /* Right Panel */
  .right-panel {
    flex: 1;
    overflow-y: auto;
    background: hsl(var(--muted) / 0.2);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: var(--space-8);
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
  }

  .empty-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .tag-detail {
    padding: var(--space-6);
    max-width: 600px;
  }

  .detail-header {
    margin-bottom: var(--space-6);
  }

  .detail-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .detail-actions {
    display: flex;
    gap: var(--space-2);
  }

  .edit-form-inline {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .detail-card {
    margin-bottom: var(--space-4);
  }

  .detail-stat {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: hsl(var(--primary));
  }

  .detail-stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .detail-stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-left: var(--space-1);
  }

  .info-card h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-3) 0;
  }

  .usage-list {
    margin: 0;
    padding-left: var(--space-4);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .usage-list li {
    margin-bottom: var(--space-2);
  }

  .usage-list li:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    .split-panel-layout {
      flex-direction: column;
    }

    .left-panel {
      width: 100%;
      min-width: unset;
      max-height: 50vh;
      border-right: none;
      border-bottom: 1px solid hsl(var(--border));
    }

    .right-panel {
      flex: 1;
    }
  }
</style>
