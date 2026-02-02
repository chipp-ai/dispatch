<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, toasts, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "$lib/design-system";
  import { currentWorkspace, workspaceStore, fetchWorkspaces } from "../../stores/workspace";
  import { user } from "../../stores/auth";
  import { ArrowLeft, Camera, Trash2, LogOut, ArrowRight } from "lucide-svelte";
  import { push } from "svelte-spa-router";

  interface WorkspaceMember {
    id: string;
    userId: string;
    email: string;
    name: string | null;
    role: "OWNER" | "EDITOR" | "VIEWER";
    joinedAt: string;
  }

  // Form state
  let name = "";
  let pictureUrl = "";
  let website = "";
  let about = "";
  let isSaving = false;
  let fileInput: HTMLInputElement;

  // Workspace data
  let members: WorkspaceMember[] = [];
  let currentUserRole: "OWNER" | "EDITOR" | "VIEWER" | null = null;
  let isLoading = true;
  let hasMultipleWorkspaces = false;

  // Modal states
  let showDeleteModal = false;
  let showLeaveModal = false;
  let showTransferModal = false;
  let deleteConfirmText = "";
  let selectedNewOwner: WorkspaceMember | null = null;

  $: isOwner = currentUserRole === "OWNER";
  $: isViewer = currentUserRole === "VIEWER";
  $: canDelete = isOwner && hasMultipleWorkspaces;

  onMount(async () => {
    await loadWorkspaceData();
  });

  // React to workspace changes
  $: if ($currentWorkspace?.id) {
    loadWorkspaceData();
  }

  async function loadWorkspaceData() {
    if (!$currentWorkspace?.id) return;

    isLoading = true;
    try {
      // Fetch members to determine role
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/members`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        members = data.data || [];

        // Find current user's role
        const currentMember = members.find(m => m.email === $user?.email);
        currentUserRole = currentMember?.role || null;
      }

      // Check if user has multiple workspaces
      hasMultipleWorkspaces = ($workspaceStore.workspaces?.length || 0) > 1;

      // Initialize form with workspace data
      name = "";
      pictureUrl = "";
      website = "";
      about = "";
    } catch (error) {
      console.error("Failed to load workspace data:", error);
      toasts.error("Error", "Failed to load workspace data");
    } finally {
      isLoading = false;
    }
  }

  $: hasChanges = name.trim() !== "" || pictureUrl !== "" || website.trim() !== "" || about.trim() !== "";

  function validateUrl(url: string): boolean {
    if (!url.trim()) return true;
    const urlString = url.trim();
    const validatePrefixes = ["http://", "https://", "www."];
    const hasValidPrefix = validatePrefixes.some(prefix =>
      urlString.toLowerCase().startsWith(prefix)
    );
    const urlPattern = /^(https?:\/\/|www\.)[^\s]+\.[^\s]+$/;
    return hasValidPrefix && urlPattern.test(urlString);
  }

  async function handleSubmit() {
    if (!hasChanges || !$currentWorkspace?.id) return;

    if (website && !validateUrl(website)) {
      toasts.error("Error", "Please enter a valid website URL");
      return;
    }

    isSaving = true;
    try {
      const updateData: Record<string, string> = {};
      if (name.trim()) updateData.name = name.trim();
      if (pictureUrl) updateData.pictureUrl = pictureUrl;
      if (website.trim()) updateData.website = website.trim();
      if (about.trim()) updateData.description = about.trim();

      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error("Failed to update workspace");
      }

      // Refresh workspaces
      await fetchWorkspaces();

      // Clear form
      name = "";
      pictureUrl = "";
      website = "";
      about = "";

      toasts.success("Success", "Workspace updated successfully");
    } catch (error) {
      console.error("Failed to update workspace:", error);
      toasts.error("Error", "Failed to update workspace");
    } finally {
      isSaving = false;
    }
  }

  function handleAvatarClick() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Preview URL - in production would upload to storage
    const reader = new FileReader();
    reader.onloadend = () => {
      pictureUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleLeaveWorkspace() {
    if (!$currentWorkspace?.id) return;

    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/leave`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to leave workspace");
      }

      showLeaveModal = false;
      toasts.success("Success", "You have left the workspace");
      await fetchWorkspaces();
      push("/dashboard");
    } catch (error) {
      console.error("Failed to leave workspace:", error);
      toasts.error("Error", error instanceof Error ? error.message : "Failed to leave workspace");
    }
  }

  async function handleDeleteWorkspace() {
    if (!$currentWorkspace?.id || deleteConfirmText !== $currentWorkspace.name) return;

    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete workspace");
      }

      showDeleteModal = false;
      toasts.success("Success", "Workspace deleted");
      await fetchWorkspaces();
      push("/dashboard");
    } catch (error) {
      console.error("Failed to delete workspace:", error);
      toasts.error("Error", "Failed to delete workspace");
    }
  }

  async function handleTransferOwnership() {
    if (!$currentWorkspace?.id || !selectedNewOwner) return;

    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newOwnerUserId: selectedNewOwner.userId }),
      });

      if (!response.ok) {
        throw new Error("Failed to transfer ownership");
      }

      showTransferModal = false;
      selectedNewOwner = null;
      toasts.success("Success", "Ownership transferred successfully");
      await loadWorkspaceData();
    } catch (error) {
      console.error("Failed to transfer ownership:", error);
      toasts.error("Error", "Failed to transfer ownership");
    }
  }

  $: otherMembers = members.filter(m => m.email !== $user?.email);
</script>

<svelte:head>
  <title>Workspace Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <!-- Mobile back button -->
      <a href="#/settings" class="back-link">
        <ArrowLeft size={16} />
        <span>Back to Settings</span>
      </a>

      {#if isLoading}
        <div class="loading">Loading...</div>
      {:else if isViewer}
        <div class="viewer-message">
          <h2>Access Restricted</h2>
          <p>You are a viewer in this workspace. Only workspace owners and editors can manage settings.</p>
        </div>
      {:else}
        <!-- Page header -->
        <div class="page-header">
          <h1>Workspace Settings</h1>
          <p class="page-subtitle">Update branding and workspace details.</p>
        </div>

        <!-- Workspace form -->
        <Card padding="lg" class="settings-card">
          <div class="form-content">
            <!-- Avatar section -->
            <div class="avatar-section">
              <button type="button" class="avatar-button" on:click={handleAvatarClick}>
                {#if pictureUrl || $currentWorkspace?.iconUrl}
                  <img src={pictureUrl || $currentWorkspace?.iconUrl} alt="Workspace" class="avatar-image" />
                {:else}
                  <div class="avatar-placeholder">
                    {($currentWorkspace?.name || "W").charAt(0).toUpperCase()}
                  </div>
                {/if}
                <div class="avatar-overlay">
                  <Camera size={20} />
                </div>
              </button>
              <input
                bind:this={fileInput}
                type="file"
                accept="image/*"
                class="hidden-input"
                on:change={handleFileChange}
              />
              <p class="avatar-hint">Click to upload a logo</p>
            </div>

            <!-- Name field -->
            <div class="form-field">
              <label for="name" class="field-label">Workspace Name</label>
              <input
                id="name"
                type="text"
                class="field-input"
                placeholder={$currentWorkspace?.name || "Workspace Name"}
                bind:value={name}
              />
            </div>

            <!-- Website field -->
            <div class="form-field">
              <label for="website" class="field-label">Website</label>
              <input
                id="website"
                type="text"
                class="field-input"
                placeholder="www.yourwebsite.com"
                bind:value={website}
              />
            </div>

            <!-- About field -->
            <div class="form-field">
              <label for="about" class="field-label">About</label>
              <textarea
                id="about"
                class="field-textarea"
                placeholder="Share a brief description about your workspace"
                bind:value={about}
                rows="3"
              />
            </div>

            <!-- Save button -->
            <div class="form-actions">
              <Button
                variant="default"
                disabled={!hasChanges || isSaving}
                on:click={handleSubmit}
              >
                {isSaving ? "Saving..." : "Save Workspace Details"}
              </Button>
            </div>
          </div>
        </Card>

        <!-- Danger Zone -->
        <div class="section">
          <div class="section-header">
            <h2>Danger Zone</h2>
            <p class="section-subtitle">{isOwner ? "Delete or transfer this workspace." : "Leave this workspace."}</p>
          </div>

          <Card padding="lg" class="danger-card">
            {#if isOwner}
              <div class="danger-actions">
                <!-- Transfer Workspace -->
                <div class="danger-action">
                  <div class="danger-info">
                    <p class="danger-title">Transfer Workspace</p>
                    <p class="danger-description">Move ownership to another member.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={otherMembers.length === 0}
                    on:click={() => showTransferModal = true}
                  >
                    Transfer
                  </Button>
                </div>

                <div class="divider" />

                <!-- Delete Workspace -->
                <div class="danger-action">
                  <div class="danger-info">
                    <p class="danger-title">Delete Workspace</p>
                    {#if canDelete}
                      <p class="danger-description">Permanently delete this workspace and all its data.</p>
                    {:else}
                      <p class="danger-description">You must have more than one workspace to delete this one.</p>
                    {/if}
                  </div>
                  <button
                    class="icon-button"
                    disabled={!canDelete}
                    on:click={() => showDeleteModal = true}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            {:else}
              <!-- Leave Workspace for non-owners -->
              <div class="danger-action">
                <div class="danger-info">
                  <p class="danger-title">Leave Workspace</p>
                  <p class="danger-description">Remove yourself from this workspace.</p>
                </div>
                <button class="icon-button" on:click={() => showLeaveModal = true}>
                  <LogOut size={20} />
                </button>
              </div>
            {/if}
          </Card>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Leave Workspace Modal -->
<Dialog open={showLeaveModal} onOpenChange={(open) => showLeaveModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Leave Workspace</DialogTitle>
      <DialogDescription>
        Are you sure you want to leave "{$currentWorkspace?.name}"? You will lose access to all apps and data in this workspace.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" on:click={() => showLeaveModal = false}>Cancel</Button>
      <Button variant="destructive" on:click={handleLeaveWorkspace}>Leave Workspace</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Delete Workspace Modal -->
<Dialog open={showDeleteModal} onOpenChange={(open) => showDeleteModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Workspace</DialogTitle>
      <DialogDescription>
        This action cannot be undone. This will permanently delete the workspace "{$currentWorkspace?.name}" and all associated data.
      </DialogDescription>
    </DialogHeader>
    <div class="modal-content">
      <label for="confirm-delete" class="field-label">
        Type <strong>{$currentWorkspace?.name}</strong> to confirm:
      </label>
      <input
        id="confirm-delete"
        type="text"
        class="field-input"
        placeholder="Type workspace name"
        bind:value={deleteConfirmText}
      />
    </div>
    <DialogFooter>
      <Button variant="outline" on:click={() => { showDeleteModal = false; deleteConfirmText = ""; }}>Cancel</Button>
      <Button
        variant="destructive"
        disabled={deleteConfirmText !== $currentWorkspace?.name}
        on:click={handleDeleteWorkspace}
      >
        Delete Workspace
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Transfer Ownership Modal -->
<Dialog open={showTransferModal} onOpenChange={(open) => showTransferModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Transfer Ownership</DialogTitle>
      <DialogDescription>
        Select a member to become the new owner of this workspace. You will become an editor.
      </DialogDescription>
    </DialogHeader>
    <div class="modal-content">
      <div class="member-list">
        {#each otherMembers as member}
          <button
            class="member-option"
            class:selected={selectedNewOwner?.id === member.id}
            on:click={() => selectedNewOwner = member}
          >
            <div class="member-avatar">
              {(member.name || member.email).charAt(0).toUpperCase()}
            </div>
            <div class="member-info">
              <p class="member-name">{member.name || "Unnamed"}</p>
              <p class="member-email">{member.email}</p>
            </div>
            <span class="member-role">{member.role}</span>
          </button>
        {/each}
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" on:click={() => { showTransferModal = false; selectedNewOwner = null; }}>Cancel</Button>
      <Button
        disabled={!selectedNewOwner}
        on:click={handleTransferOwnership}
      >
        Transfer Ownership
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<style>
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 64px;
  }

  .settings-main {
    flex: 1;
    overflow-y: auto;
  }

  .settings-content {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .back-link {
    display: none;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    transition: color 0.2s;
  }

  .back-link:hover {
    color: hsl(var(--foreground));
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    color: hsl(var(--muted-foreground));
  }

  .viewer-message {
    text-align: center;
    padding: var(--space-12);
  }

  .viewer-message h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .viewer-message p {
    color: hsl(var(--muted-foreground));
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .settings-card :global(.card),
  .danger-card :global(.card) {
    background: hsl(var(--card));
  }

  .form-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .avatar-button {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-lg);
    border: none;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    background: transparent;
  }

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .avatar-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .avatar-button:hover .avatar-overlay {
    opacity: 1;
  }

  .hidden-input {
    display: none;
  }

  .avatar-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .field-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .field-input,
  .field-textarea {
    padding: var(--space-2-5) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    resize: vertical;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
  }

  .section {
    margin-top: var(--space-8);
  }

  .section-header {
    margin-bottom: var(--space-4);
  }

  .section-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .danger-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .danger-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .danger-info {
    flex: 1;
  }

  .danger-title {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .danger-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .divider {
    border-top: 1px solid hsl(var(--border));
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--destructive));
    cursor: pointer;
    transition: background 0.2s;
  }

  .icon-button:hover:not(:disabled) {
    background: hsl(var(--destructive) / 0.1);
  }

  .icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-content {
    padding: var(--space-4) 0;
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 300px;
    overflow-y: auto;
  }

  .member-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    text-align: left;
    width: 100%;
  }

  .member-option:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .member-option.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.1);
  }

  .member-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .member-info {
    flex: 1;
    min-width: 0;
  }

  .member-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-email {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-role {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
  }

  @media (min-width: 769px) {
    .settings-layout {
      padding-left: 256px;
    }
  }

  @media (max-width: 768px) {
    .back-link {
      display: flex;
    }

    .settings-content {
      padding: var(--space-4);
    }
  }
</style>
