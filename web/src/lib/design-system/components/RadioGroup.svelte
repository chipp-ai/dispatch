<script lang="ts">
  import { setContext } from "svelte";
  import { writable } from "svelte/store";

  export let value: string = "";
  export let name: string = "";

  // Create stores for context
  const valueStore = writable(value);
  const nameStore = writable(name);

  // Update stores when props change
  $: valueStore.set(value);
  $: nameStore.set(name);

  // Provide context for child RadioGroupItems
  setContext("radioGroup", {
    value: valueStore,
    name: nameStore,
    setValue: (newValue: string) => {
      value = newValue;
      valueStore.set(newValue);
    },
  });
</script>

<div class="radio-group" role="radiogroup" {...$$restProps}>
  <slot></slot>
</div>

<style>
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
