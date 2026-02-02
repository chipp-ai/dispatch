<script lang="ts">
  /**
   * WhatsAppSetupDialog Component
   *
   * Multi-step dialog for setting up WhatsApp Business integration:
   * - Step 1: Link to create WhatsApp Business App
   * - Step 2: Configure webhook (shows URL and verify token to copy)
   * - Step 3: Enter credentials (Phone Number ID, Business Account ID, Access Token)
   *
   * Also shows connected state when already configured.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { ExternalLink, Check, Loader2, AlertCircle, Unlink, Copy } from 'lucide-svelte';
  import Dialog from '../Dialog.svelte';
  import DialogHeader from '../DialogHeader.svelte';
  import DialogTitle from '../DialogTitle.svelte';
  import DialogDescription from '../DialogDescription.svelte';
  import DialogFooter from '../DialogFooter.svelte';
  import Button from '../Button.svelte';
  import Input from '../Input.svelte';
  import Label from '../Label.svelte';
  import { api } from '../../../api';
  import { toasts } from '../../stores/toast';

  export let open = false;
  export let applicationId: string;

  const dispatch = createEventDispatcher();

  // State
  type Step = 'loading' | 'create-app' | 'webhook' | 'credentials' | 'connected';
  let step: Step = 'loading';
  let loading = false;
  let error = '';

  // Credentials form
  let phoneNumberId = '';
  let businessAccountId = '';
  let accessToken = '';

  // Connected state
  let webhookUrl = '';
  let webhookSecret = '';
  let copiedField: string | null = null;

  // API base URL for webhooks
  function getApiBaseUrl(): string {
    const isLocalhost = window.location.hostname === 'localhost';
    const isStaging = window.location.hostname.includes('staging') || window.location.hostname.includes('chipp.live');

    if (isLocalhost) {
      return 'http://localhost:8000';
    } else if (isStaging) {
      return 'https://staging-dino-mullet.chipp.ai';
    } else {
      return 'https://dino-mullet.chipp.ai';
    }
  }

  async function checkStatus() {
    loading = true;
    error = '';

    try {
      const response = await api.get<{
        connected: boolean;
        hasCredentials?: boolean;
        webhookUrl?: string;
        webhookSecret?: string;
      }>(`/api/integrations/whatsapp/status?applicationId=${applicationId}`);

      if (response.connected) {
        webhookUrl = response.webhookUrl || `${getApiBaseUrl()}/api/webhooks/whatsapp/${applicationId}`;
        webhookSecret = response.webhookSecret || '';
        step = 'connected';
      } else if (response.hasCredentials) {
        webhookUrl = response.webhookUrl || `${getApiBaseUrl()}/api/webhooks/whatsapp/${applicationId}`;
        webhookSecret = response.webhookSecret || '';
        step = 'connected';
      } else {
        step = 'create-app';
      }
    } catch (err) {
      step = 'create-app';
    } finally {
      loading = false;
    }
  }

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;
    if (!isOpen) {
      dispatch('close');
    }
  }

  function openMetaPortal() {
    window.open('https://developers.facebook.com/apps/', '_blank', 'noopener,noreferrer');
  }

  function goToWebhook() {
    // Generate a preview of the webhook URL
    webhookUrl = `${getApiBaseUrl()}/api/webhooks/whatsapp/${applicationId}`;
    webhookSecret = '(will be generated when you save credentials)';
    step = 'webhook';
  }

  function goToCredentials() {
    step = 'credentials';
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

  async function saveCredentials() {
    if (!phoneNumberId.trim() || !businessAccountId.trim() || !accessToken.trim()) {
      error = 'All fields are required';
      return;
    }

    loading = true;
    error = '';

    try {
      const response = await api.post<{
        success: boolean;
        webhookUrl: string;
        webhookSecret: string;
      }>('/api/integrations/whatsapp/config', {
        applicationId,
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim(),
        accessToken: accessToken.trim(),
      });

      webhookUrl = response.webhookUrl;
      webhookSecret = response.webhookSecret;
      toasts.success('WhatsApp Connected', 'Configure your webhook in Meta Developer Portal.');
      step = 'connected';
      dispatch('connected');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save credentials';
    } finally {
      loading = false;
    }
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect WhatsApp? Your bot will stop responding to messages.')) {
      return;
    }

    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/whatsapp/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'WhatsApp integration has been removed.');
      step = 'create-app';
      phoneNumberId = '';
      businessAccountId = '';
      accessToken = '';
      webhookUrl = '';
      webhookSecret = '';
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
        <div class="whatsapp-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        WhatsApp Integration
      </div>
    </DialogTitle>
    <DialogDescription>
      {#if step === 'loading'}
        Checking connection status...
      {:else if step === 'connected'}
        Your chatbot is connected to WhatsApp
      {:else}
        Deploy your chatbot to WhatsApp Business
      {/if}
    </DialogDescription>
  </DialogHeader>

  <div class="dialog-body">
    {#if step === 'loading'}
      <div class="loading-state">
        <Loader2 size={32} class="spinner" />
        <p>Checking WhatsApp connection...</p>
      </div>

    {:else if step === 'create-app'}
      <div class="step-content">
        <div class="step-number">Step 1</div>
        <h3>Create a WhatsApp Business App</h3>
        <p>First, you need to create a WhatsApp Business app in the Meta Developer Portal.</p>

        <div class="info-box">
          <h4>What you'll need:</h4>
          <ul>
            <li>A Meta Developer account</li>
            <li>A Meta Business account</li>
            <li>A phone number for testing (can use the test number Meta provides)</li>
          </ul>
        </div>

        <Button variant="secondary" on:click={openMetaPortal}>
          <ExternalLink size={16} />
          Open Meta Developer Portal
        </Button>
      </div>

    {:else if step === 'webhook'}
      <div class="step-content">
        <div class="step-number">Step 2</div>
        <h3>Configure Webhook</h3>
        <p>In your WhatsApp app settings, configure the webhook with these values.</p>

        <div class="form-group">
          <Label>Callback URL</Label>
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

        <div class="info-box warning">
          <h4>Important:</h4>
          <ul>
            <li>The Verify Token will be generated after you save your credentials</li>
            <li>Subscribe to the <code>messages</code> webhook field</li>
            <li>You may need to use ngrok for local development</li>
          </ul>
        </div>
      </div>

    {:else if step === 'credentials'}
      <div class="step-content">
        <div class="step-number">Step 3</div>
        <h3>Enter Credentials</h3>
        <p>Copy these values from your WhatsApp app in the Meta Developer Portal.</p>

        <div class="form-group">
          <Label for="phoneNumberId">Phone Number ID</Label>
          <Input
            id="phoneNumberId"
            bind:value={phoneNumberId}
            placeholder="123456789012345"
            disabled={loading}
          />
          <span class="field-hint">Found in WhatsApp &rarr; API Setup &rarr; Phone number ID</span>
        </div>

        <div class="form-group">
          <Label for="businessAccountId">WhatsApp Business Account ID</Label>
          <Input
            id="businessAccountId"
            bind:value={businessAccountId}
            placeholder="123456789012345"
            disabled={loading}
          />
          <span class="field-hint">Found in WhatsApp &rarr; API Setup &rarr; WhatsApp Business Account ID</span>
        </div>

        <div class="form-group">
          <Label for="accessToken">Permanent Access Token</Label>
          <Input
            id="accessToken"
            type="password"
            bind:value={accessToken}
            placeholder="EAAxxxxxxxxxxxxxxxx"
            disabled={loading}
          />
          <span class="field-hint">Generate in App Settings &rarr; Basic Settings. Use a System User token for production.</span>
        </div>
      </div>

    {:else if step === 'connected'}
      <div class="step-content connected">
        <div class="connected-status">
          <div class="connected-icon">
            <Check size={24} />
          </div>
          <div class="connected-info">
            <h3>WhatsApp Connected</h3>
            <p class="connection-detail">Webhook configured</p>
          </div>
        </div>

        <div class="webhook-info">
          <h4>Webhook Configuration</h4>
          <div class="form-group">
            <Label>Callback URL</Label>
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
            <Label>Verify Token</Label>
            <div class="copy-box" on:click={() => copyToClipboard(webhookSecret, 'secret')}>
              <code class="copy-text">{webhookSecret}</code>
              <button class="copy-btn">
                {#if copiedField === 'secret'}
                  <Check size={18} />
                {:else}
                  <Copy size={18} />
                {/if}
              </button>
            </div>
          </div>
        </div>

        <div class="info-box success">
          <h4>Your bot is ready!</h4>
          <ul>
            <li>Configure the webhook in Meta Developer Portal with the URL and Verify Token above</li>
            <li>Subscribe to the <code>messages</code> webhook field</li>
            <li>Send a message to your WhatsApp number to test</li>
          </ul>
        </div>

        <button class="disconnect-btn" on:click={disconnect} disabled={loading}>
          {#if loading}
            <Loader2 size={14} class="spinner" />
          {:else}
            <Unlink size={14} />
          {/if}
          Disconnect
        </button>
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
    {#if step === 'create-app'}
      <Button variant="ghost" on:click={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button on:click={goToWebhook}>
        I've created my app
      </Button>
    {:else if step === 'webhook'}
      <Button variant="ghost" on:click={() => step = 'create-app'}>
        Back
      </Button>
      <Button on:click={goToCredentials}>
        Continue
      </Button>
    {:else if step === 'credentials'}
      <Button variant="ghost" on:click={() => step = 'webhook'}>
        Back
      </Button>
      <Button on:click={saveCredentials} disabled={loading}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
        {/if}
        Save & Connect
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

  .whatsapp-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 40%);
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

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
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

  .webhook-info {
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .webhook-info h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
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
    width: fit-content;
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
