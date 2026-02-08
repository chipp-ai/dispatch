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
  import { ExternalLink, Check, Loader2, AlertCircle, Unlink, Copy, CheckCircle, ArrowRight, ArrowLeft, Info, Zap } from 'lucide-svelte';
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
  let showDisconnectConfirm = false;

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
      showDisconnectConfirm = false;
      dispatch('close');
    }
  }

  function openMetaPortal() {
    window.open('https://developers.facebook.com/apps/', '_blank', 'noopener,noreferrer');
  }

  function goToWebhook() {
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
    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/whatsapp/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'WhatsApp integration has been removed.');
      showDisconnectConfirm = false;
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
  <!-- Centered header matching ChippMono pattern -->
  <DialogHeader>
    <DialogTitle>
      <div class="wa-header">
        <div class="wa-icon-wrapper">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        <span>WhatsApp Configuration</span>
      </div>
    </DialogTitle>
    <DialogDescription>
      <span class="wa-description">
        {#if step === 'loading'}
          Checking connection status...
        {:else if step === 'connected'}
          Your chatbot is connected and receiving messages
        {:else}
          Connect your app to WhatsApp to deploy your application
        {/if}
      </span>
    </DialogDescription>
  </DialogHeader>

  <div class="wa-body">
    {#if step === 'loading'}
      <div class="wa-loading">
        <Loader2 size={28} class="spinner" />
        <p>Checking WhatsApp connection...</p>
      </div>

    {:else if step === 'create-app'}
      <div class="wa-form-area">
        <!-- Progress indicator -->
        <div class="wa-progress">
          <div class="wa-progress-step active">
            <div class="wa-progress-dot">1</div>
            <span>Create App</span>
          </div>
          <div class="wa-progress-line"></div>
          <div class="wa-progress-step">
            <div class="wa-progress-dot">2</div>
            <span>Webhook</span>
          </div>
          <div class="wa-progress-line"></div>
          <div class="wa-progress-step">
            <div class="wa-progress-dot">3</div>
            <span>Credentials</span>
          </div>
        </div>

        <div class="wa-section-header">
          <h3>Create a WhatsApp Business App</h3>
          <p>Set up your app in the Meta Developer Portal to get started.</p>
        </div>

        <div class="wa-status-box info">
          <div class="wa-status-box-icon">
            <Info size={18} />
          </div>
          <div class="wa-status-box-content">
            <h4>What you'll need</h4>
            <ul>
              <li>A Meta Developer account</li>
              <li>A Meta Business account</li>
              <li>A phone number for testing (can use the test number Meta provides)</li>
            </ul>
          </div>
        </div>

        <button class="wa-external-link" on:click={openMetaPortal}>
          <ExternalLink size={16} />
          Open Meta Developer Portal
          <ArrowRight size={14} />
        </button>
      </div>

    {:else if step === 'webhook'}
      <div class="wa-form-area">
        <div class="wa-progress">
          <div class="wa-progress-step done">
            <div class="wa-progress-dot"><Check size={12} /></div>
            <span>Create App</span>
          </div>
          <div class="wa-progress-line done"></div>
          <div class="wa-progress-step active">
            <div class="wa-progress-dot">2</div>
            <span>Webhook</span>
          </div>
          <div class="wa-progress-line"></div>
          <div class="wa-progress-step">
            <div class="wa-progress-dot">3</div>
            <span>Credentials</span>
          </div>
        </div>

        <div class="wa-section-header">
          <h3>Configure Webhook</h3>
          <p>In your WhatsApp app settings, configure the webhook with these values.</p>
        </div>

        <div class="wa-field-group">
          <Label>Callback URL</Label>
          <button class="wa-copy-field" on:click={() => copyToClipboard(webhookUrl, 'url')}>
            <code>{webhookUrl}</code>
            <div class="wa-copy-icon" class:copied={copiedField === 'url'}>
              {#if copiedField === 'url'}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </div>
          </button>
        </div>

        <div class="wa-status-box warning">
          <div class="wa-status-box-icon">
            <AlertCircle size={18} />
          </div>
          <div class="wa-status-box-content">
            <h4>Important</h4>
            <ul>
              <li>The Verify Token will be generated after you save your credentials</li>
              <li>Subscribe to the <code>messages</code> webhook field</li>
              <li>You may need to use ngrok for local development</li>
            </ul>
          </div>
        </div>
      </div>

    {:else if step === 'credentials'}
      <div class="wa-form-area">
        <div class="wa-progress">
          <div class="wa-progress-step done">
            <div class="wa-progress-dot"><Check size={12} /></div>
            <span>Create App</span>
          </div>
          <div class="wa-progress-line done"></div>
          <div class="wa-progress-step done">
            <div class="wa-progress-dot"><Check size={12} /></div>
            <span>Webhook</span>
          </div>
          <div class="wa-progress-line done"></div>
          <div class="wa-progress-step active">
            <div class="wa-progress-dot">3</div>
            <span>Credentials</span>
          </div>
        </div>

        <div class="wa-section-header">
          <h3>Enter Credentials</h3>
          <p>Copy these values from your WhatsApp app in the Meta Developer Portal.</p>
        </div>

        <div class="wa-field-group">
          <Label for="phoneNumberId">Phone Number ID</Label>
          <Input
            id="phoneNumberId"
            bind:value={phoneNumberId}
            placeholder="123456789012345"
            disabled={loading}
          />
          <span class="wa-hint">Found in WhatsApp &rarr; API Setup &rarr; Phone number ID</span>
        </div>

        <div class="wa-field-group">
          <Label for="businessAccountId">WhatsApp Business Account ID</Label>
          <Input
            id="businessAccountId"
            bind:value={businessAccountId}
            placeholder="123456789012345"
            disabled={loading}
          />
          <span class="wa-hint">Found in WhatsApp &rarr; API Setup &rarr; WhatsApp Business Account ID</span>
        </div>

        <div class="wa-field-group">
          <Label for="accessToken">Permanent Access Token</Label>
          <Input
            id="accessToken"
            type="password"
            bind:value={accessToken}
            placeholder="EAAxxxxxxxxxxxxxxxx"
            disabled={loading}
          />
          <span class="wa-hint">Generate in App Settings &rarr; Basic Settings. Use a System User token for production.</span>
        </div>
      </div>

    {:else if step === 'connected'}
      <div class="wa-form-area">
        <!-- Connected banner with gradient -->
        <div class="wa-connected-banner">
          <div class="wa-connected-banner-bg"></div>
          <div class="wa-connected-banner-content">
            <div class="wa-connected-icon">
              <CheckCircle size={20} />
            </div>
            <div class="wa-connected-text">
              <h3>WhatsApp Connected</h3>
              <div class="wa-connected-meta">
                <div class="wa-status-dot"></div>
                <span>Receiving messages</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Webhook config card -->
        <div class="wa-config-card">
          <div class="wa-config-card-header">
            <Zap size={14} />
            <span>Webhook Configuration</span>
          </div>
          <div class="wa-config-fields">
            <div class="wa-field-group">
              <Label>Callback URL</Label>
              <button class="wa-copy-field" on:click={() => copyToClipboard(webhookUrl, 'url')}>
                <code>{webhookUrl}</code>
                <div class="wa-copy-icon" class:copied={copiedField === 'url'}>
                  {#if copiedField === 'url'}
                    <Check size={14} />
                  {:else}
                    <Copy size={14} />
                  {/if}
                </div>
              </button>
            </div>

            <div class="wa-field-group">
              <Label>Verify Token</Label>
              <button class="wa-copy-field" on:click={() => copyToClipboard(webhookSecret, 'secret')}>
                <code>{webhookSecret}</code>
                <div class="wa-copy-icon" class:copied={copiedField === 'secret'}>
                  {#if copiedField === 'secret'}
                    <Check size={14} />
                  {:else}
                    <Copy size={14} />
                  {/if}
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Next steps -->
        <div class="wa-status-box success">
          <div class="wa-status-box-icon">
            <CheckCircle size={18} />
          </div>
          <div class="wa-status-box-content">
            <h4>Your bot is ready!</h4>
            <ul>
              <li>Configure the webhook in Meta Developer Portal with the URL and Verify Token above</li>
              <li>Subscribe to the <code>messages</code> webhook field</li>
              <li>Send a message to your WhatsApp number to test</li>
            </ul>
          </div>
        </div>

        <!-- Disconnect section -->
        {#if showDisconnectConfirm}
          <div class="wa-disconnect-confirm">
            <AlertCircle size={16} />
            <div class="wa-disconnect-confirm-body">
              <p>Are you sure? Your bot will stop responding to WhatsApp messages.</p>
              <div class="wa-disconnect-confirm-actions">
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
          <button class="wa-disconnect-link" on:click={() => showDisconnectConfirm = true}>
            <Unlink size={13} />
            Disconnect WhatsApp
          </button>
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="wa-error">
        <AlertCircle size={15} />
        <span>{error}</span>
      </div>
    {/if}
  </div>

  <!-- Sticky footer with border-t -->
  <DialogFooter>
    {#if step === 'create-app'}
      <Button variant="ghost" on:click={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button on:click={goToWebhook}>
        I've created my app
        <ArrowRight size={15} />
      </Button>
    {:else if step === 'webhook'}
      <Button variant="ghost" on:click={() => step = 'create-app'}>
        <ArrowLeft size={15} />
        Back
      </Button>
      <Button on:click={goToCredentials}>
        Continue
        <ArrowRight size={15} />
      </Button>
    {:else if step === 'credentials'}
      <Button variant="ghost" on:click={() => step = 'webhook'}>
        <ArrowLeft size={15} />
        Back
      </Button>
      <Button on:click={saveCredentials} disabled={loading}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
          Saving...
        {:else}
          Save Configuration
        {/if}
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

  .wa-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
  }

  .wa-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, hsl(142 70% 45%) 0%, hsl(142 70% 35%) 100%);
    color: white;
    box-shadow: 0 2px 8px hsl(142 70% 45% / 0.3);
  }

  .wa-header span {
    font-family: var(--font-display);
  }

  .wa-description {
    display: block;
    text-align: center;
    max-width: 65%;
    margin: 0 auto;
  }

  /* ========================================
   * Body
   * ======================================== */

  .wa-body {
    padding: var(--space-2) 0 var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .wa-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .wa-loading p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .wa-loading :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ========================================
   * Form Area (centered content column)
   * ======================================== */

  .wa-form-area {
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

  .wa-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: var(--space-2) 0 var(--space-2) 0;
  }

  .wa-progress-step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .wa-progress-dot {
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

  .wa-progress-step span {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
    transition: color var(--transition-base);
  }

  .wa-progress-step.active .wa-progress-dot {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .wa-progress-step.active span {
    color: hsl(var(--foreground));
  }

  .wa-progress-step.done .wa-progress-dot {
    border-color: hsl(142 70% 45%);
    background: hsl(142 70% 45%);
    color: white;
  }

  .wa-progress-step.done span {
    color: hsl(var(--muted-foreground));
  }

  .wa-progress-line {
    width: 32px;
    height: 1.5px;
    background: hsl(var(--border));
    margin: 0 var(--space-1);
    transition: background var(--transition-base);
  }

  .wa-progress-line.done {
    background: hsl(142 70% 45%);
  }

  /* ========================================
   * Section Header
   * ======================================== */

  .wa-section-header {
    text-align: center;
  }

  .wa-section-header h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .wa-section-header p {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    line-height: 1.5;
    margin: 0;
  }

  /* ========================================
   * Status Boxes (info, warning, success, error)
   * ======================================== */

  .wa-status-box {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-xl);
    border: 1px solid;
  }

  .wa-status-box.info {
    background: hsl(217 91% 60% / 0.06);
    border-color: hsl(217 91% 60% / 0.15);
  }
  .wa-status-box.info .wa-status-box-icon {
    color: hsl(217 91% 50%);
  }
  .wa-status-box.info h4 {
    color: hsl(217 91% 30%);
  }

  .wa-status-box.warning {
    background: hsl(38 92% 50% / 0.06);
    border-color: hsl(38 92% 50% / 0.2);
  }
  .wa-status-box.warning .wa-status-box-icon {
    color: hsl(38 92% 45%);
  }
  .wa-status-box.warning h4 {
    color: hsl(38 50% 30%);
  }

  .wa-status-box.success {
    background: hsl(142 70% 45% / 0.06);
    border-color: hsl(142 70% 45% / 0.2);
  }
  .wa-status-box.success .wa-status-box-icon {
    color: hsl(142 70% 40%);
  }
  .wa-status-box.success h4 {
    color: hsl(142 50% 25%);
  }

  .wa-status-box-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .wa-status-box-content {
    flex: 1;
    min-width: 0;
  }

  .wa-status-box-content h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-2) 0;
  }

  .wa-status-box-content ul {
    margin: 0;
    padding-left: var(--space-4);
  }

  .wa-status-box-content li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    line-height: 1.6;
  }

  .wa-status-box-content li:last-child {
    margin-bottom: 0;
  }

  .wa-status-box-content code {
    background: hsl(var(--background));
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border: 1px solid hsl(var(--border));
  }

  /* ========================================
   * External Link Button
   * ======================================== */

  .wa-external-link {
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

  .wa-external-link:hover {
    border-color: hsl(var(--foreground) / 0.3);
    box-shadow: var(--shadow-sm);
  }

  /* ========================================
   * Form Fields
   * ======================================== */

  .wa-field-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .wa-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
  }

  /* ========================================
   * Copy Field (ChippMono pattern)
   * ======================================== */

  .wa-copy-field {
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

  .wa-copy-field:hover {
    border-color: hsl(var(--border));
    box-shadow: var(--shadow-sm);
  }

  .wa-copy-field code {
    flex: 1;
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .wa-copy-icon {
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

  .wa-copy-icon.copied {
    color: hsl(142 70% 40%);
    background: hsl(142 70% 45% / 0.1);
  }

  .wa-copy-field:hover .wa-copy-icon:not(.copied) {
    color: hsl(var(--foreground));
  }

  /* ========================================
   * Connected State
   * ======================================== */

  .wa-connected-banner {
    position: relative;
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .wa-connected-banner-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      hsl(142 70% 45% / 0.1) 0%,
      hsl(142 70% 45% / 0.05) 50%,
      hsl(160 60% 45% / 0.08) 100%
    );
    border: 1px solid hsl(142 70% 45% / 0.2);
    border-radius: inherit;
  }

  .wa-connected-banner-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-4);
  }

  .wa-connected-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, hsl(142 70% 45%) 0%, hsl(160 60% 40%) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 0 4px 12px hsl(142 70% 45% / 0.3);
  }

  .wa-connected-text h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .wa-connected-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .wa-status-dot {
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
   * Config Card
   * ======================================== */

  .wa-config-card {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .wa-config-card-header {
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

  .wa-config-fields {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* ========================================
   * Disconnect
   * ======================================== */

  .wa-disconnect-link {
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

  .wa-disconnect-link:hover {
    color: hsl(var(--destructive));
  }

  .wa-disconnect-confirm {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--destructive) / 0.04);
    border: 1px solid hsl(var(--destructive) / 0.15);
    border-radius: var(--radius-xl);
    color: hsl(var(--destructive));
  }

  .wa-disconnect-confirm > :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .wa-disconnect-confirm-body {
    flex: 1;
  }

  .wa-disconnect-confirm-body p {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
    line-height: 1.5;
  }

  .wa-disconnect-confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  /* ========================================
   * Error
   * ======================================== */

  .wa-error {
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

  .wa-error span {
    flex: 1;
  }

  /* ========================================
   * Global overrides
   * ======================================== */

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }
</style>
