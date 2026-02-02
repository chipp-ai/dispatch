<script lang="ts">
  import { Card } from "$lib/design-system";
  import { Youtube, BookOpen, MessageCircle, Lightbulb, ExternalLink } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  function openExternalLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const helpResources = [
    {
      icon: Youtube,
      title: "Video Tutorials",
      description: "Watch step-by-step guides on YouTube",
      url: "https://www.youtube.com/@chippai",
      color: "youtube",
    },
    {
      icon: BookOpen,
      title: "Documentation",
      description: "Read comprehensive guides and API docs",
      url: "https://docs.chipp.ai",
      color: "docs",
    },
    {
      icon: MessageCircle,
      title: "Discord Community",
      description: "Connect with other Chipp users and get help",
      url: "https://discord.gg/chipp",
      color: "discord",
    },
    {
      icon: Lightbulb,
      title: "Feature Requests",
      description: "Suggest new features and vote on ideas",
      url: "https://chipp.featurebase.app",
      color: "feature",
    },
  ];
</script>

<div class="help-content">
  <div class="help-layout">
    <!-- Left side: Resource cards -->
    <div class="resources-section">
      <h2 class="section-title">Help Center</h2>

      <div class="resources-grid">
        {#each helpResources as resource}
          <Card padding="lg" class="resource-card">
            <button class="resource-button" on:click={() => openExternalLink(resource.url)}>
              <div class="resource-icon {resource.color}">
                <svelte:component this={resource.icon} size={24} />
              </div>
              <div class="resource-info">
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
              </div>
              <div class="resource-arrow">
                <ExternalLink size={18} />
              </div>
            </button>
          </Card>
        {/each}
      </div>

      <!-- Quick Links -->
      <div class="quick-links">
        <h3 class="quick-links-title">Quick Links</h3>
        <div class="quick-links-list">
          <a href="https://docs.chipp.ai/getting-started" target="_blank" rel="noopener noreferrer">
            Getting Started Guide
          </a>
          <a href="https://docs.chipp.ai/knowledge-sources" target="_blank" rel="noopener noreferrer">
            Knowledge Sources
          </a>
          <a href="https://docs.chipp.ai/custom-actions" target="_blank" rel="noopener noreferrer">
            Custom Actions & Integrations
          </a>
          <a href="https://docs.chipp.ai/embedding" target="_blank" rel="noopener noreferrer">
            Embedding Your Chatbot
          </a>
          <a href="https://docs.chipp.ai/api" target="_blank" rel="noopener noreferrer">
            API Reference
          </a>
        </div>
      </div>
    </div>

    <!-- Right side: Chippy support chat -->
    <div class="support-section">
      <h2 class="section-title">Chat with Chippy</h2>
      <p class="support-description">Get instant help from our AI support assistant</p>
      <div class="support-iframe-container">
        <iframe
          src="https://chippysupportai-10031755.chipp.ai"
          title="Chippy Support"
          class="support-iframe"
        ></iframe>
      </div>
    </div>
  </div>
</div>

<style>
  .help-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .help-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-6);
    max-width: 1400px;
  }

  .section-title {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .resources-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .resources-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .resource-card :global(.card) {
    background: hsl(var(--card));
    padding: 0;
  }

  .resource-button {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
    border-radius: var(--radius-lg);
  }

  .resource-button:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .resource-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    flex-shrink: 0;
  }

  .resource-icon.youtube {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 50%);
  }

  .resource-icon.docs {
    background: hsl(220 70% 50% / 0.1);
    color: hsl(220 70% 50%);
  }

  .resource-icon.discord {
    background: hsl(235 85% 65% / 0.1);
    color: hsl(235 85% 65%);
  }

  .resource-icon.feature {
    background: hsl(45 90% 50% / 0.1);
    color: hsl(45 90% 50%);
  }

  .resource-info {
    flex: 1;
    min-width: 0;
  }

  .resource-info h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .resource-info p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .resource-arrow {
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .quick-links {
    margin-top: var(--space-6);
    padding: var(--space-4);
    background: hsl(var(--card));
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
  }

  .quick-links-title {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3) 0;
  }

  .quick-links-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .quick-links-list a {
    font-size: var(--text-sm);
    color: hsl(var(--primary));
    text-decoration: none;
    padding: var(--space-2) 0;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    transition: color 0.2s;
  }

  .quick-links-list a:last-child {
    border-bottom: none;
  }

  .quick-links-list a:hover {
    color: hsl(var(--primary) / 0.8);
    text-decoration: underline;
  }

  .support-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .support-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .support-iframe-container {
    flex: 1;
    min-height: 500px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .support-iframe {
    width: 100%;
    height: 100%;
    min-height: 500px;
    border: none;
  }

  @media (max-width: 1024px) {
    .help-layout {
      grid-template-columns: 1fr;
    }

    .support-section {
      order: -1;
    }
  }

  @media (max-width: 768px) {
    .help-content {
      padding: var(--space-4);
    }
  }
</style>
