<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { Button, toasts, SlackSetupDialog, WhatsAppSetupDialog, EmailSetupDialog } from "$lib/design-system";
  import { Link, Code, Copy, MessageSquare, Smartphone, Globe, Check, ExternalLink, Mail, ArrowRight, Key } from "lucide-svelte";

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    appNameId: string;
    custom_domain?: string;
  };

  let slackDialogOpen = false;
  let whatsappDialogOpen = false;
  let emailDialogOpen = false;

  let activeTab: "share" | "deploy" = "share";
  let copiedField: string | null = null;
  let mounted = false;

  onMount(() => {
    requestAnimationFrame(() => { mounted = true; });
  });

  // Reset animation on tab change
  $: if (activeTab) {
    mounted = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { mounted = true; });
    });
  }

  function getAppUrl(): string {
    if (!app) return "";
    const isLocalhost = window.location.hostname === "localhost";
    const isStaging = window.location.hostname.includes("staging");
    if (app.custom_domain) return `https://${app.custom_domain}`;
    if (isLocalhost) return `http://${app.appNameId}.localhost:5174`;
    if (isStaging) return `https://${app.appNameId}.chipp.live`;
    return `https://${app.appNameId}.chipp.ai`;
  }

  function getIframeCode(): string {
    const url = getAppUrl();
    return `<iframe src="${url}" height="800px" width="100%" frameborder="0" title="${app?.name || "Chat"}"></iframe>`;
  }

  function getWidgetCode(): string {
    const url = getAppUrl();
    return `<script src="${url}/widget.js"><\/script>`;
  }

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = field;
      toasts.success("Copied", "Copied to clipboard!");
      setTimeout(() => { copiedField = null; }, 2000);
    } catch (e) {
      toasts.error("Error", "Failed to copy to clipboard");
    }
  }

  function openExternalLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
</script>

<div class="share-content">
  <!-- Tab Toggle -->
  <div class="tab-bar">
    <button class="tab-btn" class:active={activeTab === "share"} on:click={() => activeTab = "share"}>
      Share
    </button>
    <button class="tab-btn" class:active={activeTab === "deploy"} on:click={() => activeTab = "deploy"}>
      Deploy
    </button>
  </div>

  {#if activeTab === "share"}
    <!-- ==================== SHARE TAB ==================== -->
    <div class="tab-content atmosphere">
      <!-- Scan lines decoration -->
      <div class="scan-lines" aria-hidden="true"></div>

      <!-- Header -->
      <div class="tab-header" class:animate={mounted}>
        <div class="header-icon-wrap share-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </div>
        <h2 class="tab-title">Share Your AI</h2>
        <p class="tab-subtitle">Get your chatbot in front of users with links, embeds, and APIs</p>
      </div>

      <!-- Section: Links -->
      <div class="section-header" class:animate={mounted} style="animation-delay: 0.1s">
        <span class="section-label">Direct Access</span>
        <span class="section-line"></span>
      </div>

      <div class="share-grid">
        <!-- Share Link -->
        <div class="share-card constellation-card" class:animate={mounted} style="animation-delay: 0.12s">
          <div class="share-card-header">
            <div class="icon-box icon-box--blue">
              <Link size={20} />
            </div>
            <div class="share-card-title">
              <h3>Share Link</h3>
              <p>Direct link to your chatbot</p>
            </div>
          </div>
          <button class="copy-field" on:click={() => copyToClipboard(getAppUrl(), "link")}>
            <span class="copy-field-text">{getAppUrl()}</span>
            <span class="copy-field-btn" class:copied={copiedField === "link"}>
              {#if copiedField === "link"}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </span>
          </button>
        </div>

        <!-- Iframe Embed -->
        <div class="share-card constellation-card" class:animate={mounted} style="animation-delay: 0.17s">
          <div class="share-card-header">
            <div class="icon-box icon-box--purple">
              <Code size={20} />
            </div>
            <div class="share-card-title">
              <h3>Embed with Iframe</h3>
              <p>Add to any website</p>
            </div>
          </div>
          <button class="copy-field copy-field--code" on:click={() => copyToClipboard(getIframeCode(), "iframe")}>
            <code class="copy-field-text">{getIframeCode()}</code>
            <span class="copy-field-btn" class:copied={copiedField === "iframe"}>
              {#if copiedField === "iframe"}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </span>
          </button>
        </div>

        <!-- Chat Widget -->
        <div class="share-card constellation-card" class:animate={mounted} style="animation-delay: 0.22s">
          <div class="share-card-header">
            <div class="icon-box icon-box--green">
              <MessageSquare size={20} />
            </div>
            <div class="share-card-title">
              <h3>Chat Widget</h3>
              <p>Floating chat bubble</p>
            </div>
          </div>
          <button class="copy-field copy-field--code" on:click={() => copyToClipboard(getWidgetCode(), "widget")}>
            <code class="copy-field-text">{getWidgetCode()}</code>
            <span class="copy-field-btn" class:copied={copiedField === "widget"}>
              {#if copiedField === "widget"}
                <Check size={14} />
              {:else}
                <Copy size={14} />
              {/if}
            </span>
          </button>
        </div>

        <!-- API Access -->
        <div class="share-card constellation-card" class:animate={mounted} style="animation-delay: 0.27s">
          <div class="share-card-header">
            <div class="icon-box icon-box--orange">
              <Key size={20} />
            </div>
            <div class="share-card-title">
              <h3>API Access</h3>
              <p>OpenAI-compatible endpoints</p>
            </div>
          </div>
          <div class="share-card-tags">
            <span class="tag">REST API</span>
            <span class="tag">Streaming</span>
            <span class="tag">Bearer Auth</span>
          </div>
          <button class="action-link" on:click={() => push(`/apps/${appId}/access`)}>
            Manage API Keys <ArrowRight size={14} />
          </button>
        </div>
      </div>

    </div>

  {:else}
    <!-- ==================== DEPLOY TAB ==================== -->
    <div class="tab-content atmosphere">
      <!-- Scan lines decoration -->
      <div class="scan-lines" aria-hidden="true"></div>

      <!-- Header -->
      <div class="tab-header" class:animate={mounted}>
        <div class="header-icon-wrap deploy-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h2 class="tab-title">Deploy Your AI</h2>
        <p class="tab-subtitle">Connect your chatbot to messaging platforms and distribution channels</p>
      </div>

      <!-- Section: Messaging Platforms -->
      <div class="section-header" class:animate={mounted} style="animation-delay: 0.1s">
        <span class="section-label">Messaging Platforms</span>
        <span class="section-line"></span>
      </div>

      <div class="deploy-grid">
        <!-- Slack -->
        <button class="deploy-card" class:animate={mounted} style="animation-delay: 0.12s" on:click={() => slackDialogOpen = true}>
          <div class="deploy-card-glow" style="--glow: rgba(97, 31, 105, 0.15);"></div>
          <div class="deploy-card-inner">
            <div class="deploy-card-top">
              <div class="deploy-icon slack-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              </div>
              <div class="deploy-status">
                <ArrowRight size={16} />
              </div>
            </div>
            <h3 class="deploy-name">Slack</h3>
            <p class="deploy-desc">Deploy as a Slack bot in your workspace</p>
            <div class="deploy-tags">
              <span class="tag">@mentions</span>
              <span class="tag">Threads</span>
              <span class="tag">DMs</span>
            </div>
          </div>
        </button>

        <!-- WhatsApp -->
        <button class="deploy-card" class:animate={mounted} style="animation-delay: 0.17s" on:click={() => whatsappDialogOpen = true}>
          <div class="deploy-card-glow" style="--glow: rgba(37, 211, 102, 0.15);"></div>
          <div class="deploy-card-inner">
            <div class="deploy-card-top">
              <div class="deploy-icon whatsapp-icon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div class="deploy-status">
                <ArrowRight size={16} />
              </div>
            </div>
            <h3 class="deploy-name">WhatsApp</h3>
            <p class="deploy-desc">Connect to WhatsApp Business</p>
            <div class="deploy-tags">
              <span class="tag">Meta API</span>
              <span class="tag">Webhooks</span>
              <span class="tag">Media</span>
            </div>
          </div>
        </button>

        <!-- Email -->
        <button class="deploy-card" class:animate={mounted} style="animation-delay: 0.22s" on:click={() => emailDialogOpen = true}>
          <div class="deploy-card-glow" style="--glow: rgba(59, 130, 246, 0.15);"></div>
          <div class="deploy-card-inner">
            <div class="deploy-card-top">
              <div class="deploy-icon email-icon">
                <Mail size={24} color="white" />
              </div>
              <div class="deploy-status">
                <ArrowRight size={16} />
              </div>
            </div>
            <h3 class="deploy-name">Email</h3>
            <p class="deploy-desc">Enable conversations via email</p>
            <div class="deploy-tags">
              <span class="tag">Threads</span>
              <span class="tag">Whitelist</span>
              <span class="tag">Plain Text</span>
            </div>
          </div>
        </button>
      </div>

      <!-- Section: Distribution -->
      <div class="section-header" class:animate={mounted} style="animation-delay: 0.25s">
        <span class="section-label">Distribution</span>
        <span class="section-line"></span>
      </div>

      <div class="deploy-grid deploy-grid--2col">
        <!-- Mobile (PWA) -->
        <button class="deploy-card" class:animate={mounted} style="animation-delay: 0.28s" on:click={() => openExternalLink(getAppUrl())}>
          <div class="deploy-card-glow" style="--glow: rgba(249, 115, 22, 0.15);"></div>
          <div class="deploy-card-inner">
            <div class="deploy-card-top">
              <div class="deploy-icon pwa-icon">
                <Smartphone size={24} color="white" />
              </div>
              <div class="deploy-status">
                <ExternalLink size={14} />
              </div>
            </div>
            <h3 class="deploy-name">Mobile App</h3>
            <p class="deploy-desc">Install as a progressive web app on any device</p>
            <div class="deploy-tags">
              <span class="tag">Home Screen</span>
              <span class="tag">Offline</span>
              <span class="tag">Push Notifications</span>
            </div>
          </div>
        </button>

        <!-- API -->
        <button class="deploy-card" class:animate={mounted} style="animation-delay: 0.33s" on:click={() => push(`/apps/${appId}/access`)}>
          <div class="deploy-card-glow" style="--glow: rgba(139, 92, 246, 0.15);"></div>
          <div class="deploy-card-inner">
            <div class="deploy-card-top">
              <div class="deploy-icon api-icon">
                <Globe size={24} color="white" />
              </div>
              <div class="deploy-status">
                <ArrowRight size={16} />
              </div>
            </div>
            <h3 class="deploy-name">API</h3>
            <p class="deploy-desc">Access your chatbot programmatically via REST API</p>
            <div class="deploy-tags">
              <span class="tag">OpenAI Format</span>
              <span class="tag">Streaming</span>
              <span class="tag">Bearer Auth</span>
            </div>
          </div>
        </button>
      </div>

    </div>
  {/if}
</div>

<!-- Dialogs -->
<SlackSetupDialog
  bind:open={slackDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("Slack Connected", "Your chatbot is now available in Slack!")}
/>
<WhatsAppSetupDialog
  bind:open={whatsappDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("WhatsApp Connected", "Configure your webhook in Meta Developer Portal.")}
/>
<EmailSetupDialog
  bind:open={emailDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("Email Connected", "Your chatbot is now available via email.")}
/>

<style>
  /* ========================================
     Layout
     ======================================== */
  .share-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .tab-bar {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    width: fit-content;
    margin-bottom: var(--space-6);
    max-width: 960px;
    margin-left: auto;
    margin-right: auto;
  }

  .tab-btn {
    padding: 8px 20px;
    border: none;
    background: transparent;
    border-radius: calc(var(--radius-lg) - 2px);
    font-family: "Chubbo", serif;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s ease;
    letter-spacing: 0.01em;
  }

  .tab-btn:hover {
    color: hsl(var(--foreground));
  }

  .tab-btn.active {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.08);
  }

  /* ========================================
     Constellation Atmosphere
     ======================================== */
  .tab-content {
    position: relative;
  }

  .atmosphere {
    background:
      radial-gradient(ellipse 120% 80% at 20% 0%, var(--gradient-blue, rgba(59, 130, 246, 0.06)) 0%, transparent 40%),
      radial-gradient(ellipse 100% 60% at 80% 100%, var(--gradient-purple, rgba(139, 92, 246, 0.04)) 0%, transparent 40%);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    border: 1px solid hsl(var(--border) / 0.5);
    max-width: 960px;
    margin-inline: auto;
  }

  :global(.dark) .atmosphere {
    background:
      radial-gradient(ellipse 120% 80% at 20% 0%, rgba(96, 165, 250, 0.08) 0%, transparent 40%),
      radial-gradient(ellipse 100% 60% at 80% 100%, rgba(167, 139, 250, 0.06) 0%, transparent 40%),
      hsl(var(--card));
  }

  /* ========================================
     Scan Lines
     ======================================== */
  .scan-lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    border-radius: var(--radius-xl);
  }

  .scan-lines::before,
  .scan-lines::after {
    content: "";
    position: absolute;
    background: linear-gradient(90deg, transparent, hsl(var(--primary) / 0.5), transparent);
    height: 1px;
    width: 100%;
    animation: scan 8s linear infinite;
  }

  .scan-lines::before {
    top: 30%;
    opacity: 0.06;
  }

  .scan-lines::after {
    top: 70%;
    animation-delay: -4s;
    opacity: 0.04;
  }

  :global(.dark) .scan-lines::before { opacity: 0.12; }
  :global(.dark) .scan-lines::after { opacity: 0.08; }

  @keyframes scan {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* ========================================
     Tab Header
     ======================================== */
  .tab-header {
    text-align: center;
    margin-bottom: var(--space-8);
    position: relative;
    z-index: 1;
    opacity: 0;
    transform: translateY(12px);
  }

  .tab-header.animate {
    animation: slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .header-icon-wrap {
    width: 56px;
    height: 56px;
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    position: relative;
    border: 1px solid hsl(var(--border) / 0.5);
    backdrop-filter: blur(8px);
    color: hsl(var(--foreground));
  }

  .header-icon-wrap::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 16px;
    opacity: 0.15;
    animation: icon-glow 3s ease-in-out infinite;
  }

  .header-icon-wrap::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 18px;
    opacity: 0.2;
    filter: blur(8px);
    animation: icon-glow 3s ease-in-out infinite;
  }

  .share-icon-wrap::before,
  .share-icon-wrap::after {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(139, 92, 246, 0.8));
  }

  .deploy-icon-wrap::before,
  .deploy-icon-wrap::after {
    background: linear-gradient(135deg, rgba(37, 211, 102, 0.8), rgba(59, 130, 246, 0.8));
  }

  @keyframes icon-glow {
    0%, 100% { opacity: 0.15; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(1.03); }
  }

  .tab-title {
    font-family: "Chubbo", serif;
    font-size: 1.5rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 6px;
    letter-spacing: -0.02em;
  }

  .tab-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 360px;
    margin-inline: auto;
    line-height: 1.5;
  }

  /* ========================================
     Section Headers
     ======================================== */
  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 0 4px;
    position: relative;
    z-index: 1;
    opacity: 0;
    transform: translateY(12px);
  }

  .section-header.animate {
    animation: slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .section-label {
    font-family: var(--font-mono, "SF Mono", monospace);
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: hsl(var(--muted-foreground) / 0.6);
    white-space: nowrap;
  }

  .section-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, hsl(var(--border)), transparent);
  }

  /* ========================================
     Tags (shared)
     ======================================== */
  .tag {
    font-size: 0.7rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.6);
    padding: 3px 10px;
    border-radius: var(--radius-full);
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  /* ========================================
     Deploy Grid
     ======================================== */
  .deploy-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: var(--space-8);
    position: relative;
    z-index: 1;
  }

  .deploy-grid--2col {
    grid-template-columns: repeat(2, 1fr);
  }

  .deploy-card {
    position: relative;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    text-align: left;
    padding: 0;
    opacity: 0;
    transform: translateY(16px);
  }

  .deploy-card.animate {
    animation: slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  :global(.dark) .deploy-card {
    background: rgba(24, 24, 36, 0.6);
    border-color: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);
  }

  .deploy-card-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, var(--glow, transparent) 0%, transparent 65%);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .deploy-card:hover {
    border-color: hsl(var(--primary) / 0.3);
    transform: translateY(-3px);
    box-shadow: 0 8px 24px hsl(var(--foreground) / 0.08);
  }

  .deploy-card:hover .deploy-card-glow {
    opacity: 1;
  }

  .deploy-card:active {
    transform: translateY(-1px);
  }

  :global(.dark) .deploy-card:hover {
    background: rgba(32, 32, 48, 0.8);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .deploy-card-inner {
    position: relative;
    z-index: 1;
    padding: 20px;
  }

  .deploy-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .deploy-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .slack-icon {
    background: linear-gradient(135deg, #611f69, #4a154b);
  }

  .whatsapp-icon {
    background: linear-gradient(135deg, #25d366, #128c7e);
  }

  .email-icon {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .pwa-icon {
    background: linear-gradient(135deg, #f97316, #ea580c);
  }

  .api-icon {
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  }

  .deploy-status {
    color: hsl(var(--muted-foreground) / 0.4);
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.2s ease;
  }

  .deploy-card:hover .deploy-status {
    opacity: 1;
    transform: translateX(0);
    color: hsl(var(--foreground) / 0.6);
  }

  .deploy-name {
    font-family: "Chubbo", serif;
    font-size: var(--text-base);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }

  .deploy-desc {
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    margin: 0 0 12px;
    line-height: 1.4;
  }

  .deploy-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* ========================================
     Share Grid
     ======================================== */
  .share-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    position: relative;
    z-index: 1;
  }

  .share-card {
    position: relative;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0;
    transform: translateY(12px);
  }

  .share-card.animate {
    animation: slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  :global(.dark) .share-card {
    background: rgba(24, 24, 36, 0.6);
    border-color: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);
  }

  .share-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .icon-box {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid hsl(var(--border) / 0.5);
    transition: all 0.25s ease;
  }

  .icon-box--blue {
    background: rgba(59, 130, 246, 0.08);
    color: hsl(210 80% 50%);
  }
  .share-card:hover .icon-box--blue {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .icon-box--purple {
    background: rgba(139, 92, 246, 0.08);
    color: hsl(258 80% 65%);
  }
  .share-card:hover .icon-box--purple {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.3);
  }

  .icon-box--green {
    background: rgba(16, 185, 129, 0.08);
    color: hsl(160 70% 40%);
  }
  .share-card:hover .icon-box--green {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .icon-box--orange {
    background: rgba(249, 115, 22, 0.08);
    color: hsl(25 95% 53%);
  }
  .share-card:hover .icon-box--orange {
    background: rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.3);
  }

  .share-card-title h3 {
    font-family: "Chubbo", serif;
    font-size: var(--text-sm);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
    letter-spacing: -0.01em;
  }

  .share-card-title p {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    margin: 2px 0 0;
  }

  .share-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }

  .action-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: hsl(var(--primary));
    cursor: pointer;
    transition: gap 0.2s ease;
  }

  .action-link:hover {
    gap: 10px;
  }

  /* ========================================
     Copy Fields (polished)
     ======================================== */
  .copy-field {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0 4px 0 14px;
    height: 40px;
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .copy-field:hover {
    background: hsl(var(--muted) / 0.8);
    border-color: hsl(var(--border));
  }

  .copy-field--code {
    font-family: var(--font-mono, "SF Mono", monospace);
  }

  .copy-field-text {
    flex: 1;
    font-size: 0.8rem;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .copy-field-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
    transition: all 0.2s ease;
    border: 1px solid hsl(var(--border) / 0.3);
  }

  .copy-field:hover .copy-field-btn {
    color: hsl(var(--foreground));
    border-color: hsl(var(--border));
  }

  .copy-field-btn.copied {
    background: hsl(160 70% 40% / 0.1);
    color: hsl(160 70% 40%);
    border-color: hsl(160 70% 40% / 0.3);
  }

  /* ========================================
     Animations
     ======================================== */
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ========================================
     Responsive
     ======================================== */
  @media (max-width: 768px) {
    .share-content {
      padding: var(--space-4);
    }

    .deploy-grid,
    .deploy-grid--2col {
      grid-template-columns: 1fr;
    }

    .share-grid {
      grid-template-columns: 1fr;
    }

    .atmosphere {
      padding: var(--space-4);
    }
  }

  @media (max-width: 1024px) {
    .deploy-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
