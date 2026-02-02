<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: number = 0;
  export let min: number = 0;
  export let max: number = 100;
  export let step: number = 1;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{ change: number }>();

  $: percentage = ((value - min) / (max - min)) * 100;

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    dispatch('change', newValue);
  }
</script>

<div class="slider" class:disabled>
  <input
    type="range"
    bind:value
    {min}
    {max}
    {step}
    {disabled}
    class="slider-input"
    style="--value: {percentage}%"
    on:input
    on:change={handleChange}
    {...$$restProps}
  />
</div>

<style>
  .slider {
    position: relative;
    width: 100%;
  }

  .slider-input {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 8px;
    border-radius: var(--radius-full);
    background: linear-gradient(
      to right,
      var(--brand-color-ui) 0%,
      var(--brand-color-ui) var(--value),
      var(--bg-tertiary) var(--value),
      var(--bg-tertiary) 100%
    );
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    background: white;
    border: 2px solid var(--brand-color-ui);
    cursor: grab;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform var(--transition-fast);
  }

  .slider-input::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .slider-input::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .slider-input::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    background: white;
    border: 2px solid var(--brand-color-ui);
    cursor: grab;
  }

  .slider.disabled .slider-input {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .slider.disabled .slider-input::-webkit-slider-thumb {
    cursor: not-allowed;
  }
</style>
