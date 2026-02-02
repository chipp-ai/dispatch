<script lang="ts">
  import { Card } from "$lib/design-system";
  import { ExternalLink } from "lucide-svelte";

  interface HelpCenterItem {
    icon: string;
    title: string;
    description: string;
    link: string;
  }

  const helpCenterData: HelpCenterItem[] = [
    {
      icon: "/assets/settings-help-center-logos/featurebase-logo.png",
      title: "Feedback",
      description:
        "Request features you want to see. Report bugs to fix. View our roadmap.",
      link: "https://updates.chipp.ai/",
    },
    {
      icon: "/assets/settings-help-center-logos/disco-logo.png",
      title: "Academy",
      description:
        "Learn to use AI and Chipp in our supportive community. Attend live events, ask questions and get answers as a free Academy member.",
      link: "https://chipp.disco.co/home",
    },
    {
      icon: "/assets/settings-help-center-logos/discord-logo.png",
      title: "Community",
      description:
        "Meet fellow Chippsters, showcase your work, and chat with our dev team on Discord.",
      link: "https://discord.com/invite/TMfcNqFWSt",
    },
    {
      icon: "/assets/settings-help-center-logos/substack-logo.png",
      title: "Newsletter",
      description: "Get the latest news and updates from Chipp.",
      link: "https://chipp.substack.com/",
    },
  ];

  const socialsData: HelpCenterItem[] = [
    {
      icon: "/assets/settings-help-center-logos/youtube-logo.webp",
      title: "YouTube",
      description:
        "Watch tutorials and find inspiration from our Builder Series.",
      link: "https://www.youtube.com/channel/UCTTeB31mMKNasUGGN-Dk_4w",
    },
    {
      icon: "/assets/settings-help-center-logos/linkedin-logo.png",
      title: "LinkedIn",
      description: "Learn to integrate Chipp for business on our LinkedIn page.",
      link: "https://www.linkedin.com/company/chippdotai",
    },
    {
      icon: "/assets/settings-help-center-logos/twitter-logo.png",
      title: "X",
      description: "Watch demos and get updates on X.",
      link: "https://twitter.com/chippdotai_",
    },
  ];
</script>

<div class="help-center">
  <!-- Main Help Resources -->
  <section class="section">
    <div class="section-header">
      <h1>Help Center</h1>
      <p class="section-subtitle">Find answers to your questions.</p>
    </div>

    <div class="cards-grid">
      {#each helpCenterData as item}
        <a href={item.link} target="_blank" rel="noopener noreferrer" class="card-link">
          <Card padding="lg" class="help-card">
            <img src={item.icon} alt={item.title} class="card-icon" />
            <h2 class="card-title">{item.title}</h2>
            <p class="card-description">{item.description}</p>
          </Card>
        </a>
      {/each}
    </div>
  </section>

  <!-- Socials Section -->
  <section class="section">
    <div class="section-header">
      <h1>Socials</h1>
      <p class="section-subtitle">Follow us for the latest updates, demos, and use cases.</p>
    </div>

    <div class="cards-grid">
      {#each socialsData as item}
        <a href={item.link} target="_blank" rel="noopener noreferrer" class="card-link">
          <Card padding="lg" class="help-card">
            <img src={item.icon} alt={item.title} class="card-icon" />
            <h2 class="card-title">{item.title}</h2>
            <p class="card-description">{item.description}</p>
          </Card>
        </a>
      {/each}
    </div>
  </section>

  <!-- Chipp Support Section -->
  <section class="section">
    <div class="section-header">
      <h1>Chipp Support</h1>
      <p class="section-subtitle">Get help with Chipp by using Chipp</p>
    </div>

    <div class="support-iframe-container">
      <iframe
        src="https://chippysupportai-10031755.chipp.ai"
        title="Chippy Support"
        class="support-iframe"
      />
    </div>
  </section>
</div>

<style>
  .help-center {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section-header {
    margin-bottom: var(--space-2);
  }

  .section-header h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  .card-link {
    text-decoration: none;
    display: block;
    height: 100%;
  }

  .card-link :global(.help-card) {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    cursor: pointer;
    transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  }

  .card-link:hover :global(.help-card) {
    transform: translate(-4px, -4px);
    box-shadow: 4px 4px 0 0 hsl(var(--foreground));
    border-color: hsl(var(--foreground));
  }

  .card-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    margin-bottom: var(--space-1);
  }

  .card-title {
    font-size: var(--text-2xl);
    font-family: var(--font-serif);
    font-weight: var(--font-normal);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  .support-iframe-container {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  }

  .support-iframe {
    width: 100%;
    height: 700px;
    border: none;
  }

  @media (max-width: 768px) {
    .cards-grid {
      grid-template-columns: 1fr;
    }

    .support-iframe {
      height: 500px;
    }
  }
</style>
