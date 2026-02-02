<script lang="ts">
  import PlanCard from "../../../lib/design-system/components/PlanCard.svelte";
  import { Card, Button, toasts } from "$lib/design-system";
  import { currentOrganization } from "../../../stores/organization";
  import { BadgeCheck, ExternalLink } from "lucide-svelte";

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
</script>

<!-- Page header -->
<div class="page-header">
  <h1>Plan</h1>
  <p class="page-subtitle">Manage your subscription plan</p>
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
