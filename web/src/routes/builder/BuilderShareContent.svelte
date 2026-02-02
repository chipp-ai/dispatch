<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, Button, toasts, SlackSetupDialog, WhatsAppSetupDialog, EmailSetupDialog } from "$lib/design-system";
  import { Link, Code, Copy, MessageSquare, Smartphone, Globe, Check, ExternalLink, BookOpen, Users, DollarSign, BarChart3, Mail } from "lucide-svelte";

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    appNameId: string;
    custom_domain?: string;
  };

  // Setup dialogs
  let slackDialogOpen = false;
  let whatsappDialogOpen = false;
  let emailDialogOpen = false;

  let activeTab: "share" | "deploy" = "share";
  let copiedField: string | null = null;

  // Guide definitions
  interface Guide {
    title: string;
    description: string;
    bullets: string[];
    url: string;
    gradient: string;
    iconBg: string;
    icon: "code" | "globe" | "users" | "smartphone" | "dollar" | "chart" | "slack" | "whatsapp" | "email" | "link";
  }

  const shareGuides: Guide[] = [
    {
      title: "Embed Chat Widget",
      description: "Add your AI to any website",
      bullets: ["Floating chat bubble", "Full-page iframe embed", "Customizable styling"],
      url: "https://chipp.ai/docs/guides/embed-widget",
      gradient: "linear-gradient(135deg, hsl(250 80% 60% / 0.15), hsl(280 80% 60% / 0.05))",
      iconBg: "hsl(250 80% 60%)",
      icon: "code",
    },
    {
      title: "API Quickstart",
      description: "Access your AI programmatically",
      bullets: ["OpenAI-compatible format", "Bearer token auth", "Streaming support"],
      url: "https://chipp.ai/docs/api/quickstart",
      gradient: "linear-gradient(135deg, hsl(200 80% 50% / 0.15), hsl(220 80% 60% / 0.05))",
      iconBg: "hsl(200 80% 50%)",
      icon: "globe",
    },
    {
      title: "Custom Domains",
      description: "Use your own branded URL",
      bullets: ["Replace chipp.ai with your domain", "SSL certificates included", "Professional branding"],
      url: "https://chipp.ai/docs/guides/custom-domains",
      gradient: "linear-gradient(135deg, hsl(320 80% 50% / 0.15), hsl(340 80% 60% / 0.05))",
      iconBg: "hsl(320 80% 50%)",
      icon: "link",
    },
  ];

  const deployGuides: Guide[] = [
    {
      title: "Slack Integration",
      description: "Deploy your AI as a Slack bot",
      bullets: ["Responds to @mentions", "Threaded conversations", "Works in channels & DMs"],
      url: "https://chipp.ai/docs/integrations/slack",
      gradient: "linear-gradient(135deg, hsl(300 60% 45% / 0.15), hsl(280 60% 50% / 0.05))",
      iconBg: "hsl(300 60% 45%)",
      icon: "slack",
    },
    {
      title: "WhatsApp Integration",
      description: "Connect to WhatsApp Business",
      bullets: ["Meta Developer setup", "Webhook configuration", "Direct messaging"],
      url: "https://chipp.ai/docs/integrations/whatsapp",
      gradient: "linear-gradient(135deg, hsl(142 70% 40% / 0.15), hsl(160 70% 45% / 0.05))",
      iconBg: "hsl(142 70% 40%)",
      icon: "whatsapp",
    },
    {
      title: "Email Integration",
      description: "Chat via email",
      bullets: ["Threaded conversations", "Sender whitelist", "Plain text responses"],
      url: "https://chipp.ai/docs/integrations/email",
      gradient: "linear-gradient(135deg, hsl(210 80% 50% / 0.15), hsl(220 80% 55% / 0.05))",
      iconBg: "hsl(210 80% 50%)",
      icon: "email",
    },
    {
      title: "Mobile App (PWA)",
      description: "Install on any device",
      bullets: ["Home screen icon", "Works offline", "Push notifications"],
      url: "https://chipp.ai/docs/guides/pwa-installation",
      gradient: "linear-gradient(135deg, hsl(30 90% 50% / 0.15), hsl(40 90% 60% / 0.05))",
      iconBg: "hsl(30 90% 50%)",
      icon: "smartphone",
    },
  ];

  function getAppUrl(): string {
    if (!app) return "";

    const isLocalhost = window.location.hostname === "localhost";
    const isStaging = window.location.hostname.includes("staging");

    if (app.custom_domain) {
      return `https://${app.custom_domain}`;
    }

    if (isLocalhost) {
      return `http://${app.appNameId}.localhost:5174`;
    } else if (isStaging) {
      return `https://${app.appNameId}.chipp.live`;
    } else {
      return `https://${app.appNameId}.chipp.ai`;
    }
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
      setTimeout(() => {
        copiedField = null;
      }, 2000);
    } catch (e) {
      toasts.error("Error", "Failed to copy to clipboard");
    }
  }

  function openExternalLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
</script>

<div class="share-content">
  <div class="share-layout">
    <!-- Left side: Share options -->
    <div class="share-options">
      <!-- Tab buttons -->
      <div class="tab-buttons">
        <button
          class="tab-button"
          class:active={activeTab === "share"}
          on:click={() => activeTab = "share"}
        >
          Share
        </button>
        <button
          class="tab-button"
          class:active={activeTab === "deploy"}
          on:click={() => activeTab = "deploy"}
        >
          Deploy
        </button>
      </div>

      {#if activeTab === "share"}
        <!-- Share Link Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon">
              <Link size={20} />
            </div>
            <h3>Share Link</h3>
          </div>
          <div class="copy-box" on:click={() => copyToClipboard(getAppUrl(), "link")}>
            <span class="copy-text">{getAppUrl()}</span>
            <button class="copy-btn">
              {#if copiedField === "link"}
                <Check size={18} />
              {:else}
                <Copy size={18} />
              {/if}
            </button>
          </div>
        </Card>

        <!-- Iframe Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon">
              <Code size={20} />
            </div>
            <h3>Embed with Iframe</h3>
          </div>
          <p class="card-description">Embed your chatbot on any website using an iframe</p>
          <div class="copy-box code" on:click={() => copyToClipboard(getIframeCode(), "iframe")}>
            <code class="copy-text">{getIframeCode()}</code>
            <button class="copy-btn">
              {#if copiedField === "iframe"}
                <Check size={18} />
              {:else}
                <Copy size={18} />
              {/if}
            </button>
          </div>
        </Card>

        <!-- Widget Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon">
              <MessageSquare size={20} />
            </div>
            <h3>Chat Widget</h3>
          </div>
          <p class="card-description">Add a floating chat widget to your website</p>
          <div class="copy-box code" on:click={() => copyToClipboard(getWidgetCode(), "widget")}>
            <code class="copy-text">{getWidgetCode()}</code>
            <button class="copy-btn">
              {#if copiedField === "widget"}
                <Check size={18} />
              {:else}
                <Copy size={18} />
              {/if}
            </button>
          </div>
        </Card>

        <!-- API Access Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon api">
              <Globe size={20} />
            </div>
            <h3>API Access</h3>
          </div>
          <p class="card-description">Access your chatbot programmatically via API</p>
          <Button variant="secondary" on:click={() => push(`/apps/${appId}/access`)}>
            Manage API Keys
          </Button>
        </Card>
      {:else}
        <!-- Deploy Tab -->
        <!-- Slack Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon slack">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
              </svg>
            </div>
            <h3>Slack</h3>
          </div>
          <p class="card-description">Deploy your chatbot as a Slack app</p>
          <Button variant="secondary" on:click={() => slackDialogOpen = true}>
            Connect to Slack
          </Button>
        </Card>

        <!-- WhatsApp Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon whatsapp">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <h3>WhatsApp</h3>
          </div>
          <p class="card-description">Connect your chatbot to WhatsApp Business</p>
          <Button variant="secondary" on:click={() => whatsappDialogOpen = true}>
            Connect to WhatsApp
          </Button>
        </Card>

        <!-- Email Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon email">
              <Mail size={20} />
            </div>
            <h3>Email</h3>
          </div>
          <p class="card-description">Enable conversations via email</p>
          <Button variant="secondary" on:click={() => emailDialogOpen = true}>
            Connect to Email
          </Button>
        </Card>

        <!-- PWA Card -->
        <Card padding="lg" class="share-card">
          <div class="card-header">
            <div class="card-icon pwa">
              <Smartphone size={20} />
            </div>
            <h3>Mobile App (PWA)</h3>
          </div>
          <p class="card-description">Install your chatbot as a progressive web app</p>
          <Button variant="secondary" on:click={() => openExternalLink(getAppUrl())}>
            Open App
          </Button>
        </Card>
      {/if}
    </div>

    <!-- Right side: Guides -->
    <div class="guides-section">
      <div class="guides-header">
        <BookOpen size={20} />
        <h3 class="guides-title">Learn More</h3>
      </div>

      <div class="guides-grid">
        {#each activeTab === "share" ? shareGuides : deployGuides as guide}
          <a
            href={guide.url}
            target="_blank"
            rel="noopener noreferrer"
            class="guide-card"
            style="background: {guide.gradient};"
          >
            <div class="guide-card-inner">
              <div class="guide-header">
                <div class="guide-icon" style="background: {guide.iconBg};">
                  {#if guide.icon === "code"}
                    <Code size={20} />
                  {:else if guide.icon === "globe"}
                    <Globe size={20} />
                  {:else if guide.icon === "users"}
                    <Users size={20} />
                  {:else if guide.icon === "smartphone"}
                    <Smartphone size={20} />
                  {:else if guide.icon === "dollar"}
                    <DollarSign size={20} />
                  {:else if guide.icon === "chart"}
                    <BarChart3 size={20} />
                  {:else if guide.icon === "slack"}
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                  {:else if guide.icon === "whatsapp"}
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  {:else if guide.icon === "email"}
                    <Mail size={20} />
                  {:else if guide.icon === "link"}
                    <Link size={20} />
                  {/if}
                </div>
                <ExternalLink size={16} class="guide-external" />
              </div>
              <div class="guide-content">
                <h4 class="guide-title">{guide.title}</h4>
                <p class="guide-description">{guide.description}</p>
                <ul class="guide-bullets">
                  {#each guide.bullets as bullet}
                    <li>{bullet}</li>
                  {/each}
                </ul>
              </div>
            </div>
          </a>
        {/each}
      </div>
    </div>
  </div>
</div>

<!-- Slack Setup Dialog -->
<SlackSetupDialog
  bind:open={slackDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("Slack Connected", "Your chatbot is now available in Slack!")}
/>

<!-- WhatsApp Setup Dialog -->
<WhatsAppSetupDialog
  bind:open={whatsappDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("WhatsApp Connected", "Configure your webhook in Meta Developer Portal.")}
/>

<!-- Email Setup Dialog -->
<EmailSetupDialog
  bind:open={emailDialogOpen}
  applicationId={appId}
  on:connected={() => toasts.success("Email Connected", "Your chatbot is now available via email.")}
/>

<style>
  .share-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .share-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-6);
    max-width: 1400px;
  }

  .share-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .tab-buttons {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-1);
    background: hsl(var(--muted));
    border-radius: var(--radius-lg);
    width: fit-content;
  }

  .tab-button {
    padding: var(--space-2) var(--space-4);
    border: none;
    background: transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-button:hover {
    color: hsl(var(--foreground));
  }

  .tab-button.active {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .share-card :global(.card) {
    background: hsl(var(--card));
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-lg);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .card-icon.api {
    background: hsl(220 70% 50% / 0.1);
    color: hsl(220 70% 50%);
  }

  .card-icon.slack {
    background: hsl(300 60% 40% / 0.1);
    color: hsl(300 60% 40%);
  }

  .card-icon.whatsapp {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 40%);
  }

  .card-icon.email {
    background: hsl(210 80% 50% / 0.1);
    color: hsl(210 80% 50%);
  }

  .card-icon.pwa {
    background: hsl(30 70% 50% / 0.1);
    color: hsl(30 70% 50%);
  }

  .card-header h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-3) 0;
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

  .copy-box.code {
    font-family: monospace;
  }

  .copy-text {
    flex: 1;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-box.code .copy-text {
    white-space: pre-wrap;
    word-break: break-all;
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

  .guides-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    height: 100%;
  }

  .guides-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--foreground));
  }

  .guides-title {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .guides-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    flex: 1;
  }

  .guide-card {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 160px;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    text-decoration: none;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    position: relative;
  }

  .guide-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 0%, hsl(var(--background) / 0.6) 100%);
    pointer-events: none;
  }

  .guide-card:hover {
    border-color: hsl(var(--primary) / 0.4);
    transform: translateY(-2px);
    box-shadow:
      0 8px 30px hsl(var(--foreground) / 0.08),
      0 4px 12px hsl(var(--foreground) / 0.04);
  }

  .guide-card-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-5);
    position: relative;
    z-index: 1;
  }

  .guide-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .guide-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    flex-shrink: 0;
    color: white;
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
  }

  .guide-card :global(.guide-external) {
    color: hsl(var(--muted-foreground));
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.2s ease;
  }

  .guide-card:hover :global(.guide-external) {
    opacity: 1;
    transform: translateX(0);
    color: hsl(var(--foreground));
  }

  .guide-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .guide-title {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
    letter-spacing: -0.01em;
  }

  .guide-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-3) 0;
    line-height: 1.5;
  }

  .guide-bullets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .guide-bullets li {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.6);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    backdrop-filter: blur(4px);
  }

  @media (max-width: 1024px) {
    .share-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .share-content {
      padding: var(--space-4);
    }
  }
</style>
