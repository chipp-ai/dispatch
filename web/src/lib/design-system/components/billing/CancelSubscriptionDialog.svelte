<script lang="ts">
  /**
   * CancelSubscriptionDialog
   *
   * Confirmation dialog shown when a user attempts to cancel their subscription.
   * Shows what will happen and when access will end.
   */
  import { createEventDispatcher } from 'svelte';
  import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '$lib/design-system';
  import { AlertCircle, Calendar } from 'lucide-svelte';

  export let open: boolean = false;
  export let currentTier: string = 'PRO';
  export let billingPeriodEnd: Date | null = null;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: void;
  }>();

  function formatTierName(tier: string): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  }

  function formatDate(date: Date | null): string {
    if (!date) return 'the end of your billing period';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function handleClose() {
    if (!isLoading) {
      dispatch('close');
    }
  }

  function handleConfirm() {
    dispatch('confirm');
  }
</script>

<Dialog {open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
  <DialogHeader>
    <div class="dialog-header-content">
      <div class="dialog-icon destructive">
        <AlertCircle size={20} />
      </div>
      <DialogTitle>Cancel Subscription</DialogTitle>
    </div>
    <DialogDescription>
      Are you sure you want to cancel your <strong>{formatTierName(currentTier)}</strong> subscription?
    </DialogDescription>
  </DialogHeader>

  <div class="dialog-body">
    <div class="info-card">
      <div class="info-row">
        <Calendar size={16} />
        <div>
          <p class="info-label">Your access continues until</p>
          <p class="info-value">{formatDate(billingPeriodEnd)}</p>
        </div>
      </div>
    </div>

    <div class="consequences">
      <p class="consequences-title">After cancellation:</p>
      <ul class="consequences-list">
        <li>Your subscription will not renew</li>
        <li>You'll be moved to the Free plan</li>
        <li>Some features may become unavailable</li>
        <li>Your data will be preserved</li>
      </ul>
    </div>

    <div class="reassurance">
      <p>You can undo this cancellation anytime before {formatDate(billingPeriodEnd)}.</p>
    </div>
  </div>

  <DialogFooter>
    <Button variant="outline" on:click={handleClose} disabled={isLoading}>
      Keep Subscription
    </Button>
    <Button variant="destructive" on:click={handleConfirm} disabled={isLoading}>
      {#if isLoading}
        Canceling...
      {:else}
        Cancel Subscription
      {/if}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .dialog-header-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .dialog-icon {
    padding: var(--space-2);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog-icon.destructive {
    background: hsl(0 84.2% 60.2% / 0.1);
    color: hsl(0 84.2% 60.2%);
  }

  .dialog-body {
    padding: var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .info-card {
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .info-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .info-row :global(svg) {
    color: hsl(var(--muted-foreground));
    margin-top: 2px;
    flex-shrink: 0;
  }

  .info-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-1) 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-value {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .consequences {
    padding: 0 var(--space-2);
  }

  .consequences-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .consequences-list {
    margin: 0;
    padding-left: var(--space-4);
    list-style: disc;
  }

  .consequences-list li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
  }

  .reassurance {
    background: hsl(142.1 76.2% 36.3% / 0.1);
    border: 1px solid hsl(142.1 76.2% 36.3% / 0.3);
    border-radius: var(--radius);
    padding: var(--space-3);
  }

  .reassurance p {
    font-size: var(--text-sm);
    color: hsl(142.1 70% 35%);
    margin: 0;
  }
</style>
