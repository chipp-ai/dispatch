<script lang="ts">
  /**
   * SuggestionButton
   *
   * Conversation starter button with:
   * - Desktop variant (card style with icon)
   * - Mobile variant (pill style)
   * - Title and optional description
   * - Brand color hover effect
   */
  import { createEventDispatcher } from "svelte";

  export let title: string;
  export let description: string = "";
  export let iconUrl: string | null = null;
  export let content: string;
  export let primaryColor: string = "#4499ff";
  export let variant: "desktop" | "mobile" = "desktop";
  export let disabled: boolean = false;
  export let forceDarkMode: boolean = false;

  const dispatch = createEventDispatcher<{
    click: { content: string };
  }>();

  function handleClick(): void {
    if (!disabled) {
      dispatch("click", { content });
    }
  }
</script>

<button
  class="suggestion-btn {variant}"
  class:dark={forceDarkMode}
  class:disabled
  style="--primary-color: {primaryColor}"
  on:click={handleClick}
  {disabled}
>
  {#if variant === "desktop"}
    <!-- Desktop: Card style -->
    <div class="card-content">
      {#if iconUrl}
        <img src={iconUrl} alt="" class="suggestion-icon" />
      {:else}
        <div class="icon-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
      {/if}
      <div class="text-content">
        <span class="suggestion-title">{title || content}</span>
        {#if description}
          <span class="suggestion-description">{description}</span>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Mobile: Pill style -->
    <span class="pill-content">{title || content}</span>
  {/if}
</button>

<style>
  .suggestion-btn {
    display: flex;
    align-items: center;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    font-family: inherit;
  }

  .suggestion-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Desktop variant */
  .suggestion-btn.desktop {
    width: 100%;
    max-width: 400px;
    padding: var(--space-4);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .suggestion-btn.desktop:hover:not(:disabled) {
    border-color: var(--primary-color);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--primary-color) 20%, transparent);
    transform: translateY(-2px);
  }

  .suggestion-btn.desktop.dark {
    background-color: #2a2a2a;
    border-color: #3a3a3a;
  }

  .suggestion-btn.desktop.dark:hover:not(:disabled) {
    border-color: var(--primary-color);
    background-color: #333;
  }

  .card-content {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
  }

  .suggestion-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    object-fit: cover;
    flex-shrink: 0;
  }

  .icon-placeholder {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background-color: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dark .icon-placeholder {
    background-color: #3a3a3a;
  }

  .icon-placeholder svg {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
  }

  .text-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .suggestion-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .dark .suggestion-title {
    color: #f0f0f0;
  }

  .suggestion-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Mobile variant */
  .suggestion-btn.mobile {
    padding: var(--space-2) var(--space-4);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 9999px;
    width: 100%;
    justify-content: center;
  }

  .suggestion-btn.mobile:hover:not(:disabled) {
    border-color: var(--primary-color);
    background-color: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .suggestion-btn.mobile.dark {
    background-color: #2a2a2a;
    border-color: #3a3a3a;
  }

  .suggestion-btn.mobile.dark:hover:not(:disabled) {
    border-color: var(--primary-color);
    background-color: color-mix(in srgb, var(--primary-color) 20%, #2a2a2a);
  }

  .pill-content {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dark .pill-content {
    color: #f0f0f0;
  }
</style>
