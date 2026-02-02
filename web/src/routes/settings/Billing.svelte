<script lang="ts">
  import { onMount } from "svelte";
  import GlobalNavBar from "../../lib/design-system/components/GlobalNavBar.svelte";
  import SettingsSidebar from "../../lib/design-system/components/settings/SettingsSidebar.svelte";
  import PlanCard from "../../lib/design-system/components/PlanCard.svelte";
  import { Card, Button, Badge, Skeleton, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, toasts } from "$lib/design-system";
  import { currentOrganization } from "../../stores/organization";
  import { ArrowLeft, BadgeCheck, ExternalLink, CreditCard, Wallet, Receipt, TrendingUp, Info, CheckCircle, Sparkles, Shield, Zap, ArrowRight, Loader2 } from "lucide-svelte";

  // Plan benefits mapping
  const PlanBenefits: Record<string, string[]> = {
    FREE: ["1000 Message Trial", "Best Models", "Unlimited Knowledge Sources"],
    PRO: [
      "Start with 500 messages free",
      "Best Models",
      "Unlimited Knowledge Sources",
      "Unlimited API Access",
      "1 x Custom Agent Domain",
      "Deploy to WhatsApp, Slack, more",
      "Sell Individual Agents",
    ],
    TEAM: [
      "Everything in Pro plus:",
      "Unlimited AI HQs",
      "Team Management",
      "5 x Custom Agent Domains",
      "Sell Agent Bundles",
    ],
    BUSINESS: [
      "Everything in Team plus:",
      "Zero Data Retention (ZDR)",
      "Custom Domains for HQs",
      "Unlimited Custom Domains",
      "HIPAA Compatible (with add-on)",
      "Single-tenant compatible (with add-on)",
      "Full Encryption compatible (with add-on)",
    ],
    ENTERPRISE: [
      "Everything in Team plus:",
      "Zero Data Retention (ZDR)",
      "Custom Domains for HQs",
      "Unlimited Custom Domains",
      "HIPAA Compatible (with add-on)",
      "Single-tenant compatible (with add-on)",
      "Full Encryption compatible (with add-on)",
      "Private Cloud (VPC)",
      "Data Sovereignty",
      "Custom Subdomain",
      "White-label Platform",
    ],
  };

  // State
  let isLoadingPortal = false;
  let loadingTier: string | null = null;

  // Payment method state
  let paymentMethodStatus: { hasDefaultPaymentMethod: boolean; customerId: string | null } | null = null;
  let isLoadingPaymentStatus = true;
  let isOpeningPortal = false;
  let paymentError: string | null = null;

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

  // Plans data
  const plans = [
    {
      plan: "Pro",
      tagline: "Perfect for one person building & sharing.",
      cost: "29",
      costCaption: "/month + usage over $10",
      buttonText: "Get Started",
      subheading: "1 Editor and Unlimited Visitors",
      benefits: [
        "Start with 500 messages free",
        "Best Models",
        "Unlimited Knowledge Sources",
        "Unlimited API Access",
        "1 x Custom Agent Domain",
        "Deploy to WhatsApp, Slack, more",
        "Sell Individual Agents",
      ],
      tier: "PRO",
    },
    {
      plan: "Team",
      tagline: "Best for working with others.",
      cost: "99",
      costCaption: "/month + usage over $30",
      buttonText: "Get Started",
      subheading: "Unlimited Editors and Visitors",
      benefits: [
        "Everything in Pro plus:",
        "Unlimited AI HQs",
        "Team Management",
        "5 x Custom Agent Domains",
        "Sell Agent Bundles",
      ],
      tier: "TEAM",
      highlight: true,
      mostPopular: true,
    },
    {
      plan: "Business",
      tagline: "Keep data private - no data shared with model providers like OpenAI.",
      cost: "299",
      costCaption: "/month + usage over $100",
      buttonText: "Get Started",
      subheading: "Unlimited Editors and Visitors",
      benefits: [
        "Everything in Team plus:",
        "Zero Data Retention (ZDR)",
        "Custom Domains for HQs",
        "Unlimited Custom Domains",
        "HIPAA Compatible (with add-on)",
        "Single-tenant compatible (with add-on)",
        "Full Encryption compatible (with add-on)",
      ],
      tier: "BUSINESS",
      mostPrivate: true,
    },
  ];

  function formatPlanName(plan: string): string {
    return plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
  }

  function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  $: currentPlanBenefits = $currentOrganization
    ? PlanBenefits[$currentOrganization.subscriptionTier] || PlanBenefits.FREE
    : PlanBenefits.FREE;

  $: availableCredits = Math.abs(
    previewData?.credit_balance_cents ??
    previewData?.allowance?.remaining_cents ??
    0
  ) / 100;

  async function handleManageSubscription() {
    isLoadingPortal = true;
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
        const errorData = await response.json();
        console.error("Failed to create billing portal session:", errorData);
        toasts.error("Error", "Failed to open billing portal");
        isLoadingPortal = false;
      }
    } catch (error) {
      console.error("Error opening billing portal:", error);
      toasts.error("Error", "Failed to open billing portal");
      isLoadingPortal = false;
    }
  }

  async function handlePlanClick(tier: string) {
    if (!$currentOrganization) return;

    // Check if this would be a downgrade
    const tierOrder: Record<string, number> = {
      FREE: 0,
      PRO: 1,
      TEAM: 2,
      BUSINESS: 3,
      ENTERPRISE: 4,
    };
    const currentTierLevel = tierOrder[$currentOrganization.subscriptionTier] || 0;
    const newTierLevel = tierOrder[tier] || 0;

    if (newTierLevel < currentTierLevel) {
      if (!confirm("Are you sure you want to downgrade your plan?")) {
        return;
      }
    }

    loadingTier = tier;
    try {
      const response = await fetch(
        `/api/stripe/plans/payment-url?subscriptionTier=${tier}&subscriptionPeriod=MONTHLY&returnToUrl=${encodeURIComponent(window.location.origin + "/auth/stripelogin")}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to generate payment URL");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      console.error("Error generating payment URL:", error);
      toasts.error("Error", "Failed to generate payment URL. Please try again.");
      loadingTier = null;
    }
  }

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
    fetchAutoTopupSettings();
    fetchInvoicePreview();
  });
</script>

<svelte:head>
  <title>Billing - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <!-- Mobile back button -->
      <a href="#/settings" class="back-link">
        <ArrowLeft size={16} />
        <span>Back to Settings</span>
      </a>

      <!-- Page header -->
      <div class="page-header">
        <h1>Billing</h1>
        <p class="page-subtitle">Manage your subscription, payment methods, and credits.</p>
      </div>

      <div class="billing-sections">
        <!-- Current Plan Card -->
        <Card padding="lg" class="current-plan-card">
          <div class="plan-badge">
            <img src="/assets/ai-for-all-badge.svg" alt="AI for All" class="badge-img" />
          </div>

          <div class="plan-info">
            <p class="plan-label">
              {$currentOrganization?.name || "Your organization"} is currently on the...
            </p>
            <h2 class="plan-name">
              {formatPlanName($currentOrganization?.subscriptionTier || "FREE")} Plan
            </h2>

            <ul class="plan-benefits">
              {#each currentPlanBenefits as benefit}
                <li class="benefit-item">
                  <BadgeCheck size={16} />
                  <span>{benefit}</span>
                </li>
              {/each}
            </ul>

            {#if $currentOrganization?.subscriptionTier !== "FREE"}
              <Button
                variant="outline"
                on:click={handleManageSubscription}
                disabled={isLoadingPortal}
                class="manage-btn"
              >
                {#if isLoadingPortal}
                  Opening portal...
                {:else}
                  Manage Subscription
                  <ExternalLink size={16} />
                {/if}
              </Button>
            {/if}
          </div>
        </Card>

        <!-- Plans Section -->
        <section class="plans-section">
          <div class="section-header">
            <h2>Plans</h2>
            <p class="section-subtitle">
              You are currently on the {formatPlanName($currentOrganization?.subscriptionTier || "FREE")}. Upgrade below:
            </p>
          </div>

          <div class="plans-grid">
            {#each plans as plan}
              <PlanCard
                plan={plan.plan}
                tagline={plan.tagline}
                cost={plan.cost}
                costCaption={plan.costCaption}
                buttonText={plan.buttonText}
                subheading={plan.subheading}
                benefits={plan.benefits}
                highlight={plan.highlight}
                mostPopular={plan.mostPopular}
                mostPrivate={plan.mostPrivate}
                disabled={$currentOrganization?.subscriptionTier === plan.tier}
                isLoading={loadingTier === plan.tier}
                on:click={() => handlePlanClick(plan.tier)}
              />
            {/each}
          </div>
        </section>

        <!-- Payment Method Section -->
        <section class="billing-section">
          <div class="section-header">
            <h2>Payment Method</h2>
            <p class="section-subtitle">Manage your default payment method for automatic charges and top-ups</p>
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
        </section>

        <!-- Auto Top-up Section -->
        <section class="billing-section">
          <div class="section-header">
            <h2>Auto Top-up</h2>
            <p class="section-subtitle">Automatically add credits when your balance runs low</p>
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
        </section>

        <!-- Credits & Usage Section -->
        <section class="billing-section">
          <div class="section-header">
            <h2>Credits & Usage</h2>
            <p class="section-subtitle">Monitor your usage and add credits to your account</p>
          </div>

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

                {#if !paymentMethodStatus?.hasDefaultPaymentMethod}
                  <Button variant="outline" on:click={openBillingPortal}>
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
        </section>
      </div>
    </div>
  </div>
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
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 64px;
  }

  .settings-main {
    flex: 1;
    overflow-y: auto;
  }

  .settings-content {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .back-link {
    display: none;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    transition: color 0.2s;
  }

  .back-link:hover {
    color: hsl(var(--foreground));
  }

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-header h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
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
    gap: var(--space-12);
  }

  /* Current Plan Card */
  .current-plan-card :global(.card) {
    position: relative;
    overflow: visible;
  }

  .plan-badge {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    transform: rotate(12deg);
  }

  .badge-img {
    width: 80px;
    height: auto;
  }

  .plan-info {
    max-width: 70%;
  }

  .plan-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .plan-name {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4) 0;
  }

  .plan-benefits {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-4) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .benefit-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
  }

  .benefit-item :global(svg) {
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .manage-btn :global(svg) {
    margin-left: var(--space-2);
  }

  /* Section Header */
  .section-header {
    margin-bottom: var(--space-6);
  }

  .section-header h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1) 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  /* Plans Grid */
  .plans-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6);
    margin-top: var(--space-8);
  }

  /* Billing Section */
  .billing-section {
    display: flex;
    flex-direction: column;
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
  @media (min-width: 769px) {
    .settings-layout {
      padding-left: 256px;
    }
  }

  @media (max-width: 1024px) {
    .plans-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .back-link {
      display: flex;
    }

    .settings-content {
      padding: var(--space-4);
    }

    .plan-info {
      max-width: 100%;
    }

    .plan-badge {
      display: none;
    }

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
