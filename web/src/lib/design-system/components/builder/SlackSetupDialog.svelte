<script lang="ts">
  /**
   * SlackSetupDialog Component
   *
   * Multi-step dialog for setting up Slack integration:
   * - Step 1: Generate manifest, create Slack app from manifest
   * - Step 2: Enter credentials (Client ID, Secret, Signing Secret)
   * - Step 3: Install to Slack workspace
   *
   * Also shows connected state when already installed.
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { ExternalLink, Check, Loader2, AlertCircle, Unlink, Copy, Download, AtSign, ArrowRight, ArrowLeft, Info, CheckCircle, Zap } from 'lucide-svelte';
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
  export let appName: string = 'My AI Assistant';

  const dispatch = createEventDispatcher();

  // State
  type Step = 'loading' | 'create-app' | 'credentials' | 'install' | 'connected';
  let step: Step = 'loading';
  let loading = false;
  let error = '';
  let manifestCopied = false;
  let mentionCopied = false;

  // Credentials form
  let clientId = '';
  let clientSecret = '';
  let signingSecret = '';

  // Connected state
  let workspaceName = '';
  let oauthPopup: Window | null = null;
  let showDisconnectConfirm = false;

  // API base URL for OAuth and manifest
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

  // Generate the Slack app manifest JSON
  function generateManifest(): object {
    const baseUrl = getApiBaseUrl();
    return {
      _metadata: {
        major_version: 2,
        minor_version: 1,
      },
      display_information: {
        name: appName || 'My AI Assistant',
        description: 'AI assistant powered by Chipp',
        background_color: '#4F46E5',
      },
      features: {
        app_home: {
          messages_tab_enabled: true,
          messages_tab_read_only_enabled: false,
        },
        bot_user: {
          display_name: appName || 'My AI Assistant',
          always_online: true,
        },
      },
      oauth_config: {
        redirect_urls: [`${baseUrl}/api/integrations/slack/oauth/callback`],
        scopes: {
          bot: [
            'chat:write',
            'chat:write.public',
            'app_mentions:read',
            'channels:history',
            'groups:history',
            'im:history',
            'files:write',
            'files:read',
            'channels:join',
            'reactions:write',
            'users:read',
            'users:read.email',
          ],
        },
      },
      settings: {
        interactivity: {
          is_enabled: true,
          request_url: `${baseUrl}/api/webhooks/slack/interactive`,
        },
        event_subscriptions: {
          request_url: `${baseUrl}/api/webhooks/slack`,
          bot_events: [
            'app_mention',
            'message.im',
            'message.groups',
            'message.channels',
          ],
        },
        socket_mode_enabled: false,
      },
    };
  }

  function getManifestJson(): string {
    return JSON.stringify(generateManifest(), null, 2);
  }

  async function copyManifest() {
    try {
      await navigator.clipboard.writeText(getManifestJson());
      manifestCopied = true;
      toasts.success('Copied', 'Manifest copied to clipboard');
      setTimeout(() => { manifestCopied = false; }, 2000);
    } catch {
      toasts.error('Copy failed', 'Could not copy to clipboard');
    }
  }

  function downloadManifest() {
    const blob = new Blob([getManifestJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (appName || 'slack-app').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `${safeName}-slack-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyMention() {
    const text = `@${appName} How can you help me?`;
    try {
      await navigator.clipboard.writeText(text);
      mentionCopied = true;
      toasts.success('Copied', text);
      setTimeout(() => { mentionCopied = false; }, 2000);
    } catch {
      toasts.error('Copy failed', 'Could not copy to clipboard');
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
      showDisconnectConfirm = false;
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
        slackClientId: clientId.trim(),
        slackClientSecret: clientSecret.trim(),
        slackSigningSecret: signingSecret.trim(),
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
    loading = true;
    error = '';

    try {
      await api.delete(`/api/integrations/slack/disconnect?applicationId=${applicationId}`);
      toasts.success('Disconnected', 'Slack integration has been removed.');
      showDisconnectConfirm = false;
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
  <!-- Centered header -->
  <DialogHeader>
    <DialogTitle>
      <div class="sl-header">
        <div class="sl-icon-wrapper">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
          </svg>
        </div>
        <span>Slack Configuration</span>
      </div>
    </DialogTitle>
    <DialogDescription>
      <span class="sl-description">
        {#if step === 'loading'}
          Checking connection status...
        {:else if step === 'connected'}
          Your chatbot is connected and responding in Slack
        {:else}
          Connect your assistant to Slack by creating a Slack app
        {/if}
      </span>
    </DialogDescription>
  </DialogHeader>

  <div class="sl-body">
    {#if step === 'loading'}
      <div class="sl-loading">
        <Loader2 size={28} class="spinner" />
        <p>Checking Slack connection...</p>
      </div>

    {:else if step === 'create-app'}
      <div class="sl-form-area">
        <!-- Progress indicator -->
        <div class="sl-progress">
          <div class="sl-progress-step active">
            <div class="sl-progress-dot">1</div>
            <span>Create App</span>
          </div>
          <div class="sl-progress-line"></div>
          <div class="sl-progress-step">
            <div class="sl-progress-dot">2</div>
            <span>Credentials</span>
          </div>
          <div class="sl-progress-line"></div>
          <div class="sl-progress-step">
            <div class="sl-progress-dot">3</div>
            <span>Install</span>
          </div>
        </div>

        <div class="sl-section-header">
          <h3>Create a Slack App</h3>
          <p>Use the manifest below to auto-configure your Slack app with the right permissions.</p>
        </div>

        <div class="sl-status-box info">
          <div class="sl-status-box-icon">
            <Info size={18} />
          </div>
          <div class="sl-status-box-content">
            <h4>Setup instructions</h4>
            <ol>
              <li>Go to <button class="sl-inline-link" on:click={openSlackAppCreate}>api.slack.com/apps <ExternalLink size={11} /></button></li>
              <li>Click <strong>"Create New App"</strong> then <strong>"From manifest"</strong></li>
              <li>Paste the JSON below and click Create</li>
              <li>Copy the <strong>Client ID</strong>, <strong>Client Secret</strong>, and <strong>Signing Secret</strong></li>
            </ol>
          </div>
        </div>

        <!-- Manifest code card -->
        <div class="sl-config-card">
          <div class="sl-config-card-header">
            <Zap size={14} />
            <span>App Manifest (JSON)</span>
            <div class="sl-manifest-actions">
              <button class="sl-action-btn" on:click={copyManifest}>
                {#if manifestCopied}
                  <Check size={13} />
                  Copied
                {:else}
                  <Copy size={13} />
                  Copy
                {/if}
              </button>
              <button class="sl-action-btn" on:click={downloadManifest}>
                <Download size={13} />
                Download
              </button>
            </div>
          </div>
          <pre class="sl-manifest-code">{getManifestJson()}</pre>
        </div>
      </div>

    {:else if step === 'credentials'}
      <div class="sl-form-area">
        <div class="sl-progress">
          <div class="sl-progress-step done">
            <div class="sl-progress-dot"><Check size={12} /></div>
            <span>Create App</span>
          </div>
          <div class="sl-progress-line done"></div>
          <div class="sl-progress-step active">
            <div class="sl-progress-dot">2</div>
            <span>Credentials</span>
          </div>
          <div class="sl-progress-line"></div>
          <div class="sl-progress-step">
            <div class="sl-progress-dot">3</div>
            <span>Install</span>
          </div>
        </div>

        <div class="sl-section-header">
          <h3>Enter Credentials</h3>
          <p>Copy these values from your Slack app's Basic Information page.</p>
        </div>

        <div class="sl-field-group">
          <Label for="clientId">Client ID</Label>
          <Input
            id="clientId"
            bind:value={clientId}
            placeholder="1234567890.1234567890123"
            disabled={loading}
          />
          <span class="sl-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>

        <div class="sl-field-group">
          <Label for="clientSecret">Client Secret</Label>
          <Input
            id="clientSecret"
            type="password"
            bind:value={clientSecret}
            placeholder="abcdef1234567890abcdef1234567890"
            disabled={loading}
          />
          <span class="sl-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>

        <div class="sl-field-group">
          <Label for="signingSecret">Signing Secret</Label>
          <Input
            id="signingSecret"
            type="password"
            bind:value={signingSecret}
            placeholder="abcdef1234567890abcdef1234567890"
            disabled={loading}
          />
          <span class="sl-hint">Found in Basic Information &rarr; App Credentials</span>
        </div>
      </div>

    {:else if step === 'install'}
      <div class="sl-form-area">
        <div class="sl-progress">
          <div class="sl-progress-step done">
            <div class="sl-progress-dot"><Check size={12} /></div>
            <span>Create App</span>
          </div>
          <div class="sl-progress-line done"></div>
          <div class="sl-progress-step done">
            <div class="sl-progress-dot"><Check size={12} /></div>
            <span>Credentials</span>
          </div>
          <div class="sl-progress-line done"></div>
          <div class="sl-progress-step active">
            <div class="sl-progress-dot">3</div>
            <span>Install</span>
          </div>
        </div>

        <div class="sl-section-header">
          <h3>Install to Slack</h3>
          <p>Click below to install your app. A popup will open for you to authorize the connection.</p>
        </div>

        <button class="sl-install-btn" on:click={installToSlack} disabled={loading}>
          {#if loading}
            <Loader2 size={18} class="spinner" />
            <span>Connecting...</span>
          {:else}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
            <span>Install to Slack</span>
            <ArrowRight size={15} />
          {/if}
        </button>

        <div class="sl-status-box info">
          <div class="sl-status-box-icon">
            <Info size={18} />
          </div>
          <div class="sl-status-box-content">
            <h4>What happens next</h4>
            <ul>
              <li>A Slack authorization popup will open</li>
              <li>Select the workspace you want to connect</li>
              <li>Approve the bot permissions</li>
            </ul>
          </div>
        </div>
      </div>

    {:else if step === 'connected'}
      <div class="sl-form-area">
        <!-- Connected banner with gradient -->
        <div class="sl-connected-banner">
          <div class="sl-connected-banner-bg"></div>
          <div class="sl-connected-banner-content">
            <div class="sl-connected-icon">
              <CheckCircle size={20} />
            </div>
            <div class="sl-connected-text">
              <h3>Slack Connected</h3>
              <div class="sl-connected-meta">
                <div class="sl-status-dot"></div>
                <span>{workspaceName}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Mention example card -->
        <div class="sl-config-card">
          <div class="sl-config-card-header">
            <AtSign size={14} />
            <span>Try it out</span>
          </div>
          <div class="sl-config-fields">
            <p class="sl-mention-label">Mention your bot in any channel to start a conversation:</p>
            <button class="sl-copy-field" on:click={copyMention}>
              <code>@{appName} How can you help me?</code>
              <div class="sl-copy-icon" class:copied={mentionCopied}>
                {#if mentionCopied}
                  <Check size={14} />
                {:else}
                  <Copy size={14} />
                {/if}
              </div>
            </button>
          </div>
        </div>

        <!-- Next steps -->
        <div class="sl-status-box success">
          <div class="sl-status-box-icon">
            <CheckCircle size={18} />
          </div>
          <div class="sl-status-box-content">
            <h4>Your bot is ready!</h4>
            <ul>
              <li>Mention with <strong>@{appName}</strong> in any channel</li>
              <li>Send a direct message to your bot</li>
              <li>The bot responds using your chatbot's AI</li>
            </ul>
          </div>
        </div>

        <!-- Disconnect section -->
        {#if showDisconnectConfirm}
          <div class="sl-disconnect-confirm">
            <AlertCircle size={16} />
            <div class="sl-disconnect-confirm-body">
              <p>Are you sure? Your bot will stop responding in Slack.</p>
              <div class="sl-disconnect-confirm-actions">
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
          <button class="sl-disconnect-link" on:click={() => showDisconnectConfirm = true}>
            <Unlink size={13} />
            Disconnect Slack
          </button>
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="sl-error">
        <AlertCircle size={15} />
        <span>{error}</span>
      </div>
    {/if}
  </div>

  <!-- Sticky footer -->
  <DialogFooter>
    {#if step === 'create-app'}
      <Button variant="ghost" on:click={() => handleOpenChange(false)}>
        Cancel
      </Button>
      <Button on:click={goToCredentials}>
        I've created my app
        <ArrowRight size={15} />
      </Button>
    {:else if step === 'credentials'}
      <Button variant="ghost" on:click={() => step = 'create-app'}>
        <ArrowLeft size={15} />
        Back
      </Button>
      <Button on:click={saveCredentials} disabled={loading || !clientId.trim() || !clientSecret.trim() || !signingSecret.trim()}>
        {#if loading}
          <Loader2 size={16} class="spinner" />
          Saving...
        {:else}
          Save & Continue
        {/if}
      </Button>
    {:else if step === 'install'}
      <Button variant="ghost" on:click={() => step = 'credentials'}>
        <ArrowLeft size={15} />
        Edit Credentials
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

  .sl-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
  }

  .sl-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xl);
    background: linear-gradient(135deg, hsl(263 70% 55%) 0%, hsl(330 80% 55%) 100%);
    color: white;
    box-shadow: 0 2px 8px hsl(263 70% 55% / 0.3);
  }

  .sl-header span {
    font-family: var(--font-display);
  }

  .sl-description {
    display: block;
    text-align: center;
    max-width: 65%;
    margin: 0 auto;
  }

  /* ========================================
   * Body
   * ======================================== */

  .sl-body {
    padding: var(--space-2) 0 var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .sl-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .sl-loading p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .sl-loading :global(.spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ========================================
   * Form Area (centered content column)
   * ======================================== */

  .sl-form-area {
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

  .sl-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: var(--space-2) 0 var(--space-2) 0;
  }

  .sl-progress-step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .sl-progress-dot {
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

  .sl-progress-step span {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
    transition: color var(--transition-base);
  }

  .sl-progress-step.active .sl-progress-dot {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .sl-progress-step.active span {
    color: hsl(var(--foreground));
  }

  .sl-progress-step.done .sl-progress-dot {
    border-color: hsl(263 70% 55%);
    background: hsl(263 70% 55%);
    color: white;
  }

  .sl-progress-step.done span {
    color: hsl(var(--muted-foreground));
  }

  .sl-progress-line {
    width: 32px;
    height: 1.5px;
    background: hsl(var(--border));
    margin: 0 var(--space-1);
    transition: background var(--transition-base);
  }

  .sl-progress-line.done {
    background: hsl(263 70% 55%);
  }

  /* ========================================
   * Section Header
   * ======================================== */

  .sl-section-header {
    text-align: center;
  }

  .sl-section-header h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .sl-section-header p {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    line-height: 1.5;
    margin: 0;
  }

  /* ========================================
   * Status Boxes (info, warning, success)
   * ======================================== */

  .sl-status-box {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-xl);
    border: 1px solid;
  }

  .sl-status-box.info {
    background: hsl(217 91% 60% / 0.06);
    border-color: hsl(217 91% 60% / 0.15);
  }
  .sl-status-box.info .sl-status-box-icon {
    color: hsl(217 91% 50%);
  }
  .sl-status-box.info h4 {
    color: hsl(217 91% 30%);
  }

  .sl-status-box.success {
    background: hsl(142 70% 45% / 0.06);
    border-color: hsl(142 70% 45% / 0.2);
  }
  .sl-status-box.success .sl-status-box-icon {
    color: hsl(142 70% 40%);
  }
  .sl-status-box.success h4 {
    color: hsl(142 50% 25%);
  }

  .sl-status-box-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .sl-status-box-content {
    flex: 1;
    min-width: 0;
  }

  .sl-status-box-content h4 {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-2) 0;
  }

  .sl-status-box-content ul,
  .sl-status-box-content ol {
    margin: 0;
    padding-left: var(--space-4);
  }

  .sl-status-box-content li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    line-height: 1.6;
  }

  .sl-status-box-content li:last-child {
    margin-bottom: 0;
  }

  .sl-status-box-content code {
    background: hsl(var(--background));
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    border: 1px solid hsl(var(--border));
  }

  .sl-inline-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: none;
    border: none;
    padding: 0;
    color: hsl(217 91% 50%);
    font-size: inherit;
    font-weight: var(--font-semibold);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color var(--transition-fast);
  }

  .sl-inline-link:hover {
    text-decoration-color: currentColor;
  }

  /* ========================================
   * Config Card
   * ======================================== */

  .sl-config-card {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .sl-config-card-header {
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

  .sl-config-fields {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .sl-mention-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  /* Manifest actions in config card header */
  .sl-manifest-actions {
    display: flex;
    gap: var(--space-2);
    margin-left: auto;
  }

  .sl-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: var(--space-1) var(--space-2);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .sl-action-btn:hover {
    border-color: hsl(var(--foreground) / 0.2);
    color: hsl(var(--foreground));
    box-shadow: var(--shadow-sm);
  }

  .sl-manifest-code {
    margin: 0;
    padding: var(--space-4);
    background: hsl(var(--background));
    font-size: 11px;
    line-height: 1.5;
    font-family: var(--font-mono);
    color: hsl(var(--foreground));
    overflow-x: auto;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre;
    border-radius: 0;
  }

  /* ========================================
   * Copy Field
   * ======================================== */

  .sl-copy-field {
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

  .sl-copy-field:hover {
    border-color: hsl(var(--border));
    box-shadow: var(--shadow-sm);
  }

  .sl-copy-field code {
    flex: 1;
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .sl-copy-icon {
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

  .sl-copy-icon.copied {
    color: hsl(142 70% 40%);
    background: hsl(142 70% 45% / 0.1);
  }

  .sl-copy-field:hover .sl-copy-icon:not(.copied) {
    color: hsl(var(--foreground));
  }

  /* ========================================
   * Form Fields
   * ======================================== */

  .sl-field-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .sl-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    line-height: 1.4;
  }

  /* ========================================
   * Install Button
   * ======================================== */

  .sl-install-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1.5px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .sl-install-btn:hover:not(:disabled) {
    border-color: hsl(263 70% 55% / 0.4);
    box-shadow: 0 2px 12px hsl(263 70% 55% / 0.1);
    background: hsl(263 70% 55% / 0.04);
  }

  .sl-install-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ========================================
   * Connected State
   * ======================================== */

  .sl-connected-banner {
    position: relative;
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .sl-connected-banner-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      hsl(263 70% 55% / 0.1) 0%,
      hsl(263 70% 55% / 0.05) 50%,
      hsl(330 80% 55% / 0.08) 100%
    );
    border: 1px solid hsl(263 70% 55% / 0.2);
    border-radius: inherit;
  }

  .sl-connected-banner-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-4);
  }

  .sl-connected-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, hsl(263 70% 55%) 0%, hsl(330 80% 55%) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 0 4px 12px hsl(263 70% 55% / 0.3);
  }

  .sl-connected-text h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    letter-spacing: -0.01em;
  }

  .sl-connected-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .sl-status-dot {
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
   * Disconnect
   * ======================================== */

  .sl-disconnect-link {
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

  .sl-disconnect-link:hover {
    color: hsl(var(--destructive));
  }

  .sl-disconnect-confirm {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--destructive) / 0.04);
    border: 1px solid hsl(var(--destructive) / 0.15);
    border-radius: var(--radius-xl);
    color: hsl(var(--destructive));
  }

  .sl-disconnect-confirm > :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .sl-disconnect-confirm-body {
    flex: 1;
  }

  .sl-disconnect-confirm-body p {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
    line-height: 1.5;
  }

  .sl-disconnect-confirm-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  /* ========================================
   * Error
   * ======================================== */

  .sl-error {
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

  .sl-error span {
    flex: 1;
  }

  /* ========================================
   * Global overrides
   * ======================================== */

  :global(.spinner) {
    animation: spin 1s linear infinite;
  }
</style>
