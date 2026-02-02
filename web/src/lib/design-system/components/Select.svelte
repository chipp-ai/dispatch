<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  export let value: string = "";
  export let placeholder: string = "Select...";
  export let disabled: boolean = false;

  let open = false;
  let triggerEl: HTMLButtonElement;

  const dispatch = createEventDispatcher();

  function toggle() {
    if (!disabled) open = !open;
  }

  function close() {
    open = false;
  }

  function handleSelect(e: CustomEvent<{ value: string; label: string }>) {
    value = e.detail.value;
    dispatch('change', e.detail);
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="select" class:open class:disabled>
  <button
    bind:this={triggerEl}
    type="button"
    class="select-trigger"
    aria-haspopup="listbox"
    aria-expanded={open}
    {disabled}
    on:click={toggle}
    {...$$restProps}
  >
    <span class="select-value" class:placeholder={!value}>
      <slot name="value" {value}>
        {value || placeholder}
      </slot>
    </span>
    <svg class="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="select-backdrop" on:click={close}></div>
    <div
      class="select-content"
      role="listbox"
      transition:scale={{ duration: 100, start: 0.95 }}
      on:select={(e) => handleSelect(e as unknown as CustomEvent<{ value: string; label: string }>)}
    >
      <slot {handleSelect} />
    </div>
  {/if}
</div>

<style>
  .select {
    position: relative;
    width: 100%;
  }

  .select-trigger {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-primary);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .select-trigger:hover:not(:disabled) {
    border-color: var(--border-secondary);
  }

  .select-trigger:focus {
    outline: none;
    border-color: var(--brand-color-ui);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-color-ui) 10%, transparent);
  }

  .select.disabled .select-trigger {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select-value {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-value.placeholder {
    color: var(--text-muted);
  }

  .select-icon {
    width: 16px;
    height: 16px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .select.open .select-icon {
    transform: rotate(180deg);
  }

  .select-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .select-content {
    position: absolute;
    z-index: 50;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    width: max-content;
    max-height: 240px;
    overflow-y: auto;
    padding: var(--space-1);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }
</style>
