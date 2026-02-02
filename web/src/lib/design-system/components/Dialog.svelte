<script lang="ts">
  /**
   * Dialog Component
   * 
   * Uses a portal to render at the document body level, avoiding stacking context issues.
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';

  export let open: boolean = false;
  export let hideCloseButton: boolean = false;
  export let onOpenChange: ((open: boolean) => void) | undefined = undefined;

  const dispatch = createEventDispatcher();

  // Portal container element
  let portalContainer: HTMLDivElement | null = null;

  function close() {
    open = false;
    dispatch('close');
    onOpenChange?.(false);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  // Lock body scroll when dialog is open
  $: {
    if (typeof document !== 'undefined') {
      if (open) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }
  }

  // Create portal container on mount
  onMount(() => {
    portalContainer = document.createElement('div');
    portalContainer.className = 'dialog-portal';
    document.body.appendChild(portalContainer);
  });

  // Clean up portal container on destroy
  onDestroy(() => {
    if (portalContainer && portalContainer.parentNode) {
      portalContainer.parentNode.removeChild(portalContainer);
    }
    // Ensure body scroll is restored
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });

  // Use Svelte action to teleport content to portal
  function portal(node: HTMLElement) {
    if (portalContainer) {
      portalContainer.appendChild(node);
    }

    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div use:portal class="dialog-wrapper">
    <div class="dialog-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
      <div
        class="dialog-content"
        role="dialog"
        aria-modal="true"
        transition:scale={{ duration: 150, start: 0.95 }}
        {...$$restProps}
      >
        {#if !hideCloseButton}
          <button class="dialog-close" on:click={close} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        {/if}
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-wrapper {
    /* Wrapper for portal - no styles needed, just a container */
  }

  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .dialog-content {
    position: relative;
    width: 100%;
    max-width: 500px;
    max-height: 85vh;
    margin: var(--space-4);
    padding: var(--space-6);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    overflow-y: auto;
  }

  .dialog-close {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .dialog-close:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .dialog-close svg {
    width: 16px;
    height: 16px;
  }
</style>
