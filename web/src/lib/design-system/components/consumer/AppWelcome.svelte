<script lang="ts">
  /**
   * AppWelcome
   *
   * Welcome screen shown when chat is empty, featuring:
   * - Large app logo
   * - App name
   * - Optional description
   * - Centered layout
   */

  export let appName: string = "Chat";
  export let logoUrl: string | null = null;
  export let description: string | null = null;
  export let primaryColor: string = "#4499ff";
  export let className: string = "";
</script>

<div class="app-welcome {className}">
  <div class="logo-container">
    {#if logoUrl}
      <img src={logoUrl} alt="{appName}" class="app-logo" />
    {:else}
      <div class="default-logo" style="--accent-color: {primaryColor}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
    {/if}
  </div>

  <h2 class="app-name">{appName}</h2>

  {#if description}
    <p class="app-description">{description}</p>
  {:else}
    <p class="app-description">Start a conversation</p>
  {/if}
</div>

<style>
  .app-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-3);
  }

  .logo-container {
    width: 80px;
    height: 80px;
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    transition: transform 0.3s ease;
  }

  .logo-container:hover {
    transform: scale(1.05);
  }

  .app-logo {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .default-logo {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      var(--accent-color) 0%,
      color-mix(in srgb, var(--accent-color) 80%, black) 100%
    );
    color: white;
  }

  .default-logo svg {
    width: 40px;
    height: 40px;
    opacity: 0.9;
  }

  .app-name {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .app-description {
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 300px;
  }

  @media (max-width: 640px) {
    .logo-container {
      width: 64px;
      height: 64px;
    }

    .default-logo svg {
      width: 32px;
      height: 32px;
    }

    .app-name {
      font-size: var(--text-lg);
    }

    .app-description {
      font-size: var(--text-sm);
    }
  }
</style>
