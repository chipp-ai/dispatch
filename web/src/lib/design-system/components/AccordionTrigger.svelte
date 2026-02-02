<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  function toggle() {
    open = !open;
    dispatch('toggle', { open });
  }
</script>

<button
  type="button"
  class="accordion-trigger"
  class:open
  aria-expanded={open}
  on:click={toggle}
  {...$$restProps}
>
  <slot />
  <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
</button>

<style>
  .accordion-trigger {
    display: flex;
    flex: 1;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) 0;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    text-align: left;
    color: var(--text-primary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .accordion-trigger:hover {
    text-decoration: underline;
  }

  .chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .accordion-trigger.open .chevron {
    transform: rotate(180deg);
  }
</style>
