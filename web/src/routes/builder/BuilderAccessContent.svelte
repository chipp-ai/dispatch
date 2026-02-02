<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Switch, Input, Button, toasts } from "$lib/design-system";
  import { DollarSign, Users, TrendingUp, Package } from "lucide-svelte";

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    applicationCapabilities?: { id: string; name: string; enabled: boolean; description: string }[];
    emailGatingEnabled?: boolean;
    allowedEmails?: string[];
    allowedDomains?: string[];
    redirectAfterSignup?: string;
    ssoEnabled?: boolean;
    domainWhitelistEnabled?: boolean;
    allowedDomainsList?: string[];
  };

  let isSaving = false;

  // Active tab
  let activeTab: "access" | "sell" = "access";

  // Access settings state
  let userSignupEnabled = false;
  let ssoEnabled = false;
  let emailGatingEnabled = false;
  let domainWhitelistEnabled = false;
  let redirectUrl = "";
  let allowedDomainsInput = "";
  let allowedEmailsInput = "";

  // Sell settings state
  let stripeConnected = false;
  let monetizationEnabled = false;

  // Stats (would come from API)
  let stats = {
    allTimeRevenue: "$0",
    last30DaysRevenue: "$0",
    freeUsers: 0,
    customers: 0
  };

  // Initialize from app prop
  $: if (app) {
    const userSignupCap = app.applicationCapabilities?.find(c => c.name === "USER_SIGNUP");
    userSignupEnabled = userSignupCap?.enabled ?? false;

    const ssoCap = app.applicationCapabilities?.find(c => c.name === "CONSUMER_SSO");
    ssoEnabled = ssoCap?.enabled ?? false;

    emailGatingEnabled = app.emailGatingEnabled ?? false;
    domainWhitelistEnabled = app.domainWhitelistEnabled ?? false;
    redirectUrl = app.redirectAfterSignup ?? "";
    allowedDomainsInput = app.allowedDomainsList?.join(", ") ?? "";
    allowedEmailsInput = app.allowedEmails?.join(", ") ?? "";
  }

  onMount(async () => {
    await loadStats();
  });

  async function loadStats() {
    try {
      const response = await fetch(`/api/applications/${appId}/analytics`, {
        credentials: "include",
      });
      if (response.ok) {
        const result = await response.json();
        if (result.data) {
          stats = {
            allTimeRevenue: result.data.allTimeRevenue || "$0",
            last30DaysRevenue: result.data.lastMonthRevenue || "$0",
            freeUsers: result.data.freeUsersCount || 0,
            customers: result.data.customersCount || 0
          };
        }
      }
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  async function updateCapability(name: string, enabled: boolean) {
    isSaving = true;
    try {
      const capability = app?.applicationCapabilities?.find(c => c.name === name);
      if (capability) {
        await fetch(`/api/applications/${appId}/capabilities/${capability.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ enabled }),
        });
      } else {
        await fetch(`/api/applications/${appId}/capabilities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, enabled }),
        });
      }
      toasts.success("Saved", "Setting updated");
    } catch (e) {
      console.error("Failed to update capability:", e);
      toasts.error("Error", "Failed to update setting");
    } finally {
      isSaving = false;
    }
  }

  async function updateAppSettings(fields: Record<string, unknown>) {
    isSaving = true;
    try {
      await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      toasts.success("Saved", "Settings updated");
    } catch (e) {
      console.error("Failed to update settings:", e);
      toasts.error("Error", "Failed to update settings");
    } finally {
      isSaving = false;
    }
  }

  function handleUserSignupToggle(enabled: boolean) {
    userSignupEnabled = enabled;
    updateCapability("USER_SIGNUP", enabled);
  }

  function handleSSOToggle(enabled: boolean) {
    ssoEnabled = enabled;
    updateCapability("CONSUMER_SSO", enabled);
  }

  function handleEmailGatingToggle(enabled: boolean) {
    emailGatingEnabled = enabled;
    updateAppSettings({ emailGatingEnabled: enabled });
  }

  function handleDomainWhitelistToggle(enabled: boolean) {
    domainWhitelistEnabled = enabled;
    updateAppSettings({ domainWhitelistEnabled: enabled });
  }

  function handleRedirectBlur() {
    updateAppSettings({ redirectAfterSignup: redirectUrl });
  }

  function handleMonetizationToggle(enabled: boolean) {
    monetizationEnabled = enabled;
    // TODO: Update monetization setting
  }
</script>

<div class="split-panel-layout">
  <!-- Left Panel: Access Controls -->
  <div class="left-panel">
    <!-- Tabs -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          class="tab"
          class:active={activeTab === "access"}
          on:click={() => activeTab = "access"}
        >
          Access
        </button>
        <button
          class="tab"
          class:active={activeTab === "sell"}
          on:click={() => activeTab = "sell"}
        >
          Sell
        </button>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="cards-container">
      {#if activeTab === "access"}
        <!-- User Signup Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>User Signup</h3>
              <p>Authenticate users with their email and password before using your application.</p>
            </div>
            <Switch checked={userSignupEnabled} on:change={(e) => handleUserSignupToggle(e.detail)} />
          </div>
        </Card>

        <!-- SSO Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>Single Sign-On (SSO)</h3>
              <p>Allow users to authenticate using your organization's SSO provider.</p>
            </div>
            <Switch checked={ssoEnabled} on:change={(e) => handleSSOToggle(e.detail)} />
          </div>
        </Card>

        <!-- Redirect After Signup Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-content full">
            <h3>Redirect After Signup</h3>
            <p>Redirect users to a custom URL after they sign up.</p>
            <div class="input-row">
              <Input
                bind:value={redirectUrl}
                placeholder="https://example.com/welcome"
                on:blur={handleRedirectBlur}
              />
            </div>
          </div>
        </Card>

        <!-- Domain Whitelisting Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>Domain Whitelisting</h3>
              <p>Only allow users from specific email domains to access your application.</p>
            </div>
            <Switch checked={domainWhitelistEnabled} on:change={(e) => handleDomainWhitelistToggle(e.detail)} />
          </div>
          {#if domainWhitelistEnabled}
            <div class="expanded-content">
              <Input
                bind:value={allowedDomainsInput}
                placeholder="example.com, company.org"
                on:blur={() => updateAppSettings({ allowedDomainsList: allowedDomainsInput.split(",").map(d => d.trim()).filter(Boolean) })}
              />
              <span class="hint">Comma-separated list of allowed domains</span>
            </div>
          {/if}
        </Card>

        <!-- Email Gating Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>Email Gating</h3>
              <p>Only allow specific email addresses to access your application.</p>
            </div>
            <Switch checked={emailGatingEnabled} on:change={(e) => handleEmailGatingToggle(e.detail)} />
          </div>
          {#if emailGatingEnabled}
            <div class="expanded-content">
              <Input
                bind:value={allowedEmailsInput}
                placeholder="user@example.com, admin@company.org"
                on:blur={() => updateAppSettings({ allowedEmails: allowedEmailsInput.split(",").map(e => e.trim()).filter(Boolean) })}
              />
              <span class="hint">Comma-separated list of allowed emails</span>
            </div>
          {/if}
        </Card>
      {:else}
        <!-- Sell Tab -->

        <!-- Stripe Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>Connect Stripe</h3>
              <p>Connect your Stripe account to accept payments from users.</p>
            </div>
            <Button variant="outline" size="sm">
              {stripeConnected ? "Manage" : "Connect"}
            </Button>
          </div>
        </Card>

        <!-- Monetization Card -->
        <Card padding="md" class="toggle-card">
          <div class="card-row">
            <div class="card-content">
              <h3>Monetization</h3>
              <p>Enable paid access to your application with subscription packages.</p>
            </div>
            <Switch checked={monetizationEnabled} on:change={(e) => handleMonetizationToggle(e.detail)} />
          </div>
        </Card>
      {/if}
    </div>
  </div>

  <!-- Right Panel: Stats & Packages -->
  <div class="right-panel">
    <!-- Stats Grid -->
    <div class="stats-grid">
      <Card padding="md" class="stat-card">
        <div class="stat-value">{stats.allTimeRevenue}</div>
        <div class="stat-label">App Revenue</div>
      </Card>
      <Card padding="md" class="stat-card">
        <div class="stat-value">{stats.last30DaysRevenue}</div>
        <div class="stat-label">30 Day Revenue</div>
      </Card>
      <Card padding="md" class="stat-card">
        <div class="stat-value">{stats.freeUsers}</div>
        <div class="stat-label">Free Users</div>
      </Card>
      <Card padding="md" class="stat-card">
        <div class="stat-value">{stats.customers}</div>
        <div class="stat-label">Customers</div>
      </Card>
    </div>

    <!-- Packages Section -->
    <div class="packages-section">
      <div class="section-header">
        <h2>Packages</h2>
        <Button variant="primary" size="sm">
          <Package size={16} />
          Create Package
        </Button>
      </div>
      <div class="empty-packages">
        <Package size={40} />
        <p>No packages yet</p>
        <span>Create a package to offer paid access to your application</span>
      </div>
    </div>
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
    width: 400px;
    min-width: 340px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    overflow-y: auto;
  }

  .tabs-container {
    display: flex;
    justify-content: center;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
    background: hsl(var(--muted) / 0.5);
    padding: var(--space-1);
    border-radius: var(--radius-lg);
  }

  .tab {
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover {
    color: hsl(var(--foreground));
  }

  .tab.active {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
  }

  .cards-container {
    flex: 1;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Toggle Cards */
  :global(.toggle-card) {
    transition: box-shadow 0.15s;
  }

  .card-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .card-content {
    flex: 1;
  }

  .card-content.full {
    width: 100%;
  }

  .card-content h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-1) 0;
    color: hsl(var(--foreground));
  }

  .card-content p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  .input-row {
    margin-top: var(--space-3);
  }

  .expanded-content {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .hint {
    display: block;
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Right Panel */
  .right-panel {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
    background: hsl(var(--muted) / 0.2);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  :global(.stat-card) {
    text-align: left;
  }

  .stat-value {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-1);
  }

  .stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  /* Packages Section */
  .packages-section {
    background: hsl(var(--background));
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .section-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .empty-packages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-12);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-packages p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-packages span {
    font-size: var(--text-sm);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .split-panel-layout {
      flex-direction: column;
    }

    .left-panel {
      width: 100%;
      min-width: unset;
      max-height: 60vh;
      border-right: none;
      border-bottom: 1px solid hsl(var(--border));
    }

    .right-panel {
      flex: 1;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
