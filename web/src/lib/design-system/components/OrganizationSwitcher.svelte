<script lang="ts">
  import { onMount } from "svelte";
  import DropdownMenu from "./DropdownMenu.svelte";
  import DropdownMenuItem from "./DropdownMenuItem.svelte";
  import DropdownMenuSeparator from "./DropdownMenuSeparator.svelte";
  import Dialog from "./Dialog.svelte";
  import DialogHeader from "./DialogHeader.svelte";
  import DialogTitle from "./DialogTitle.svelte";
  import DialogFooter from "./DialogFooter.svelte";
  import Button from "./Button.svelte";
  import Input from "./Input.svelte";
  import {
    organizationStore,
    currentOrganization,
    setCurrentOrganization,
    createOrganization,
    initOrganization,
    type Organization,
  } from "../../../stores/organization";

  let open = false;
  let showCreateDialog = false;
  let newOrgName = "";
  let isCreating = false;

  onMount(() => {
    initOrganization();
  });

  function handleSelectOrg(org: Organization) {
    setCurrentOrganization(org);
    open = false;
  }

  function openCreateDialog() {
    open = false;
    showCreateDialog = true;
    newOrgName = "";
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;

    isCreating = true;
    try {
      await createOrganization(newOrgName.trim());
      showCreateDialog = false;
      newOrgName = "";
    } finally {
      isCreating = false;
    }
  }

  function getTierBadgeColor(tier: string): string {
    switch (tier) {
      case "ENTERPRISE":
        return "var(--color-purple)";
      case "BUSINESS":
        return "var(--color-blue)";
      case "TEAM":
        return "var(--color-green)";
      case "PRO":
        return "var(--color-orange)";
      default:
        return "var(--text-tertiary)";
    }
  }
</script>

<DropdownMenu bind:open align="start">
  <button
    slot="trigger"
    class="org-trigger"
    on:click|stopPropagation={() => open = !open}
    aria-haspopup="true"
    aria-expanded={open}
  >
    <div class="org-icon">
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
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    </div>
    <span class="org-name">{$currentOrganization?.name || "Organization"}</span>
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

  <div class="org-menu" slot="default" let:close>
    <div class="org-list">
      {#each $organizationStore.organizations as org}
        <DropdownMenuItem on:click={() => handleSelectOrg(org)}>
          <div class="org-item">
            <div class="org-item-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              </svg>
            </div>
            <span class="org-item-name">{org.name}</span>
            {#if org.subscriptionTier !== "FREE"}
              <span class="tier-badge" style="color: {getTierBadgeColor(org.subscriptionTier)}">
                {org.subscriptionTier}
              </span>
            {/if}
            {#if $currentOrganization?.id === org.id}
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
    </div>

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
      Create Organization
    </DropdownMenuItem>
  </div>
</DropdownMenu>

<Dialog bind:open={showCreateDialog}>
  <DialogHeader>
    <DialogTitle>Create Organization</DialogTitle>
  </DialogHeader>

  <form on:submit|preventDefault={handleCreateOrg} class="create-form">
    <Input
      label="Organization Name"
      placeholder="My Organization"
      bind:value={newOrgName}
      disabled={isCreating}
    />
  </form>

  <DialogFooter>
    <Button variant="ghost" on:click={() => (showCreateDialog = false)} disabled={isCreating}>
      Cancel
    </Button>
    <Button on:click={handleCreateOrg} disabled={isCreating || !newOrgName.trim()}>
      {isCreating ? "Creating..." : "Create"}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .org-trigger {
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

  .org-trigger:hover {
    background: var(--bg-secondary);
  }

  .org-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    overflow: hidden;
  }

  .org-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .org-name {
    font-size: var(--text-sm);
    font-weight: 500;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    color: var(--text-tertiary);
  }

  .org-menu {
    min-width: 220px;
  }

  .org-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .org-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }

  .org-item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    overflow: hidden;
    flex-shrink: 0;
  }

  .org-item-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .org-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tier-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .check-icon {
    color: var(--color-success);
    flex-shrink: 0;
  }

  .create-form {
    padding: var(--space-4) 0;
  }
</style>
