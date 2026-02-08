<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Input, Label, Switch, Spinner } from "$lib/design-system";
  import { user } from "../../../stores/auth";
  import {
    organizationMembers,
    fetchOrganizationMembers,
  } from "../../../stores/organization";
  import {
    whitelabelTenant,
    whitelabelOrganization,
    isWhitelabelLoading,
    whitelabelError,
    fetchWhitelabelSettings,
    updateWhitelabelSettings,
    type WhitelabelTenant,
  } from "../../../stores/whitelabel";
  import {
    Palette,
    Save,
    AlertCircle,
    Lock,
    Shield,
    Sparkles,
    Building2,
    Globe,
    Copy,
    Check,
    Trash2,
    RefreshCw,
  } from "lucide-svelte";

  // Sender domain types
  interface SenderDomain {
    id: string;
    domain: string;
    status: "pending" | "verified" | "failed";
    dkimRecordName: string | null;
    dkimRecordValue: string | null;
    returnPathRecordName: string | null;
    returnPathRecordValue: string | null;
    trackingRecordName: string | null;
    trackingRecordValue: string | null;
    dmarcRecordValue: string | null;
  }

  // Sender domain state
  let senderDomains: SenderDomain[] = [];
  let newDomain = "";
  let isAddingDomain = false;
  let addDomainError: string | null = null;
  let expandedDomainId: string | null = null;
  let verifyingDomainId: string | null = null;
  let copiedField: string | null = null;

  async function loadSenderDomains() {
    try {
      const res = await fetch("/api/organization/sender-domains", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        senderDomains = json.data;
      }
    } catch { /* ignore */ }
  }

  async function handleAddDomain() {
    if (!newDomain.trim() || isAddingDomain) return;
    isAddingDomain = true;
    addDomainError = null;

    try {
      const res = await fetch("/api/organization/sender-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: newDomain.trim() }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to add domain");
      }

      newDomain = "";
      await loadSenderDomains();
    } catch (error) {
      addDomainError = error instanceof Error ? error.message : "Failed to add domain";
    } finally {
      isAddingDomain = false;
    }
  }

  async function handleVerifyDomain(domainId: string) {
    verifyingDomainId = domainId;
    try {
      const res = await fetch(`/api/organization/sender-domains/${domainId}/verify`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        await loadSenderDomains();
      }
    } catch { /* ignore */ }
    verifyingDomainId = null;
  }

  async function handleRemoveDomain(domainId: string) {
    try {
      await fetch(`/api/organization/sender-domains/${domainId}`, {
        method: "DELETE",
        credentials: "include",
      });
      senderDomains = senderDomains.filter((d) => d.id !== domainId);
    } catch { /* ignore */ }
  }

  function toggleDomainExpand(domainId: string) {
    expandedDomainId = expandedDomainId === domainId ? null : domainId;
  }

  function copyToClipboard(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    copiedField = fieldId;
    setTimeout(() => { copiedField = null; }, 2000);
  }

  // Form state
  let name = "";
  let primaryColor = "#000000";
  let secondaryColor = "#ffffff";
  let logoUrl = "";
  let faviconUrl = "";
  let isGoogleAuthDisabled = false;
  let isMicrosoftAuthDisabled = false;
  let isLocalAuthDisabled = false;
  let isBillingDisabled = false;
  let isHelpCenterDisabled = false;
  let smtpFromEmail = "";
  let smtpFromName = "";

  let isSaving = false;
  let saveError: string | null = null;
  let saveSuccess = false;
  let hasChanges = false;

  // User role check
  $: canEdit = $user && ["owner", "admin"].includes(getUserRole($user.id));
  $: isEnterprise = $whitelabelOrganization?.subscriptionTier === "ENTERPRISE";

  function getUserRole(userId: string): string {
    const member = $organizationMembers.find((m) => m.id === userId);
    return member?.role || "member";
  }

  // Initialize form when tenant loads
  $: if ($whitelabelTenant) {
    initForm($whitelabelTenant);
  }

  function initForm(tenant: WhitelabelTenant) {
    if (!hasChanges) {
      name = tenant.name || "";
      primaryColor = tenant.primaryColor || "#000000";
      secondaryColor = tenant.secondaryColor || "#ffffff";
      logoUrl = tenant.logoUrl || "";
      faviconUrl = tenant.faviconUrl || "";
      isGoogleAuthDisabled = tenant.features.isGoogleAuthDisabled || false;
      isMicrosoftAuthDisabled = tenant.features.isMicrosoftAuthDisabled || false;
      isLocalAuthDisabled = tenant.features.isLocalAuthDisabled || false;
      isBillingDisabled = tenant.features.isBillingDisabled || false;
      isHelpCenterDisabled = tenant.features.isHelpCenterDisabled || false;
      smtpFromEmail = tenant.features.smtpFromEmail || "";
      smtpFromName = tenant.features.smtpFromName || "";
    }
  }

  // Track changes
  function checkChanges() {
    if (!$whitelabelTenant) {
      // Creating new tenant - any filled field means changes
      hasChanges = name.trim() !== "";
      return;
    }

    const t = $whitelabelTenant;
    hasChanges =
      name !== (t.name || "") ||
      primaryColor !== (t.primaryColor || "#000000") ||
      secondaryColor !== (t.secondaryColor || "#ffffff") ||
      logoUrl !== (t.logoUrl || "") ||
      faviconUrl !== (t.faviconUrl || "") ||
      isGoogleAuthDisabled !== (t.features.isGoogleAuthDisabled || false) ||
      isMicrosoftAuthDisabled !== (t.features.isMicrosoftAuthDisabled || false) ||
      isLocalAuthDisabled !== (t.features.isLocalAuthDisabled || false) ||
      isBillingDisabled !== (t.features.isBillingDisabled || false) ||
      isHelpCenterDisabled !== (t.features.isHelpCenterDisabled || false) ||
      smtpFromEmail !== (t.features.smtpFromEmail || "") ||
      smtpFromName !== (t.features.smtpFromName || "");
  }

  // Trigger change detection on reactive updates
  $: name, primaryColor, secondaryColor, logoUrl, faviconUrl, checkChanges();
  $: isGoogleAuthDisabled, isMicrosoftAuthDisabled, isLocalAuthDisabled, checkChanges();
  $: isBillingDisabled, isHelpCenterDisabled, smtpFromEmail, smtpFromName, checkChanges();

  onMount(async () => {
    await Promise.all([fetchWhitelabelSettings(), fetchOrganizationMembers()]);
    loadSenderDomains();
  });

  async function handleSave() {
    if (!hasChanges || isSaving) return;

    // Validate name for new tenant
    if (!$whitelabelTenant && !name.trim()) {
      saveError = "Company name is required to create whitelabel settings";
      return;
    }

    isSaving = true;
    saveError = null;
    saveSuccess = false;

    try {
      await updateWhitelabelSettings({
        name: name || undefined,
        primaryColor: primaryColor || null,
        secondaryColor: secondaryColor || null,
        logoUrl: logoUrl || null,
        faviconUrl: faviconUrl || null,
        isGoogleAuthDisabled,
        isMicrosoftAuthDisabled,
        isLocalAuthDisabled,
        isBillingDisabled,
        isHelpCenterDisabled,
        smtpFromEmail: smtpFromEmail || null,
        smtpFromName: smtpFromName || null,
      });
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
    if ($whitelabelTenant) {
      initForm($whitelabelTenant);
    } else {
      // Reset to defaults
      name = "";
      primaryColor = "#000000";
      secondaryColor = "#ffffff";
      logoUrl = "";
      faviconUrl = "";
      isGoogleAuthDisabled = false;
      isMicrosoftAuthDisabled = false;
      isLocalAuthDisabled = false;
      isBillingDisabled = false;
      isHelpCenterDisabled = false;
      smtpFromEmail = "";
      smtpFromName = "";
    }
    hasChanges = false;
  }
</script>

<div class="page-header">
  <h1>Whitelabel Settings</h1>
  <p class="page-subtitle">Configure your organization's branding and features.</p>
</div>

{#if $isWhitelabelLoading && !$whitelabelOrganization}
  <div class="loading-container">
    <Spinner size="lg" />
    <p>Loading whitelabel settings...</p>
  </div>
{:else if $whitelabelError}
  <!-- Enterprise tier gate -->
  <Card>
    <div class="enterprise-gate">
      <div class="gate-icon">
        <Lock size={48} />
      </div>
      <h3>Enterprise Feature</h3>
      <p>
        Whitelabel settings are only available for Enterprise tier organizations.
        Upgrade your plan to customize your platform's branding.
      </p>
      <Button href="#/settings/billing">
        <Sparkles size={16} />
        View Plans
      </Button>
    </div>
  </Card>
{:else}
  <!-- Branding Section -->
  <section class="settings-section">
    <h2>Branding</h2>
    <Card>
      <div class="form-group">
        <Label for="company-name">Company Name</Label>
        <Input
          id="company-name"
          bind:value={name}
          placeholder="Enter your company name"
          disabled={!canEdit}
        />
        <p class="field-hint">This will be displayed throughout your whitelabeled platform</p>
      </div>

      <div class="form-row">
        <div class="form-group">
          <Label for="logo-url">Logo URL</Label>
          <Input
            id="logo-url"
            bind:value={logoUrl}
            placeholder="https://example.com/logo.png"
            disabled={!canEdit}
          />
          <p class="field-hint">Recommended: 200x50px PNG with transparency</p>
        </div>

        <div class="form-group">
          <Label for="favicon-url">Favicon URL</Label>
          <Input
            id="favicon-url"
            bind:value={faviconUrl}
            placeholder="https://example.com/favicon.ico"
            disabled={!canEdit}
          />
          <p class="field-hint">32x32px PNG or ICO</p>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <Label for="primary-color">Primary Color</Label>
          <div class="color-input-row">
            <input
              type="color"
              id="primary-color"
              bind:value={primaryColor}
              disabled={!canEdit}
              class="color-picker"
            />
            <Input
              bind:value={primaryColor}
              placeholder="#000000"
              disabled={!canEdit}
              style="flex: 1"
            />
          </div>
        </div>

        <div class="form-group">
          <Label for="secondary-color">Secondary Color</Label>
          <div class="color-input-row">
            <input
              type="color"
              id="secondary-color"
              bind:value={secondaryColor}
              disabled={!canEdit}
              class="color-picker"
            />
            <Input
              bind:value={secondaryColor}
              placeholder="#ffffff"
              disabled={!canEdit}
              style="flex: 1"
            />
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="preview-section">
        <Label>Preview</Label>
        <div class="preview-box">
          <div class="preview-header" style="background-color: {primaryColor}">
            {#if logoUrl}
              <img src={logoUrl} alt="Logo preview" class="preview-logo" />
            {:else}
              <span class="preview-company-name" style="color: {secondaryColor}">
                {name || "Company Name"}
              </span>
            {/if}
          </div>
          <div class="preview-body">
            <div class="preview-button" style="background-color: {primaryColor}; color: {secondaryColor}">
              Sample Button
            </div>
          </div>
        </div>
      </div>
    </Card>
  </section>

  <!-- Authentication Section -->
  <section class="settings-section">
    <h2>Authentication</h2>
    <Card>
      <p class="section-description">
        Control which authentication methods are available to your users.
        At least one method must remain enabled.
      </p>

      <div class="toggle-group">
        <div class="toggle-item">
          <div class="toggle-info">
            <Shield size={20} />
            <div>
              <h4>Google Sign-In</h4>
              <p>Allow users to sign in with their Google account</p>
            </div>
          </div>
          <Switch
            checked={!isGoogleAuthDisabled}
            on:change={(e) => (isGoogleAuthDisabled = !e.detail)}
            disabled={!canEdit}
          />
        </div>

        <div class="toggle-item">
          <div class="toggle-info">
            <Shield size={20} />
            <div>
              <h4>Microsoft Sign-In</h4>
              <p>Allow users to sign in with their Microsoft account</p>
            </div>
          </div>
          <Switch
            checked={!isMicrosoftAuthDisabled}
            on:change={(e) => (isMicrosoftAuthDisabled = !e.detail)}
            disabled={!canEdit}
          />
        </div>

        <div class="toggle-item">
          <div class="toggle-info">
            <Shield size={20} />
            <div>
              <h4>Email/Password Sign-In</h4>
              <p>Allow users to sign in with email and password</p>
            </div>
          </div>
          <Switch
            checked={!isLocalAuthDisabled}
            on:change={(e) => (isLocalAuthDisabled = !e.detail)}
            disabled={!canEdit}
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- Features Section -->
  <section class="settings-section">
    <h2>Features</h2>
    <Card>
      <p class="section-description">
        Show or hide platform features for your whitelabeled deployment.
      </p>

      <div class="toggle-group">
        <div class="toggle-item">
          <div class="toggle-info">
            <Building2 size={20} />
            <div>
              <h4>Billing UI</h4>
              <p>Show billing and subscription management to users</p>
            </div>
          </div>
          <Switch
            checked={!isBillingDisabled}
            on:change={(e) => (isBillingDisabled = !e.detail)}
            disabled={!canEdit}
          />
        </div>

        <div class="toggle-item">
          <div class="toggle-info">
            <AlertCircle size={20} />
            <div>
              <h4>Help Center</h4>
              <p>Show help center and support links</p>
            </div>
          </div>
          <Switch
            checked={!isHelpCenterDisabled}
            on:change={(e) => (isHelpCenterDisabled = !e.detail)}
            disabled={!canEdit}
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- Email Settings Section -->
  <section class="settings-section">
    <h2>Email Settings</h2>
    <Card>
      <p class="section-description">
        Customize the sender information for system emails sent to your users.
      </p>

      <div class="form-row">
        <div class="form-group">
          <Label for="smtp-from-email">From Email</Label>
          <Input
            id="smtp-from-email"
            type="email"
            bind:value={smtpFromEmail}
            placeholder="noreply@example.com"
            disabled={!canEdit}
          />
        </div>

        <div class="form-group">
          <Label for="smtp-from-name">From Name</Label>
          <Input
            id="smtp-from-name"
            bind:value={smtpFromName}
            placeholder="Your Company"
            disabled={!canEdit}
          />
        </div>
      </div>
    </Card>
  </section>

  <!-- Sender Domain Verification -->
  <section class="settings-section">
    <h2>Sender Domain Verification</h2>
    <Card>
      <p class="section-description">
        Verify a custom domain for sending emails. This enables DKIM signing and improves deliverability.
      </p>

      <!-- Add domain form -->
      <div class="domain-add-row">
        <Input
          bind:value={newDomain}
          placeholder="example.com"
          disabled={!canEdit || isAddingDomain}
        />
        <Button on:click={handleAddDomain} disabled={!canEdit || isAddingDomain || !newDomain.trim()}>
          {#if isAddingDomain}
            <Spinner size="sm" />
          {:else}
            <Globe size={16} />
          {/if}
          Add Domain
        </Button>
      </div>

      {#if addDomainError}
        <p class="domain-error">{addDomainError}</p>
      {/if}

      <!-- Domain list -->
      {#if senderDomains.length > 0}
        <div class="domain-list">
          {#each senderDomains as domain}
            <div class="domain-item">
              <div class="domain-header">
                <div class="domain-info">
                  <span class="domain-name">{domain.domain}</span>
                  <span class="domain-status" class:verified={domain.status === "verified"} class:failed={domain.status === "failed"}>
                    {domain.status}
                  </span>
                </div>
                <div class="domain-actions">
                  {#if domain.status !== "verified"}
                    <Button
                      variant="ghost"
                      size="sm"
                      on:click={() => handleVerifyDomain(domain.id)}
                      disabled={verifyingDomainId === domain.id}
                    >
                      {#if verifyingDomainId === domain.id}
                        <Spinner size="sm" />
                      {:else}
                        <RefreshCw size={14} />
                      {/if}
                      Verify
                    </Button>
                  {/if}
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => toggleDomainExpand(domain.id)}
                  >
                    DNS Records
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    on:click={() => handleRemoveDomain(domain.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              {#if expandedDomainId === domain.id}
                <div class="dns-records">
                  <p class="dns-instructions">Add these DNS records to your domain to verify ownership:</p>

                  {#if domain.dkimRecordName}
                    <div class="dns-record">
                      <div class="dns-record-header">
                        <span class="dns-type">CNAME (DKIM)</span>
                        <button class="copy-btn" on:click={() => copyToClipboard(domain.dkimRecordValue || "", `dkim-${domain.id}`)}>
                          {#if copiedField === `dkim-${domain.id}`}
                            <Check size={12} />
                          {:else}
                            <Copy size={12} />
                          {/if}
                        </button>
                      </div>
                      <code class="dns-name">{domain.dkimRecordName}</code>
                      <code class="dns-value">{domain.dkimRecordValue}</code>
                    </div>
                  {/if}

                  {#if domain.returnPathRecordName}
                    <div class="dns-record">
                      <div class="dns-record-header">
                        <span class="dns-type">CNAME (Return-Path)</span>
                        <button class="copy-btn" on:click={() => copyToClipboard(domain.returnPathRecordValue || "", `rp-${domain.id}`)}>
                          {#if copiedField === `rp-${domain.id}`}
                            <Check size={12} />
                          {:else}
                            <Copy size={12} />
                          {/if}
                        </button>
                      </div>
                      <code class="dns-name">{domain.returnPathRecordName}</code>
                      <code class="dns-value">{domain.returnPathRecordValue}</code>
                    </div>
                  {/if}

                  {#if domain.trackingRecordName}
                    <div class="dns-record">
                      <div class="dns-record-header">
                        <span class="dns-type">CNAME (Tracking)</span>
                        <button class="copy-btn" on:click={() => copyToClipboard(domain.trackingRecordValue || "", `track-${domain.id}`)}>
                          {#if copiedField === `track-${domain.id}`}
                            <Check size={12} />
                          {:else}
                            <Copy size={12} />
                          {/if}
                        </button>
                      </div>
                      <code class="dns-name">{domain.trackingRecordName}</code>
                      <code class="dns-value">{domain.trackingRecordValue}</code>
                    </div>
                  {/if}

                  {#if domain.dmarcRecordValue}
                    <div class="dns-record">
                      <div class="dns-record-header">
                        <span class="dns-type">TXT (DMARC)</span>
                        <button class="copy-btn" on:click={() => copyToClipboard(domain.dmarcRecordValue || "", `dmarc-${domain.id}`)}>
                          {#if copiedField === `dmarc-${domain.id}`}
                            <Check size={12} />
                          {:else}
                            <Copy size={12} />
                          {/if}
                        </button>
                      </div>
                      <code class="dns-name">_dmarc.{domain.domain}</code>
                      <code class="dns-value">{domain.dmarcRecordValue}</code>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  </section>

  <!-- Tenant Info Section -->
  {#if $whitelabelTenant}
    <section class="settings-section">
      <h2>Tenant Information</h2>
      <Card>
        <div class="info-grid">
          <div class="info-item">
            <Label>Tenant ID</Label>
            <code>{$whitelabelTenant.id}</code>
          </div>
          <div class="info-item">
            <Label>Slug</Label>
            <code>{$whitelabelTenant.slug}</code>
          </div>
          {#if $whitelabelTenant.customDomain}
            <div class="info-item">
              <Label>Custom Domain</Label>
              <code>{$whitelabelTenant.customDomain}</code>
            </div>
          {/if}
          <div class="info-item">
            <Label>Created</Label>
            <span>{new Date($whitelabelTenant.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </Card>
    </section>
  {/if}

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
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
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

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .enterprise-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    text-align: center;
    gap: var(--space-4);
  }

  .gate-icon {
    color: hsl(var(--muted-foreground));
  }

  .enterprise-gate h3 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .enterprise-gate p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 400px;
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

  .section-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6) 0;
  }

  .form-group {
    margin-bottom: var(--space-6);
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .field-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-2);
  }

  .color-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .color-picker {
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    cursor: pointer;
    background: none;
  }

  .color-picker::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker::-webkit-color-swatch {
    border-radius: calc(var(--radius) - 2px);
    border: none;
  }

  .preview-section {
    margin-top: var(--space-6);
  }

  .preview-box {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-top: var(--space-2);
  }

  .preview-header {
    padding: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-logo {
    max-height: 32px;
    max-width: 150px;
    object-fit: contain;
  }

  .preview-company-name {
    font-weight: var(--font-semibold);
    font-size: var(--text-lg);
  }

  .preview-body {
    padding: var(--space-6);
    background: hsl(var(--background));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-button {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .toggle-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-lg);
  }

  .toggle-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .toggle-info div h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .toggle-info div p {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .info-item code {
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
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

  /* Sender domain styles */
  .domain-add-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .domain-error {
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    margin: var(--space-2) 0;
  }

  .domain-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .domain-item {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .domain-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
  }

  .domain-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .domain-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .domain-status {
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-2);
    border-radius: var(--radius);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    text-transform: capitalize;
  }

  .domain-status.verified {
    background: hsl(142 76% 36% / 0.1);
    color: hsl(142 76% 36%);
  }

  .domain-status.failed {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .domain-actions {
    display: flex;
    gap: var(--space-1);
  }

  .dns-records {
    padding: var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border-top: 1px solid hsl(var(--border));
  }

  .dns-instructions {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .dns-record {
    margin-bottom: var(--space-3);
    padding: var(--space-3);
    background: hsl(var(--background));
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
  }

  .dns-record-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .dns-type {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius);
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
  }

  .copy-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .dns-name,
  .dns-value {
    display: block;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: hsl(var(--muted-foreground));
    word-break: break-all;
    line-height: 1.5;
  }

  .dns-name {
    color: hsl(var(--foreground));
    margin-bottom: var(--space-1);
  }

  @media (max-width: 768px) {
    .settings-header {
      flex-direction: column;
      gap: var(--space-3);
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .domain-add-row {
      flex-direction: column;
    }

    .domain-header {
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
    }

    .save-actions {
      flex-direction: column;
      gap: var(--space-3);
      align-items: stretch;
    }

    .save-buttons {
      justify-content: flex-end;
    }
  }
</style>
