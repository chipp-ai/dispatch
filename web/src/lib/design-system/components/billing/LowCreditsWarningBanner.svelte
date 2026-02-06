<script lang="ts">
  /**
   * LowCreditsWarningBanner
   *
   * Shows a warning banner when credit balance is low or exhausted.
   * Two variants: "full" (page-width) and "compact" (inline).
   * Two severities: "exhausted" (red/destructive) vs "low" (yellow/warning).
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/design-system';
  import { AlertCircle, AlertTriangle, X, CreditCard } from 'lucide-svelte';

  export let variant: 'full' | 'compact' = 'full';
  export let severity: 'low' | 'exhausted' = 'low';
  export let balanceFormatted: string = '$0.00';
  export let hasPaymentMethod: boolean = false;

  const dispatch = createEventDispatcher<{
    addCredits: void;
    dismiss: void;
  }>();

  $: title = severity === 'exhausted'
    ? 'Credits exhausted'
    : 'Credits running low';

  $: description = severity === 'exhausted'
    ? 'Your credit balance is $0.00. Add credits to continue using AI features.'
    : `Your credit balance is ${balanceFormatted}. Consider adding more credits.`;

  $: ctaText = hasPaymentMethod ? 'Add Credits' : 'Set Up Payment';

  function handleCta() {
    dispatch('addCredits');
  }

  function handleDismiss() {
    dispatch('dismiss');
  }
</script>

{#if variant === 'full'}
  <div class="banner" class:exhausted={severity === 'exhausted'} class:low={severity === 'low'}>
    <div class="banner-icon">
      {#if severity === 'exhausted'}
        <AlertCircle size={20} />
      {:else}
        <AlertTriangle size={20} />
      {/if}
    </div>

    <div class="banner-content">
      <h3 class="banner-title">{title}</h3>
      <p class="banner-description">{description}</p>
    </div>

    <div class="banner-actions">
      <Button
        variant={severity === 'exhausted' ? 'default' : 'outline'}
        size="sm"
        on:click={handleCta}
      >
        <CreditCard size={14} />
        {ctaText}
      </Button>
    </div>

    <button class="banner-dismiss" on:click={handleDismiss} aria-label="Dismiss">
      <X size={16} />
    </button>
  </div>
{:else}
  <!-- Compact variant for inline use -->
  <div class="compact-banner" class:exhausted={severity === 'exhausted'} class:low={severity === 'low'}>
    <div class="compact-icon">
      {#if severity === 'exhausted'}
        <AlertCircle size={14} />
      {:else}
        <AlertTriangle size={14} />
      {/if}
    </div>
    <span class="compact-text">
      {severity === 'exhausted' ? 'Credits exhausted' : `Low credits: ${balanceFormatted}`}
    </span>
    <button class="compact-cta" on:click={handleCta}>
      Add Credits
    </button>
    <button class="compact-dismiss" on:click={handleDismiss} aria-label="Dismiss">
      <X size={12} />
    </button>
  </div>
{/if}

<style>
  /* Full variant */
  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    position: relative;
    margin-bottom: var(--space-4);
  }

  .banner.exhausted {
    background: hsl(0 84.2% 60.2% / 0.08);
    border: 1px solid hsl(0 84.2% 60.2% / 0.25);
  }

  .banner.low {
    background: hsl(38 92% 50% / 0.08);
    border: 1px solid hsl(38 92% 50% / 0.25);
  }

  .banner-icon {
    flex-shrink: 0;
    padding: var(--space-1);
  }

  .banner.exhausted .banner-icon {
    color: hsl(0 84.2% 60.2%);
  }

  .banner.low .banner-icon {
    color: hsl(38 92% 50%);
  }

  .banner-content {
    flex: 1;
    min-width: 0;
  }

  .banner-title {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-1) 0;
  }

  .banner.exhausted .banner-title {
    color: hsl(0 84.2% 40%);
  }

  .banner.low .banner-title {
    color: hsl(38 92% 35%);
  }

  .banner-description {
    font-size: var(--text-sm);
    margin: 0;
    line-height: 1.5;
  }

  .banner.exhausted .banner-description {
    color: hsl(0 84.2% 50%);
  }

  .banner.low .banner-description {
    color: hsl(38 92% 40%);
  }

  .banner-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .banner-actions :global(button) {
    white-space: nowrap;
  }

  .banner-dismiss {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    padding: var(--space-1);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: opacity 0.2s;
    opacity: 0.5;
  }

  .banner-dismiss:hover {
    opacity: 1;
  }

  .banner.exhausted .banner-dismiss {
    color: hsl(0 84.2% 50%);
  }

  .banner.low .banner-dismiss {
    color: hsl(38 92% 50%);
  }

  /* Compact variant */
  .compact-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
  }

  .compact-banner.exhausted {
    background: hsl(0 84.2% 60.2% / 0.08);
    border: 1px solid hsl(0 84.2% 60.2% / 0.2);
  }

  .compact-banner.low {
    background: hsl(38 92% 50% / 0.08);
    border: 1px solid hsl(38 92% 50% / 0.2);
  }

  .compact-icon {
    flex-shrink: 0;
  }

  .compact-banner.exhausted .compact-icon {
    color: hsl(0 84.2% 60.2%);
  }

  .compact-banner.low .compact-icon {
    color: hsl(38 92% 50%);
  }

  .compact-text {
    flex: 1;
    font-weight: var(--font-medium);
  }

  .compact-banner.exhausted .compact-text {
    color: hsl(0 84.2% 45%);
  }

  .compact-banner.low .compact-text {
    color: hsl(38 92% 38%);
  }

  .compact-cta {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    text-decoration: underline;
    text-underline-offset: 2px;
    padding: 0;
  }

  .compact-banner.exhausted .compact-cta {
    color: hsl(0 84.2% 45%);
  }

  .compact-banner.low .compact-cta {
    color: hsl(38 92% 35%);
  }

  .compact-cta:hover {
    opacity: 0.8;
  }

  .compact-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    opacity: 0.4;
    transition: opacity 0.2s;
    border-radius: var(--radius-sm);
  }

  .compact-dismiss:hover {
    opacity: 1;
  }

  .compact-banner.exhausted .compact-dismiss {
    color: hsl(0 84.2% 50%);
  }

  .compact-banner.low .compact-dismiss {
    color: hsl(38 92% 50%);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .banner {
      flex-direction: column;
      padding-right: var(--space-8);
    }

    .banner-actions {
      width: 100%;
    }

    .banner-actions :global(button) {
      width: 100%;
    }
  }
</style>
