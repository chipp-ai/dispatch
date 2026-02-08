<script lang="ts">
  /**
   * EmailSetupDialog Component
   *
   * Multi-step dialog for setting up Postmark email integration:
   * - Step 1: Configure - Choose infrastructure (shared/custom), email addresses, token
   * - Step 2: Webhook (custom domain only) - Shows webhook URL and token
   * - Step 3: Whitelist - Manage allowed senders
   *
   * Also shows connected state when already configured.
   *
   * Constellation design treatment matching WhatsApp/Slack dialogs.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { Mail, Check, Loader2, AlertCircle, Unlink, Copy, Plus, X, Users, CheckCircle, ArrowRight, ArrowLeft, Info, Zap, Shield } from 'lucide-svelte';
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
  let showDisconnectConfirm = false;

  // Whitelist management
  let whitelistedEmails: string[] = [];
  let newWhitelistEmail = '';
  let sharedDomain = 'chipp.ai';

  // Dynamic step labels based on infrastructure choice
  $: stepLabels = useSharedInfrastructure
    ? ['Configure', 'Whitelist']
    : ['Configure', 'Webhook', 'Whitelist'];

  // Map current step to stepper index
  function getStepIndex(currentStep: Step): number {
    if (currentStep === 'setup') return 0;
    if (currentStep === 'webhook') return 1;
    if (currentStep === 'whitelist') return useSharedInfrastructure ? 1 : 2;
    return -1;
  }

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
      showDisconnectConfirm = false;
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
    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/email/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'Email integration has been removed.');
      showDisconnectConfirm = false;
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
  <!-- Centered header matching constellation pattern -->
  <DialogHeader>
    <DialogTitle>
      <div class="em-header">
        <div class="em-icon-wrapper">
          <Mail size={20} />
        </div>
        <span>Email Configuration</span>
      </div>
    </DialogTitle>
    <DialogDescription>
      <span class="em-description">
        {#if step === 'loading'}
          Checking connection status...
        {:else if step === 'connected'}
          Your chatbot is connected and responding via email
        {:else if step === 'whitelist'}
          Manage who can email your bot
        {:else}
          Deploy your chatbot to email
        {/if}
      </span>
    </DialogDescription>
  </DialogHeader>

  <div class="em-body">
    {#if step === 'loading'}
      <div class="em-loading">
        <Loader2 size={28} class="spinner" />
        <p>Checking email configuration...</p>
      </div>

    {:else if step === 'setup'}
      <div class="em-form-area">
        <!-- Progress indicator -->
        <div class="em-progress">
          {#each stepLabels as label, i}
            {#if i > 0}
              <div class="em-progress-line" class:done={getStepIndex(step) > i}></div>
            {/if}
            <div class="em-progress-step" class:active={getStepIndex(step) === i} class:done={getStepIndex(step) > i}>
              <div class="em-progress-dot">
                {#if getStepIndex(step) > i}
                  <Check size={12} />
                {:else}
                  {i + 1}
                {/if}
              </div>
              <span>{label}</span>
            </div>
          {/each}
        </div>

        <div class="em-section-header">
          <h3>Configure Email Integration</h3>
          <p>Set up how your AI agent receives and sends emails.</p>
        </div>

        <!-- Infrastructure toggle -->
        <div class="em-config-card">
          <div class="em-config-card-header">
            <Zap size={14} />
            <span>Infrastructure</span>
          </div>
          <div class="em-config-fields">
            <div class="em-toggle-row">
              <div class="em-toggle-label">
                <Label>Use Shared Infrastructure</Label>
                <span class="em-hint">Use @{sharedDomain} addresses (recommended)</span>
              </div>
              <Switch
                checked={useSharedInfrastructure}
                on:change={() => useSharedInfrastructure = !useSharedInfrastructure}
              />
            </div>
          </div>
        </div>

        <!-- Email addresses config card -->
        <div class="em-config-card">
          <div class="em-config-card-header">
            <Mail size={14} />
            <span>Email Addresses</span>
          </div>
          <div class="em-config-fields">
            <div class="em-field-group">
              <Label for="inboundEmail">Inbound Email Address</Label>
              <Input
                id="inboundEmail"
                bind:value={inboundEmailAddress}
                placeholder={useSharedInfrastructure ? `your-bot@${sharedDomain}` : "support@yourdomain.com"}
                disabled={loading}
              />
              <span class="em-hint">Emails sent to this address will be handled by your bot</span>
            </div>

            <div class="em-field-group">
              <Label for="fromEmail">From Email Address</Label>
              <Input
                id="fromEmail"
                bind:value={fromEmailAddress}
                placeholder={useSharedInfrastructure ? `your-bot@${sharedDomain}` : "support@yourdomain.com"}
                disabled={loading}
              />
              <span class="em-hint">Replies will be sent from this address</span>
            </div>

            <div class="em-field-group">
              <Label for="fromName">From Name</Label>
              <Input
                id="fromName"
                bind:value={fromEmailName}
                placeholder="Your Bot Name"
                disabled={loading}
              />
              <span class="em-hint">Display name shown in email clients</span>
            </div>

            {#if !useSharedInfrastructure}
              <div class="em-field-group">
                <Label for="postmarkToken">Postmark Server API Token</Label>
                <Input
                  id="postmarkToken"
                  type="password"
                  bind:value={postmarkServerToken}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  disabled={loading}
                />
                <span class="em-hint">Get this from your Postmark server settings</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Whitelist toggle -->
        <div class="em-config-card">
          <div class="em-config-card-header">
            <Shield size={14} />
            <span>Security</span>
          </div>
          <div class="em-config-fields">
            <div class="em-toggle-row">
              <div class="em-toggle-label">
                <Label>Enable Sender Whitelist</Label>
                <span class="em-hint">Only respond to approved email addresses</span>
              </div>
              <Switch
                checked={enableWhitelist}
                on:change={() => enableWhitelist = !enableWhitelist}
              />
            </div>
          </div>
        </div>
      </div>

    {:else if step === 'webhook'}
      <div class="em-form-area">
        <!-- Progress indicator -->
        <div class="em-progress">
          {#each stepLabels as label, i}
            {#if i > 0}
              <div class="em-progress-line" class:done={getStepIndex(step) >= i}></div>
            {/if}
            <div class="em-progress-step" class:active={getStepIndex(step) === i} class:done={getStepIndex(step) > i}>
              <div class="em-progress-dot">
                {#if getStepIndex(step) > i}
                  <Check size={12} />
                {:else}
                  {i + 1}
                {/if}
              </div>
              <span>{label}</span>
            </div>
          {/each}
        </div>

        <div class="em-section-header">
          <h3>Configure Postmark Webhook</h3>
          <p>Add this webhook URL in your Postmark server's Inbound settings.</p>
        </div>

        <div class="em-field-group">
          <Label>Webhook URL</Label>
          <button class="em-copy-field" on:click={() => copyToClipboard(webhookUrl, 'url')}>
            <code>{webhookUrl}</code>
            <div class="em-copy-icon" class:copied={copiedField === 'url'}>
              {#if copiedField === 'url'}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </div>
          </button>
        </div>

        <div class="em-field-group">
          <Label>Webhook Token</Label>
          <button class="em-copy-field" on:click={() => copyToClipboard(webhookToken, 'token')}>
            <code>{webhookToken}</code>
            <div class="em-copy-icon" class:copied={copiedField === 'token'}>
              {#if copiedField === 'token'}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </div>
          </button>
          <span class="em-hint">Add as <code>?token=</code> query parameter to the webhook URL</span>
        </div>

        <div class="em-status-box info">
          <div class="em-status-box-icon">
            <Info size={18} />
          </div>
          <div class="em-status-box-content">
            <h4>Postmark setup</h4>
            <ol>
              <li>Go to Postmark &rarr; Servers &rarr; [Your Server] &rarr; Settings</li>
              <li>Under Inbound, set the Webhook URL to the URL above with <code>?token=YOUR_TOKEN</code></li>
              <li>Enable "Include raw email content in JSON payload" if available</li>
            </ol>
          </div>
        </div>
      </div>

    {:else if step === 'whitelist'}
      <div class="em-form-area">
        <!-- Progress indicator -->
        <div class="em-progress">
          {#each stepLabels as label, i}
            {#if i > 0}
              <div class="em-progress-line" class:done={getStepIndex(step) >= i}></div>
            {/if}
            <div class="em-progress-step" class:active={getStepIndex(step) === i} class:done={getStepIndex(step) > i}>
              <div class="em-progress-dot">
                {#if getStepIndex(step) > i}
                  <Check size={12} />
                {:else}
                  {i + 1}
                {/if}
              </div>
              <span>{label}</span>
            </div>
          {/each}
        </div>

        <div class="em-section-header">
          <h3>Manage Allowed Senders</h3>
          <p>Control which email addresses can interact with your bot.</p>
        </div>

        <div class="em-config-card">
          <div class="em-config-card-header">
            <Shield size={14} />
            <span>Whitelist Settings</span>
          </div>
          <div class="em-config-fields">
            <div class="em-toggle-row">
              <div class="em-toggle-label">
                <Label>Enable Whitelist</Label>
                <span class="em-hint">When enabled, only listed emails can contact your bot</span>
              </div>
              <Switch
                checked={enableWhitelist}
                on:change={toggleWhitelist}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {#if enableWhitelist}
          <div class="em-whitelist-section">
            <div class="em-add-email-row">
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
              <div class="em-whitelist-items">
                {#each whitelistedEmails as email}
                  <div class="em-whitelist-item">
                    <span>{email}</span>
                    <button class="em-remove-btn" on:click={() => removeFromWhitelist(email)} disabled={loading}>
                      <X size={14} />
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="em-empty-whitelist">
                <Users size={24} />
                <p>No emails whitelisted yet</p>
              </div>
            {/if}
          </div>
        {:else}
          <div class="em-status-box warning">
            <div class="em-status-box-icon">
              <AlertCircle size={18} />
            </div>
            <div class="em-status-box-content">
              <h4>Warning</h4>
              <p class="em-warning-text">With whitelist disabled, anyone can email your bot. Consider enabling the whitelist for security.</p>
            </div>
          </div>
        {/if}
      </div>

    {:else if step === 'connected'}
      <div class="em-form-area">
        <!-- Connected banner with gradient -->
        <div class="em-connected-banner">
          <div class="em-connected-banner-bg"></div>
          <div class="em-connected-banner-content">
            <div class="em-connected-icon">
              <CheckCircle size={20} />
            </div>
            <div class="em-connected-text">
              <h3>Email Connected</h3>
              <div class="em-connected-meta">
                <div class="em-status-dot"></div>
                <span>{inboundEmailAddress}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Config details card -->
        <div class="em-config-card">
          <div class="em-config-card-header">
            <Mail size={14} />
            <span>Configuration</span>
          </div>
          <div class="em-config-fields">
            <div class="em-config-row">
              <span class="em-config-label">Inbound Address</span>
              <span class="em-config-value">{inboundEmailAddress}</span>
            </div>
            <div class="em-config-row">
              <span class="em-config-label">From Address</span>
              <span class="em-config-value">{fromEmailAddress}</span>
            </div>
            <div class="em-config-row">
              <span class="em-config-label">From Name</span>
              <span class="em-config-value">{fromEmailName}</span>
            </div>
            <div class="em-config-row">
              <span class="em-config-label">Whitelist</span>
              <span class="em-config-value">{enableWhitelist ? `Enabled (${whitelistedEmails.length})` : 'Disabled'}</span>
            </div>
          </div>
        </div>

        <!-- Manage whitelist button -->
        <button class="em-manage-btn" on:click={() => step = 'whitelist'}>
          <Users size={16} />
          Manage Whitelist
          <ArrowRight size={14} />
        </button>

        <!-- Next steps -->
        <div class="em-status-box success">
          <div class="em-status-box-icon">
            <CheckCircle size={18} />
          </div>
          <div class="em-status-box-content">
            <h4>Your bot is ready!</h4>
            <ul>
              <li>Send an email to <strong>{inboundEmailAddress}</strong> to test</li>
              <li>Your bot will reply from <strong>{fromEmailName}</strong></li>
              <li>Conversations are threaded automatically</li>
            </ul>
          </div>
        </div>

        <!-- Disconnect section -->
        {#if showDisconnectConfirm}
          <div class="em-disconnect-confirm">
            <AlertCircle size={16} />
            <div class="em-disconnect-confirm-body">
              <p>Are you sure? Your bot will stop responding to emails.</p>
              <div class="em-disconnect-confirm-actions">
                <Button variant="ghost" size="sm" on:click={() => showDisconnectConfirm = false} disabled={loading}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" on:click={disconnect} disabled={loading}>
                  {#if loading}
                    <Loader2 size={14} class="spinner" />
                  {/if}
                  Yes, Disconnect
                </Button>
              </div>
            </div>
          </div>
        {:else}
          <button class="em-disconnect-link" on:click={() => showDisconnectConfirm = true}>
            <Unlink size={13} />
            Disconnect Email
          </button>
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="em-error">
        <AlertCircle size={15} />
        <span>{error}</span>
      </div>
    {/if}
  </div>

  <!-- Sticky footer -->
  <DialogFooter>
    {#if step === 'setup'}
      <Button variant="ghost" on:click={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button on:click={saveConfig} disabled={loading}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
          Saving...
        {:else}
          Save & Continue
          <ArrowRight size={15} />
        {/if}
      </Button>
    {:else if step === 'webhook'}
      <Button variant="ghost" on:click={() => step = 'setup'}>
        <ArrowLeft size={15} />
        Back
      </Button>
      <Button on:click={goToWhitelist}>
        Continue
        <ArrowRight size={15} />
      </Button>
    {:else if step === 'whitelist'}
      <Button variant="ghost" on:click={() => useSharedInfrastructure ? step = 'setup' : step = 'webhook'}>
        <ArrowLeft size={15} />
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
  /* ========================================
   * Header
   * ======================================== */

  .em-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
  }

  .em-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, hsl(210 80% 50%) 0%, hsl(240 70% 55%) 100%);
    color: white;
    box-shadow: 0 2px 8px hsl(210 80% 50% / 0.3);
  }

  .em-header span {
    font-family: var(--font-display);
  }

  .em-description {
    display: block;
    text-align: center;
    max-width: 65%;
    margin: 0 auto;
  }

  /* ========================================
   * Body
   * ======================================== */

  .em-body {
    padding: var(--space-2) 0 var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .em-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .em-loading p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .em-loading :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ========================================
   * Form Area (centered content column)
   * ======================================== */

  .em-form-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 420px;
    width: 100%;
    margin: 0 auto;
  }

  /* ========================================
   * Progress Steps
   * ======================================== */

  .em-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: var(--space-2) 0 var(--space-2) 0;
  }

  .em-progress-step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .em-progress-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: var(--font-semibold);
    border: 1.5px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
    background: hsl(var(--background));
    transition: all var(--transition-base);
  }

  .em-progress-step span {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
    transition: color var(--transition-base);
  }

  .em-progress-step.active .em-progress-dot {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .em-progress-step.active span {
    color: hsl(var(--foreground));
  }

  .em-progress-step.done .em-progress-dot {
    border-color: hsl(210 80% 50%);
    background: hsl(210 80% 50%);
    color: white;
  }

  .em-progress-step.done span {
    color: hsl(var(--muted-foreground));
  }

  .em-progress-line {
    width: 32px;
    height: 1.5px;
    background: hsl(var(--border));
    margin: 0 var(--space-1);
    transition: background var(--transition-base);
  }

  .em-progress-line.done {
    background: hsl(210 80% 50%);
  }

  /* ========================================
   * Section Header
   * ======================================== */

  .em-section-header {
    text-align: center;
  }

  .em-section-header h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .em-section-header p {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    line-height: 1.5;
    margin: 0;
  }

  /* ========================================
   * Status Boxes (info, warning, success)
   * ======================================== */

  .em-status-box {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-xl);
    border: 1px solid;
  }

  .em-status-box.info {
    background: hsl(217 91% 60% / 0.06);
    border-color: hsl(217 91% 60% / 0.15);
  }
  .em-status-box.info .em-status-box-icon {
    color: hsl(217 91% 50%);
  }
  .em-status-box.info h4 {
    color: hsl(217 91% 30%);
  }

  .em-status-box.warning {
    background: hsl(38 92% 50% / 0.06);
    border-color: hsl(38 92% 50% / 0.2);
  }
  .em-status-box.warning .em-status-box-icon {
    color: hsl(38 92% 45%);
  }
  .em-status-box.warning h4 {
    color: hsl(38 50% 30%);
  }

  .em-status-box.success {
    background: hsl(142 70% 45% / 0.06);
    border-color: hsl(142 70% 45% / 0.2);
  }
  .em-status-box.success .em-status-box-icon {
    color: hsl(142 70% 40%);
  }
  .em-status-box.success h4 {
    color: hsl(142 50% 25%);
  }

  .em-status-box-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .em-status-box-content {
    flex: 1;
    min-width: 0;
  }

  .em-status-box-content h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-2) 0;
  }

  .em-status-box-content ul,
  .em-status-box-content ol {
    margin: 0;
    padding-left: var(--space-4);
  }

  .em-status-box-content li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    line-height: 1.6;
  }

  .em-status-box-content li:last-child {
    margin-bottom: 0;
  }

  .em-status-box-content code {
    background: hsl(var(--background));
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border: 1px solid hsl(var(--border));
  }

  .em-warning-text {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.6;
  }

  /* ========================================
   * Config Card
   * ======================================== */

  .em-config-card {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .em-config-card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--muted) / 0.5);
    border-bottom: 1px solid hsl(var(--border));
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .em-config-fields {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ========================================
   * Form Fields
   * ======================================== */

  .em-field-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .em-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
  }

  .em-hint code {
    background: hsl(var(--muted));
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  /* ========================================
   * Toggle Row
   * ======================================== */

  .em-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .em-toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ========================================
   * Copy Field
   * ======================================== */

  .em-copy-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    height: 40px;
    padding: 0 var(--space-2) 0 var(--space-4);
    background: hsl(var(--muted));
    border: 1px solid transparent;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-base);
    width: 100%;
    text-align: left;
  }

  .em-copy-field:hover {
    border-color: hsl(var(--border));
    box-shadow: var(--shadow-sm);
  }

  .em-copy-field code {
    flex: 1;
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .em-copy-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    transition: all var(--transition-base);
  }

  .em-copy-icon.copied {
    color: hsl(142 70% 40%);
    background: hsl(142 70% 45% / 0.1);
  }

  .em-copy-field:hover .em-copy-icon:not(.copied) {
    color: hsl(var(--foreground));
  }

  /* ========================================
   * Whitelist Management
   * ======================================== */

  .em-whitelist-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .em-add-email-row {
    display: flex;
    gap: var(--space-2);
  }

  .em-add-email-row :global(input) {
    flex: 1;
  }

  .em-whitelist-items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 200px;
    overflow-y: auto;
  }

  .em-whitelist-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted));
    border-radius: var(--radius-xl);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
  }

  .em-remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: var(--radius-full);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .em-remove-btn:hover:not(:disabled) {
    color: hsl(var(--destructive));
    background: hsl(var(--destructive) / 0.1);
  }

  .em-remove-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .em-empty-whitelist {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .em-empty-whitelist p {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* ========================================
   * Connected State
   * ======================================== */

  .em-connected-banner {
    position: relative;
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .em-connected-banner-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      hsl(210 80% 50% / 0.1) 0%,
      hsl(210 80% 50% / 0.05) 50%,
      hsl(240 70% 55% / 0.08) 100%
    );
    border: 1px solid hsl(210 80% 50% / 0.2);
    border-radius: inherit;
  }

  .em-connected-banner-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-4);
  }

  .em-connected-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, hsl(210 80% 50%) 0%, hsl(240 70% 55%) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 0 4px 12px hsl(210 80% 50% / 0.3);
  }

  .em-connected-text h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .em-connected-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .em-status-dot {
    width: 7px;
    height: 7px;
    background: hsl(142 70% 45%);
    border-radius: var(--radius-full);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 hsl(142 70% 45% / 0.4); }
    50% { opacity: 0.8; box-shadow: 0 0 0 4px hsl(142 70% 45% / 0); }
  }

  /* ========================================
   * Config Rows (connected state details)
   * ======================================== */

  .em-config-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
  }

  .em-config-label {
    color: hsl(var(--muted-foreground));
  }

  .em-config-value {
    color: hsl(var(--foreground));
    font-weight: var(--font-medium);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }

  /* ========================================
   * Manage Whitelist Button
   * ======================================== */

  .em-manage-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    border: 1.5px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .em-manage-btn:hover {
    border-color: hsl(210 80% 50% / 0.4);
    box-shadow: 0 2px 12px hsl(210 80% 50% / 0.1);
    background: hsl(210 80% 50% / 0.04);
  }

  /* ========================================
   * Disconnect
   * ======================================== */

  .em-disconnect-link {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2);
    background: transparent;
    border: none;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: color var(--transition-base);
    border-radius: var(--radius-md);
  }

  .em-disconnect-link:hover {
    color: hsl(var(--destructive));
  }

  .em-disconnect-confirm {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--destructive) / 0.04);
    border: 1px solid hsl(var(--destructive) / 0.15);
    border-radius: var(--radius-xl);
    color: hsl(var(--destructive));
  }

  .em-disconnect-confirm > :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .em-disconnect-confirm-body {
    flex: 1;
  }

  .em-disconnect-confirm-body p {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
    line-height: 1.5;
  }

  .em-disconnect-confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  /* ========================================
   * Error
   * ======================================== */

  .em-error {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--destructive) / 0.06);
    border: 1px solid hsl(var(--destructive) / 0.15);
    border-radius: var(--radius-xl);
    color: hsl(var(--destructive));
    font-size: var(--text-sm);
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
  }

  .em-error span {
    flex: 1;
  }

  /* ========================================
   * Global overrides
   * ======================================== */

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }
</style>
