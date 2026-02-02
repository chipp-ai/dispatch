<script lang="ts">
  /**
   * BookmarkButton
   *
   * A heart icon button for bookmarking messages.
   * Shows filled heart when bookmarked, outline when not.
   */
  import { createEventDispatcher } from 'svelte';
  import { scale } from 'svelte/transition';

  export let isBookmarked: boolean = false;
  export let messageId: string;
  export let loading: boolean = false;
  export let size: 'sm' | 'md' = 'sm';

  const dispatch = createEventDispatcher<{
    toggle: { messageId: string; isBookmarked: boolean };
  }>();

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    dispatch('toggle', { messageId, isBookmarked: !isBookmarked });
  }

  $: iconSize = size === 'sm' ? 16 : 20;
</script>

<button
  class="bookmark-btn"
  class:bookmarked={isBookmarked}
  class:loading
  class:size-sm={size === 'sm'}
  class:size-md={size === 'md'}
  on:click={handleClick}
  aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
  aria-pressed={isBookmarked}
  disabled={loading}
>
  {#if isBookmarked}
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="2"
      width={iconSize}
      height={iconSize}
      in:scale={{ duration: 200, start: 0.5 }}
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  {:else}
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      width={iconSize}
      height={iconSize}
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  {/if}
</button>

<style>
  .bookmark-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s;
    opacity: 0.6;
  }

  .bookmark-btn:hover {
    opacity: 1;
    color: hsl(var(--foreground));
  }

  .bookmark-btn.bookmarked {
    color: #ef4444;
    opacity: 1;
  }

  .bookmark-btn.bookmarked:hover {
    color: #dc2626;
  }

  .bookmark-btn.loading {
    opacity: 0.5;
    cursor: wait;
  }

  .bookmark-btn:disabled {
    cursor: not-allowed;
  }

  .size-sm {
    width: 24px;
    height: 24px;
  }

  .size-md {
    width: 32px;
    height: 32px;
  }
</style>
