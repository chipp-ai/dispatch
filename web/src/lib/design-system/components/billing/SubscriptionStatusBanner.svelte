<script lang="ts">
  /**
   * SubscriptionStatusBanner
   *
   * Shows banners for scheduled subscription changes:
   * - Scheduled downgrade
   * - Scheduled cancellation
   *
   * Includes undo buttons for both scenarios.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/design-system';
  import { AlertCircle, AlertTriangle, X } from 'lucide-svelte';

  export let type: 'cancellation' | 'downgrade' = 'cancellation';
  export let currentTier: string | null = null;
  export let pendingTier: string | null = null;
  export let effectiveDate: Date | null = null;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher<{
    undo: void;
    dismiss: void;
  }>();

  function formatTierName(tier: string | null): string {
    if (!tier) return '';
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  }

  function formatDate(date: Date | null): string {
    if (!date) return 'your billing period ends';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function handleUndo() {
    dispatch('undo');
  }

  function handleDismiss() {
    dispatch('dismiss');
  }

  $: title = type === 'cancellation'
    ? 'Subscription scheduled for cancellation'
    : 'Plan change scheduled';

  $: description = type === 'cancellation'
    ? `Your subscription will end on ${formatDate(effectiveDate)}. You'll retain full access until then.`
    : `Your plan will change from ${formatTierName(currentTier)} to ${formatTierName(pendingTier)} on ${formatDate(effectiveDate)}.`;

  $: undoText = type === 'cancellation'
    ? 'Undo Cancellation'
    : 'Undo Downgrade';
</script>

<div class="banner" class:cancellation={type === 'cancellation'} class:downgrade={type === 'downgrade'}>
  <div class="banner-icon">
    {#if type === 'cancellation'}
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
      variant="outline"
      size="sm"
      on:click={handleUndo}
      disabled={isLoading}
    >
      {#if isLoading}
        Undoing...
      {:else}
        {undoText}
      {/if}
    </Button>
  </div>

  <button class="banner-dismiss" on:click={handleDismiss} aria-label="Dismiss">
    <X size={16} />
  </button>
</div>

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    position: relative;
  }

  .banner.cancellation {
    background: hsl(0 84.2% 60.2% / 0.1);
    border: 1px solid hsl(0 84.2% 60.2% / 0.3);
  }

  .banner.downgrade {
    background: hsl(38 92% 50% / 0.1);
    border: 1px solid hsl(38 92% 50% / 0.3);
  }

  .banner-icon {
    flex-shrink: 0;
    padding: var(--space-1);
  }

  .banner.cancellation .banner-icon {
    color: hsl(0 84.2% 60.2%);
  }

  .banner.downgrade .banner-icon {
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

  .banner.cancellation .banner-title {
    color: hsl(0 84.2% 40%);
  }

  .banner.downgrade .banner-title {
    color: hsl(38 92% 35%);
  }

  .banner-description {
    font-size: var(--text-sm);
    margin: 0;
    line-height: 1.5;
  }

  .banner.cancellation .banner-description {
    color: hsl(0 84.2% 50%);
  }

  .banner.downgrade .banner-description {
    color: hsl(38 92% 40%);
  }

  .banner-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  .banner.cancellation .banner-dismiss {
    color: hsl(0 84.2% 50%);
  }

  .banner.downgrade .banner-dismiss {
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
