<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, toasts, Input } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import {
    organization,
    organizationMembers,
    fetchOrganization,
    fetchOrganizationMembers,
    type OrganizationMember,
  } from "../../stores/organization";
  import { user } from "../../stores/auth";
  import { ArrowLeft, Users, ArrowUpDown, Shield, Crown, Eye, UserCog } from "lucide-svelte";
  import { formatDistanceToNow } from "date-fns";

  // Loading state
  let isLoading = true;
  let filterText = "";
  let sortBy: "name" | "role" = "name";
  let sortDirection: "asc" | "desc" = "asc";

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
        extra: { userId: $user?.id, action: "loadOrganizationData" },
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

      // Then by name
      const nameA = (a.name || a.email).toLowerCase();
      const nameB = (b.name || b.email).toLowerCase();
      return sortDirection === "asc"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    });

  function toggleSort(column: "name" | "role") {
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

  function getRoleIcon(role: string) {
    switch (role) {
      case "owner":
        return Crown;
      case "admin":
        return Shield;
      case "viewer":
        return Eye;
      default:
        return UserCog;
    }
  }

  function getRoleDisplayName(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function isCurrentUser(member: OrganizationMember): boolean {
    return member.id === $user?.id;
  }
</script>

<svelte:head>
  <title>Team - Chipp</title>
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
        <div class="loading">Loading team members...</div>
      {:else if !$organization}
        <div class="empty-state-container">
          <h2>No Organization Found</h2>
          <p>You don't appear to be part of an organization.</p>
        </div>
      {:else}
        <!-- Page header -->
        <div class="page-header">
          <div class="header-icon">
            <Users size={24} />
          </div>
          <div class="header-text">
            <h1>Team</h1>
            <p class="page-subtitle">
              Members of the {$organization.name} organization.
            </p>
          </div>
        </div>

        <!-- Team info card -->
        <section class="section">
          <Card>
            <div class="team-stats">
              <div class="stat">
                <span class="stat-value">{$organizationMembers.length}</span>
                <span class="stat-label">Total Members</span>
              </div>
              <div class="stat">
                <span class="stat-value">
                  {$organizationMembers.filter((m) => m.role === "owner" || m.role === "admin").length}
                </span>
                <span class="stat-label">Admins</span>
              </div>
              <div class="stat">
                <span class="stat-value tier-{$organization.subscriptionTier.toLowerCase()}">
                  {$organization.subscriptionTier}
                </span>
                <span class="stat-label">Plan</span>
              </div>
            </div>
          </Card>
        </section>

        <!-- Members table -->
        <section class="section">
          <h2>Organization Members</h2>
          <Card padding="lg">
            <div class="table-controls">
              <Input
                placeholder="Filter by name or email..."
                bind:value={filterText}
                class="filter-input"
              />
            </div>

            <div class="table-container">
              <table class="members-table">
                <thead>
                  <tr>
                    <th>
                      <button class="sort-header" on:click={() => toggleSort("name")}>
                        <span>Member</span>
                        {#if sortBy === "name"}
                          <ArrowUpDown size={14} />
                        {/if}
                      </button>
                    </th>
                    <th class="hide-mobile">Email</th>
                    <th>
                      <button class="sort-header" on:click={() => toggleSort("role")}>
                        <span>Role</span>
                        {#if sortBy === "role"}
                          <ArrowUpDown size={14} />
                        {/if}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#if filteredMembers.length === 0}
                    <tr>
                      <td colspan="3" class="empty-state">
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
                              <span class="avatar-initial">{getInitial(member)}</span>
                            </div>
                            <div class="member-info">
                              <p class="member-name">
                                {member.name || member.email.split("@")[0]}
                                {#if isCurrentUser(member)}
                                  <span class="you-badge">You</span>
                                {/if}
                              </p>
                              <p class="member-email-mobile">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td class="hide-mobile email-cell">{member.email}</td>
                        <td class="role-cell">
                          <span class="role-badge role-{member.role}">
                            <svelte:component this={getRoleIcon(member.role)} size={14} />
                            {getRoleDisplayName(member.role)}
                          </span>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <!-- Role explanations -->
        <section class="section">
          <h2>Role Permissions</h2>
          <div class="role-cards">
            <Card padding="md">
              <div class="role-card-header">
                <Crown size={20} class="role-icon owner" />
                <h4>Owner</h4>
              </div>
              <p>Full control over the organization including billing, members, and all settings.</p>
            </Card>
            <Card padding="md">
              <div class="role-card-header">
                <Shield size={20} class="role-icon admin" />
                <h4>Admin</h4>
              </div>
              <p>Can manage organization settings and members. Cannot modify billing.</p>
            </Card>
            <Card padding="md">
              <div class="role-card-header">
                <UserCog size={20} class="role-icon member" />
                <h4>Member</h4>
              </div>
              <p>Can create and manage apps. Cannot modify organization settings.</p>
            </Card>
            <Card padding="md">
              <div class="role-card-header">
                <Eye size={20} class="role-icon viewer" />
                <h4>Viewer</h4>
              </div>
              <p>Read-only access to apps and data. Cannot make changes.</p>
            </Card>
          </div>
        </section>

        <!-- Note about management -->
        {#if !canManage}
          <Card>
            <div class="info-message">
              <p>
                Team management is handled by organization owners and admins.
                Contact your organization administrator if you need to add or remove members.
              </p>
            </div>
          </Card>
        {/if}
      {/if}
    </div>
  </div>
</div>

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
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .header-text h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .section {
    margin-bottom: var(--space-6);
  }

  .section h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .team-stats {
    display: flex;
    gap: var(--space-8);
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .stat-value.tier-free {
    color: hsl(var(--muted-foreground));
  }

  .stat-value.tier-pro {
    color: hsl(var(--primary));
  }

  .stat-value.tier-team {
    color: hsl(210 100% 40%);
  }

  .stat-value.tier-business {
    color: hsl(270 100% 40%);
  }

  .stat-value.tier-enterprise {
    color: hsl(45 100% 30%);
  }

  .stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .table-controls {
    margin-bottom: var(--space-4);
  }

  .table-controls :global(.filter-input) {
    max-width: 300px;
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
  }

  .avatar-initial {
    color: white;
    font-weight: var(--font-medium);
    font-size: var(--text-sm);
  }

  .member-info {
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

  .role-cell {
    min-width: 120px;
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5);
    padding: var(--space-1) var(--space-2-5);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  .role-badge.role-owner {
    background: hsl(45 100% 50% / 0.1);
    color: hsl(45 100% 30%);
  }

  .role-badge.role-admin {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .role-badge.role-member {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .role-badge.role-viewer {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .empty-state {
    text-align: center;
    color: hsl(var(--muted-foreground));
    padding: var(--space-8) !important;
  }

  .role-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-4);
  }

  .role-card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .role-card-header h4 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .role-cards p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  .role-cards :global(.role-icon) {
    flex-shrink: 0;
  }

  .role-cards :global(.role-icon.owner) {
    color: hsl(45 100% 30%);
  }

  .role-cards :global(.role-icon.admin) {
    color: hsl(var(--primary));
  }

  .role-cards :global(.role-icon.member) {
    color: hsl(var(--foreground));
  }

  .role-cards :global(.role-icon.viewer) {
    color: hsl(var(--muted-foreground));
  }

  .info-message {
    padding: var(--space-2);
    text-align: center;
  }

  .info-message p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
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

    .page-header {
      flex-direction: column;
      gap: var(--space-3);
    }

    .team-stats {
      gap: var(--space-6);
    }

    .role-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
