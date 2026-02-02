<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Badge, Skeleton, toasts } from "$lib/design-system";
  import { CreditCard, ExternalLink, CheckCircle, Loader2 } from "lucide-svelte";

  // Payment method state
  let paymentMethodStatus: { hasDefaultPaymentMethod: boolean; customerId: string | null } | null = null;
  let isLoadingPaymentStatus = true;
  let isOpeningPortal = false;
  let paymentError: string | null = null;

  async function fetchPaymentMethodStatus() {
    isLoadingPaymentStatus = true;
    paymentError = null;
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
      paymentError = e.message || "Failed to load payment method";
    } finally {
      isLoadingPaymentStatus = false;
    }
  }

  async function openBillingPortal() {
    isOpeningPortal = true;
    paymentError = null;
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
        const err = await response.json().catch(() => ({}));
        paymentError = err?.portalSetupRequired
          ? "Please configure the Stripe Customer Portal in your sandbox first."
          : err?.details || "Failed to open billing portal";
        isOpeningPortal = false;
      }
    } catch (e: any) {
      paymentError = "Failed to open billing portal";
      isOpeningPortal = false;
    }
  }

  onMount(() => {
    fetchPaymentMethodStatus();
  });
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Payment</h1>
  <p class="page-subtitle">Manage your default payment method for automatic charges and top-ups</p>
</div>

<Card padding="lg">
  {#if isLoadingPaymentStatus}
    <div class="skeleton-container">
      <Skeleton class="h-6 w-48" />
      <Skeleton class="h-4 w-full mt-2" />
      <Skeleton class="h-10 w-40 mt-4" />
    </div>
  {:else}
    <div class="payment-status">
      <div class="status-info">
        <div class="status-header">
          <CreditCard size={20} class="text-muted" />
          <h3>Default Payment Method</h3>
        </div>
        <p class="status-description">
          {#if paymentMethodStatus?.hasDefaultPaymentMethod}
            You have a payment method configured. Automatic charges for top-ups and overages will use this payment method.
          {:else}
            No payment method configured. Add a payment method to enable automatic top-ups and seamless billing when you exceed your monthly allowance.
          {/if}
        </p>

        {#if paymentMethodStatus?.hasDefaultPaymentMethod}
          <Badge variant="default" class="success-badge">
            <CheckCircle size={12} />
            Payment Method Configured
          </Badge>
        {:else}
          <Badge variant="outline">No Payment Method</Badge>
        {/if}
      </div>
    </div>

    <div class="payment-actions">
      <Button on:click={openBillingPortal} disabled={isOpeningPortal}>
        {#if isOpeningPortal}
          <Loader2 size={16} class="animate-spin" />
          Opening portal...
        {:else}
          <CreditCard size={16} />
          {paymentMethodStatus?.hasDefaultPaymentMethod ? "Update Payment Method" : "Add Payment Method"}
          <ExternalLink size={14} />
        {/if}
      </Button>
    </div>

    {#if paymentError}
      <div class="error-box">
        <p>{paymentError}</p>
      </div>
    {/if}

    <div class="info-box">
      <p class="info-title">Why add a payment method?</p>
      <ul class="info-list">
        <li><strong>Manual Top-ups:</strong> Purchase additional credits on-demand when you need them</li>
        <li><strong>Automatic Top-ups:</strong> Set up automatic credit purchases when your balance runs low</li>
        <li><strong>Overage Protection:</strong> Continue using AI features seamlessly when you exceed your monthly allowance</li>
        <li><strong>Secure:</strong> Your payment information is stored securely by Stripe and never shared with us</li>
      </ul>
    </div>
  {/if}
</Card>

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

  .skeleton-container {
    display: flex;
    flex-direction: column;
  }

  /* Payment Status */
  .payment-status {
    margin-bottom: var(--space-6);
  }

  .status-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .status-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .status-header h3 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .status-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .success-badge :global(.badge) {
    background: hsl(142.1 76.2% 36.3%);
    color: white;
  }

  .payment-actions {
    display: flex;
    gap: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    margin-bottom: var(--space-6);
  }

  .error-box {
    background: hsl(0 84.2% 60.2% / 0.1);
    border: 1px solid hsl(0 84.2% 60.2% / 0.3);
    border-radius: var(--radius);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .error-box p {
    font-size: var(--text-sm);
    color: hsl(0 84.2% 60.2%);
    margin: 0;
  }

  .info-box {
    background: hsl(221.2 83.2% 53.3% / 0.1);
    border: 1px solid hsl(221.2 83.2% 53.3% / 0.3);
    border-radius: var(--radius);
    padding: var(--space-4);
  }

  .info-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(221.2 83.2% 53.3%);
    margin: 0 0 var(--space-2) 0;
  }

  .info-list {
    list-style: disc;
    padding-left: var(--space-4);
    margin: 0;
  }

  .info-list li {
    font-size: var(--text-sm);
    color: hsl(221.2 83.2% 53.3%);
    margin-bottom: var(--space-1);
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
