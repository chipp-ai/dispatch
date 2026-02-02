<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    ChevronLeft,
    Check,
    Loader2,
    Sparkles,
    Shield,
    Unlock,
    Crown,
    Zap,
  } from "lucide-svelte";
  import { Card, Button } from "$lib/design-system";
  import { PRICING_PLANS, type PricingPlan } from "$lib/onboarding-v2/flow";
  import {
    onboardingV2Store,
    currentApplicationId,
    currentAppName,
  } from "../../stores/onboardingV2";

  let selectedPlan: PricingPlan["id"] | null = null;
  let isLoading = false;

  $: appId = $currentApplicationId;
  $: appName = $currentAppName;

  // Redirect to Build step if no application is selected
  $: if ($onboardingV2Store.isHydrated && !appId) {
    onboardingV2Store.setCurrentStep("build");
  }

  const PLAN_ICONS: Record<PricingPlan["id"], typeof Zap> = {
    PRO: Zap,
    TEAM: Crown,
    BUSINESS: Shield,
  };

  function handleBack() {
    onboardingV2Store.setCurrentStep("share");
  }

  async function handleSelectPlan(planId: PricingPlan["id"]) {
    selectedPlan = planId;
    isLoading = true;

    try {
      // Get payment URL from Stripe
      const plan = PRICING_PLANS.find((p) => p.id === planId);
      if (!plan) {
        throw new Error("Plan not found");
      }

      const response = await fetch(
        `/api/stripe/plans/payment-url?tier=${planId}&period=MONTHLY&returnUrl=${encodeURIComponent(window.location.origin + "/#/dashboard")}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to get payment URL");
      }

      const data = await response.json();

      if (data.url) {
        // Mark onboarding complete and redirect to Stripe
        onboardingV2Store.markStepCompleted("unlock");
        window.location.href = data.url;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (error) {
      console.error("[UnlockContent] Error:", error);
      isLoading = false;
      selectedPlan = null;
    }
  }

  function handleFreeTrial() {
    // Mark onboarding complete and go to app builder
    onboardingV2Store.markStepCompleted("unlock");

    // Navigate to the app builder for the created app
    if (appId) {
      push(`/builder/${appId}/build`);
    } else {
      push("/dashboard");
    }
  }
</script>

<div class="unlock-step">
  <!-- Header -->
  <div class="unlock-header">
    <div class="header-icon">
      <Unlock size={24} />
    </div>
    <h2 class="header-title">Unlock your AI's full potential</h2>
    <p class="header-description">
      Choose a plan to remove limits and access premium features
    </p>
  </div>

  <!-- Pricing cards -->
  <div class="pricing-cards">
    {#each PRICING_PLANS as plan (plan.id)}
      {@const Icon = PLAN_ICONS[plan.id]}
      {@const isSelected = selectedPlan === plan.id}
      {@const isLoadingPlan = isLoading && isSelected}
      <button
        class="pricing-card"
        class:popular={plan.popular}
        class:private={plan.privateBadge}
        class:selected={isSelected}
        class:loading={isLoadingPlan}
        on:click={() => handleSelectPlan(plan.id)}
        disabled={isLoading}
      >
        <!-- Badge -->
        {#if plan.popular || plan.privateBadge}
          <div class="plan-badge" class:popular={plan.popular}>
            <Sparkles size={12} />
            {plan.popularBadge || plan.privateBadge}
          </div>
        {/if}

        <!-- Plan icon -->
        <div class="plan-icon" class:popular={plan.popular}>
          <Icon size={24} />
        </div>

        <!-- Plan name -->
        <h3 class="plan-name">{plan.name}</h3>

        <!-- Price -->
        <div class="plan-price">
          <span class="price-currency">$</span>
          <span class="price-amount">{plan.price}</span>
          <span class="price-period">/{plan.period}</span>
        </div>
        <p class="price-note">{plan.usageNote}</p>

        <!-- Features -->
        <ul class="plan-features">
          {#each plan.features as feature}
            <li>
              <Check size={14} />
              {feature}
            </li>
          {/each}
        </ul>

        <!-- CTA -->
        <div class="plan-cta">
          {#if isLoadingPlan}
            <Loader2 size={20} class="spinning" />
            Processing...
          {:else}
            {plan.ctaLabel}
          {/if}
        </div>
      </button>
    {/each}
  </div>

  <!-- Free tier option -->
  <Card class="free-tier">
    <div class="free-content">
      <div class="free-text">
        <h4 class="free-title">Not ready to commit?</h4>
        <p class="free-description">
          Continue with the free tier and upgrade later. You'll have limited
          features but can still test your AI.
        </p>
      </div>
      <Button
        variant="outline"
        on:click={handleFreeTrial}
        disabled={isLoading}
        class="free-button"
      >
        Start with Free
      </Button>
    </div>
  </Card>

  <!-- Back button -->
  <div class="navigation">
    <Button
      variant="ghost"
      on:click={handleBack}
      disabled={isLoading}
      class="back-button"
    >
      <ChevronLeft size={20} />
      Back
    </Button>
  </div>
</div>

<style>
  .unlock-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  /* Header */
  .unlock-header {
    text-align: center;
    margin-bottom: var(--space-2);
  }

  .header-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--brand-color) 10%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--space-4);
    color: var(--brand-color);
  }

  .header-title {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-2) 0 0 0;
  }

  /* Pricing cards grid */
  .pricing-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 900px) {
    .pricing-cards {
      grid-template-columns: 1fr;
    }
  }

  .pricing-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-5);
    border-radius: var(--radius-2xl);
    border: 2px solid hsl(var(--border));
    background: hsl(var(--card));
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .pricing-card:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent);
    background: hsl(var(--muted) / 0.3);
    transform: translateY(-2px);
  }

  .pricing-card.popular {
    border-color: var(--brand-color);
    background: color-mix(in srgb, var(--brand-color) 5%, transparent);
  }

  .pricing-card.popular:hover:not(:disabled) {
    background: color-mix(in srgb, var(--brand-color) 10%, transparent);
  }

  .pricing-card.selected {
    border-color: var(--brand-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-color) 20%, transparent);
  }

  .pricing-card.loading {
    pointer-events: none;
    opacity: 0.7;
  }

  .pricing-card:disabled {
    cursor: not-allowed;
  }

  /* Badge */
  .plan-badge {
    position: absolute;
    top: calc(var(--space-3) * -1);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    background: hsl(var(--muted));
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
  }

  .plan-badge.popular {
    background: var(--brand-color);
    color: white;
  }

  /* Plan icon */
  .plan-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-3);
  }

  .plan-icon.popular {
    background: color-mix(in srgb, var(--brand-color) 15%, transparent);
    color: var(--brand-color);
  }

  /* Plan name */
  .plan-name {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  /* Price */
  .plan-price {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .price-currency {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .price-amount {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    letter-spacing: -0.02em;
  }

  .price-period {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .price-note {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 var(--space-4) 0;
  }

  /* Features */
  .plan-features {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-5) 0;
    width: 100%;
  }

  .plan-features li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-1-5) 0;
    font-size: var(--text-sm);
    color: hsl(var(--foreground) / 0.8);
    text-align: left;
  }

  .plan-features li :global(svg) {
    color: var(--brand-color);
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* CTA */
  .plan-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-xl);
    background: var(--brand-color);
    color: white;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    margin-top: auto;
  }

  .pricing-card:not(.popular) .plan-cta {
    background: hsl(var(--foreground));
  }

  /* Free tier */
  :global(.free-tier) {
    padding: var(--space-5) !important;
    border-radius: var(--radius-xl) !important;
    border: 1px solid hsl(var(--border)) !important;
    background: hsl(var(--muted) / 0.3) !important;
  }

  .free-content {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  @media (max-width: 640px) {
    .free-content {
      flex-direction: column;
      text-align: center;
    }
  }

  .free-text {
    flex: 1;
  }

  .free-title {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .free-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  :global(.free-button) {
    height: 44px !important;
    padding: 0 var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
    flex-shrink: 0;
  }

  /* Navigation */
  .navigation {
    display: flex;
    justify-content: flex-start;
  }

  :global(.back-button) {
    height: 44px !important;
    padding: 0 var(--space-4) !important;
    border-radius: var(--radius-xl) !important;
  }

  /* Spinning animation */
  :global(.spinning) {
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
