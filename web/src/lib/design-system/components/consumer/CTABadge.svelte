<script lang="ts">
  /**
   * CTABadge
   *
   * Call-to-action badge displayed above the chat input.
   * Features:
   * - Optional image
   * - Text with link
   * - Brand color styling
   */

  export let text: string = "";
  export let link: string = "";
  export let imgUrl: string | null = null;
  export let variant: "brand" | "light" = "light";
  export let primaryColor: string = "#4499ff";

  function handleClick(): void {
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }
</script>

{#if text || imgUrl}
  <button
    class="cta-badge {variant}"
    style="--primary-color: {primaryColor}"
    on:click={handleClick}
    disabled={!link}
  >
    {#if imgUrl}
      <img src={imgUrl} alt="" class="cta-image" />
    {/if}
    {#if text}
      <span class="cta-text">{text}</span>
    {/if}
    {#if link}
      <svg class="external-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
      </svg>
    {/if}
  </button>
{/if}

<style>
  .cta-badge {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -44px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 9999px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    font-size: var(--text-sm);
    white-space: nowrap;
    box-shadow: var(--shadow-md);
  }

  .cta-badge:disabled {
    cursor: default;
  }

  .cta-badge.brand {
    background-color: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
  }

  .cta-badge.brand:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateX(-50%) translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .cta-badge.light {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    border-color: hsl(var(--border));
  }

  .cta-badge.light:hover:not(:disabled) {
    border-color: var(--primary-color);
    transform: translateX(-50%) translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .cta-image {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    object-fit: cover;
  }

  .cta-text {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .external-icon {
    width: 14px;
    height: 14px;
    opacity: 0.7;
  }

  @media (max-width: 640px) {
    .cta-badge {
      top: -38px;
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
    }

    .cta-image {
      width: 16px;
      height: 16px;
    }

    .cta-text {
      max-width: 150px;
    }

    .external-icon {
      width: 12px;
      height: 12px;
    }
  }
</style>
