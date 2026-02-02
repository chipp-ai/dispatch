<script lang="ts">
  /**
   * SlackSetupDialog Component
   *
   * Multi-step dialog for setting up Slack integration:
   * - Step 1: Link to create Slack app
   * - Step 2: Enter credentials (Client ID, Secret, Signing Secret)
   * - Step 3: Install to Slack workspace
   *
   * Also shows connected state when already installed.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { ExternalLink, Check, Loader2, AlertCircle, Unlink } from 'lucide-svelte';
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
  type Step = 'loading' | 'create-app' | 'credentials' | 'install' | 'connected';
  let step: Step = 'loading';
  let loading = false;
  let error = '';

  // Credentials form
  let clientId = '';
  let clientSecret = '';
  let signingSecret = '';

  // Connected state
  let workspaceName = '';
  let oauthPopup: Window | null = null;

  // API base URL for OAuth
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
        workspaceName?: string;
        hasCredentials?: boolean;
      }>(`/api/integrations/slack/status?applicationId=${applicationId}`);

      if (response.connected) {
        workspaceName = response.workspaceName || 'Connected workspace';
        step = 'connected';
      } else if (response.hasCredentials) {
        step = 'install';
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

  function openSlackAppCreate() {
    window.open('https://api.slack.com/apps?new_app=1', '_blank', 'noopener,noreferrer');
  }

  function goToCredentials() {
    step = 'credentials';
  }

  async function saveCredentials() {
    if (!clientId.trim() || !clientSecret.trim() || !signingSecret.trim()) {
      error = 'All fields are required';
      return;
    }

    loading = true;
    error = '';

    try {
      await api.post('/api/integrations/slack/credentials', {
        applicationId,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        signingSecret: signingSecret.trim(),
      });

      toasts.success('Credentials saved', 'Now install the app to your Slack workspace.');
      step = 'install';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save credentials';
    } finally {
      loading = false;
    }
  }

  async function installToSlack() {
    loading = true;
    error = '';

    try {
      const response = await api.get<{ oauthUrl: string }>(
        `/api/integrations/slack/oauth-url?applicationId=${applicationId}`
      );

      // Open OAuth popup
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      oauthPopup = window.open(
        response.oauthUrl,
        'slack-oauth',
        `width=${width},height=${height},left=${left},top=${top},popup=1`
      );

      // Listen for OAuth completion message
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'slack-oauth-complete') {
          window.removeEventListener('message', handleMessage);
          oauthPopup?.close();
          oauthPopup = null;

          if (event.data.success) {
            workspaceName = event.data.workspaceName || 'Connected workspace';
            step = 'connected';
            toasts.success('Slack connected!', `Connected to ${workspaceName}`);
            dispatch('connected', { workspaceName });
          } else {
            error = event.data.error || 'OAuth failed';
          }
          loading = false;
        }
      };

      window.addEventListener('message', handleMessage);

      // Handle popup close without completion
      const checkPopup = setInterval(() => {
        if (oauthPopup?.closed) {
          clearInterval(checkPopup);
          window.removeEventListener('message', handleMessage);
          if (loading) {
            loading = false;
          }
        }
      }, 500);

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to start OAuth';
      loading = false;
    }
  }

  async function disconnect() {
    if (!confirm('Are you sure you want to disconnect Slack? Your bot will stop responding in the connected workspace.')) {
      return;
    }

    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/slack/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'Slack integration has been removed.');
      step = 'create-app';
      clientId = '';
      clientSecret = '';
      signingSecret = '';
      workspaceName = '';
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
        <div class="slack-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        </div>
        Slack Integration
      </div>
    </DialogTitle>
    <DialogDescription>
      {#if step === 'loading'}
        Checking connection status...
      {:else if step === 'connected'}
        Your chatbot is connected to Slack
      {:else}
        Deploy your chatbot as a Slack app
      {/if}
    </DialogDescription>
  </DialogHeader>

  <div class="dialog-body">
    {#if step === 'loading'}
      <div class="loading-state">
        <Loader2 size={32} class="spinner" />
        <p>Checking Slack connection...</p>
      </div>

    {:else if step === 'create-app'}
      <div class="step-content">
        <div class="step-number">Step 1</div>
        <h3>Create a Slack App</h3>
        <p>First, you need to create a Slack app in your workspace. Click the button below to open the Slack API dashboard.</p>

        <div class="info-box">
          <h4>When creating your app:</h4>
          <ul>
            <li>Choose "From scratch"</li>
            <li>Give it a name (e.g., your chatbot name)</li>
            <li>Select the workspace to install to</li>
          </ul>
        </div>

        <Button variant="secondary" on:click={openSlackAppCreate}>
          <ExternalLink size={16} />
          Create Slack App
        </Button>
      </div>

    {:else if step === 'credentials'}
      <div class="step-content">
        <div class="step-number">Step 2</div>
        <h3>Enter Credentials</h3>
        <p>Copy these values from your Slack app's settings page.</p>

        <div class="form-group">
          <Label for="clientId">Client ID</Label>
          <Input
            id="clientId"
            bind:value={clientId}
            placeholder="1234567890.1234567890"
            disabled={loading}
          />
          <span class="field-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>

        <div class="form-group">
          <Label for="clientSecret">Client Secret</Label>
          <Input
            id="clientSecret"
            type="password"
            bind:value={clientSecret}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            disabled={loading}
          />
          <span class="field-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>

        <div class="form-group">
          <Label for="signingSecret">Signing Secret</Label>
          <Input
            id="signingSecret"
            type="password"
            bind:value={signingSecret}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            disabled={loading}
          />
          <span class="field-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>

        <div class="info-box warning">
          <h4>Configure your Slack app:</h4>
          <ul>
            <li>Go to OAuth & Permissions, add redirect URL: <code>{getApiBaseUrl()}/api/integrations/slack/oauth/callback</code></li>
            <li>Add Bot Token Scopes: <code>chat:write</code>, <code>channels:history</code>, <code>app_mentions:read</code>, <code>im:history</code></li>
            <li>Go to Event Subscriptions, enable events, set Request URL: <code>{getApiBaseUrl()}/api/webhooks/slack</code></li>
            <li>Subscribe to bot events: <code>app_mention</code>, <code>message.im</code></li>
          </ul>
        </div>
      </div>

    {:else if step === 'install'}
      <div class="step-content">
        <div class="step-number">Step 3</div>
        <h3>Install to Slack</h3>
        <p>Click the button below to install your app to a Slack workspace. A popup will open for you to authorize the connection.</p>

        <div class="install-action">
          <Button on:click={installToSlack} disabled={loading}>
            {#if loading}
              <Loader2 size={16} class="spinner" />
              Connecting...
            {:else}
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
              Install to Slack
            {/if}
          </Button>
        </div>
      </div>

    {:else if step === 'connected'}
      <div class="step-content connected">
        <div class="connected-status">
          <div class="connected-icon">
            <Check size={24} />
          </div>
          <div class="connected-info">
            <h3>Connected to Slack</h3>
            <p class="workspace-name">{workspaceName}</p>
          </div>
        </div>

        <div class="info-box success">
          <h4>Your bot is ready!</h4>
          <ul>
            <li>Mention your bot with @YourBotName in any channel</li>
            <li>Send a direct message to your bot</li>
            <li>The bot will respond using your chatbot's AI</li>
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
      <Button on:click={goToCredentials}>
        I've created my app
      </Button>
    {:else if step === 'credentials'}
      <Button variant="ghost" on:click={() => step = 'create-app'}>
        Back
      </Button>
      <Button on:click={saveCredentials} disabled={loading}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
        {/if}
        Save & Continue
      </Button>
    {:else if step === 'install'}
      <Button variant="ghost" on:click={() => step = 'credentials'}>
        Back
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

  .slack-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: hsl(300 60% 40% / 0.1);
    color: hsl(300 60% 40%);
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
    word-break: break-all;
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

  .install-action {
    display: flex;
    justify-content: center;
    padding: var(--space-4);
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

  .workspace-name {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: var(--space-1) 0 0 0;
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
