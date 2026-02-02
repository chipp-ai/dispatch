<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let disabled: boolean = false;
  export let destructive: boolean = false;

  const dispatch = createEventDispatcher();

  function handleClick() {
    if (!disabled) {
      dispatch('click');
    }
  }
</script>

<button
  type="button"
  role="menuitem"
  class="dropdown-item"
  class:destructive
  class:disabled
  on:click={handleClick}
  {...$$restProps}
>
  <slot />
</button>

<style>
  .dropdown-item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    text-align: left;
    color: var(--text-primary);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .dropdown-item:hover:not(.disabled) {
    background-color: var(--bg-secondary);
  }

  .dropdown-item.destructive {
    color: var(--color-error);
  }

  .dropdown-item.destructive:hover:not(.disabled) {
    background-color: rgba(239, 68, 68, 0.1);
  }

  .dropdown-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
