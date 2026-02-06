<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, toasts, Input } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import {
    organization,
    organizationMembers,
    fetchOrganization,
    fetchOrganizationMembers,
    type OrganizationMember,
  } from "../../../stores/organization";
  import { user } from "../../../stores/auth";
  import { ArrowUpDown, UserPlus, Crown } from "lucide-svelte";
  import { formatDistanceToNow } from "date-fns";

  // Loading state
  let isLoading = true;
  let filterText = "";
  let sortBy: "name" | "activity" | "role" = "name";
  let sortDirection: "asc" | "desc" = "asc";

  // Pagination
  const PAGE_SIZE = 10;
  let currentPage = 0;

  // User role
  $: currentUserRole = getCurrentUserRole();
  $: isOwner = currentUserRole === "owner";
  $: isAdmin = currentUserRole === "admin";
  $: canManage = isOwner || isAdmin;

  function getCurrentUserRole(): string {
    if (!$user?.id) return "viewer";
    const member = $organizationMembers.find((m) => m.id === $user.id);
    return member?.role || "viewer";
  }

  onMount(async () => {
    isLoading = true;
    try {
      await Promise.all([fetchOrganization(), fetchOrganizationMembers()]);
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-team" },
        extra: { action: "loadOrganizationData" },
      });
      toasts.error("Error", "Failed to load team members");
    } finally {
      isLoading = false;
    }
  });

  // Filter and sort members
  $: filteredMembers = $organizationMembers
    .filter((m) => {
      if (!filterText) return true;
      const search = filterText.toLowerCase();
      return (
        m.email.toLowerCase().includes(search) ||
        (m.name?.toLowerCase().includes(search) ?? false)
      );
    })
    .sort((a, b) => {
      // Sort by role priority first (owner > admin > member > viewer)
      const rolePriority: Record<string, number> = {
        owner: 0,
        admin: 1,
        member: 2,
        viewer: 3,
      };

      if (sortBy === "role") {
        const priorityDiff = rolePriority[a.role] - rolePriority[b.role];
        if (priorityDiff !== 0) {
          return sortDirection === "asc" ? priorityDiff : -priorityDiff;
        }
      }

      if (sortBy === "activity") {
        // For now just sort by name as fallback since we don't have activity date
        const nameA = (a.name || a.email).toLowerCase();
        const nameB = (b.name || b.email).toLowerCase();
        return sortDirection === "asc"
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      }

      // Sort by name
      const nameA = (a.name || a.email).toLowerCase();
      const nameB = (b.name || b.email).toLowerCase();
      return sortDirection === "asc"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    });

  // Pagination
  $: totalPages = Math.ceil(filteredMembers.length / PAGE_SIZE);
  $: paginatedMembers = filteredMembers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  $: canPreviousPage = currentPage > 0;
  $: canNextPage = currentPage < totalPages - 1;

  function previousPage() {
    if (canPreviousPage) currentPage--;
  }

  function nextPage() {
    if (canNextPage) currentPage++;
  }

  // Reset page when filter changes
  $: if (filterText !== undefined) currentPage = 0;

  function toggleSort(column: "name" | "activity" | "role") {
    if (sortBy === column) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortBy = column;
      sortDirection = "asc";
    }
  }

  function getAvatarColor(name: string): string {
    const hash = Array.from(name).reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc),
      0
    );
    return `#${((hash & 0x00ffffff) | 0x1000000).toString(16).substring(1)}`;
  }

  function getInitial(member: OrganizationMember): string {
    const name = member.name || member.email;
    return name.charAt(0).toUpperCase();
  }

  function getRoleDisplayName(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function isCurrentUser(member: OrganizationMember): boolean {
    return member.id === $user?.id;
  }

  function getSeatLimitText(): string {
    // Enterprise/Business typically have unlimited, others have limits
    const tier = $organization?.subscriptionTier || "FREE";
    if (tier === "ENTERPRISE" || tier === "BUSINESS") {
      return "unlimited";
    }
    // Default seat limits for other tiers
    const seatLimits: Record<string, number> = {
      FREE: 1,
      PRO: 5,
      TEAM: 25,
    };
    return String(seatLimits[tier] || 1);
  }
</script>

<svelte:head>
  <title>Team - Chipp</title>
</svelte:head>

{#if isLoading}
  <div class="loading">Loading team members...</div>
{:else if !$organization}
  <div class="empty-state-container">
    <h2>No Organization Found</h2>
    <p>You don't appear to be part of an organization.</p>
  </div>
{:else}
  <!-- Page header -->
  <div class="page-header">
    <div class="header-left">
      <h1>Organization Team</h1>
      <p class="page-subtitle">
        Team members can see all non-private workspaces in the {$organization.name} organization.
      </p>
    </div>
    <div class="header-right">
      <span class="seat-count">{$organizationMembers.length} / {getSeatLimitText()} seats used</span>
    </div>
  </div>

  <!-- Members table -->
  <Card padding="lg">
    <div class="table-controls">
      <Input
        placeholder="Filter members by name..."
        bind:value={filterText}
        class="filter-input"
      />
      <Button variant="outline" size="sm">
        <UserPlus size={16} />
        Invite
      </Button>
    </div>

    <div class="table-container">
      <table class="members-table">
        <thead>
          <tr>
            <th>
              <span>Member Name</span>
            </th>
            <th class="hide-mobile">Email</th>
            <th>
              <button class="sort-header" on:click={() => toggleSort("activity")}>
                <span>Latest Activity</span>
                <ArrowUpDown size={14} />
              </button>
            </th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {#if paginatedMembers.length === 0}
            <tr>
              <td colspan="4" class="empty-state">
                No team members found.
              </td>
            </tr>
          {:else}
            {#each paginatedMembers as member}
              <tr>
                <td>
                  <div class="member-cell">
                    {#if member.pictureUrl}
                      <img src={member.pictureUrl} alt="" class="member-avatar" />
                    {:else}
                      <div
                        class="member-avatar"
                        style="background-color: {getAvatarColor(member.email)}"
                      >
                        <span class="avatar-initial">{getInitial(member)}</span>
                      </div>
                    {/if}
                    <span class="member-name">
                      {member.name || member.email.split("@")[0]}
                      {#if isCurrentUser(member)}
                        <span class="you-badge">You</span>
                      {/if}
                    </span>
                  </div>
                </td>
                <td class="hide-mobile email-cell">{member.email}</td>
                <td class="activity-cell">Accepted</td>
                <td class="role-cell">{getRoleDisplayName(member.role)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination - always visible like production -->
    <div class="pagination">
      <Button size="sm" variant="default" disabled={!canPreviousPage} on:click={previousPage}>
        Previous
      </Button>
      <Button size="sm" variant="default" disabled={!canNextPage} on:click={nextPage}>
        Next
      </Button>
    </div>
  </Card>
{/if}

<style>
  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    color: hsl(var(--muted-foreground));
  }

  .empty-state-container {
    text-align: center;
    padding: var(--space-12);
  }

  .empty-state-container h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .empty-state-container p {
    color: hsl(var(--muted-foreground));
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-6);
    gap: var(--space-4);
  }

  .header-left h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .header-right {
    flex-shrink: 0;
  }

  .seat-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .table-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .table-controls :global(.filter-input) {
    max-width: 300px;
  }

  .table-controls :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
    color: hsl(var(--muted-foreground));
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
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
  }

  .sort-header:hover {
    color: hsl(var(--foreground));
  }

  .member-cell {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    object-fit: cover;
  }

  img.member-avatar {
    background: hsl(var(--muted));
  }

  .avatar-initial {
    color: white;
    font-weight: var(--font-medium);
    font-size: var(--text-sm);
  }

  .member-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .you-badge {
    font-size: 10px;
    font-weight: var(--font-medium);
    padding: 2px 6px;
    border-radius: 9999px;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .email-cell {
    color: hsl(var(--foreground));
  }

  .activity-cell {
    color: hsl(var(--foreground));
  }

  .role-cell {
    color: hsl(var(--foreground));
  }

  .empty-state {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: var(--space-8) !important;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding-top: var(--space-4);
  }

  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      gap: var(--space-2);
    }

    .hide-mobile {
      display: none;
    }

    .table-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .table-controls :global(.filter-input) {
      max-width: none;
    }
  }
</style>
