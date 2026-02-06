<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { Card, Button, Input, Label, Switch, Spinner } from "$lib/design-system";
  import { user } from "../../stores/auth";
  import {
    organizationMembers,
    fetchOrganizationMembers,
  } from "../../stores/organization";
  import {
    whitelabelTenant,
    whitelabelOrganization,
    isWhitelabelLoading,
    whitelabelError,
    fetchWhitelabelSettings,
    updateWhitelabelSettings,
    type WhitelabelTenant,
  } from "../../stores/whitelabel";
  import {
    Palette,
    Save,
    AlertCircle,
    Lock,
    Image,
    Mail,
    Shield,
    Sparkles,
    Building2,
    Upload,
  } from "lucide-svelte";
  import CustomDomainSection from "./components/CustomDomainSection.svelte";
  import { captureException } from "$lib/sentry";

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
  let isUploadingLogo = false;
  let isUploadingFavicon = false;

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
  });

  async function handleUpload(type: "logo" | "favicon", file: File) {
    if (type === "logo") isUploadingLogo = true;
    else isUploadingFavicon = true;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/organization/whitelabel/upload?type=${type}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Failed to upload ${type}`);
      }

      const { data } = await response.json();

      // Auto-fill the URL field
      if (type === "logo") {
        logoUrl = data.url;
      } else {
        faviconUrl = data.url;
      }
    } catch (error) {
      saveError = error instanceof Error ? error.message : `Failed to upload ${type}`;
      captureException(error, {
        tags: { feature: "whitelabel-upload" },
        extra: { type, fileName: file.name, fileSize: file.size },
      });
    } finally {
      if (type === "logo") isUploadingLogo = false;
      else isUploadingFavicon = false;
    }
  }

  function onFileSelected(type: "logo" | "favicon", event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (file) {
      handleUpload(type, file);
      // Reset input so same file can be re-selected
      input.value = "";
    }
  }

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

<svelte:head>
  <title>Whitelabel Settings - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <div class="settings-header">
        <div class="header-icon">
          <Palette size={24} />
        </div>
        <div class="header-text">
          <h1>Whitelabel Settings</h1>
          <p>Customize your platform's branding and appearance</p>
        </div>
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
                <Label for="logo-url">Logo</Label>
                <div class="upload-field">
                  {#if logoUrl}
                    <img src={logoUrl} alt="Logo" class="upload-preview" />
                  {/if}
                  <div class="upload-input-row">
                    <Input
                      id="logo-url"
                      bind:value={logoUrl}
                      placeholder="https://example.com/logo.png"
                      disabled={!canEdit}
                      style="flex: 1"
                    />
                    {#if canEdit && $whitelabelTenant}
                      <label class="upload-btn" class:uploading={isUploadingLogo}>
                        {#if isUploadingLogo}
                          <Spinner size="sm" />
                        {:else}
                          <Upload size={14} />
                        {/if}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          on:change={(e) => onFileSelected("logo", e)}
                          disabled={isUploadingLogo}
                          hidden
                        />
                      </label>
                    {/if}
                  </div>
                  <p class="field-hint">200x50px PNG with transparency. Upload or paste a URL.</p>
                </div>
              </div>

              <div class="form-group">
                <Label for="favicon-url">Favicon</Label>
                <div class="upload-field">
                  {#if faviconUrl}
                    <img src={faviconUrl} alt="Favicon" class="upload-preview upload-preview-small" />
                  {/if}
                  <div class="upload-input-row">
                    <Input
                      id="favicon-url"
                      bind:value={faviconUrl}
                      placeholder="https://example.com/favicon.ico"
                      disabled={!canEdit}
                      style="flex: 1"
                    />
                    {#if canEdit && $whitelabelTenant}
                      <label class="upload-btn" class:uploading={isUploadingFavicon}>
                        {#if isUploadingFavicon}
                          <Spinner size="sm" />
                        {:else}
                          <Upload size={14} />
                        {/if}
                        <input
                          type="file"
                          accept="image/png,image/x-icon,image/vnd.microsoft.icon"
                          on:change={(e) => onFileSelected("favicon", e)}
                          disabled={isUploadingFavicon}
                          hidden
                        />
                      </label>
                    {/if}
                  </div>
                  <p class="field-hint">32x32px PNG or ICO. Upload or paste a URL.</p>
                </div>
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

        <!-- Custom Domain Section -->
        <CustomDomainSection
          tenantId={$whitelabelTenant?.id || null}
          canEdit={!!canEdit}
        />

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

  .upload-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .upload-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--muted) / 0.3);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.15s, color 0.15s;
  }

  .upload-btn:hover:not(.uploading) {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .upload-btn.uploading {
    cursor: default;
  }

  .upload-preview {
    max-height: 40px;
    max-width: 150px;
    object-fit: contain;
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    padding: var(--space-1);
  }

  .upload-preview-small {
    max-height: 32px;
    max-width: 32px;
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

    .form-row {
      grid-template-columns: 1fr;
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
