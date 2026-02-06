<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, toasts, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { currentWorkspace, fetchWorkspaces } from "../../stores/workspace";
  import { user } from "../../stores/auth";
  import { ArrowLeft, Trash2, UserPlus, ArrowUpDown, ArrowLeftRight } from "lucide-svelte";
  import { formatDistanceToNow } from "date-fns";

  interface WorkspaceMember {
    id: string;
    userId: string;
    email: string;
    name: string | null;
    pictureUrl: string | null;
    role: "OWNER" | "EDITOR" | "VIEWER";
    joinedAt: string;
    latestActivity: string | null;
  }

  // Member data
  let members: WorkspaceMember[] = [];
  let isLoading = true;
  let filterText = "";
  let sortBy: "name" | "latestActivity" = "name";
  let sortDirection: "asc" | "desc" = "asc";

  // User role
  let currentUserRole: "OWNER" | "EDITOR" | "VIEWER" | null = null;
  $: isOwner = currentUserRole === "OWNER";
  $: isViewer = currentUserRole === "VIEWER";
  $: canManage = isOwner || currentUserRole === "EDITOR";

  // Invite modal
  let showInviteModal = false;
  let inviteEmail = "";
  let inviteRole: "EDITOR" | "VIEWER" = "EDITOR";
  let isInviting = false;

  // Delete modal
  let showDeleteModal = false;
  let memberToDelete: WorkspaceMember | null = null;
  let isDeleting = false;

  // Transfer ownership modal
  let showTransferModal = false;
  let showTransferConfirmModal = false;
  let selectedNewOwner: WorkspaceMember | null = null;
  let isTransferring = false;

  // Role change
  let isUpdatingRole = false;

  onMount(async () => {
    await loadMembers();
  });

  // React to workspace changes
  $: if ($currentWorkspace?.id) {
    loadMembers();
  }

  async function loadMembers() {
    if (!$currentWorkspace?.id) return;

    isLoading = true;
    try {
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
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-workspace-members" },
        extra: { workspaceId: $currentWorkspace?.id, action: "loadMembers" },
      });
      toasts.error("Error", "Failed to load workspace members");
    } finally {
      isLoading = false;
    }
  }

  // Filter and sort members
  $: filteredMembers = members
    .filter(m => {
      if (!filterText) return true;
      const search = filterText.toLowerCase();
      return (
        m.email.toLowerCase().includes(search) ||
        (m.name?.toLowerCase().includes(search) ?? false)
      );
    })
    .sort((a, b) => {
      // Owners first
      if (a.role === "OWNER" && b.role !== "OWNER") return -1;
      if (a.role !== "OWNER" && b.role === "OWNER") return 1;

      // Then by selected sort
      if (sortBy === "name") {
        const nameA = (a.name || a.email).toLowerCase();
        const nameB = (b.name || b.email).toLowerCase();
        return sortDirection === "asc"
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      } else {
        const dateA = a.latestActivity ? new Date(a.latestActivity).getTime() : 0;
        const dateB = b.latestActivity ? new Date(b.latestActivity).getTime() : 0;
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      }
    });

  $: otherMembers = members.filter(m => m.email !== $user?.email && m.role !== "OWNER");

  function toggleSort() {
    if (sortBy === "latestActivity") {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortBy = "latestActivity";
      sortDirection = "desc";
    }
  }

  function formatActivity(date: string | null): string {
    if (!date) return "No activity";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return "No activity";
    }
  }

  function getAvatarColor(name: string): string {
    const hash = Array.from(name).reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc),
      0
    );
    return `#${((hash & 0x00ffffff) | 0x1000000).toString(16).substring(1)}`;
  }

  function getInitial(member: WorkspaceMember): string {
    const name = member.name || member.email;
    return name.charAt(0).toUpperCase();
  }

  async function handleInvite() {
    if (!$currentWorkspace?.id || !inviteEmail.trim()) return;

    // Check if already a member
    if (members.some(m => m.email.toLowerCase() === inviteEmail.toLowerCase().trim())) {
      toasts.error("Error", "This user is already a member");
      return;
    }

    isInviting = true;
    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to invite member");
      }

      showInviteModal = false;
      inviteEmail = "";
      inviteRole = "EDITOR";
      toasts.success("Success", "Member invited successfully");
      await loadMembers();
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-workspace-members" },
        extra: { workspaceId: $currentWorkspace?.id, inviteEmail, inviteRole, action: "inviteMember" },
      });
      toasts.error("Error", error instanceof Error ? error.message : "Failed to invite member");
    } finally {
      isInviting = false;
    }
  }

  async function handleDeleteMember() {
    if (!$currentWorkspace?.id || !memberToDelete) return;

    isDeleting = true;
    try {
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/members/${memberToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to remove member");
      }

      showDeleteModal = false;
      memberToDelete = null;
      toasts.success("Success", "Member removed successfully");
      await loadMembers();
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-workspace-members" },
        extra: { workspaceId: $currentWorkspace?.id, memberId: memberToDelete?.id, action: "removeMember" },
      });
      toasts.error("Error", error instanceof Error ? error.message : "Failed to remove member");
    } finally {
      isDeleting = false;
    }
  }

  async function handleRoleChange(member: WorkspaceMember, newRole: "EDITOR" | "VIEWER") {
    if (!$currentWorkspace?.id) return;

    isUpdatingRole = true;
    try {
      // We need an endpoint to update member role - using PATCH on member
      const response = await fetch(`/api/workspaces/${$currentWorkspace.id}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error("Failed to update role");
      }

      // Update local state
      members = members.map(m =>
        m.id === member.id ? { ...m, role: newRole } : m
      );

      toasts.success("Success", "Role updated successfully");
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-workspace-members" },
        extra: { workspaceId: $currentWorkspace?.id, memberId: member.id, newRole, action: "updateRole" },
      });
      toasts.error("Error", "Failed to update role");
    } finally {
      isUpdatingRole = false;
    }
  }

  async function handleTransferOwnership() {
    if (!$currentWorkspace?.id || !selectedNewOwner) return;

    isTransferring = true;
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

      showTransferConfirmModal = false;
      showTransferModal = false;
      selectedNewOwner = null;
      toasts.success("Success", "Ownership transferred successfully");
      await loadMembers();
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-workspace-members" },
        extra: { workspaceId: $currentWorkspace?.id, newOwnerId: selectedNewOwner?.userId, action: "transferOwnership" },
      });
      toasts.error("Error", "Failed to transfer ownership");
    } finally {
      isTransferring = false;
    }
  }

  function openDeleteModal(member: WorkspaceMember) {
    memberToDelete = member;
    showDeleteModal = true;
  }

  function isCurrentUser(member: WorkspaceMember): boolean {
    return member.email === $user?.email;
  }

  function canEditMember(member: WorkspaceMember): boolean {
    return isOwner && !isCurrentUser(member) && member.role !== "OWNER";
  }
</script>

<svelte:head>
  <title>Workspace Members - Chipp</title>
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
          <p>You are a viewer in this workspace. Only workspace owners and editors can manage members.</p>
        </div>
      {:else}
        <!-- Page header -->
        <div class="page-header">
          <div class="header-content">
            <div class="header-text">
              <h1>Workspace Members</h1>
              <p class="page-subtitle">Manage who can access the {$currentWorkspace?.name} workspace.</p>
            </div>
            {#if isOwner}
              <p class="seat-count">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            {/if}
          </div>
        </div>

        <!-- Members table card -->
        <Card padding="lg" class="members-card">
          <div class="table-controls">
            <Input
              placeholder="Filter members by name..."
              bind:value={filterText}
              class="filter-input"
            />
            {#if canManage}
              <Button on:click={() => showInviteModal = true}>
                <UserPlus size={18} />
                <span>Invite</span>
              </Button>
            {/if}
          </div>

          <div class="table-container">
            <table class="members-table">
              <thead>
                <tr>
                  <th>Member Name</th>
                  <th class="hide-mobile">Email</th>
                  <th>
                    <button class="sort-header" on:click={toggleSort}>
                      <span>Latest Activity</span>
                      <ArrowUpDown size={14} />
                    </button>
                  </th>
                  <th>Role</th>
                  {#if isOwner}
                    <th class="actions-col"></th>
                  {/if}
                </tr>
              </thead>
              <tbody>
                {#if filteredMembers.length === 0}
                  <tr>
                    <td colspan={isOwner ? 5 : 4} class="empty-state">
                      No team members found.
                    </td>
                  </tr>
                {:else}
                  {#each filteredMembers as member}
                    <tr>
                      <td>
                        <div class="member-cell">
                          <div
                            class="member-avatar"
                            style="background-color: {getAvatarColor(member.email)}"
                          >
                            {#if member.pictureUrl}
                              <img src={member.pictureUrl} alt="" class="avatar-img" />
                            {:else}
                              <span class="avatar-initial">{getInitial(member)}</span>
                            {/if}
                          </div>
                          <div class="member-name-cell">
                            <p class="member-name">
                              {member.name || member.email}
                              {#if isCurrentUser(member)}
                                <span class="you-badge">You</span>
                              {/if}
                            </p>
                            <p class="member-email-mobile">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td class="hide-mobile email-cell">{member.email}</td>
                      <td class="activity-cell">{formatActivity(member.latestActivity)}</td>
                      <td class="role-cell">
                        {#if canEditMember(member)}
                          <select
                            class="role-select"
                            value={member.role}
                            on:change={(e) => handleRoleChange(member, e.currentTarget.value as "EDITOR" | "VIEWER")}
                            disabled={isUpdatingRole}
                          >
                            <option value="EDITOR">Editor</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        {:else}
                          <span class="role-text">
                            {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                          </span>
                        {/if}
                      </td>
                      {#if isOwner}
                        <td class="actions-cell">
                          {#if !isCurrentUser(member) && member.role !== "OWNER"}
                            <button
                              class="delete-button"
                              on:click={() => openDeleteModal(member)}
                              title="Remove member"
                            >
                              <Trash2 size={16} />
                            </button>
                          {/if}
                        </td>
                      {/if}
                    </tr>
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>
        </Card>

        <!-- Danger Zone - Transfer Ownership -->
        {#if isOwner}
          <div class="section">
            <div class="section-header">
              <h2>Danger Zone</h2>
              <p class="section-subtitle">Give workspace ownership to another team member.</p>
            </div>

            <Card padding="lg" class="danger-card">
              <div class="danger-action">
                <div class="danger-info">
                  <p class="danger-title">Transfer Ownership</p>
                  <p class="danger-description">
                    {otherMembers.length === 0
                      ? "You must have more than one team member to transfer ownership."
                      : "Transfer this workspace to another member. You will become an editor."}
                  </p>
                </div>
                <button
                  class="transfer-button"
                  disabled={otherMembers.length === 0}
                  on:click={() => showTransferModal = true}
                >
                  <ArrowLeftRight size={20} />
                </button>
              </div>
            </Card>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Invite Member Modal -->
<Dialog open={showInviteModal} onOpenChange={(open) => showInviteModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Invite to workspace</DialogTitle>
      <DialogDescription>
        Members you invite will have access to view and edit this workspace.
      </DialogDescription>
    </DialogHeader>
    <div class="modal-content">
      <div class="form-field">
        <label for="invite-role" class="field-label">Role</label>
        <select id="invite-role" class="role-select full-width" bind:value={inviteRole}>
          <option value="EDITOR">Editor</option>
          <option value="VIEWER">Viewer</option>
        </select>
      </div>
      <div class="form-field">
        <label for="invite-email" class="field-label">Email address</label>
        <Input
          id="invite-email"
          placeholder="Enter email address"
          bind:value={inviteEmail}
          disabled={isInviting}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" on:click={() => showInviteModal = false}>Cancel</Button>
      <Button
        disabled={!inviteEmail.trim() || isInviting}
        on:click={handleInvite}
      >
        {isInviting ? "Sending..." : "Send invite"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Delete Member Modal -->
<Dialog open={showDeleteModal} onOpenChange={(open) => showDeleteModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Remove Member</DialogTitle>
      <DialogDescription>
        Are you sure you want to remove {memberToDelete?.name || memberToDelete?.email} from this workspace?
        They will lose access to all apps and data.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" on:click={() => { showDeleteModal = false; memberToDelete = null; }}>Cancel</Button>
      <Button
        variant="destructive"
        disabled={isDeleting}
        on:click={handleDeleteMember}
      >
        {isDeleting ? "Removing..." : "Remove Member"}
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
        Select a member to transfer ownership to.
      </DialogDescription>
    </DialogHeader>
    <div class="modal-content">
      <select
        class="role-select full-width"
        bind:value={selectedNewOwner}
        on:change={(e) => {
          const memberId = e.currentTarget.value;
          selectedNewOwner = otherMembers.find(m => m.id === memberId) || null;
        }}
      >
        <option value="">Select a member</option>
        {#each otherMembers as member}
          <option value={member.id}>{member.name || member.email}</option>
        {/each}
      </select>
    </div>
    <DialogFooter>
      <Button variant="outline" on:click={() => { showTransferModal = false; selectedNewOwner = null; }}>Cancel</Button>
      <Button
        disabled={!selectedNewOwner}
        on:click={() => {
          showTransferModal = false;
          showTransferConfirmModal = true;
        }}
      >
        Transfer
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

<!-- Transfer Confirmation Modal -->
<Dialog open={showTransferConfirmModal} onOpenChange={(open) => showTransferConfirmModal = open}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Transfer</DialogTitle>
      <DialogDescription>
        By transferring ownership, you are giving all permissions to {selectedNewOwner?.name || selectedNewOwner?.email}.
        You will become an editor.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" on:click={() => { showTransferConfirmModal = false; selectedNewOwner = null; }}>Cancel</Button>
      <Button
        variant="destructive"
        disabled={isTransferring}
        on:click={handleTransferOwnership}
      >
        {isTransferring ? "Transferring..." : "Confirm Transfer"}
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
    max-width: 800px;
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

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .header-text h1 {
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

  .seat-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .members-card :global(.card) {
    background: hsl(var(--card));
  }

  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .table-controls :global(.filter-input) {
    width: 200px;
  }

  .table-container {
    overflow-x: auto;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
  }

  .members-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .members-table th,
  .members-table td {
    padding: var(--space-3) var(--space-4);
    text-align: left;
  }

  .members-table th {
    background: hsl(var(--muted) / 0.3);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    border-bottom: 1px solid hsl(var(--border));
  }

  .members-table td {
    border-bottom: 1px solid hsl(var(--border));
  }

  .members-table tbody tr:last-child td {
    border-bottom: none;
  }

  .sort-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: none;
    padding: 0;
    color: hsl(var(--foreground));
    font-weight: var(--font-medium);
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
  }

  .sort-header:hover {
    color: hsl(var(--primary));
  }

  .actions-col {
    width: 50px;
  }

  .member-cell {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .member-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-initial {
    color: white;
    font-weight: var(--font-medium);
    font-size: var(--text-sm);
  }

  .member-name-cell {
    min-width: 0;
  }

  .member-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .you-badge {
    font-size: 10px;
    font-weight: var(--font-semibold);
    padding: 2px 6px;
    border-radius: 9999px;
    background: hsl(var(--muted) / 0.5);
    color: hsl(var(--foreground));
  }

  .member-email-mobile {
    display: none;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .email-cell {
    color: hsl(var(--foreground));
  }

  .activity-cell {
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
  }

  .role-cell {
    min-width: 100px;
  }

  .role-select {
    padding: var(--space-1-5) var(--space-2);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .role-select:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }

  .role-select.full-width {
    width: 100%;
    padding: var(--space-2-5) var(--space-3);
  }

  .role-text {
    color: hsl(var(--foreground));
    text-transform: capitalize;
  }

  .actions-cell {
    text-align: center;
  }

  .delete-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .delete-button:hover {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .empty-state {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: var(--space-8) !important;
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

  .danger-card :global(.card) {
    background: hsl(var(--card));
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

  .transfer-button {
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

  .transfer-button:hover:not(:disabled) {
    background: hsl(var(--destructive) / 0.1);
  }

  .transfer-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-content {
    padding: var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
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

    .hide-mobile {
      display: none;
    }

    .member-email-mobile {
      display: block;
    }

    .table-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .table-controls :global(.filter-input) {
      width: 100%;
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .seat-count {
      margin: 0;
    }
  }
</style>
