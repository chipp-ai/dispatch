<script lang="ts">
  import { onMount } from "svelte";
  import {
    ChevronRight,
    ChevronLeft,
    Share2,
    Copy,
    Check,
    Link as LinkIcon,
    Code,
    Smartphone,
    MessageCircle,
    ExternalLink,
    Slack,
  } from "lucide-svelte";
  import { captureException } from "$lib/sentry";
  import { Card, Button, Input } from "$lib/design-system";
  import { computeShareUrl, computeEmbedCode } from "$lib/onboarding-v2/flow";
  import {
    onboardingV2Store,
    currentApplicationId,
    currentAppName,
  } from "../../stores/onboardingV2";

  type ShareOption = "link" | "embed" | "widget" | "pwa";

  let selectedOption: ShareOption = "link";
  let copiedField: "url" | "embed" | null = null;
  let showSlackDialog = false;
  let showWhatsAppDialog = false;

  $: appId = $currentApplicationId;
  $: appName = $currentAppName;
  $: shareUrl = computeShareUrl(appName, appId);
  $: embedCode = computeEmbedCode(shareUrl, appId);

  // Redirect to Build step if no application is selected
  $: if ($onboardingV2Store.isHydrated && !appId) {
    onboardingV2Store.setCurrentStep("build");
  }

  async function copyToClipboard(text: string, field: "url" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      copiedField = field;
      setTimeout(() => {
        copiedField = null;
      }, 2000);
    } catch (error) {
      captureException(error, { tags: { feature: "onboarding-share" }, extra: { action: "copy-to-clipboard", field } });
    }
  }

  function handleBack() {
    onboardingV2Store.setCurrentStep("train");
  }

  function handleContinue() {
    onboardingV2Store.markStepCompleted("share");
    onboardingV2Store.setCurrentStep("unlock");
  }

  function handleOpenUrl() {
    if (shareUrl) {
      window.open(shareUrl, "_blank");
    }
  }

  const SHARE_OPTIONS: Array<{
    id: ShareOption;
    label: string;
    description: string;
    icon: typeof LinkIcon;
  }> = [
    {
      id: "link",
      label: "Share Link",
      description: "Get a shareable URL",
      icon: LinkIcon,
    },
    {
      id: "embed",
      label: "Embed Code",
      description: "Add to your website",
      icon: Code,
    },
    {
      id: "widget",
      label: "Widget",
      description: "Floating chat widget",
      icon: MessageCircle,
    },
    {
      id: "pwa",
      label: "Mobile App",
      description: "Install as an app",
      icon: Smartphone,
    },
  ];
</script>

<div class="share-step">
  <!-- Share options tabs -->
  <div class="share-tabs">
    {#each SHARE_OPTIONS as option (option.id)}
      {@const Icon = option.icon}
      <button
        class="share-tab"
        class:selected={selectedOption === option.id}
        on:click={() => (selectedOption = option.id)}
      >
        <Icon size={20} />
        <span class="tab-label">{option.label}</span>
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <Card class="share-content">
    {#if selectedOption === "link"}
      <!-- Share Link -->
      <div class="content-header">
        <div class="header-icon bg-blue-100">
          <LinkIcon size={24} class="text-blue-600" />
        </div>
        <div class="header-text">
          <h3 class="content-title">Share your AI</h3>
          <p class="content-description">
            Anyone with this link can chat with your AI
          </p>
        </div>
      </div>

      <div class="share-url-container">
        <div class="url-display">
          <input
            type="text"
            value={shareUrl}
            readonly
            class="url-field"
          />
          <button
            class="copy-button"
            on:click={() => copyToClipboard(shareUrl, "url")}
          >
            {#if copiedField === "url"}
              <Check size={16} />
              Copied
            {:else}
              <Copy size={16} />
              Copy
            {/if}
          </button>
        </div>
        <Button variant="outline" class="open-button" on:click={handleOpenUrl}>
          <ExternalLink size={16} />
          Open in new tab
        </Button>
      </div>
    {:else if selectedOption === "embed"}
      <!-- Embed Code -->
      <div class="content-header">
        <div class="header-icon bg-purple-100">
          <Code size={24} class="text-purple-600" />
        </div>
        <div class="header-text">
          <h3 class="content-title">Embed on your website</h3>
          <p class="content-description">
            Add this code to your website to show a chat widget
          </p>
        </div>
      </div>

      <div class="embed-container">
        <div class="embed-display">
          <pre class="embed-code">{embedCode}</pre>
          <button
            class="copy-button large"
            on:click={() => copyToClipboard(embedCode, "embed")}
          >
            {#if copiedField === "embed"}
              <Check size={16} />
              Copied
            {:else}
              <Copy size={16} />
              Copy code
            {/if}
          </button>
        </div>
        <p class="embed-note">
          Paste this code in the <code>&lt;body&gt;</code> of your HTML
        </p>
      </div>
    {:else if selectedOption === "widget"}
      <!-- Widget -->
      <div class="content-header">
        <div class="header-icon bg-green-100">
          <MessageCircle size={24} class="text-green-600" />
        </div>
        <div class="header-text">
          <h3 class="content-title">Floating Chat Widget</h3>
          <p class="content-description">
            A chat bubble that floats on your website
          </p>
        </div>
      </div>

      <div class="widget-preview">
        <div class="widget-demo">
          <div class="widget-bubble">
            <MessageCircle size={24} />
          </div>
          <div class="widget-window">
            <div class="widget-header">
              <span>{appName || "AI Assistant"}</span>
            </div>
            <div class="widget-messages">
              <div class="widget-message">Hi! How can I help you today?</div>
            </div>
            <div class="widget-input">Type a message...</div>
          </div>
        </div>
      </div>

      <p class="widget-note">
        Use the embed code to add the floating widget to your website.
        <button class="link-button" on:click={() => (selectedOption = "embed")}>
          Get embed code
        </button>
      </p>
    {:else if selectedOption === "pwa"}
      <!-- PWA -->
      <div class="content-header">
        <div class="header-icon bg-orange-100">
          <Smartphone size={24} class="text-orange-600" />
        </div>
        <div class="header-text">
          <h3 class="content-title">Install as Mobile App</h3>
          <p class="content-description">
            Your AI as a native-like mobile experience
          </p>
        </div>
      </div>

      <div class="pwa-instructions">
        <div class="instruction-step">
          <span class="step-number">1</span>
          <p>Open the share link on your mobile device</p>
        </div>
        <div class="instruction-step">
          <span class="step-number">2</span>
          <p>Tap "Share" or menu icon in your browser</p>
        </div>
        <div class="instruction-step">
          <span class="step-number">3</span>
          <p>Select "Add to Home Screen"</p>
        </div>
      </div>

      <Button variant="outline" class="qr-button">
        <Smartphone size={16} />
        Show QR Code
      </Button>
    {/if}
  </Card>

  <!-- Deploy to platforms -->
  <Card class="deploy-section">
    <h3 class="deploy-title">Deploy to platforms</h3>
    <p class="deploy-description">
      Connect your AI to messaging platforms
    </p>

    <div class="deploy-options">
      <button class="deploy-card" on:click={() => (showSlackDialog = true)}>
        <div class="deploy-icon slack">
          <Slack size={24} />
        </div>
        <div class="deploy-text">
          <span class="deploy-name">Slack</span>
          <span class="deploy-status">Not connected</span>
        </div>
        <ChevronRight size={20} />
      </button>

      <button class="deploy-card" on:click={() => (showWhatsAppDialog = true)}>
        <div class="deploy-icon whatsapp">
          <MessageCircle size={24} />
        </div>
        <div class="deploy-text">
          <span class="deploy-name">WhatsApp</span>
          <span class="deploy-status">Not connected</span>
        </div>
        <ChevronRight size={20} />
      </button>
    </div>
  </Card>

  <!-- Navigation -->
  <div class="navigation">
    <Button variant="outline" on:click={handleBack} class="nav-button">
      <ChevronLeft size={20} />
      Back
    </Button>

    <div class="nav-spacer" />

    <Button on:click={handleContinue} class="nav-button">
      Continue
      <ChevronRight size={20} />
    </Button>
  </div>
</div>

<!-- Slack Dialog -->
{#if showSlackDialog}
  <div class="modal-overlay" on:click={() => (showSlackDialog = false)} role="presentation">
    <div class="modal-content" on:click|stopPropagation role="dialog">
      <div class="modal-header">
        <div class="modal-icon slack">
          <Slack size={32} />
        </div>
        <h3 class="modal-title">Connect to Slack</h3>
        <p class="modal-description">
          Add your AI assistant to Slack workspaces
        </p>
      </div>

      <div class="modal-body">
        <p class="feature-note">
          Slack integration requires a Pro or Team subscription.
        </p>
        <ul class="feature-list">
          <li>Respond to messages in channels</li>
          <li>Answer direct messages</li>
          <li>Use slash commands</li>
          <li>Access conversation history</li>
        </ul>
      </div>

      <div class="modal-footer">
        <Button
          variant="outline"
          on:click={() => (showSlackDialog = false)}
        >
          Cancel
        </Button>
        <Button on:click={handleContinue}>
          Continue to Unlock
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- WhatsApp Dialog -->
{#if showWhatsAppDialog}
  <div class="modal-overlay" on:click={() => (showWhatsAppDialog = false)} role="presentation">
    <div class="modal-content" on:click|stopPropagation role="dialog">
      <div class="modal-header">
        <div class="modal-icon whatsapp">
          <MessageCircle size={32} />
        </div>
        <h3 class="modal-title">Connect to WhatsApp</h3>
        <p class="modal-description">
          Deploy your AI to WhatsApp Business
        </p>
      </div>

      <div class="modal-body">
        <p class="feature-note">
          WhatsApp integration requires a Team or Business subscription.
        </p>
        <ul class="feature-list">
          <li>Respond to customer messages</li>
          <li>Support multiple phone numbers</li>
          <li>Send rich media messages</li>
          <li>24/7 automated responses</li>
        </ul>
      </div>

      <div class="modal-footer">
        <Button
          variant="outline"
          on:click={() => (showWhatsAppDialog = false)}
        >
          Cancel
        </Button>
        <Button on:click={handleContinue}>
          Continue to Unlock
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .share-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Share tabs */
  .share-tabs {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-1);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-xl);
  }

  .share-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: transparent;
    border: none;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: all 0.2s;
  }

  .share-tab:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--background) / 0.5);
  }

  .share-tab.selected {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
  }

  .tab-label {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
  }

  /* Share content card */
  :global(.share-content) {
    padding: var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
    border: 1px solid hsl(var(--border)) !important;
  }

  .content-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .header-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-text {
    flex: 1;
  }

  .content-title {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .content-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  /* Share URL */
  .share-url-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .url-display {
    display: flex;
    gap: var(--space-2);
  }

  .url-field {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
  }

  .copy-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .copy-button:hover {
    background: hsl(var(--muted));
  }

  .copy-button.large {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
  }

  :global(.open-button) {
    align-self: flex-start;
    height: 40px !important;
    border-radius: var(--radius-lg) !important;
  }

  /* Embed code */
  .embed-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .embed-display {
    position: relative;
  }

  .embed-code {
    padding: var(--space-4);
    padding-right: 100px;
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }

  .embed-note {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .embed-note code {
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    background: hsl(var(--muted));
    font-family: var(--font-mono);
  }

  /* Widget preview */
  .widget-preview {
    display: flex;
    justify-content: center;
    padding: var(--space-6);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-xl);
  }

  .widget-demo {
    position: relative;
    width: 260px;
  }

  .widget-bubble {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--brand-color);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  .widget-window {
    position: absolute;
    bottom: 72px;
    right: 0;
    width: 240px;
    border-radius: var(--radius-xl);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    overflow: hidden;
  }

  .widget-header {
    padding: var(--space-3);
    background: var(--brand-color);
    color: white;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .widget-messages {
    padding: var(--space-3);
  }

  .widget-message {
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    display: inline-block;
  }

  .widget-input {
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid hsl(var(--border));
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .widget-note {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin: 0;
  }

  .link-button {
    background: none;
    border: none;
    color: var(--brand-color);
    cursor: pointer;
    text-decoration: underline;
    font-size: inherit;
  }

  /* PWA instructions */
  .pwa-instructions {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .instruction-step {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--brand-color);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .instruction-step p {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin: 0;
  }

  :global(.qr-button) {
    width: 100%;
    height: 44px !important;
    border-radius: var(--radius-xl) !important;
  }

  /* Deploy section */
  :global(.deploy-section) {
    padding: var(--space-5) !important;
    border-radius: var(--radius-xl) !important;
    border: 1px solid hsl(var(--border)) !important;
  }

  .deploy-title {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .deploy-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 var(--space-4) 0;
  }

  .deploy-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .deploy-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    cursor: pointer;
    transition: all 0.2s;
  }

  .deploy-card:hover {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent);
    background: hsl(var(--muted) / 0.3);
  }

  .deploy-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .deploy-icon.slack {
    background: #4a154b;
    color: white;
  }

  .deploy-icon.whatsapp {
    background: #25d366;
    color: white;
  }

  .deploy-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .deploy-name {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .deploy-status {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Navigation */
  .navigation {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-4);
  }

  :global(.nav-button) {
    height: 48px !important;
    padding: 0 var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
  }

  .nav-spacer {
    flex: 1;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: var(--space-4);
  }

  .modal-content {
    background: hsl(var(--card));
    border-radius: var(--radius-2xl);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    max-width: 28rem;
    width: 100%;
    padding: var(--space-6);
  }

  .modal-header {
    text-align: center;
    margin-bottom: var(--space-6);
  }

  .modal-icon {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--space-4);
  }

  .modal-icon.slack {
    background: #4a154b;
    color: white;
  }

  .modal-icon.whatsapp {
    background: #25d366;
    color: white;
  }

  .modal-title {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .modal-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  .modal-body {
    margin-bottom: var(--space-6);
  }

  .feature-note {
    font-size: var(--text-sm);
    color: var(--brand-color);
    margin: 0 0 var(--space-4) 0;
    font-weight: var(--font-medium);
  }

  .feature-list {
    padding-left: var(--space-5);
    margin: 0;
  }

  .feature-list li {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    padding: var(--space-1) 0;
  }

  .modal-footer {
    display: flex;
    gap: var(--space-3);
  }

  .modal-footer :global(button) {
    flex: 1;
  }

  /* Color utilities */
  .bg-blue-100 {
    background: hsl(217 91% 95%);
  }

  .bg-purple-100 {
    background: hsl(270 91% 95%);
  }

  .bg-green-100 {
    background: hsl(142 76% 95%);
  }

  .bg-orange-100 {
    background: hsl(24 95% 95%);
  }

  :global(.text-blue-600) {
    color: hsl(217 91% 60%);
  }

  :global(.text-purple-600) {
    color: hsl(270 91% 60%);
  }

  :global(.text-green-600) {
    color: hsl(142 76% 40%);
  }

  :global(.text-orange-600) {
    color: hsl(24 95% 53%);
  }
</style>
