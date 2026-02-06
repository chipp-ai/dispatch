<script lang="ts">
  import { onMount } from "svelte";
  import PlanCard from "../../../lib/design-system/components/PlanCard.svelte";
  import { Card, Button, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { currentOrganization, fetchOrganization } from "../../../stores/organization";
  import { BadgeCheck, ExternalLink } from "lucide-svelte";
  import {
    DowngradeDialog,
    CancelSubscriptionDialog,
    SubscriptionStatusBanner,
  } from "../../../lib/design-system/components/billing";

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

  // Tier ordering for comparison
  const tierOrder: Record<string, number> = {
    FREE: 0,
    PRO: 1,
    TEAM: 2,
    BUSINESS: 3,
    ENTERPRISE: 4,
  };

  // State
  let isLoadingPortal = false;
  let loadingTier: string | null = null;

  // Subscription status state
  let subscriptionStatus: {
    currentTier: string;
    pendingDowngradeTier: string | null;
    downgradeEffectiveAt: Date | null;
    isCancelled: boolean;
    subscriptionEndsAt: Date | null;
    billingPeriodEnd: Date | null;
  } | null = null;
  let isLoadingStatus = true;
  let statusDismissed = false;

  // Dialog state
  let showDowngradeDialog = false;
  let showCancelDialog = false;
  let downgradeTargetTier: string | null = null;
  let isSchedulingDowngrade = false;
  let isCanceling = false;
  let isUndoing = false;

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

  $: currentPlanBenefits = $currentOrganization
    ? PlanBenefits[$currentOrganization.subscriptionTier] || PlanBenefits.FREE
    : PlanBenefits.FREE;

  // Check if there's a pending change to show
  $: hasPendingDowngrade = subscriptionStatus?.pendingDowngradeTier && !statusDismissed;
  $: hasPendingCancellation = subscriptionStatus?.isCancelled && !statusDismissed;

  async function fetchSubscriptionStatus() {
    isLoadingStatus = true;
    try {
      const response = await fetch("/api/organization/subscription-status", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        subscriptionStatus = {
          ...data,
          downgradeEffectiveAt: data.downgradeEffectiveAt
            ? new Date(data.downgradeEffectiveAt)
            : null,
          subscriptionEndsAt: data.subscriptionEndsAt
            ? new Date(data.subscriptionEndsAt)
            : null,
          billingPeriodEnd: data.billingPeriodEnd
            ? new Date(data.billingPeriodEnd)
            : null,
        };
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "fetchSubscriptionStatus" },
      });
    } finally {
      isLoadingStatus = false;
    }
  }

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
        captureException(new Error("Failed to create billing portal session"), {
          tags: { feature: "settings-billing-plan" },
          extra: { action: "handleManageSubscription", errorData },
        });
        toasts.error("Error", "Failed to open billing portal");
        isLoadingPortal = false;
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handleManageSubscription" },
      });
      toasts.error("Error", "Failed to open billing portal");
      isLoadingPortal = false;
    }
  }

  async function handlePlanClick(tier: string) {
    if (!$currentOrganization) return;

    const currentTierLevel = tierOrder[$currentOrganization.subscriptionTier] || 0;
    const newTierLevel = tierOrder[tier] || 0;

    // Check if this would be a downgrade
    if (newTierLevel < currentTierLevel) {
      downgradeTargetTier = tier;
      showDowngradeDialog = true;
      return;
    }

    // Upgrade flow - redirect to Stripe checkout
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
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handlePlanClick", tier },
      });
      toasts.error("Error", "Failed to generate payment URL. Please try again.");
      loadingTier = null;
    }
  }

  async function handleConfirmDowngrade() {
    if (!downgradeTargetTier) return;

    isSchedulingDowngrade = true;
    try {
      const response = await fetch("/api/organization/schedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetTier: downgradeTargetTier,
        }),
      });

      if (response.ok) {
        toasts.success("Downgrade scheduled", "Your plan will change at the end of your billing period.");
        showDowngradeDialog = false;
        statusDismissed = false;
        await fetchSubscriptionStatus();
      } else {
        const errorData = await response.json();
        toasts.error("Error", errorData.error || "Failed to schedule downgrade");
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handleConfirmDowngrade", downgradeTargetTier },
      });
      toasts.error("Error", "Failed to schedule downgrade. Please try again.");
    } finally {
      isSchedulingDowngrade = false;
      downgradeTargetTier = null;
    }
  }

  async function handleCancelSubscription() {
    showCancelDialog = true;
  }

  async function handleConfirmCancellation() {
    isCanceling = true;
    try {
      const response = await fetch("/api/organization/cancel-subscription", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toasts.success("Cancellation scheduled", "Your subscription will end at the billing period end.");
        showCancelDialog = false;
        statusDismissed = false;
        await fetchSubscriptionStatus();
      } else {
        const errorData = await response.json();
        toasts.error("Error", errorData.error || "Failed to cancel subscription");
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handleConfirmCancellation" },
      });
      toasts.error("Error", "Failed to cancel subscription. Please try again.");
    } finally {
      isCanceling = false;
    }
  }

  async function handleUndoDowngrade() {
    isUndoing = true;
    try {
      const response = await fetch("/api/organization/undo-downgrade", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toasts.success("Downgrade cancelled", "Your plan will remain unchanged.");
        await fetchSubscriptionStatus();
        await fetchOrganization();
      } else {
        const errorData = await response.json();
        toasts.error("Error", errorData.error || "Failed to undo downgrade");
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handleUndoDowngrade" },
      });
      toasts.error("Error", "Failed to undo downgrade. Please try again.");
    } finally {
      isUndoing = false;
    }
  }

  async function handleUndoCancellation() {
    isUndoing = true;
    try {
      const response = await fetch("/api/organization/undo-cancellation", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toasts.success("Cancellation undone", "Your subscription will continue.");
        await fetchSubscriptionStatus();
        await fetchOrganization();
      } else {
        const errorData = await response.json();
        toasts.error("Error", errorData.error || "Failed to undo cancellation");
      }
    } catch (error) {
      captureException(error, {
        tags: { feature: "settings-billing-plan" },
        extra: { action: "handleUndoCancellation" },
      });
      toasts.error("Error", "Failed to undo cancellation. Please try again.");
    } finally {
      isUndoing = false;
    }
  }

  onMount(() => {
    fetchSubscriptionStatus();
  });
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Plan</h1>
  <p class="page-subtitle">Manage your subscription plan</p>
</div>

<div class="billing-sections">
  <!-- Status Banners -->
  {#if hasPendingCancellation}
    <SubscriptionStatusBanner
      type="cancellation"
      currentTier={$currentOrganization?.subscriptionTier}
      effectiveDate={subscriptionStatus?.subscriptionEndsAt}
      isLoading={isUndoing}
      on:undo={handleUndoCancellation}
      on:dismiss={() => (statusDismissed = true)}
    />
  {:else if hasPendingDowngrade}
    <SubscriptionStatusBanner
      type="downgrade"
      currentTier={$currentOrganization?.subscriptionTier}
      pendingTier={subscriptionStatus?.pendingDowngradeTier}
      effectiveDate={subscriptionStatus?.downgradeEffectiveAt}
      isLoading={isUndoing}
      on:undo={handleUndoDowngrade}
      on:dismiss={() => (statusDismissed = true)}
    />
  {/if}

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
        <div class="plan-actions">
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

          {#if !subscriptionStatus?.isCancelled}
            <Button
              variant="ghost"
              size="sm"
              on:click={handleCancelSubscription}
              class="cancel-btn"
            >
              Cancel Subscription
            </Button>
          {/if}
        </div>
      {/if}
    </div>
  </Card>

  <!-- Plans Section -->
  <section class="plans-section">
    <div class="section-header">
      <h2>Upgrade Your Plan</h2>
      <p class="section-subtitle">
        You are currently on the {formatPlanName($currentOrganization?.subscriptionTier || "FREE")} plan. Upgrade below:
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
</div>

<!-- Downgrade Dialog -->
<DowngradeDialog
  open={showDowngradeDialog}
  currentTier={$currentOrganization?.subscriptionTier || "FREE"}
  targetTier={downgradeTargetTier || "FREE"}
  isLoading={isSchedulingDowngrade}
  on:close={() => {
    showDowngradeDialog = false;
    downgradeTargetTier = null;
  }}
  on:confirm={handleConfirmDowngrade}
/>

<!-- Cancel Subscription Dialog -->
<CancelSubscriptionDialog
  open={showCancelDialog}
  currentTier={$currentOrganization?.subscriptionTier || "FREE"}
  billingPeriodEnd={subscriptionStatus?.billingPeriodEnd}
  isLoading={isCanceling}
  on:close={() => (showCancelDialog = false)}
  on:confirm={handleConfirmCancellation}
/>

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
    gap: var(--space-8);
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

  .plan-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .manage-btn :global(svg) {
    margin-left: var(--space-2);
  }

  .cancel-btn {
    color: hsl(var(--muted-foreground));
  }

  .cancel-btn:hover {
    color: hsl(0 84.2% 60.2%);
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

  /* Responsive */
  @media (max-width: 1024px) {
    .plans-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .plan-info {
      max-width: 100%;
    }

    .plan-badge {
      display: none;
    }
  }
</style>
