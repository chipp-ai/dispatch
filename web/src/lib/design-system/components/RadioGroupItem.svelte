<script lang="ts">
  import { getContext, createEventDispatcher } from "svelte";
  import type { Writable } from "svelte/store";

  export let value: string;
  export let disabled: boolean = false;
  export let id: string = "";

  interface RadioGroupContext {
    value: Writable<string>;
    name: Writable<string>;
    setValue: (newValue: string) => void;
  }

  const context = getContext<RadioGroupContext>("radioGroup");
  const dispatch = createEventDispatcher();

  // Get values from context
  $: groupValue = context?.value;
  $: groupName = context?.name;
  $: isChecked = $groupValue === value;

  function handleClick() {
    if (!disabled && context) {
      context.setValue(value);
      dispatch("change", { value });
    }
  }
</script>

<button
  type="button"
  role="radio"
  aria-checked={isChecked}
  {id}
  {disabled}
  class="radio-item"
  class:checked={isChecked}
  on:click={handleClick}
  {...$$restProps}
>
  <span class="radio-indicator">
    {#if isChecked}
      <span class="radio-dot"></span>
    {/if}
  </span>
</button>

<style>
  .radio-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .radio-item:focus-visible {
    outline: 2px solid var(--brand-color-ui);
    outline-offset: 2px;
    border-radius: var(--radius-full);
  }

  .radio-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .radio-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-full);
    background-color: transparent;
    transition: all var(--transition-fast);
  }

  .radio-item:hover:not(:disabled) .radio-indicator {
    border-color: var(--brand-color-ui);
  }

  .radio-item.checked .radio-indicator {
    border-color: var(--brand-color-ui);
  }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background-color: var(--brand-color-ui);
  }
</style>
