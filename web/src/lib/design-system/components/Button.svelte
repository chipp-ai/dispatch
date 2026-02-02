<!--
  Button Component

  ## Branding System

  The primary variant uses a CSS fallback pattern to support two branding contexts:

    background-color: var(--consumer-primary, var(--brand-color));

  This means:
  - In consumer chat context: Uses --consumer-primary (app-specific branding)
  - Everywhere else: Falls back to --brand-color (platform whitelabeling)

  IMPORTANT: Do not change this to just --brand-color or just --consumer-primary.

  - --brand-color: Platform whitelabeling for agencies/resellers branding the entire
    Chipp platform with their colors (set in tokens.css, per-deployment)

  - --consumer-primary: App-specific branding for individual AI chatbots to have
    their own brand colors (set dynamically by ConsumerLayout.svelte)

  See ConsumerLayout.svelte for where --consumer-primary is set.
-->
<script lang="ts">
  type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "default" | "destructive";
  type Size = "sm" | "md" | "lg";

  export let variant: Variant = "primary";
  export let size: Size = "md";
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let type: "button" | "submit" | "reset" = "button";

  // Extract class from restProps to merge with base classes
  let className: string = "";
  export { className as class };

  $: baseClasses = `btn btn-${variant} btn-${size}`;
  $: mergedClasses = className ? `${baseClasses} ${className}` : baseClasses;
</script>

<button
  {type}
  {disabled}
  class={mergedClasses}
  class:loading
  on:click
  {...$$restProps}
>
  {#if loading}
    <span class="spinner"></span>
  {/if}
  <slot />
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    font-weight: var(--font-medium);
    border-radius: var(--radius-lg);
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      opacity var(--transition-fast);
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.loading {
    position: relative;
    color: transparent;
  }

  /* Sizes */
  .btn-sm {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    height: 32px;
  }

  .btn-md {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-base);
    height: 40px;
  }

  .btn-lg {
    padding: var(--space-3) var(--space-6);
    font-size: var(--text-lg);
    height: 48px;
  }

  /* Variants */
  .btn-primary {
    /* Use --consumer-primary for app branding in consumer context, fall back to --brand-color-ui for platform */
    /* --brand-color-ui is automatically darkened in light mode for better contrast */
    background-color: var(--consumer-primary, var(--brand-color-ui));
    color: var(--brand-color-foreground);
    box-shadow:
      0px 0.48px 1.25px -1.17px rgba(0, 0, 0, 0.05),
      0px 1.83px 4.76px -2.33px rgba(0, 0, 0, 0.06),
      0px 4px 10.8px -3.5px rgba(0, 0, 0, 0.05),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.29),
      0px 0px 0px 2px rgba(0, 0, 0, 0.08);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--consumer-primary, var(--brand-color-ui-hover));
    filter: brightness(1.05);
  }

  .btn-secondary {
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--bg-tertiary);
  }

  .btn-outline {
    background-color: transparent;
    color: var(--text-primary);
    border-color: var(--border-primary);
  }

  .btn-outline:hover:not(:disabled) {
    background-color: var(--bg-secondary);
    border-color: var(--border-secondary);
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--text-secondary);
  }

  .btn-ghost:hover:not(:disabled) {
    background-color: var(--bg-secondary);
    color: var(--text-primary);
  }

  .btn-danger {
    background-color: var(--color-error);
    color: var(--color-white);
  }

  .btn-danger:hover:not(:disabled) {
    background-color: #dc2626;
  }

  /* Default variant - same as secondary */
  .btn-default {
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-primary);
  }

  .btn-default:hover:not(:disabled) {
    background-color: var(--bg-tertiary);
  }

  /* Destructive variant - same as danger */
  .btn-destructive {
    background-color: var(--color-error);
    color: var(--color-white);
  }

  .btn-destructive:hover:not(:disabled) {
    background-color: #dc2626;
  }

  /* Spinner */
  .spinner {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
