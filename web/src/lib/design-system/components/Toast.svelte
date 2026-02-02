<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  type Variant = "default" | "success" | "error" | "warning" | "loading";

  export let title: string = "";
  export let description: string = "";
  export let variant: Variant = "default";
  export let duration: number = 5000;
  export let dismissible: boolean = true;
  export let open: boolean = true;

  const dispatch = createEventDispatcher();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function close() {
    open = false;
    dispatch('close');
  }

  // Set up auto-dismiss timeout
  onMount(() => {
    if (duration > 0) {
      timeoutId = setTimeout(close, duration);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  });

  // React to duration changes (e.g., when toast transforms from loading to success)
  $: if (duration > 0 && open) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(close, duration);
  }
</script>

{#if open}
  <div
    class="toast toast-{variant}"
    role="alert"
    transition:fly={{ y: 50, duration: 200 }}
    {...$$restProps}
  >
    {#if variant === "loading"}
      <div class="toast-spinner"></div>
    {/if}
    <div class="toast-content">
      {#if title}
        <div class="toast-title">{title}</div>
      {/if}
      {#if description}
        <div class="toast-description">{description}</div>
      {/if}
      <slot />
    </div>
    {#if dismissible}
      <button class="toast-close" on:click={close} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    max-width: 360px;
    padding: var(--space-4);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .toast-success {
    border-left: 4px solid var(--color-success);
  }

  .toast-error {
    border-left: 4px solid var(--color-error);
  }

  .toast-warning {
    border-left: 4px solid var(--color-warning);
  }

  .toast-loading {
    border-left: 4px solid var(--brand-color, var(--color-primary));
  }

  .toast-spinner {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-secondary);
    border-top-color: var(--brand-color, var(--color-primary));
    border-radius: 50%;
    animation: toast-spin 0.8s linear infinite;
  }

  @keyframes toast-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .toast-content {
    flex: 1;
    min-width: 0;
  }

  .toast-title {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
  }

  .toast-description {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .toast-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }

  .toast-close:hover {
    color: var(--text-primary);
  }

  .toast-close svg {
    width: 14px;
    height: 14px;
  }
</style>
