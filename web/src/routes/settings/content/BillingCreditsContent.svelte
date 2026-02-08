<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Skeleton, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { Wallet, Receipt, TrendingUp, Info, CheckCircle, Sparkles, Shield, Zap, ArrowRight, Loader2, CreditCard, ExternalLink } from "lucide-svelte";

  // Payment method state
  let paymentMethodStatus: { hasDefaultPaymentMethod: boolean; customerId: string | null } | null = null;
  let isLoadingPaymentStatus = true;
  let isOpeningPortal = false;

  // Credits & usage state
  let isLoadingPreview = true;
  let previewData: any = null;
  let previewError: string | null = null;

  // Top-up modal state
  let confirmTopupOpen = false;
  let topupAmount = 2000;
  let toppingUp = false;
  let topupSuccess = false;
  let showDetailModal = false;

  const QUICK_AMOUNTS = [1000, 2000, 5000, 10000]; // $10, $20, $50, $100

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  $: availableCredits = Math.abs(
    previewData?.credit_balance_cents ??
    previewData?.allowance?.remaining_cents ??
    0
  ) / 100;

  async function fetchPaymentMethodStatus() {
    isLoadingPaymentStatus = true;
    try {
      const res = await fetch("/api/organization/payment-method-status", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load payment method status");
      }
      const data = await res.json();
      paymentMethodStatus = {
        hasDefaultPaymentMethod: data.has_default_payment_method,
        customerId: data.customerId,
      };
    } catch (e: any) {
      captureException(e, {
        tags: { feature: "settings-billing-credits" },
        extra: { action: "fetchPaymentMethodStatus" },
      });
    } finally {
      isLoadingPaymentStatus = false;
    }
  }

  async function openBillingPortal() {
    isOpeningPortal = true;
    try {
      const response = await fetch("/api/organization/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      if (response.ok) {
        const { url } = await response.json();
        window.location.href = url;
      } else {
        toasts.error("Error", "Failed to open billing portal");
        isOpeningPortal = false;
      }
    } catch (e: any) {
      toasts.error("Error", "Failed to open billing portal");
      isOpeningPortal = false;
    }
  }

  async function fetchInvoicePreview() {
    isLoadingPreview = true;
    previewError = null;
    try {
      const res = await fetch("/api/organization/invoice-preview", {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to load preview");
      }
      previewData = await res.json();
    } catch (e: any) {
      previewError = e?.message || "Failed to load preview";
    } finally {
      isLoadingPreview = false;
    }
  }

  async function handleTopup() {
    toppingUp = true;
    topupSuccess = false;
    try {
      const res = await fetch("/api/organization/billing-topups/topup-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount_cents: topupAmount,
          upsellSource: "MANUAL_TOPUP",
        }),
      });
      if (res.status === 409) {
        toasts.error("Error", "No default payment method is set. Please add one in the billing portal.");
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toasts.error("Error", err?.error || "Payment failed");
      } else {
        topupSuccess = true;
        await fetchInvoicePreview();
        setTimeout(() => {
          confirmTopupOpen = false;
          topupSuccess = false;
        }, 2000);
      }
    } finally {
      toppingUp = false;
    }
  }

  onMount(() => {
    fetchPaymentMethodStatus();
    fetchInvoicePreview();
  });
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Credits</h1>
  <p class="page-subtitle">Monitor your usage and add credits to your account</p>
</div>

<div class="billing-sections">
  {#if isLoadingPreview && !previewData}
    <Card padding="lg">
      <div class="skeleton-container">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-16 w-full mt-4" />
      </div>
    </Card>
  {:else}
    <!-- Credit Balance Card -->
    <Card padding="none" class="credits-card">
      <div class="credits-header">
        <div class="credits-info">
          <div class="credits-icon">
            <Wallet size={24} />
          </div>
          <div>
            <p class="credits-label">Available credits</p>
            <p class="credits-amount">${availableCredits.toFixed(2)}</p>
            <button class="breakdown-link" on:click={() => showDetailModal = true}>
              <Info size={14} />
              View breakdown
            </button>
          </div>
        </div>

        {#if isLoadingPaymentStatus}
          <Skeleton class="h-10 w-32" />
        {:else if !paymentMethodStatus?.hasDefaultPaymentMethod}
          <Button variant="outline" on:click={openBillingPortal} disabled={isOpeningPortal}>
            <CreditCard size={16} />
            Add payment method
          </Button>
        {:else}
          <Button on:click={() => confirmTopupOpen = true}>
            <Sparkles size={16} />
            Add credits
          </Button>
        {/if}
      </div>

      {#if previewData && !isLoadingPreview}
        <div class="credits-stats">
          <div class="stat-item">
            <p class="stat-label">This period's usage</p>
            <p class="stat-value">{formatCurrency(previewData.metrics?.metered_subtotal_cents || 0)}</p>
          </div>
          <div class="stat-item">
            <p class="stat-label">Credits applied</p>
            <p class="stat-value success">-{formatCurrency(previewData.metrics?.credits_applied_cents || 0)}</p>
          </div>
          <div class="stat-item">
            <p class="stat-label">Amount due</p>
            <p class="stat-value" class:warning={(previewData.metrics?.overage_cents || 0) > 0}>
              {formatCurrency(previewData.metrics?.overage_cents || 0)}
            </p>
          </div>
        </div>
      {/if}
    </Card>

    {#if previewError}
      <Card padding="lg" class="error-card">
        <p>{previewError}</p>
      </Card>
    {/if}

    <!-- Usage Line Items -->
    {#if !isLoadingPreview && previewData}
      <Card padding="lg" class="usage-card">
        <div class="usage-header">
          <Receipt size={20} />
          <h3>Usage this billing period</h3>
        </div>

        <div class="usage-items">
          {#if previewData.lines?.filter((li: any) => li.parent_type !== "license_fee_subscription_details").length === 0}
            <div class="empty-usage">
              <TrendingUp size={40} />
              <p>No usage recorded yet this period</p>
              <p class="empty-hint">Usage will appear here as your apps process requests</p>
            </div>
          {:else}
            {#each previewData.lines.filter((li: any) => li.parent_type !== "license_fee_subscription_details") as li}
              <div class="usage-item">
                <div class="usage-info">
                  <p class="usage-description">{li.description || "Usage item"}</p>
                  <div class="usage-meta">
                    {#if li.quantity != null}
                      <span class="usage-quantity">{li.quantity.toLocaleString()} units</span>
                    {/if}
                    {#if li.parent_type === "rate_card_subscription_details"}
                      <span class="usage-badge">Metered</span>
                    {/if}
                  </div>
                </div>
                <div class="usage-amount">
                  <p class="amount">{li.amount != null ? formatCurrency(li.amount) : "-"}</p>
                  {#if li.amount === 0 && li.credits_applied_cents > 0}
                    <p class="covered">
                      <CheckCircle size={12} />
                      Covered by credits
                    </p>
                  {/if}
                </div>
              </div>
            {/each}
            <p class="usage-note">Usage is billed at the end of each billing period. Credits are applied automatically.</p>
          {/if}
        </div>

        {#if previewData.hosted_invoice_url}
          <a href={previewData.hosted_invoice_url} target="_blank" rel="noreferrer" class="invoice-link">
            <ExternalLink size={14} />
            View full invoice on Stripe
          </a>
        {/if}
      </Card>
    {/if}
  {/if}
</div>

<!-- Add Credits Modal -->
<Dialog open={confirmTopupOpen} onClose={() => confirmTopupOpen = false}>
  {#if topupSuccess}
    <div class="modal-success">
      <div class="success-icon">
        <CheckCircle size={32} />
      </div>
      <DialogTitle>Credits added successfully!</DialogTitle>
      <p>${(topupAmount / 100).toFixed(2)} has been added to your account</p>
    </div>
  {:else}
    <DialogHeader>
      <div class="modal-header-content">
        <div class="modal-icon">
          <Sparkles size={20} />
        </div>
        <DialogTitle>Add credits to your account</DialogTitle>
      </div>
      <DialogDescription>
        Credits are used to pay for AI usage across all your apps. They never expire and roll over each month.
      </DialogDescription>
    </DialogHeader>

    <div class="modal-content">
      <div class="amount-selection">
        <label class="selection-label">Select amount</label>
        <div class="quick-amounts">
          {#each QUICK_AMOUNTS as amount}
            <button
              class="quick-amount"
              class:selected={topupAmount === amount}
              on:click={() => topupAmount = amount}
            >
              ${amount / 100}
            </button>
          {/each}
        </div>
        <div class="custom-amount">
          <span>$</span>
          <input
            type="number"
            value={topupAmount / 100}
            on:input={(e) => topupAmount = Math.max(1, Math.round(Number(e.currentTarget.value) * 100))}
            min="1"
          />
          <span class="custom-label">Custom amount</span>
        </div>
      </div>

      <div class="modal-how-works">
        <p class="how-title">How it works</p>
        <div class="steps">
          <div class="step">
            <div class="step-number">1</div>
            <p>Your saved payment method will be charged <strong>${(topupAmount / 100).toFixed(2)}</strong></p>
          </div>
          <div class="step">
            <div class="step-number">2</div>
            <p>Credits are added to your account <strong>instantly</strong></p>
          </div>
          <div class="step">
            <div class="step-number">3</div>
            <p>Credits are automatically applied to your usage each billing period</p>
          </div>
        </div>
      </div>

      <div class="trust-indicators">
        <div class="indicator">
          <Shield size={14} />
          <span>Secure payment</span>
        </div>
        <div class="indicator">
          <Zap size={14} />
          <span>Instant delivery</span>
        </div>
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" on:click={() => confirmTopupOpen = false} disabled={toppingUp}>
        Cancel
      </Button>
      <Button on:click={handleTopup} disabled={toppingUp || topupAmount < 100}>
        {#if toppingUp}
          <Loader2 size={16} class="animate-spin" />
          Processing...
        {:else}
          Add ${(topupAmount / 100).toFixed(2)}
          <ArrowRight size={16} />
        {/if}
      </Button>
    </DialogFooter>
  {/if}
</Dialog>

<!-- Credit Details Modal -->
<Dialog open={showDetailModal} onClose={() => showDetailModal = false}>
  <DialogHeader>
    <div class="modal-header-content">
      <div class="modal-icon">
        <Wallet size={20} />
      </div>
      <DialogTitle>Credit balance details</DialogTitle>
    </div>
    <DialogDescription>Here's how your credits break down</DialogDescription>
  </DialogHeader>

  {#if previewData}
    <div class="detail-modal-content">
      <div class="total-available">
        <div class="total-info">
          <p class="total-label">Total available credits</p>
          <p class="total-sublabel">Subscription allowance + top-up credits</p>
        </div>
        <p class="total-amount">${availableCredits.toFixed(2)}</p>
      </div>

      <div class="breakdown-cards">
        <div class="breakdown-card">
          <div class="card-header">
            <TrendingUp size={16} />
            <p>This billing period</p>
          </div>
          <div class="card-rows">
            <div class="card-row">
              <span>Monthly allowance from plan</span>
              <span class="value">{formatCurrency(previewData.allowance?.amount_cents || 0)}</span>
            </div>
            <div class="card-row">
              <span>Applied to usage</span>
              <span class="value">-{formatCurrency(previewData.allowance?.used_cents || 0)}</span>
            </div>
            <div class="card-row total">
              <span>Remaining this period</span>
              <span class="value">{formatCurrency(previewData.allowance?.remaining_cents || 0)}</span>
            </div>
          </div>
        </div>

        <div class="breakdown-card">
          <div class="card-header">
            <Receipt size={16} />
            <p>Usage summary</p>
          </div>
          <div class="card-rows">
            <div class="card-row">
              <span>Total metered usage</span>
              <span class="value">{formatCurrency(previewData.metrics?.metered_subtotal_cents || 0)}</span>
            </div>
            <div class="card-row">
              <span>Credits applied</span>
              <span class="value success">-{formatCurrency(previewData.metrics?.credits_applied_cents || 0)}</span>
            </div>
            {#if (previewData.metrics?.overage_cents || 0) > 0}
              <div class="card-row total warning">
                <span>Amount due (overage)</span>
                <span class="value">{formatCurrency(previewData.metrics?.overage_cents || 0)}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="detail-note">
        <Info size={16} />
        <p>Subscription allowance resets each billing period. Top-up credits never expire and automatically roll over to the next period.</p>
      </div>

      <Button variant="outline" class="w-full" on:click={() => showDetailModal = false}>
        Close
      </Button>
    </div>
  {/if}
</Dialog>

<style>
  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-header h1 {
    font-size: var(--text-3xl);
    font-family: var(--font-serif);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .page-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .billing-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .skeleton-container {
    display: flex;
    flex-direction: column;
  }

  /* Credits Card */
  .credits-card :global(.card) {
    overflow: hidden;
  }

  .credits-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-8);
    background: linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%);
  }

  .credits-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .credits-icon {
    padding: var(--space-3);
    background: hsl(var(--primary) / 0.1);
    border-radius: var(--radius-lg);
    color: hsl(var(--primary));
  }

  .credits-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .credits-amount {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 700;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .breakdown-link {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: hsl(var(--primary));
    background: none;
    border: none;
    padding: 0;
    margin-top: var(--space-2);
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .breakdown-link:hover {
    opacity: 0.8;
  }

  .credits-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid hsl(var(--border));
  }

  .stat-item {
    padding: var(--space-4) var(--space-5);
    border-right: 1px solid hsl(var(--border));
  }

  .stat-item:last-child {
    border-right: none;
  }

  .stat-label {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .stat-value {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .stat-value.success {
    color: hsl(142.1 76.2% 36.3%);
  }

  .stat-value.warning {
    color: hsl(24.6 95% 53.1%);
  }

  /* Usage Card */
  .usage-card {
    margin-top: var(--space-4);
  }

  .usage-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .usage-header h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .usage-items {
    max-height: 320px;
    overflow-y: auto;
  }

  .empty-usage {
    text-align: center;
    padding: var(--space-8);
    color: hsl(var(--muted-foreground));
  }

  .empty-usage :global(svg) {
    opacity: 0.5;
    margin-bottom: var(--space-3);
  }

  .empty-usage p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .empty-hint {
    font-size: var(--text-xs) !important;
    opacity: 0.75;
    margin-top: var(--space-1) !important;
  }

  .usage-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .usage-item:last-of-type {
    border-bottom: none;
  }

  .usage-info {
    flex: 1;
    min-width: 0;
    padding-right: var(--space-4);
  }

  .usage-description {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .usage-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .usage-quantity {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .usage-badge {
    font-size: var(--text-xs);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    padding: 2px 8px;
    border-radius: 999px;
  }

  .usage-amount {
    text-align: right;
  }

  .usage-amount .amount {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .usage-amount .covered {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: hsl(142.1 76.2% 36.3%);
    margin: var(--space-1) 0 0 0;
  }

  .usage-note {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-4) 0 0 0;
    padding-top: var(--space-2);
  }

  .invoice-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-sm);
    color: hsl(var(--primary));
    text-decoration: none;
    margin-top: var(--space-4);
    transition: opacity 0.2s;
  }

  .invoice-link:hover {
    opacity: 0.8;
  }

  /* Modal Styles */
  .modal-success {
    padding: var(--space-8);
    text-align: center;
  }

  .success-icon {
    width: 64px;
    height: 64px;
    background: hsl(142.1 76.2% 36.3% / 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--space-4);
    color: hsl(142.1 76.2% 36.3%);
  }

  .modal-header-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .modal-icon {
    padding: var(--space-2);
    background: hsl(var(--primary) / 0.1);
    border-radius: var(--radius);
    color: hsl(var(--primary));
  }

  .modal-content {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .amount-selection {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .selection-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .quick-amounts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }

  .quick-amount {
    padding: var(--space-2-5) var(--space-3);
    border-radius: var(--radius);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quick-amount:hover {
    background: hsl(var(--muted) / 0.8);
  }

  .quick-amount.selected {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 0 4px hsl(var(--background));
  }

  .custom-amount {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .custom-amount input {
    width: 80px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
  }

  .custom-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .modal-how-works {
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .how-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-2-5);
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .step-number {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .step p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .trust-indicators {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
  }

  .indicator {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Detail Modal */
  .detail-modal-content {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .total-available {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: hsl(142.1 76.2% 36.3% / 0.1);
    border: 1px solid hsl(142.1 76.2% 36.3% / 0.3);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
  }

  .total-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(142.1 76.2% 36.3%);
    margin: 0;
  }

  .total-sublabel {
    font-size: var(--text-xs);
    color: hsl(142.1 76.2% 36.3% / 0.8);
    margin: var(--space-0-5) 0 0 0;
  }

  .total-amount {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 700;
    color: hsl(142.1 70% 35%);
    margin: 0;
  }

  .breakdown-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .breakdown-card {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    color: hsl(var(--muted-foreground));
  }

  .card-header p {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .card-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .card-row .value {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .card-row .value.success {
    color: hsl(142.1 76.2% 36.3%);
  }

  .card-row.total {
    border-top: 1px solid hsl(var(--border));
    padding-top: var(--space-2);
    margin-top: var(--space-2);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .card-row.warning {
    color: hsl(24.6 95% 53.1%);
  }

  .card-row.warning .value {
    color: hsl(24.6 95% 53.1%);
  }

  .detail-note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius);
    padding: var(--space-3);
  }

  .detail-note :global(svg) {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
    margin-top: 2px;
  }

  .detail-note p {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .credits-header {
      flex-direction: column;
      align-items: flex-start;
      padding: var(--space-4);
    }

    .credits-stats {
      grid-template-columns: 1fr;
    }

    .stat-item {
      border-right: none;
      border-bottom: 1px solid hsl(var(--border));
    }

    .stat-item:last-child {
      border-bottom: none;
    }

    .quick-amounts {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Animation */
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
