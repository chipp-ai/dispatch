<script lang="ts">
  /**
   * EmailSetupDialog Component
   *
   * Multi-step dialog for setting up Postmark email integration:
   * - Step 1: Choose infrastructure (shared @chipp.ai or custom domain)
   * - Step 2: Configure email addresses
   * - Step 3: For custom domain: Show webhook URL and token
   * - Step 4: Manage whitelist
   *
   * Also shows connected state when already configured.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { Mail, Check, Loader2, AlertCircle, Unlink, Copy, Plus, X, Users } from 'lucide-svelte';
  import Dialog from '../Dialog.svelte';
  import DialogHeader from '../DialogHeader.svelte';
  import DialogTitle from '../DialogTitle.svelte';
  import DialogDescription from '../DialogDescription.svelte';
  import DialogFooter from '../DialogFooter.svelte';
  import Button from '../Button.svelte';
  import Input from '../Input.svelte';
  import Label from '../Label.svelte';
  import Switch from '../Switch.svelte';
  import { api } from '../../../api';
  import { toasts } from '../../stores/toast';

  export let open = false;
  export let applicationId: string;

  const dispatch = createEventDispatcher();

  // State
  type Step = 'loading' | 'setup' | 'webhook' | 'whitelist' | 'connected';
  let step: Step = 'loading';
  let loading = false;
  let error = '';

  // Config form
  let useSharedInfrastructure = true;
  let inboundEmailAddress = '';
  let fromEmailAddress = '';
  let fromEmailName = '';
  let postmarkServerToken = '';
  let enableWhitelist = true;

  // Connected state
  let webhookUrl = '';
  let webhookToken = '';
  let copiedField: string | null = null;

  // Whitelist management
  let whitelistedEmails: string[] = [];
  let newWhitelistEmail = '';
  let sharedDomain = 'chipp.ai';

  // Generate default email addresses based on app
  function generateDefaultAddresses(appSlug: string) {
    if (useSharedInfrastructure) {
      inboundEmailAddress = `${appSlug}@${sharedDomain}`;
      fromEmailAddress = `${appSlug}@${sharedDomain}`;
    }
  }

  async function checkStatus() {
    loading = true;
    error = '';

    try {
      const response = await api.get<{
        connected: boolean;
        hasCredentials?: boolean;
        inboundEmailAddress?: string;
        fromEmailAddress?: string;
        fromEmailName?: string;
        useSharedInfrastructure?: boolean;
        enableWhitelist?: boolean;
        webhookUrl?: string;
        webhookToken?: string;
        sharedDomain?: string;
      }>(`/api/integrations/email/status?applicationId=${applicationId}`);

      if (response.sharedDomain) {
        sharedDomain = response.sharedDomain;
      }

      if (response.connected) {
        inboundEmailAddress = response.inboundEmailAddress || '';
        fromEmailAddress = response.fromEmailAddress || '';
        fromEmailName = response.fromEmailName || '';
        useSharedInfrastructure = response.useSharedInfrastructure ?? true;
        enableWhitelist = response.enableWhitelist ?? true;
        webhookUrl = response.webhookUrl || '';
        webhookToken = response.webhookToken || '';
        await loadWhitelist();
        step = 'connected';
      } else {
        step = 'setup';
      }
    } catch (err) {
      step = 'setup';
    } finally {
      loading = false;
    }
  }

  async function loadWhitelist() {
    try {
      const response = await api.get<{ emails: string[] }>(
        `/api/integrations/email/whitelist?applicationId=${applicationId}`
      );
      whitelistedEmails = response.emails || [];
    } catch (err) {
      whitelistedEmails = [];
    }
  }

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen) {
      dispatch('close');
    }
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = field;
      toasts.success('Copied', 'Copied to clipboard!');
      setTimeout(() => {
        copiedField = null;
      }, 2000);
    } catch (e) {
      toasts.error('Error', 'Failed to copy to clipboard');
    }
  }

  async function saveConfig() {
    if (!inboundEmailAddress.trim() || !fromEmailAddress.trim() || !fromEmailName.trim()) {
      error = 'All email fields are required';
      return;
    }

    if (!useSharedInfrastructure && !postmarkServerToken.trim()) {
      error = 'Postmark Server Token is required for custom domain setup';
      return;
    }

    loading = true;
    error = '';

    try {
      const response = await api.post<{
        success: boolean;
        inboundEmailAddress: string;
        webhookUrl: string | null;
        webhookToken: string | null;
      }>('/api/integrations/email/config', {
        applicationId,
        inboundEmailAddress: inboundEmailAddress.trim(),
        fromEmailAddress: fromEmailAddress.trim(),
        fromEmailName: fromEmailName.trim(),
        postmarkServerToken: useSharedInfrastructure ? undefined : postmarkServerToken.trim(),
        useSharedInfrastructure,
        enableWhitelist,
      });

      inboundEmailAddress = response.inboundEmailAddress;
      webhookUrl = response.webhookUrl || '';
      webhookToken = response.webhookToken || '';

      if (!useSharedInfrastructure && webhookUrl) {
        step = 'webhook';
      } else {
        toasts.success('Email Connected', 'Your AI agent is now available via email.');
        step = 'whitelist';
        dispatch('connected');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save configuration';
    } finally {
      loading = false;
    }
  }

  function goToWhitelist() {
    step = 'whitelist';
  }

  async function addToWhitelist() {
    if (!newWhitelistEmail.trim()) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newWhitelistEmail.trim())) {
      toasts.error('Invalid Email', 'Please enter a valid email address');
      return;
    }

    loading = true;
    try {
      await api.post('/api/integrations/email/whitelist/add', {
        applicationId,
        email: newWhitelistEmail.trim(),
      });
      whitelistedEmails = [...whitelistedEmails, newWhitelistEmail.trim().toLowerCase()];
      newWhitelistEmail = '';
      toasts.success('Added', 'Email added to whitelist');
    } catch (err) {
      toasts.error('Error', err instanceof Error ? err.message : 'Failed to add email');
    } finally {
      loading = false;
    }
  }

  async function removeFromWhitelist(email: string) {
    loading = true;
    try {
      await api.post('/api/integrations/email/whitelist/remove', {
        applicationId,
        email,
      });
      whitelistedEmails = whitelistedEmails.filter(e => e !== email);
      toasts.success('Removed', 'Email removed from whitelist');
    } catch (err) {
      toasts.error('Error', err instanceof Error ? err.message : 'Failed to remove email');
    } finally {
      loading = false;
    }
  }

  async function toggleWhitelist() {
    loading = true;
    try {
      await api.post('/api/integrations/email/toggle-whitelist', {
        applicationId,
        enableWhitelist: !enableWhitelist,
      });
      enableWhitelist = !enableWhitelist;
      toasts.success('Updated', enableWhitelist ? 'Whitelist enabled' : 'Whitelist disabled');
    } catch (err) {
      toasts.error('Error', err instanceof Error ? err.message : 'Failed to toggle whitelist');
    } finally {
      loading = false;
    }
  }

  function finishSetup() {
    toasts.success('Email Connected', 'Your AI agent is now available via email.');
    step = 'connected';
    dispatch('connected');
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect email? Your bot will stop responding to emails.')) {
      return;
    }

    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/email/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'Email integration has been removed.');
      step = 'setup';
      inboundEmailAddress = '';
      fromEmailAddress = '';
      fromEmailName = '';
      postmarkServerToken = '';
      webhookUrl = '';
      webhookToken = '';
      whitelistedEmails = [];
      dispatch('disconnected');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to disconnect';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (open) {
      checkStatus();
    }
  });

  $: if (open && step === 'loading') {
    checkStatus();
  }
</script>

<Dialog bind:open onOpenChange={handleOpenChange}>
  <DialogHeader>
    <DialogTitle>
      <div class="header-with-icon">
        <div class="email-icon">
          <Mail size={24} />
        </div>
        Email Integration
      </div>
    </DialogTitle>
    <DialogDescription>
      {#if step === 'loading'}
        Checking connection status...
      {:else if step === 'connected'}
        Your chatbot is connected to email
      {:else if step === 'whitelist'}
        Manage who can email your bot
      {:else}
        Deploy your chatbot to email
      {/if}
    </DialogDescription>
  </DialogHeader>

  <div class="dialog-body">
    {#if step === 'loading'}
      <div class="loading-state">
        <Loader2 size={32} class="spinner" />
        <p>Checking email configuration...</p>
      </div>

    {:else if step === 'setup'}
      <div class="step-content">
        <div class="step-number">Configuration</div>
        <h3>Set up Email Integration</h3>
        <p>Configure how your AI agent receives and sends emails.</p>

        <div class="form-group">
          <div class="toggle-row">
            <div class="toggle-label">
              <Label>Use Shared Infrastructure</Label>
              <span class="field-hint">Use @{sharedDomain} addresses (recommended)</span>
            </div>
            <Switch
              checked={useSharedInfrastructure}
              on:change={() => useSharedInfrastructure = !useSharedInfrastructure}
            />
          </div>
        </div>

        <div class="form-group">
          <Label for="inboundEmail">Inbound Email Address</Label>
          <Input
            id="inboundEmail"
            bind:value={inboundEmailAddress}
            placeholder={useSharedInfrastructure ? `your-bot@${sharedDomain}` : "support@yourdomain.com"}
            disabled={loading}
          />
          <span class="field-hint">Emails sent to this address will be handled by your bot</span>
        </div>

        <div class="form-group">
          <Label for="fromEmail">From Email Address</Label>
          <Input
            id="fromEmail"
            bind:value={fromEmailAddress}
            placeholder={useSharedInfrastructure ? `your-bot@${sharedDomain}` : "support@yourdomain.com"}
            disabled={loading}
          />
          <span class="field-hint">Replies will be sent from this address</span>
        </div>

        <div class="form-group">
          <Label for="fromName">From Name</Label>
          <Input
            id="fromName"
            bind:value={fromEmailName}
            placeholder="Your Bot Name"
            disabled={loading}
          />
          <span class="field-hint">Display name shown in email clients</span>
        </div>

        {#if !useSharedInfrastructure}
          <div class="form-group">
            <Label for="postmarkToken">Postmark Server API Token</Label>
            <Input
              id="postmarkToken"
              type="password"
              bind:value={postmarkServerToken}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={loading}
            />
            <span class="field-hint">Get this from your Postmark server settings</span>
          </div>
        {/if}

        <div class="form-group">
          <div class="toggle-row">
            <div class="toggle-label">
              <Label>Enable Sender Whitelist</Label>
              <span class="field-hint">Only respond to approved email addresses</span>
            </div>
            <Switch
              checked={enableWhitelist}
              on:change={() => enableWhitelist = !enableWhitelist}
            />
          </div>
        </div>
      </div>

    {:else if step === 'webhook'}
      <div class="step-content">
        <div class="step-number">Webhook Setup</div>
        <h3>Configure Postmark Webhook</h3>
        <p>Add this webhook URL in your Postmark server's Inbound settings.</p>

        <div class="form-group">
          <Label>Webhook URL</Label>
          <div class="copy-box" on:click={() => copyToClipboard(webhookUrl, 'url')}>
            <code class="copy-text">{webhookUrl}</code>
            <button class="copy-btn">
              {#if copiedField === 'url'}
                <Check size={18} />
              {:else}
                <Copy size={18} />
              {/if}
            </button>
          </div>
        </div>

        <div class="form-group">
          <Label>Webhook Token (add as ?token= query param)</Label>
          <div class="copy-box" on:click={() => copyToClipboard(webhookToken, 'token')}>
            <code class="copy-text">{webhookToken}</code>
            <button class="copy-btn">
              {#if copiedField === 'token'}
                <Check size={18} />
              {:else}
                <Copy size={18} />
              {/if}
            </button>
          </div>
        </div>

        <div class="info-box">
          <h4>Postmark Setup:</h4>
          <ul>
            <li>Go to Postmark &rarr; Servers &rarr; [Your Server] &rarr; Settings</li>
            <li>Under Inbound, set the Webhook URL to the URL above with <code>?token=YOUR_TOKEN</code></li>
            <li>Enable "Include raw email content in JSON payload" if available</li>
          </ul>
        </div>
      </div>

    {:else if step === 'whitelist'}
      <div class="step-content">
        <div class="step-number">Sender Whitelist</div>
        <h3>Manage Allowed Senders</h3>
        <p>Control which email addresses can interact with your bot.</p>

        <div class="form-group">
          <div class="toggle-row">
            <div class="toggle-label">
              <Label>Enable Whitelist</Label>
              <span class="field-hint">When enabled, only listed emails can contact your bot</span>
            </div>
            <Switch
              checked={enableWhitelist}
              on:change={toggleWhitelist}
              disabled={loading}
            />
          </div>
        </div>

        {#if enableWhitelist}
          <div class="whitelist-section">
            <div class="add-email-row">
              <Input
                bind:value={newWhitelistEmail}
                placeholder="email@example.com"
                disabled={loading}
                on:keydown={(e) => e.key === 'Enter' && addToWhitelist()}
              />
              <Button variant="secondary" on:click={addToWhitelist} disabled={loading}>
                <Plus size={16} />
                Add
              </Button>
            </div>

            {#if whitelistedEmails.length > 0}
              <div class="whitelist-items">
                {#each whitelistedEmails as email}
                  <div class="whitelist-item">
                    <span>{email}</span>
                    <button class="remove-btn" on:click={() => removeFromWhitelist(email)} disabled={loading}>
                      <X size={14} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-whitelist">
                <Users size={24} />
                <p>No emails whitelisted yet</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="info-box warning">
            <h4>Warning:</h4>
            <p>With whitelist disabled, anyone can email your bot. Consider enabling the whitelist for security.</p>
          </div>
        {/if}
      </div>

    {:else if step === 'connected'}
      <div class="step-content connected">
        <div class="connected-status">
          <div class="connected-icon">
            <Check size={24} />
          </div>
          <div class="connected-info">
            <h3>Email Connected</h3>
            <p class="connection-detail">{inboundEmailAddress}</p>
          </div>
        </div>

        <div class="config-info">
          <div class="config-item">
            <span class="config-label">Inbound Address:</span>
            <span class="config-value">{inboundEmailAddress}</span>
          </div>
          <div class="config-item">
            <span class="config-label">From Address:</span>
            <span class="config-value">{fromEmailAddress}</span>
          </div>
          <div class="config-item">
            <span class="config-label">From Name:</span>
            <span class="config-value">{fromEmailName}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Whitelist:</span>
            <span class="config-value">{enableWhitelist ? `Enabled (${whitelistedEmails.length} emails)` : 'Disabled'}</span>
          </div>
        </div>

        <div class="action-buttons">
          <Button variant="secondary" on:click={() => step = 'whitelist'}>
            <Users size={16} />
            Manage Whitelist
          </Button>
          <button class="disconnect-btn" on:click={disconnect} disabled={loading}>
            {#if loading}
              <Loader2 size={14} class="spinner" />
            {:else}
              <Unlink size={14} />
            {/if}
            Disconnect
          </button>
        </div>

        <div class="info-box success">
          <h4>Your bot is ready!</h4>
          <ul>
            <li>Send an email to <strong>{inboundEmailAddress}</strong> to test</li>
            <li>Your bot will reply from <strong>{fromEmailName}</strong></li>
            <li>Conversations are threaded automatically</li>
          </ul>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="error-message">
        <AlertCircle size={16} />
        {error}
      </div>
    {/if}
  </div>

  <DialogFooter>
    {#if step === 'setup'}
      <Button variant="ghost" on:click={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button on:click={saveConfig} disabled={loading}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
        {/if}
        Save & Continue
      </Button>
    {:else if step === 'webhook'}
      <Button variant="ghost" on:click={() => step = 'setup'}>
        Back
      </Button>
      <Button on:click={goToWhitelist}>
        Continue
      </Button>
    {:else if step === 'whitelist'}
      <Button variant="ghost" on:click={() => useSharedInfrastructure ? step = 'setup' : step = 'webhook'}>
        Back
      </Button>
      <Button on:click={finishSetup}>
        Finish Setup
      </Button>
    {:else if step === 'connected'}
      <Button on:click={() => handleOpenChange(false)}>
        Done
      </Button>
    {/if}
  </DialogFooter>
</Dialog>

<style>
  .header-with-icon {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .email-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: hsl(210 80% 50% / 0.1);
    color: hsl(210 80% 50%);
  }

  .dialog-body {
    padding: var(--space-4) 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .loading-state :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1) var(--space-3);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    border-radius: var(--radius-full);
    width: fit-content;
  }

  .step-content h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .step-content > p {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    line-height: 1.6;
    margin: 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .info-box {
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .info-box h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .info-box p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.6;
  }

  .info-box ul {
    margin: 0;
    padding-left: var(--space-4);
  }

  .info-box li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    line-height: 1.6;
  }

  .info-box li:last-child {
    margin-bottom: 0;
  }

  .info-box code {
    background: hsl(var(--background));
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  .info-box.warning {
    background: hsl(45 90% 50% / 0.1);
    border: 1px solid hsl(45 90% 50% / 0.3);
  }

  .info-box.warning h4 {
    color: hsl(45 90% 35%);
  }

  .info-box.success {
    background: hsl(142 70% 45% / 0.1);
    border: 1px solid hsl(142 70% 45% / 0.3);
  }

  .info-box.success h4 {
    color: hsl(142 70% 35%);
  }

  .copy-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background 0.2s;
  }

  .copy-box:hover {
    background: hsl(var(--muted) / 0.8);
  }

  .copy-text {
    flex: 1;
    font-size: var(--text-sm);
    font-family: monospace;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: hsl(var(--background));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .copy-btn:hover {
    color: hsl(var(--foreground));
  }

  .whitelist-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .add-email-row {
    display: flex;
    gap: var(--space-2);
  }

  .add-email-row :global(input) {
    flex: 1;
  }

  .whitelist-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 200px;
    overflow-y: auto;
  }

  .whitelist-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted));
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-btn:hover:not(:disabled) {
    color: hsl(var(--destructive));
    background: hsl(var(--destructive) / 0.1);
  }

  .remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .empty-whitelist {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-whitelist p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .connected-status {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: hsl(142 70% 45% / 0.1);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(142 70% 45% / 0.3);
  }

  .connected-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-full);
    background: hsl(142 70% 45%);
    color: white;
    flex-shrink: 0;
  }

  .connected-info h3 {
    margin: 0;
  }

  .connection-detail {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: var(--space-1) 0 0 0;
  }

  .config-info {
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .config-item {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
  }

  .config-label {
    color: hsl(var(--muted-foreground));
  }

  .config-value {
    color: hsl(var(--foreground));
    font-weight: var(--font-medium);
  }

  .action-buttons {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .disconnect-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: var(--radius-md);
    color: hsl(var(--destructive));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .disconnect-btn:hover:not(:disabled) {
    background: hsl(var(--destructive) / 0.1);
    border-color: hsl(var(--destructive) / 0.5);
  }

  .disconnect-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: var(--radius-lg);
    color: hsl(var(--destructive));
    font-size: var(--text-sm);
    margin-top: var(--space-4);
  }

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }
</style>
