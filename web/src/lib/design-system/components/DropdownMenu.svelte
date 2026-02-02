<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { scale } from 'svelte/transition';

  type Align = "start" | "center" | "end";

  export let open: boolean = false;
  export let align: Align = "end";

  const dispatch = createEventDispatcher();
  let dropdownElement: HTMLDivElement;
  let clickListenerActive = false;

  function close() {
    open = false;
    dispatch('close');
  }

  function toggle() {
    open = !open;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (dropdownElement && !dropdownElement.contains(e.target as Node)) {
      close();
    }
  }

  function addClickListener() {
    if (!clickListenerActive) {
      // Use setTimeout to prevent the opening click from immediately closing
      setTimeout(() => {
        window.addEventListener('click', handleWindowClick, true);
        clickListenerActive = true;
      }, 0);
    }
  }

  function removeClickListener() {
    if (clickListenerActive) {
      window.removeEventListener('click', handleWindowClick, true);
      clickListenerActive = false;
    }
  }

  // Watch for open state changes
  $: if (open) {
    addClickListener();
  } else {
    removeClickListener();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    removeClickListener();
  });
</script>

<div class="dropdown" bind:this={dropdownElement}>
  <slot name="trigger" {open} {toggle} />

  {#if open}
    <div
      class="dropdown-content dropdown-align-{align}"
      role="menu"
      transition:scale={{ duration: 100, start: 0.95 }}
    >
      <slot {close} />
    </div>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    position: absolute;
    z-index: 50;
    top: 100%;
    min-width: 160px;
    margin-top: 4px;
    padding: var(--space-1);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .dropdown-align-start {
    left: 0;
  }

  .dropdown-align-center {
    left: 50%;
    transform: translateX(-50%);
  }

  .dropdown-align-end {
    right: 0;
  }
</style>
