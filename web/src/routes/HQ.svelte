<script lang="ts">
  import { onMount } from "svelte";
  import { Spinner, Button, Card } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { ExternalLink, Play, AlertCircle } from "lucide-svelte";

  export let params: { slug: string } = { slug: "" };

  interface HQData {
    id: string;
    workspaceId: string;
    name: string | null;
    slug: string | null;
    description: string | null;
    pictureUrl: string | null;
    bannerUrl: string | null;
    videoUrl: string | null;
    ctaText: string | null;
    ctaUrl: string | null;
    accessMode: string;
    isVerified: boolean;
    isHqPublic: boolean;
    allowDuplicateApps: boolean;
  }

  interface FeaturedApp {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    slug: string | null;
  }

  let loading = true;
  let error = "";
  let hq: HQData | null = null;
  let featuredApps: FeaturedApp[] = [];

  onMount(async () => {
    await fetchHQ();
  });

  async function fetchHQ() {
    loading = true;
    error = "";

    try {
      const response = await fetch(`/api/hq/${params.slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          error = "not_found";
        } else {
          const data = await response.json();
          error = data.message || "Failed to load HQ";
        }
        return;
      }

      const result = await response.json();
      hq = result.data.hq;
      featuredApps = result.data.featuredApps;
    } catch (e) {
      error = "Failed to load HQ";
      captureException(e, { tags: { page: "hq", feature: "fetch-hq" } });
    } finally {
      loading = false;
    }
  }

  function getAppChatUrl(app: FeaturedApp): string {
    // Use slug if available, otherwise fall back to ID
    const identifier = app.slug || app.id;
    return `https://${identifier}.chipp.ai`;
  }

  function getVideoEmbedUrl(url: string): string | null {
    // Support YouTube URLs
    const youtubeMatch = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
    );
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }

    // Support Vimeo URLs
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // Support Loom URLs
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }

    return null;
  }

  $: videoEmbedUrl = hq?.videoUrl ? getVideoEmbedUrl(hq.videoUrl) : null;
</script>

<svelte:head>
  <title>{hq?.name || "HQ"} - Chipp</title>
</svelte:head>

<div class="hq-page">
  {#if loading}
    <div class="loading-state">
      <Spinner size="lg" />
      <p>Loading HQ...</p>
    </div>
  {:else if error === "not_found"}
    <div class="error-state">
      <div class="error-content">
        <AlertCircle size={64} strokeWidth={1.5} />
        <h1>HQ Not Found</h1>
        <p>This HQ doesn't exist or isn't public.</p>
        <Button href="/">Go to Homepage</Button>
      </div>
    </div>
  {:else if error}
    <div class="error-state">
      <div class="error-content">
        <AlertCircle size={64} strokeWidth={1.5} />
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <Button on:click={fetchHQ}>Try Again</Button>
      </div>
    </div>
  {:else if hq}
    <!-- Banner Section -->
    {#if hq.bannerUrl}
      <div class="banner" style="background-image: url({hq.bannerUrl});">
        <div class="banner-overlay"></div>
      </div>
    {:else}
      <div class="banner banner-default">
        <div class="banner-overlay"></div>
      </div>
    {/if}

    <!-- Header Section -->
    <div class="hq-header">
      <div class="header-content">
        {#if hq.pictureUrl}
          <div class="hq-logo">
            <img src={hq.pictureUrl} alt={hq.name || "HQ"} />
          </div>
        {:else}
          <div class="hq-logo hq-logo-default">
            <span>{(hq.name || "HQ").charAt(0).toUpperCase()}</span>
          </div>
        {/if}

        <div class="hq-info">
          <h1>{hq.name || "Workspace HQ"}</h1>
          {#if hq.description}
            <p class="hq-description">{hq.description}</p>
          {/if}
        </div>

        {#if hq.ctaText && hq.ctaUrl}
          <a
            href={hq.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="cta-button"
          >
            {hq.ctaText}
            <ExternalLink size={16} />
          </a>
        {/if}
      </div>
    </div>

    <div class="hq-content">
      <!-- Video Section -->
      {#if videoEmbedUrl}
        <section class="video-section">
          <h2>About</h2>
          <div class="video-container">
            <iframe
              src={videoEmbedUrl}
              title="About video"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        </section>
      {/if}

      <!-- Featured Apps Section -->
      {#if featuredApps.length > 0}
        <section class="apps-section">
          <h2>Featured Apps</h2>
          <div class="apps-grid">
            {#each featuredApps as app (app.id)}
              <a
                href={getAppChatUrl(app)}
                target="_blank"
                rel="noopener noreferrer"
                class="app-card"
              >
                <div class="app-icon">
                  {#if app.iconUrl}
                    <img src={app.iconUrl} alt={app.name} />
                  {:else}
                    <span class="app-icon-fallback">
                      {app.name.charAt(0).toUpperCase()}
                    </span>
                  {/if}
                </div>
                <div class="app-info">
                  <h3>{app.name}</h3>
                  {#if app.description}
                    <p>{app.description}</p>
                  {/if}
                </div>
                <div class="app-action">
                  <span>Try it</span>
                  <ExternalLink size={14} />
                </div>
              </a>
            {/each}
          </div>
        </section>
      {:else}
        <section class="empty-section">
          <p>No apps featured yet.</p>
        </section>
      {/if}
    </div>

    <!-- Footer -->
    <footer class="hq-footer">
      <p>Powered by <a href="https://chipp.ai" target="_blank" rel="noopener noreferrer">Chipp</a></p>
    </footer>
  {/if}
</div>

<style>
  .hq-page {
    min-height: 100vh;
    background: hsl(var(--background));
  }

  /* Loading State */
  .loading-state {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  /* Error State */
  .error-state {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
  }

  .error-content {
    text-align: center;
    max-width: 400px;
  }

  .error-content :global(svg) {
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .error-content h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .error-content p {
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6) 0;
  }

  /* Banner */
  .banner {
    height: 240px;
    background-size: cover;
    background-position: center;
    position: relative;
  }

  .banner-default {
    background: linear-gradient(135deg, hsl(var(--primary) / 0.2) 0%, hsl(var(--primary) / 0.1) 100%);
  }

  .banner-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 0%, hsl(var(--background) / 0.5) 100%);
  }

  /* Header */
  .hq-header {
    margin-top: -80px;
    position: relative;
    z-index: 10;
    padding: 0 var(--space-8);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-6);
  }

  .hq-logo {
    width: 120px;
    height: 120px;
    border-radius: var(--radius-xl);
    border: 4px solid hsl(var(--background));
    overflow: hidden;
    background: hsl(var(--card));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    flex-shrink: 0;
  }

  .hq-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hq-logo-default {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%);
  }

  .hq-logo-default span {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--primary-foreground));
  }

  .hq-info {
    flex: 1;
    min-width: 200px;
    padding-bottom: var(--space-2);
  }

  .hq-info h1 {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .hq-description {
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 600px;
  }

  .cta-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-radius: var(--radius-lg);
    font-weight: var(--font-medium);
    text-decoration: none;
    transition: opacity 0.2s;
    margin-bottom: var(--space-2);
  }

  .cta-button:hover {
    opacity: 0.9;
  }

  /* Content */
  .hq-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-8);
  }

  /* Video Section */
  .video-section {
    margin-bottom: var(--space-12);
  }

  .video-section h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .video-container {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
    border-radius: var(--radius-xl);
    overflow: hidden;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
  }

  .video-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  /* Apps Section */
  .apps-section h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-6) 0;
  }

  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-4);
  }

  .app-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
  }

  .app-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
    border-color: hsl(var(--primary) / 0.5);
  }

  .app-icon {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: hsl(var(--muted));
    flex-shrink: 0;
  }

  .app-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .app-icon-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--muted-foreground));
    background: linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--border)) 100%);
  }

  .app-info {
    flex: 1;
    min-width: 0;
  }

  .app-info h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-info p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .app-action {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: hsl(var(--primary));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    white-space: nowrap;
  }

  /* Empty Section */
  .empty-section {
    text-align: center;
    padding: var(--space-12);
    color: hsl(var(--muted-foreground));
  }

  /* Footer */
  .hq-footer {
    padding: var(--space-8);
    text-align: center;
    border-top: 1px solid hsl(var(--border));
    margin-top: var(--space-8);
  }

  .hq-footer p {
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin: 0;
  }

  .hq-footer a {
    color: hsl(var(--primary));
    text-decoration: none;
    font-weight: var(--font-medium);
  }

  .hq-footer a:hover {
    text-decoration: underline;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .banner {
      height: 180px;
    }

    .hq-header {
      margin-top: -60px;
      padding: 0 var(--space-4);
    }

    .header-content {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
    }

    .hq-logo {
      width: 80px;
      height: 80px;
    }

    .hq-logo-default span {
      font-size: var(--text-2xl);
    }

    .hq-info h1 {
      font-size: var(--text-2xl);
    }

    .hq-description {
      font-size: var(--text-base);
    }

    .hq-content {
      padding: var(--space-8) var(--space-4);
    }

    .apps-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
