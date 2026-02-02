<script lang="ts">
  /**
   * Waiting For Response
   *
   * Adds a human-like delay before showing the typing indicator.
   * The delay is randomized (500-1000ms) to feel more natural.
   */

  import { onMount } from "svelte";
  import TypingIndicator from "./TypingIndicator.svelte";

  export let appName: string = "Assistant";
  export let appLogoUrl: string = "";
  export let showAvatar: boolean = true;
  export let dotColor: string = "var(--text-secondary, #666)";

  let visible = false;
  let secondaryVisible = false;

  onMount(() => {
    // Random delay between 500-1000ms to feel human-like
    const delay = 500 * Math.random() + 500;

    const timer = setTimeout(() => {
      visible = true;
      // Show "is thinking..." text after 200ms
      setTimeout(() => {
        secondaryVisible = true;
      }, 200);
    }, delay);

    return () => clearTimeout(timer);
  });
</script>

<div class="waiting-container" class:visible>
  {#if showAvatar && appLogoUrl}
    <div class="avatar">
      <img src={appLogoUrl} alt={appName} />
    </div>
  {/if}

  <div class="waiting-content">
    <TypingIndicator {dotColor} />
    {#if secondaryVisible}
      <span class="thinking-text">{appName} is thinking...</span>
    {/if}
  </div>
</div>

<style>
  .waiting-container {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 12px);
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .waiting-container.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full, 50%);
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .waiting-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    background: var(--bg-secondary, #f5f5f5);
    border-radius: var(--radius-xl, 16px);
    border-top-left-radius: var(--radius-sm, 4px);
  }

  .thinking-text {
    font-size: var(--text-xs, 12px);
    color: var(--text-tertiary, #999);
    padding: 0 16px 12px;
    opacity: 0;
    animation: fadeIn 0.2s ease forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
