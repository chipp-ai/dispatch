<script lang="ts">
  /**
   * DowngradeDialog
   *
   * Confirmation dialog shown when a user attempts to downgrade their subscription.
   * Shows the tier comparison and explains that the current plan will remain active
   * until the billing period ends.
   */
  import { createEventDispatcher } from 'svelte';
  import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '$lib/design-system';
  import { AlertTriangle } from 'lucide-svelte';

  export let open: boolean = false;
  export let currentTier: string = 'TEAM';
  export let targetTier: string = 'PRO';
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher<{
    close: void;
    confirm: void;
  }>();

  function formatTierName(tier: string): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
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
      <div class="dialog-icon warning">
        <AlertTriangle size={20} />
      </div>
      <DialogTitle>Downgrade Plan</DialogTitle>
    </div>
    <DialogDescription>
      Are you sure you want to downgrade from <strong>{formatTierName(currentTier)}</strong> to <strong>{formatTierName(targetTier)}</strong>?
    </DialogDescription>
  </DialogHeader>

  <div class="dialog-body">
    <div class="info-card">
      <p class="info-text">
        Your <strong>{formatTierName(currentTier)}</strong> plan will remain active until the end of your current billing period. After that, you'll be moved to the <strong>{formatTierName(targetTier)}</strong> plan.
      </p>
    </div>

    <div class="warning-note">
      <AlertTriangle size={14} />
      <p>Some features may become unavailable after the downgrade takes effect.</p>
    </div>
  </div>

  <DialogFooter>
    <Button variant="outline" on:click={handleClose} disabled={isLoading}>
      Keep Current Plan
    </Button>
    <Button variant="destructive" on:click={handleConfirm} disabled={isLoading}>
      {#if isLoading}
        Scheduling...
      {:else}
        Schedule Downgrade
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

  .dialog-icon.warning {
    background: hsl(38 92% 50% / 0.1);
    color: hsl(38 92% 50%);
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

  .info-text {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    line-height: 1.6;
    margin: 0;
  }

  .info-text :global(strong) {
    font-weight: var(--font-semibold);
  }

  .warning-note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(38 92% 50%);
  }

  .warning-note :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .warning-note p {
    margin: 0;
  }
</style>
