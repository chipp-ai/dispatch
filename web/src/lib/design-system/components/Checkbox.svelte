<script lang="ts">
  export let checked: boolean = false;
  export let disabled: boolean = false;
  export let id: string = "";
</script>

<button
  type="button"
  role="checkbox"
  aria-checked={checked}
  {id}
  {disabled}
  class="checkbox"
  class:checked
  on:click={() => !disabled && (checked = !checked)}
  {...$$restProps}
>
  {#if checked}
    <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  {/if}
</button>

<style>
  .checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-primary);
    background-color: transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .checkbox:hover:not(:disabled) {
    border-color: var(--brand-color-ui);
  }

  .checkbox:focus-visible {
    outline: 2px solid var(--brand-color-ui);
    outline-offset: 2px;
  }

  .checkbox.checked {
    background-color: var(--brand-color-ui);
    border-color: var(--brand-color-ui);
  }

  .checkbox:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .check-icon {
    width: 12px;
    height: 12px;
    color: var(--brand-color-foreground);
  }
</style>
