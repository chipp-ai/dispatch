<script lang="ts">
  import { onMount } from "svelte";
  import DropdownMenu from "./DropdownMenu.svelte";
  import DropdownMenuItem from "./DropdownMenuItem.svelte";
  import DropdownMenuSeparator from "./DropdownMenuSeparator.svelte";
  import DropdownMenuLabel from "./DropdownMenuLabel.svelte";
  import Dialog from "./Dialog.svelte";
  import DialogHeader from "./DialogHeader.svelte";
  import DialogTitle from "./DialogTitle.svelte";
  import DialogFooter from "./DialogFooter.svelte";
  import Button from "./Button.svelte";
  import Input from "./Input.svelte";
  import {
    workspaceStore,
    currentWorkspace,
    privateWorkspaces,
    sharedWorkspaces,
    setCurrentWorkspace,
    createWorkspace,
    initWorkspace,
    type Workspace,
  } from "../../../stores/workspace";
  import { currentOrganization } from "../../../stores/organization";

  let open = false;
  let showCreateDialog = false;
  let newWorkspaceName = "";
  let newWorkspaceVisibility: "PRIVATE" | "SHARED" = "PRIVATE";
  let isCreating = false;

  onMount(() => {
    initWorkspace();
  });

  function handleSelectWorkspace(workspace: Workspace) {
    setCurrentWorkspace(workspace);
    open = false;
  }

  function openCreateDialog() {
    open = false;
    showCreateDialog = true;
    newWorkspaceName = "";
    newWorkspaceVisibility = "PRIVATE";
  }

  async function handleCreateWorkspace() {
    if (!newWorkspaceName.trim() || !$currentOrganization) return;

    isCreating = true;
    try {
      await createWorkspace(
        newWorkspaceName.trim(),
        $currentOrganization.id,
        newWorkspaceVisibility
      );
      showCreateDialog = false;
      newWorkspaceName = "";
    } finally {
      isCreating = false;
    }
  }
</script>

<DropdownMenu bind:open align="start">
  <button
    slot="trigger"
    class="workspace-trigger"
    on:click|stopPropagation={() => open = !open}
    aria-haspopup="true"
    aria-expanded={open}
  >
    <div class="workspace-icon">
      {#if $currentWorkspace?.iconUrl}
        <img src={$currentWorkspace.iconUrl} alt={$currentWorkspace.name} />
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
      {/if}
    </div>
    <span class="workspace-name">{$currentWorkspace?.name || "Workspace"}</span>
    <svg
      class="chevron"
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  <div class="workspace-menu" slot="default" let:close>
    {#if $privateWorkspaces.length > 0}
      <DropdownMenuLabel>Private</DropdownMenuLabel>
      {#each $privateWorkspaces as workspace}
        <DropdownMenuItem on:click={() => handleSelectWorkspace(workspace)}>
          <div class="workspace-item">
            <div class="workspace-item-icon">
              {#if workspace.iconUrl}
                <img src={workspace.iconUrl} alt={workspace.name} />
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              {/if}
            </div>
            <span class="workspace-item-name">{workspace.name}</span>
            {#if $currentWorkspace?.id === workspace.id}
              <svg
                class="check-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </div>
        </DropdownMenuItem>
      {/each}
    {/if}

    {#if $sharedWorkspaces.length > 0}
      {#if $privateWorkspaces.length > 0}
        <DropdownMenuSeparator />
      {/if}
      <DropdownMenuLabel>Shared</DropdownMenuLabel>
      {#each $sharedWorkspaces as workspace}
        <DropdownMenuItem on:click={() => handleSelectWorkspace(workspace)}>
          <div class="workspace-item">
            <div class="workspace-item-icon shared">
              {#if workspace.iconUrl}
                <img src={workspace.iconUrl} alt={workspace.name} />
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              {/if}
            </div>
            <span class="workspace-item-name">{workspace.name}</span>
            {#if workspace.memberCount}
              <span class="member-count">{workspace.memberCount}</span>
            {/if}
            {#if $currentWorkspace?.id === workspace.id}
              <svg
                class="check-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </div>
        </DropdownMenuItem>
      {/each}
    {/if}

    <DropdownMenuSeparator />

    <DropdownMenuItem on:click={openCreateDialog}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Create Workspace
    </DropdownMenuItem>
  </div>
</DropdownMenu>

<Dialog bind:open={showCreateDialog}>
  <DialogHeader>
    <DialogTitle>Create Workspace</DialogTitle>
  </DialogHeader>

  <form on:submit|preventDefault={handleCreateWorkspace} class="create-form">
    <Input
      label="Workspace Name"
      placeholder="My Workspace"
      bind:value={newWorkspaceName}
      disabled={isCreating}
    />

    <div class="visibility-options">
      <label class="visibility-option">
        <input
          type="radio"
          name="visibility"
          value="PRIVATE"
          bind:group={newWorkspaceVisibility}
          disabled={isCreating}
        />
        <div class="visibility-content">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div class="visibility-text">
            <span class="visibility-title">Private</span>
            <span class="visibility-description">Only you can access</span>
          </div>
        </div>
      </label>

      <label class="visibility-option">
        <input
          type="radio"
          name="visibility"
          value="SHARED"
          bind:group={newWorkspaceVisibility}
          disabled={isCreating}
        />
        <div class="visibility-content">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <div class="visibility-text">
            <span class="visibility-title">Shared</span>
            <span class="visibility-description">Team members can access</span>
          </div>
        </div>
      </label>
    </div>
  </form>

  <DialogFooter>
    <Button variant="ghost" on:click={() => (showCreateDialog = false)} disabled={isCreating}>
      Cancel
    </Button>
    <Button on:click={handleCreateWorkspace} disabled={isCreating || !newWorkspaceName.trim()}>
      {isCreating ? "Creating..." : "Create"}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .workspace-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--text-primary);
    transition: background-color var(--transition-fast);
  }

  .workspace-trigger:hover {
    background: var(--bg-secondary);
  }

  .workspace-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    overflow: hidden;
  }

  .workspace-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .workspace-name {
    font-size: var(--text-sm);
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    color: var(--text-tertiary);
  }

  .workspace-menu {
    min-width: 200px;
  }

  .workspace-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .workspace-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    overflow: hidden;
    flex-shrink: 0;
  }

  .workspace-item-icon.shared {
    color: var(--color-blue);
  }

  .workspace-item-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .workspace-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }

  .check-icon {
    color: var(--color-success);
    flex-shrink: 0;
  }

  .create-form {
    padding: var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .visibility-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .visibility-option:hover {
    background: var(--bg-secondary);
  }

  .visibility-option:has(input:checked) {
    border-color: var(--color-primary);
    background: rgba(var(--color-primary-rgb), 0.05);
  }

  .visibility-option input {
    margin-top: 2px;
  }

  .visibility-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .visibility-content svg {
    margin-top: 2px;
    color: var(--text-secondary);
  }

  .visibility-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .visibility-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .visibility-description {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
</style>
