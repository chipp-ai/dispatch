<script lang="ts">
  export let value: string;
  export let selected: boolean = false;
  export let disabled: boolean = false;

  let buttonEl: HTMLButtonElement;

  function handleClick() {
    if (!disabled) {
      // Dispatch a native CustomEvent that bubbles up to the Select parent
      const event = new CustomEvent('select', {
        detail: { value, label: $$restProps['data-label'] || value },
        bubbles: true,
        composed: true
      });
      buttonEl.dispatchEvent(event);
    }
  }
</script>

<button
  bind:this={buttonEl}
  type="button"
  role="option"
  aria-selected={selected}
  class="select-item"
  class:selected
  class:disabled
  on:click={handleClick}
  {...$$restProps}
>
  <slot />
  {#if selected}
    <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  {/if}
</button>

<style>
  .select-item {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
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

  .select-item:hover:not(.disabled) {
    background-color: var(--bg-secondary);
  }

  .select-item.selected {
    background-color: var(--bg-tertiary);
  }

  .select-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .check-icon {
    width: 16px;
    height: 16px;
    color: var(--brand-color-ui);
  }
</style>
