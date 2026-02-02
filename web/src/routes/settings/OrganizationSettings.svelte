<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, Input, Label, Spinner } from "$lib/design-system";
  import { user } from "../../stores/auth";
  import {
    organization,
    isOrganizationLoading,
    fetchOrganization,
    updateOrganization,
    organizationMembers,
    fetchOrganizationMembers,
    type Organization,
  } from "../../stores/organization";
  import { Building2, Save, AlertCircle } from "lucide-svelte";

  // Form state
  let name = "";
  let isSaving = false;
  let saveError: string | null = null;
  let saveSuccess = false;
  let hasChanges = false;

  // User role check
  $: canEdit = $user && ["owner", "admin"].includes(getUserRole($user.id));
  $: currentUserRole = $user ? getUserRole($user.id) : null;

  function getUserRole(userId: string): string {
    const member = $organizationMembers.find((m) => m.id === userId);
    return member?.role || "member";
  }

  // Initialize form when organization loads
  $: if ($organization) {
    initForm($organization);
  }

  function initForm(org: Organization) {
    if (!hasChanges) {
      name = org.name || "";
    }
  }

  // Track changes
  $: if ($organization) {
    hasChanges = name !== ($organization.name || "");
  }

  onMount(async () => {
    await Promise.all([fetchOrganization(), fetchOrganizationMembers()]);
  });

  async function handleSave() {
    if (!hasChanges || isSaving) return;

    isSaving = true;
    saveError = null;
    saveSuccess = false;

    try {
      await updateOrganization({ name });
      saveSuccess = true;
      hasChanges = false;
      setTimeout(() => {
        saveSuccess = false;
      }, 3000);
    } catch (error) {
      saveError = error instanceof Error ? error.message : "Failed to save";
    } finally {
      isSaving = false;
    }
  }

  function handleDiscard() {
    if ($organization) {
      name = $organization.name || "";
      hasChanges = false;
    }
  }

  function getTierDisplayName(tier: string): string {
    const names: Record<string, string> = {
      FREE: "Free",
      PRO: "Pro",
      TEAM: "Team",
      BUSINESS: "Business",
      ENTERPRISE: "Enterprise",
    };
    return names[tier] || tier;
  }
</script>

<svelte:head>
  <title>Organization Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <div class="settings-header">
        <div class="header-icon">
          <Building2 size={24} />
        </div>
        <div class="header-text">
          <h1>Organization Settings</h1>
          <p>Manage your organization's profile and settings</p>
        </div>
      </div>

      {#if $isOrganizationLoading && !$organization}
        <div class="loading-container">
          <Spinner size="lg" />
          <p>Loading organization...</p>
        </div>
      {:else if !$organization}
        <Card>
          <div class="empty-state">
            <AlertCircle size={48} />
            <h3>No organization found</h3>
            <p>You don't appear to be part of an organization.</p>
          </div>
        </Card>
      {:else}
        <!-- Organization Profile Section -->
        <section class="settings-section">
          <h2>Organization Profile</h2>
          <Card>
            <div class="form-group">
              <Label for="org-name">Organization Name</Label>
              <Input
                id="org-name"
                bind:value={name}
                placeholder="Enter organization name"
                disabled={!canEdit}
              />
              {#if !canEdit}
                <p class="field-hint">Only owners and admins can edit organization settings</p>
              {/if}
            </div>

            <div class="form-group">
              <Label>Subscription</Label>
              <div class="subscription-badge">
                <span class="tier-badge tier-{$organization.subscriptionTier.toLowerCase()}">
                  {getTierDisplayName($organization.subscriptionTier)}
                </span>
                <span class="usage-badge">Usage-based billing</span>
              </div>
              <p class="field-hint">
                <a href="#/settings/billing">Manage your subscription</a>
              </p>
            </div>

            <div class="form-group">
              <Label>Organization ID</Label>
              <code class="org-id">{$organization.id}</code>
            </div>
          </Card>
        </section>

        <!-- Save Actions -->
        {#if canEdit}
          <div class="save-actions" class:visible={hasChanges || saveError || saveSuccess}>
            <div class="save-status">
              {#if saveError}
                <span class="error-message">
                  <AlertCircle size={16} />
                  {saveError}
                </span>
              {:else if saveSuccess}
                <span class="success-message">Changes saved successfully</span>
              {:else if hasChanges}
                <span class="unsaved-message">You have unsaved changes</span>
              {/if}
            </div>
            <div class="save-buttons">
              <Button variant="ghost" on:click={handleDiscard} disabled={!hasChanges || isSaving}>
                Discard
              </Button>
              <Button on:click={handleSave} disabled={!hasChanges || isSaving}>
                {#if isSaving}
                  <Spinner size="sm" />
                  Saving...
                {:else}
                  <Save size={16} />
                  Save Changes
                {/if}
              </Button>
            </div>
          </div>
        {/if}

        <!-- Your Role Section -->
        <section class="settings-section">
          <h2>Your Role</h2>
          <Card>
            <div class="role-info">
              <div class="role-badge role-{currentUserRole}">
                {currentUserRole}
              </div>
              <p class="role-description">
                {#if currentUserRole === "owner"}
                  You have full control over this organization, including billing, members, and settings.
                {:else if currentUserRole === "admin"}
                  You can manage organization settings and members, but cannot modify billing.
                {:else if currentUserRole === "member"}
                  You can access organization resources but cannot modify settings.
                {:else}
                  You have view-only access to this organization.
                {/if}
              </p>
            </div>
          </Card>
        </section>

        <!-- Quick Links -->
        <section class="settings-section">
          <h2>Quick Links</h2>
          <div class="quick-links">
            <a href="#/settings/team" class="quick-link">
              <Card padding="md">
                <h4>Team Members</h4>
                <p>Manage organization team members</p>
              </Card>
            </a>
            <a href="#/settings/billing" class="quick-link">
              <Card padding="md">
                <h4>Billing</h4>
                <p>View plans and payment methods</p>
              </Card>
            </a>
            <a href="#/settings/whitelabel" class="quick-link">
              <Card padding="md">
                <h4>Whitelabel</h4>
                <p>Customize branding and appearance</p>
              </Card>
            </a>
          </div>
        </section>
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

  .settings-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
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

  .header-text p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .empty-state h3 {
    margin: var(--space-4) 0 var(--space-2);
    color: hsl(var(--foreground));
  }

  .settings-section {
    margin-bottom: var(--space-8);
  }

  .settings-section h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .form-group {
    margin-bottom: var(--space-6);
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .field-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-2);
  }

  .field-hint a {
    color: hsl(var(--primary));
    text-decoration: none;
  }

  .field-hint a:hover {
    text-decoration: underline;
  }

  .subscription-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .tier-badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-transform: capitalize;
  }

  .tier-badge.tier-free {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .tier-badge.tier-pro {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .tier-badge.tier-team {
    background: hsl(210 100% 50% / 0.1);
    color: hsl(210 100% 40%);
  }

  .tier-badge.tier-business {
    background: hsl(270 100% 50% / 0.1);
    color: hsl(270 100% 40%);
  }

  .tier-badge.tier-enterprise {
    background: hsl(45 100% 50% / 0.1);
    color: hsl(45 100% 30%);
  }

  .usage-badge {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    padding: var(--space-0-5) var(--space-2);
    background: hsl(var(--muted));
    border-radius: var(--radius);
  }

  .org-id {
    display: block;
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted));
    border-radius: var(--radius);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: hsl(var(--muted-foreground));
    word-break: break-all;
  }

  .save-actions {
    position: sticky;
    bottom: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
    margin-bottom: var(--space-8);
  }

  .save-actions.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .save-status {
    font-size: var(--text-sm);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--destructive));
  }

  .success-message {
    color: hsl(142 76% 36%);
  }

  .unsaved-message {
    color: hsl(var(--muted-foreground));
  }

  .save-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .role-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .role-badge {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-transform: capitalize;
    flex-shrink: 0;
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
    color: hsl(var(--muted-foreground));
  }

  .role-badge.role-viewer {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .role-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.6;
  }

  .quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
  }

  .quick-link {
    text-decoration: none;
  }

  .quick-link :global(.card) {
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .quick-link:hover :global(.card) {
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: var(--shadow-md);
  }

  .quick-link h4 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .quick-link p {
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
    .settings-content {
      padding: var(--space-4);
    }

    .settings-header {
      flex-direction: column;
      gap: var(--space-3);
    }

    .save-actions {
      flex-direction: column;
      gap: var(--space-3);
      align-items: stretch;
    }

    .save-buttons {
      justify-content: flex-end;
    }

    .role-info {
      flex-direction: column;
      gap: var(--space-2);
    }

    .quick-links {
      grid-template-columns: 1fr;
    }
  }
</style>
