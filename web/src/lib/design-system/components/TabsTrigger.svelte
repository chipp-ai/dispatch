<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: string;
  export let active: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  function handleClick() {
    if (!disabled) {
      dispatch('select', { value });
    }
  }
</script>

<button
  type="button"
  role="tab"
  aria-selected={active}
  class="tabs-trigger"
  class:active
  {disabled}
  on:click={handleClick}
  {...$$restProps}
>
  <slot />
</button>

<style>
  .tabs-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-fast);
  }

  .tabs-trigger:hover:not(:disabled):not(.active) {
    color: var(--text-primary);
  }

  .tabs-trigger.active {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
  }

  .tabs-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
