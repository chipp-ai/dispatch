<script lang="ts">
  /**
   * Sheet Component
   *
   * A slide-in panel component that animates from the side or edge of the screen.
   * Uses a portal to render at the document body level, avoiding stacking context issues.
   *
   * Props:
   * - open: boolean - Whether the sheet is visible
   * - side: 'left' | 'right' | 'bottom' | 'top' - Which side to slide in from (default: 'right')
   * - width: string - CSS width value for left/right (default: '400px')
   * - height: string - CSS height value for top/bottom (default: '50vh')
   * - onClose: () => void - Callback when sheet should close
   */
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut, cubicIn } from 'svelte/easing';

  export let open: boolean = false;
  export let side: 'left' | 'right' | 'bottom' | 'top' = 'right';
  export let width: string = '400px';
  export let height: string = '50vh';

  const dispatch = createEventDispatcher<{ close: void }>();

  // Portal container element
  let portalContainer: HTMLDivElement | null = null;
  let mounted = false;

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      handleClose();
    }
  }

  function handleBackdropClick() {
    handleClose();
  }

  // Create portal container on mount
  onMount(() => {
    portalContainer = document.createElement('div');
    portalContainer.className = 'sheet-portal';
    document.body.appendChild(portalContainer);
    mounted = true;
  });

  // Clean up portal container on destroy
  onDestroy(() => {
    if (portalContainer && portalContainer.parentNode) {
      portalContainer.parentNode.removeChild(portalContainer);
    }
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  });

  // Prevent body scroll when open
  $: if (typeof document !== 'undefined') {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  // Custom slide transition
  function slideIn(node: Element, { duration = 300, side: slideSide = 'right' }: { duration?: number; side?: 'left' | 'right' | 'bottom' | 'top' }) {
    return {
      duration,
      css: (t: number) => {
        const eased = cubicOut(t);
        if (slideSide === 'left' || slideSide === 'right') {
          const translateX = slideSide === 'right' ? (1 - eased) * 100 : -(1 - eased) * 100;
          return `transform: translateX(${translateX}%);`;
        } else {
          const translateY = slideSide === 'bottom' ? (1 - eased) * 100 : -(1 - eased) * 100;
          return `transform: translateY(${translateY}%);`;
        }
      }
    };
  }

  function slideOut(node: Element, { duration = 200, side: slideSide = 'right' }: { duration?: number; side?: 'left' | 'right' | 'bottom' | 'top' }) {
    return {
      duration,
      css: (t: number) => {
        const eased = cubicIn(t);
        if (slideSide === 'left' || slideSide === 'right') {
          const translateX = slideSide === 'right' ? (1 - eased) * 100 : -(1 - eased) * 100;
          return `transform: translateX(${translateX}%);`;
        } else {
          const translateY = slideSide === 'bottom' ? (1 - eased) * 100 : -(1 - eased) * 100;
          return `transform: translateY(${translateY}%);`;
        }
      }
    };
  }

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

{#if open && mounted}
  <div use:portal class="sheet-wrapper">
    <!-- Backdrop -->
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="sheet-backdrop"
      on:click={handleBackdropClick}
      transition:fade={{ duration: 200 }}
    ></div>

    <!-- Sheet Panel -->
    <div
      class="sheet-panel"
      class:sheet-left={side === 'left'}
      class:sheet-right={side === 'right'}
      class:sheet-bottom={side === 'bottom'}
      class:sheet-top={side === 'top'}
      style="--sheet-width: {width}; --sheet-height: {height};"
      role="dialog"
      aria-modal="true"
      in:slideIn={{ duration: 300, side }}
      out:slideOut={{ duration: 200, side }}
    >
      <!-- Close button -->
      <button
        class="sheet-close"
        on:click={handleClose}
        aria-label="Close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <!-- Content -->
      <div class="sheet-content">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-wrapper {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.8);
    pointer-events: auto;
  }

  .sheet-panel {
    position: fixed;
    display: flex;
    flex-direction: column;
    background-color: hsl(var(--background));
    pointer-events: auto;
  }

  .sheet-left,
  .sheet-right {
    top: 0;
    bottom: 0;
    width: var(--sheet-width);
    max-width: calc(100vw - 40px);
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  }

  .sheet-left {
    left: 0;
    border-right: 1px solid hsl(var(--border));
  }

  .sheet-right {
    right: 0;
    border-left: 1px solid hsl(var(--border));
  }

  .sheet-bottom,
  .sheet-top {
    left: 0;
    right: 0;
    height: var(--sheet-height);
    max-height: calc(100vh - 40px);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  }

  .sheet-bottom {
    bottom: 0;
    border-top: 1px solid hsl(var(--border));
    border-radius: 16px 16px 0 0;
  }

  .sheet-top {
    top: 0;
    border-bottom: 1px solid hsl(var(--border));
    border-radius: 0 0 16px 16px;
  }

  .sheet-close {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s;
  }

  .sheet-close:hover {
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .sheet-close svg {
    width: 20px;
    height: 20px;
  }

  .sheet-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  /* Mobile: full width */
  @media (max-width: 640px) {
    .sheet-panel {
      width: 100%;
      max-width: 100%;
    }

    .sheet-close {
      width: 44px;
      height: 44px;
    }

    .sheet-close svg {
      width: 24px;
      height: 24px;
    }
  }

  /* Dark mode support */
  :global(.dark) .sheet-panel {
    background-color: hsl(var(--background));
    border-color: hsl(var(--border));
  }
</style>
