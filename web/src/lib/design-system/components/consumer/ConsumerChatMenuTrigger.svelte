<script lang="ts">
  /**
   * ConsumerChatMenuTrigger
   *
   * The hamburger menu button that opens the chat menu sheet.
   * This component is separate from the sheet content to allow the sheet
   * to be rendered at the page level, avoiding z-index stacking issues.
   */
  import { createEventDispatcher } from 'svelte';

  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ toggle: void }>();

  function handleClick() {
    dispatch('toggle');
  }
</script>

<button
  class="menu-trigger"
  on:click={handleClick}
  aria-label="Open menu"
  aria-expanded={open}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
</button>

<style>
  .menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s;
  }

  .menu-trigger:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .menu-trigger svg {
    width: 20px;
    height: 20px;
  }

  /* Mobile adjustments */
  @media (max-width: 640px) {
    .menu-trigger {
      width: 44px;
      height: 44px;
    }

    .menu-trigger svg {
      width: 24px;
      height: 24px;
    }
  }
</style>
