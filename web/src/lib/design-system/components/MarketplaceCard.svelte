<!--
  Marketplace Card Component

  Displays a public app in the marketplace grid.
-->
<script lang="ts">
  import Badge from "./Badge.svelte";
  import Avatar from "./Avatar.svelte";

  export let applicationId: string;
  export let name: string;
  export let description: string | null = null;
  export let pictureUrl: string | null = null;
  export let creatorName: string | null = null;
  export let creatorPictureUrl: string | null = null;
  export let category: string | null = null;
  export let isFeatured: boolean = false;
  export let onclick: (() => void) | null = null;

  const defaultLogo = "/assets/default-app-image.png";
  const chatUrl = `https://${applicationId}.chipp.ai`;

  function handleClick(e: MouseEvent) {
    if (onclick) {
      e.preventDefault();
      onclick();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      if (onclick) {
        e.preventDefault();
        onclick();
      }
    }
  }
</script>

<a
  href={chatUrl}
  target="_blank"
  rel="noopener noreferrer"
  class="card"
  class:featured={isFeatured}
  on:click={handleClick}
  on:keydown={handleKeydown}
>
  {#if isFeatured}
    <div class="featured-badge">
      <Badge variant="secondary">Featured</Badge>
    </div>
  {/if}

  <div class="card-header">
    <div class="app-logo">
      <img src={pictureUrl || defaultLogo} alt={name} />
    </div>
    {#if category}
      <Badge variant="outline">{category}</Badge>
    {/if}
  </div>

  <div class="card-body">
    <h3 class="app-name">{name}</h3>
    {#if description}
      <p class="app-description">{description}</p>
    {/if}
  </div>

  <div class="card-footer">
    {#if creatorName}
      <div class="creator">
        <Avatar
          src={creatorPictureUrl || ""}
          alt={creatorName}
          fallback={creatorName.charAt(0).toUpperCase()}
          size="sm"
        />
        <span class="creator-name">{creatorName}</span>
      </div>
    {/if}
    <span class="try-button">Try it</span>
  </div>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;
    position: relative;
    height: 100%;
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border-color: hsl(var(--primary) / 0.5);
  }

  .card.featured {
    border-color: hsl(var(--primary) / 0.3);
    background: linear-gradient(
      135deg,
      hsl(var(--card)) 0%,
      hsl(var(--primary) / 0.05) 100%
    );
  }

  .featured-badge {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
  }

  .card-header {
    padding: var(--space-4);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .app-logo {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: hsl(var(--muted));
    flex-shrink: 0;
  }

  .app-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-body {
    padding: 0 var(--space-4);
    flex: 1;
  }

  .app-name {
    font-size: var(--text-lg);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .card-footer {
    padding: var(--space-4);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid hsl(var(--border) / 0.5);
    margin-top: auto;
  }

  .creator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .creator-name {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .try-button {
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--primary));
    white-space: nowrap;
    transition: color 0.15s ease;
  }

  .card:hover .try-button {
    color: hsl(var(--primary) / 0.8);
  }
</style>
