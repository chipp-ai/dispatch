<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import { Card, Switch, Input, Button } from "$lib/design-system";
  import { KeyRound, Copy, Eye, EyeOff, Plus, Trash2, Shield, Globe, Mail, ExternalLink, Check } from "lucide-svelte";
  import { captureException } from "$lib/sentry";

  export let params: { appId?: string } = {};

  interface App {
    id: string;
    name: string;
    applicationCapabilities: { id: string; name: string; enabled: boolean; description: string }[];
    emailGatingEnabled: boolean;
    allowedEmails: string[];
    allowedDomains: string[];
    redirectAfterSignup: string;
  }

  interface ApiKey {
    id: string;
    name: string;
    key: string;
    createdAt: string;
  }

  let app: App | null = null;
  let isLoading = true;
  let isSaving = false;

  // API Keys state
  let apiKeys: ApiKey[] = [];
  let showingKey: string | null = null;
  let newKeyName = "";
  let isCreatingKey = false;
  let copiedKeyId: string | null = null;

  // Access settings state
  let userSignupEnabled = false;
  let emailGatingEnabled = false;
  let allowedDomainsInput = "";
  let allowedEmailsInput = "";
  let redirectUrl = "";

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await Promise.all([loadApp(), loadApiKeys()]);
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.hash = "#/login";
          return;
        }
        throw new Error("Failed to load app");
      }

      const result = await response.json();
      app = result.data;

      // Initialize state from app data
      const userSignupCap = app?.applicationCapabilities?.find(c => c.name === "USER_SIGNUP");
      userSignupEnabled = userSignupCap?.enabled ?? false;
      emailGatingEnabled = app?.emailGatingEnabled ?? false;
      allowedDomainsInput = app?.allowedDomains?.join(", ") ?? "";
      allowedEmailsInput = app?.allowedEmails?.join(", ") ?? "";
      redirectUrl = app?.redirectAfterSignup ?? "";
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "load-app" }, extra: { appId: params.appId } });
    } finally {
      isLoading = false;
    }
  }

  async function loadApiKeys() {
    try {
      const response = await fetch(`/api/applications/${params.appId}/api-keys`, {
        credentials: "include",
      });
      if (response.ok) {
        const result = await response.json();
        apiKeys = result.data || [];
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "load-api-keys" }, extra: { appId: params.appId } });
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return;

    isCreatingKey = true;
    try {
      const response = await fetch(`/api/applications/${params.appId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newKeyName }),
      });

      if (response.ok) {
        const result = await response.json();
        apiKeys = [...apiKeys, result.data];
        newKeyName = "";
        // Show the newly created key
        showingKey = result.data.id;
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "create-api-key" }, extra: { appId: params.appId } });
    } finally {
      isCreatingKey = false;
    }
  }

  async function deleteApiKey(keyId: string) {
    try {
      const response = await fetch(`/api/applications/${params.appId}/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        apiKeys = apiKeys.filter(k => k.id !== keyId);
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "delete-api-key" }, extra: { appId: params.appId, keyId } });
    }
  }

  function toggleKeyVisibility(keyId: string) {
    showingKey = showingKey === keyId ? null : keyId;
  }

  function copyToClipboard(text: string, keyId: string) {
    navigator.clipboard.writeText(text);
    copiedKeyId = keyId;
    setTimeout(() => { copiedKeyId = null; }, 2000);
  }

  async function updateCapability(name: string, enabled: boolean) {
    isSaving = true;
    try {
      const capability = app?.applicationCapabilities?.find(c => c.name === name);
      if (capability) {
        await fetch(`/api/applications/${params.appId}/capabilities/${capability.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ enabled }),
        });
      } else {
        await fetch(`/api/applications/${params.appId}/capabilities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, enabled }),
        });
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "update-capability" }, extra: { appId: params.appId, capabilityName: name } });
    } finally {
      isSaving = false;
    }
  }

  async function updateAppSettings() {
    isSaving = true;
    try {
      await fetch(`/api/applications/${params.appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          emailGatingEnabled,
          allowedDomains: allowedDomainsInput.split(",").map(d => d.trim()).filter(Boolean),
          allowedEmails: allowedEmailsInput.split(",").map(e => e.trim()).filter(Boolean),
          redirectAfterSignup: redirectUrl,
        }),
      });
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-access", feature: "update-settings" }, extra: { appId: params.appId } });
    } finally {
      isSaving = false;
    }
  }

  function handleUserSignupToggle(enabled: boolean) {
    userSignupEnabled = enabled;
    updateCapability("USER_SIGNUP", enabled);
  }

  function handleEmailGatingToggle(enabled: boolean) {
    emailGatingEnabled = enabled;
    updateAppSettings();
  }
</script>

<svelte:head>
  <title>API Access - Chipp</title>
</svelte:head>

<div class="app-builder">
  <BuilderSidebar appId={params.appId} activeTab="access" />

  <div class="main-content">
    <BuilderHeader
      appName={app?.name || "Loading..."}
      lastSaved={null}
      isSaving={isSaving}
      hasUnsavedChanges={false}
      onSave={() => {}}
      onPublish={() => {}}
      isPublishing={false}
      hidePublish={true}
    />

    <div class="page-content">
      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      {:else}
        <div class="header-section">
          <div class="header-icon">
            <KeyRound size={24} />
          </div>
          <div>
            <h1>API Access</h1>
            <p>Manage API keys and access settings for your application</p>
          </div>
        </div>

        <!-- API Keys Section -->
        <Card padding="lg" class="section-card">
          <div class="card-header">
            <h2>API Keys</h2>
          </div>
          <p class="card-description">Create API keys to integrate with your application programmatically</p>

          <div class="create-key-form">
            <Input
              bind:value={newKeyName}
              placeholder="Enter key name (e.g., Production, Development)"
            />
            <Button
              variant="primary"
              on:click={createApiKey}
              disabled={!newKeyName.trim() || isCreatingKey}
            >
              <Plus size={16} />
              {isCreatingKey ? "Creating..." : "Create Key"}
            </Button>
          </div>

          {#if apiKeys.length === 0}
            <div class="empty-state">
              <KeyRound size={40} />
              <p>No API keys yet</p>
              <span>Create an API key to integrate with your application</span>
            </div>
          {:else}
            <div class="keys-list">
              {#each apiKeys as apiKey}
                <div class="key-row">
                  <div class="key-info">
                    <span class="key-name">{apiKey.name}</span>
                    <span class="key-date">Created {new Date(apiKey.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div class="key-value">
                    <code>{showingKey === apiKey.id ? apiKey.key : '••••••••••••••••••••••••'}</code>
                  </div>
                  <div class="key-actions">
                    <button class="icon-btn" on:click={() => toggleKeyVisibility(apiKey.id)} title={showingKey === apiKey.id ? "Hide" : "Show"}>
                      {#if showingKey === apiKey.id}
                        <EyeOff size={16} />
                      {:else}
                        <Eye size={16} />
                      {/if}
                    </button>
                    <button class="icon-btn" on:click={() => copyToClipboard(apiKey.key, apiKey.id)} title="Copy">
                      {#if copiedKeyId === apiKey.id}
                        <Check size={16} />
                      {:else}
                        <Copy size={16} />
                      {/if}
                    </button>
                    <button class="icon-btn danger" on:click={() => deleteApiKey(apiKey.id)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </Card>

        <!-- Access Controls Section -->
        <Card padding="lg" class="section-card">
          <div class="card-header">
            <h2>Access Controls</h2>
          </div>
          <p class="card-description">Configure how users access your application</p>

          <div class="settings-list">
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-icon">
                  <Shield size={20} />
                </div>
                <div>
                  <span class="setting-name">User Signup</span>
                  <span class="setting-description">Require users to sign up with email and password</span>
                </div>
              </div>
              <Switch checked={userSignupEnabled} on:change={(e) => handleUserSignupToggle(e.detail)} />
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-icon">
                  <Mail size={20} />
                </div>
                <div>
                  <span class="setting-name">Email Gating</span>
                  <span class="setting-description">Only allow specific emails or domains to access</span>
                </div>
              </div>
              <Switch checked={emailGatingEnabled} on:change={(e) => handleEmailGatingToggle(e.detail)} />
            </div>
          </div>

          {#if emailGatingEnabled}
            <div class="gating-options">
              <div class="input-group">
                <label for="allowed-domains">Allowed Domains</label>
                <Input
                  id="allowed-domains"
                  bind:value={allowedDomainsInput}
                  placeholder="example.com, company.org"
                  on:blur={updateAppSettings}
                />
                <span class="input-hint">Comma-separated list of domains</span>
              </div>

              <div class="input-group">
                <label for="allowed-emails">Allowed Emails</label>
                <Input
                  id="allowed-emails"
                  bind:value={allowedEmailsInput}
                  placeholder="user@example.com, admin@company.org"
                  on:blur={updateAppSettings}
                />
                <span class="input-hint">Comma-separated list of specific emails</span>
              </div>
            </div>
          {/if}
        </Card>

        <!-- Redirect Settings -->
        <Card padding="lg" class="section-card">
          <div class="card-header">
            <h2>Post-Signup Redirect</h2>
          </div>
          <p class="card-description">Redirect users to a custom URL after they sign up</p>

          <div class="input-group">
            <label for="redirect-url">Redirect URL</label>
            <div class="url-input-wrapper">
              <ExternalLink size={16} />
              <Input
                id="redirect-url"
                bind:value={redirectUrl}
                placeholder="https://example.com/welcome"
                on:blur={updateAppSettings}
              />
            </div>
            <span class="input-hint">Leave empty to keep users in the application</span>
          </div>
        </Card>

        <!-- API Documentation -->
        <Card padding="lg" class="section-card">
          <div class="card-header">
            <h2>API Documentation</h2>
          </div>
          <p class="card-description">Learn how to integrate with the Chipp API</p>

          <div class="code-example">
            <code>
              <pre>curl -X POST https://api.chipp.ai/v1/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{`{`}
    "message": "Hello, how can I help you?"
  {`}`}'</pre>
            </code>
          </div>

          <div class="api-endpoints">
            <h3>Available Endpoints</h3>
            <ul>
              <li><code>POST /v1/chat</code> - Send a message to the AI</li>
              <li><code>GET /v1/conversations</code> - List conversations</li>
              <li><code>GET /v1/conversations/:id</code> - Get conversation details</li>
            </ul>
          </div>
        </Card>
      {/if}
    </div>
  </div>
</div>

<style>
  .app-builder {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin-left: 80px;
    min-width: 0;
  }

  .page-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
    max-width: 800px;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .header-section {
    display: flex;
    align-items: center;
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
  }

  .header-section h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .header-section p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .section-card {
    margin-bottom: var(--space-4);
  }

  .card-header {
    margin-bottom: var(--space-1);
  }

  .card-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .card-description {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: 0 0 var(--space-4) 0;
  }

  .create-key-form {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .create-key-form :global(.input-wrapper) {
    flex: 1;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-state p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state span {
    font-size: var(--text-sm);
  }

  .keys-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-md);
  }

  .key-info {
    display: flex;
    flex-direction: column;
    min-width: 120px;
  }

  .key-name {
    font-weight: var(--font-medium);
  }

  .key-date {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .key-value {
    flex: 1;
    overflow: hidden;
  }

  .key-value code {
    font-family: monospace;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .key-actions {
    display: flex;
    gap: var(--space-1);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
  }

  .icon-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .icon-btn.danger:hover {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
  }

  .setting-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .setting-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .setting-name {
    font-weight: var(--font-medium);
    display: block;
  }

  .setting-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .gating-options {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .input-group label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .input-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .url-input-wrapper {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
  }

  .url-input-wrapper :global(.input-wrapper) {
    flex: 1;
  }

  .code-example {
    background: hsl(var(--muted));
    border-radius: var(--radius-md);
    padding: var(--space-4);
    overflow-x: auto;
    margin-bottom: var(--space-4);
  }

  .code-example pre {
    margin: 0;
    font-family: monospace;
    font-size: var(--text-sm);
    white-space: pre-wrap;
    word-break: break-all;
  }

  .api-endpoints h3 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-2) 0;
  }

  .api-endpoints ul {
    margin: 0;
    padding-left: var(--space-5);
    color: hsl(var(--muted-foreground));
  }

  .api-endpoints li {
    margin-bottom: var(--space-1);
    font-size: var(--text-sm);
  }

  .api-endpoints code {
    font-family: monospace;
    font-size: var(--text-xs);
    background: hsl(var(--muted));
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }

  @media (max-width: 768px) {
    .main-content {
      margin-left: 0;
    }

    .page-content {
      padding: var(--space-4);
    }

    .create-key-form {
      flex-direction: column;
    }

    .key-row {
      flex-wrap: wrap;
    }

    .key-value {
      width: 100%;
      order: 3;
      margin-top: var(--space-2);
    }
  }
</style>
