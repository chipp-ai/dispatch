<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  type Side = "top" | "right" | "bottom" | "left";
  type Align = "start" | "center" | "end";

  export let open: boolean = false;
  export let side: Side = "bottom";
  export let align: Align = "center";

  const dispatch = createEventDispatcher();

  function close() {
    open = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="popover">
  <slot name="trigger" {open} toggle={() => open = !open} />

  {#if open}
    <div class="popover-backdrop" on:click={close} />
    <div
      class="popover-content popover-{side} popover-align-{align}"
      transition:scale={{ duration: 100, start: 0.95 }}
      {...$$restProps}
    >
      <slot />
    </div>
  {/if}
</div>

<style>
  .popover {
    position: relative;
    display: inline-block;
  }

  .popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .popover-content {
    position: absolute;
    z-index: 50;
    min-width: 200px;
    padding: var(--space-4);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .popover-top {
    bottom: 100%;
    margin-bottom: 8px;
  }

  .popover-bottom {
    top: 100%;
    margin-top: 8px;
  }

  .popover-left {
    right: 100%;
    margin-right: 8px;
  }

  .popover-right {
    left: 100%;
    margin-left: 8px;
  }

  .popover-align-start {
    left: 0;
  }

  .popover-align-center {
    left: 50%;
    transform: translateX(-50%);
  }

  .popover-align-end {
    right: 0;
  }

  .popover-top.popover-align-center,
  .popover-bottom.popover-align-center {
    left: 50%;
    transform: translateX(-50%);
  }

  .popover-left.popover-align-center,
  .popover-right.popover-align-center {
    top: 50%;
    transform: translateY(-50%);
  }
</style>
