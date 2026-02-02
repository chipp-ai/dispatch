<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let checked: boolean = false;
  export let disabled: boolean = false;
  export let id: string = "";

  const dispatch = createEventDispatcher<{ change: boolean }>();

  function handleClick() {
    if (disabled) return;
    checked = !checked;
    dispatch('change', checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  {id}
  {disabled}
  class="switch"
  class:checked
  on:click={handleClick}
  {...$$restProps}
>
  <span class="switch-thumb"></span>
</button>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    width: 44px;
    height: 24px;
    padding: 2px;
    border-radius: var(--radius-full);
    border: none;
    background-color: var(--bg-tertiary);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .switch:hover:not(:disabled) {
    background-color: var(--bg-secondary);
  }

  .switch:focus-visible {
    outline: 2px solid var(--brand-color-ui);
    outline-offset: 2px;
  }

  .switch.checked {
    background-color: var(--brand-color-ui);
  }

  .switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .switch-thumb {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    background-color: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform var(--transition-fast);
  }

  .switch.checked .switch-thumb {
    transform: translateX(20px);
  }
</style>
