<script context="module" lang="ts">
  // Re-export types for external use
  export type { CustomAction, Parameter } from "./types";
</script>

<script lang="ts">
  import BuilderCard from "./BuilderCard.svelte";
  import { Button, toasts } from "$lib/design-system";
  import CustomActionModal from "./CustomActionModal.svelte";
  import type { CustomAction, Parameter } from "./types";

  export let actions: CustomAction[] = [];
  export let onActionsChange: (actions: CustomAction[]) => void = () => {};

  let modalOpen = false;
  let editingAction: CustomAction | null = null;

  function handleAddAction() {
    editingAction = null;
    modalOpen = true;
  }

  function handleEditAction(action: CustomAction) {
    editingAction = action;
    modalOpen = true;
  }

  function handleDeleteAction(id: string) {
    const updatedActions = actions.filter((a) => a.id !== id);
    onActionsChange(updatedActions);
    toasts.success("Action deleted");
  }

  function handleModalSubmit(event: CustomEvent<{ action: CustomAction }>) {
    const { action } = event.detail;

    if (editingAction) {
      // Update existing action
      const updatedActions = actions.map((a) => (a.id === action.id ? action : a));
      onActionsChange(updatedActions);
      toasts.success("Action updated");
    } else {
      // Add new action
      onActionsChange([...actions, action]);
      toasts.success("Action added");
    }
  }

  function handleModalClose() {
    modalOpen = false;
    editingAction = null;
  }

  function getMethodColor(method: string): string {
    switch (method) {
      case "GET": return "var(--color-success)";
      case "POST": return "var(--color-primary)";
      case "PUT": return "#f59e0b";
      case "PATCH": return "#8b5cf6";
      case "DELETE": return "var(--color-error)";
      default: return "var(--text-secondary)";
    }
  }
</script>

<BuilderCard title="Custom APIs" rightIcon="dropdown">
  <div class="content">
    {#if actions.length === 0}
      <div class="empty-state">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        <h4>No APIs Connected</h4>
        <p>Give your AI the ability to call external APIs and services</p>
        <button type="button" class="add-action-btn" on:click={handleAddAction}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add API
        </button>
      </div>
    {:else}
      <div class="actions-container">
        <div class="actions-list">
          {#each actions as action}
            <div
              class="action-item"
              role="button"
              tabindex="0"
              on:click={() => handleEditAction(action)}
              on:keydown={(e) => e.key === 'Enter' && handleEditAction(action)}
            >
              <div class="action-info">
                <div class="action-header">
                  <span class="action-name">{action.name}</span>
                  <span class="action-method" style="background-color: {getMethodColor(action.method)}20; color: {getMethodColor(action.method)}">
                    {action.method}
                  </span>
                </div>
                {#if action.description}
                  <span class="action-description">{action.description}</span>
                {/if}
                <span class="action-endpoint">{action.endpoint}</span>
                {#if (action.headers?.length ?? 0) > 0 || (action.queryParams?.length ?? 0) > 0 || (action.bodyParams?.length ?? 0) > 0}
                  <div class="action-params">
                    {#if (action.headers?.length ?? 0) > 0}
                      <span class="param-badge">{action.headers?.length} header{(action.headers?.length ?? 0) !== 1 ? 's' : ''}</span>
                    {/if}
                    {#if (action.queryParams?.length ?? 0) > 0}
                      <span class="param-badge">{action.queryParams?.length} query param{(action.queryParams?.length ?? 0) !== 1 ? 's' : ''}</span>
                    {/if}
                    {#if (action.bodyParams?.length ?? 0) > 0}
                      <span class="param-badge">{action.bodyParams?.length} body param{(action.bodyParams?.length ?? 0) !== 1 ? 's' : ''}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              <button
                type="button"
                class="action-delete-btn"
                on:click|stopPropagation={() => handleDeleteAction(action.id)}
                aria-label="Delete action"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          {/each}
        </div>

        <button type="button" class="add-action-inline-btn" on:click={handleAddAction}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Another Action
        </button>
      </div>
    {/if}
  </div>
</BuilderCard>

<CustomActionModal
  bind:open={modalOpen}
  {editingAction}
  on:close={handleModalClose}
  on:submit={handleModalSubmit}
/>

<style>
  .content {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8);
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state h4 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .add-action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    margin-top: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-action-btn:hover {
    background: var(--color-primary);
    color: white;
  }

  .actions-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .action-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-3);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    gap: var(--space-3);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
  }

  .action-item:hover {
    border-color: var(--color-primary);
    background: var(--bg-tertiary);
  }

  .action-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .action-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .action-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .action-method {
    font-size: 10px;
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-md);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-description {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .action-endpoint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-params {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .param-badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
  }

  .action-delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2);
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .action-delete-btn:hover {
    background: var(--bg-primary);
    color: var(--color-error);
  }

  .add-action-inline-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    background: none;
    border: 2px dashed var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-action-inline-btn:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
</style>
