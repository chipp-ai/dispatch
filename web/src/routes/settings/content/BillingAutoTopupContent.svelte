<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Button, Skeleton } from "$lib/design-system";
  import { ExternalLink } from "lucide-svelte";

  // Payment method state (needed for auto-topup validation)
  let paymentMethodStatus: { hasDefaultPaymentMethod: boolean; customerId: string | null } | null = null;
  let isLoadingPaymentStatus = true;
  let isOpeningPortal = false;

  // Auto-topup state
  let autoTopupSettings = {
    enabled: false,
    amount_cents: 2000,
    threshold_percent: 20,
  };
  let isLoadingTopupSettings = true;
  let isSavingTopup = false;
  let topupSuccessMessage: string | null = null;
  let topupError: string | null = null;

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
      // Silent fail - we'll show the settings anyway
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
        isOpeningPortal = false;
      }
    } catch (e: any) {
      isOpeningPortal = false;
    }
  }

  async function fetchAutoTopupSettings() {
    isLoadingTopupSettings = true;
    topupError = null;
    try {
      const res = await fetch("/api/organization/billing-topups", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load auto-topup settings");
      }
      const data = await res.json();
      autoTopupSettings = data.settings;
      if (paymentMethodStatus) {
        paymentMethodStatus.hasDefaultPaymentMethod = data.has_default_payment_method;
      }
    } catch (e: any) {
      topupError = e.message || "Failed to load settings";
    } finally {
      isLoadingTopupSettings = false;
    }
  }

  async function saveAutoTopupSettings() {
    isSavingTopup = true;
    topupError = null;
    topupSuccessMessage = null;

    try {
      const res = await fetch("/api/organization/billing-topups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(autoTopupSettings),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      const data = await res.json();
      autoTopupSettings = data.settings;
      topupSuccessMessage = "Auto-topup settings saved successfully";
      setTimeout(() => (topupSuccessMessage = null), 3000);
    } catch (e: any) {
      topupError = e.message || "Failed to save settings";
    } finally {
      isSavingTopup = false;
    }
  }

  onMount(() => {
    fetchPaymentMethodStatus();
    fetchAutoTopupSettings();
  });
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Auto Top-up</h1>
  <p class="page-subtitle">Automatically add credits when your balance runs low</p>
</div>

<Card padding="lg">
  {#if isLoadingTopupSettings}
    <div class="skeleton-container">
      <Skeleton class="h-6 w-48" />
      <Skeleton class="h-4 w-full mt-2" />
      <Skeleton class="h-10 w-40 mt-4" />
    </div>
  {:else}
    {#if !paymentMethodStatus?.hasDefaultPaymentMethod}
      <div class="warning-box">
        <p><strong>No default payment method set.</strong> You must add a payment method before enabling auto-topup.</p>
        <Button variant="outline" size="sm" on:click={openBillingPortal}>Add Payment Method</Button>
      </div>
    {/if}

    <div class="topup-toggle">
      <div class="toggle-info">
        <label class="toggle-label">Enable Auto Top-up</label>
        <p class="toggle-description">Automatically charge your payment method when credits run low</p>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          bind:checked={autoTopupSettings.enabled}
          disabled={!paymentMethodStatus?.hasDefaultPaymentMethod}
        />
        <span class="slider"></span>
      </label>
    </div>

    <div class="topup-field">
      <label class="field-label">Top-up Amount</label>
      <p class="field-description">How much to charge when auto-topup triggers</p>
      <div class="amount-input">
        <span class="currency">$</span>
        <input
          type="number"
          bind:value={autoTopupSettings.amount_cents}
          on:input={(e) => autoTopupSettings.amount_cents = Math.max(100, Math.round(Number(e.currentTarget.value) * 100))}
          min="1"
          step="1"
          class="number-input"
        />
        <span class="currency-label">USD</span>
      </div>
    </div>

    <div class="topup-field">
      <label class="field-label">Trigger Threshold</label>
      <p class="field-description">Auto-topup when your balance drops to this percentage of your monthly allowance</p>
      <div class="threshold-input">
        <input
          type="number"
          bind:value={autoTopupSettings.threshold_percent}
          on:input={(e) => autoTopupSettings.threshold_percent = Math.max(0, Math.min(100, Math.round(Number(e.currentTarget.value))))}
          min="0"
          max="100"
          step="5"
          class="number-input"
        />
        <span class="threshold-label">% of allowance remaining</span>
      </div>
      <p class="field-hint">
        Example: If you have a $100 monthly allowance and set this to 20%, auto-topup will trigger when you have $20 in credits remaining.
      </p>
    </div>

    {#if topupError}
      <div class="error-box">
        <p>{topupError}</p>
      </div>
    {/if}

    {#if topupSuccessMessage}
      <div class="success-box">
        <p>{topupSuccessMessage}</p>
      </div>
    {/if}

    <div class="topup-actions">
      <Button on:click={saveAutoTopupSettings} disabled={isSavingTopup}>
        {isSavingTopup ? "Saving..." : "Save Settings"}
      </Button>
    </div>

    <div class="how-it-works">
      <p class="how-title">How Auto Top-up Works</p>
      <ol class="how-list">
        <li>Stripe monitors your credit balance in real-time</li>
        <li>When your balance drops to the threshold ({autoTopupSettings.threshold_percent}%), Stripe triggers an alert</li>
        <li>Your payment method is automatically charged ${(autoTopupSettings.amount_cents / 100).toFixed(2)}</li>
        <li>Credits are immediately added to your account</li>
      </ol>
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

  .warning-box {
    background: hsl(47.9 95.8% 53.1% / 0.1);
    border: 1px solid hsl(47.9 95.8% 53.1% / 0.3);
    border-radius: var(--radius);
    padding: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .warning-box p {
    font-size: var(--text-sm);
    color: hsl(47.9 95.8% 53.1%);
    margin: 0 0 var(--space-2) 0;
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

  .success-box {
    background: hsl(142.1 76.2% 36.3% / 0.1);
    border: 1px solid hsl(142.1 76.2% 36.3% / 0.3);
    border-radius: var(--radius);
    padding: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .success-box p {
    font-size: var(--text-sm);
    color: hsl(142.1 76.2% 36.3%);
    margin: 0;
  }

  /* Toggle Switch */
  .topup-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-6);
    border-bottom: 1px solid hsl(var(--border));
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .toggle-label {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .toggle-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: hsl(var(--border));
    transition: 0.3s;
    border-radius: 24px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: hsl(221.2 83.2% 53.3%);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }

  input:disabled + .slider {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Topup Fields */
  .topup-field {
    margin-bottom: var(--space-6);
  }

  .field-label {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    display: block;
    margin-bottom: var(--space-1);
  }

  .field-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-2) 0 0 0;
  }

  .amount-input,
  .threshold-input {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .currency,
  .currency-label,
  .threshold-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .number-input {
    width: 120px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
  }

  .topup-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    margin-bottom: var(--space-6);
  }

  .how-it-works {
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius);
    padding: var(--space-4);
  }

  .how-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .how-list {
    list-style: decimal;
    padding-left: var(--space-4);
    margin: 0;
  }

  .how-list li {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
  }
</style>
