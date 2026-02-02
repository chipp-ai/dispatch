<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let plan: string = "";
  export let tagline: string = "";
  export let cost: string = "";
  export let costCaption: string = "";
  export let buttonText: string = "Get Started";
  export let subheading: string = "";
  export let benefits: string[] = [];
  export let disabled: boolean = false;
  export let highlight: boolean = false;
  export let mostPopular: boolean = false;
  export let mostPrivate: boolean = false;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher();

  function handleClick() {
    if (!disabled && !isLoading) {
      dispatch("click");
    }
  }

  function isSectionHeader(benefit: string): boolean {
    const lowerBenefit = benefit.toLowerCase();
    return (
      (lowerBenefit.includes("everything in") && lowerBenefit.includes("plus")) ||
      (lowerBenefit.includes("start with") && lowerBenefit.includes("messages"))
    );
  }
</script>

<div class="plan-card" class:highlight class:disabled>
  {#if mostPopular}
    <div class="badge-container most-popular">
      <img src="/assets/most-popular-badge.avif" alt="Most Popular" class="badge-image" />
    </div>
  {/if}

  {#if mostPrivate}
    <div class="badge-container most-private">
      <span class="private-badge">Most Private</span>
    </div>
  {/if}

  <div class="card-content">
    <h3 class="plan-name">{plan}</h3>
    <p class="plan-tagline">{tagline}</p>

    <div class="pricing">
      <span class="price">${cost}</span>
      <span class="period">/month</span>
      {#if costCaption && costCaption.includes("usage over")}
        <div class="usage-note">+ {costCaption.replace("/month + ", "")}</div>
      {/if}
    </div>

    <button
      class="cta-button"
      class:primary={buttonText === "Get Started"}
      on:click={handleClick}
      disabled={disabled || isLoading}
    >
      {#if isLoading}
        <span class="loader"></span>
      {:else}
        {buttonText}
      {/if}
    </button>

    {#if subheading}
      <h4 class="subheading">{subheading}</h4>
    {/if}

    <ul class="benefits-list">
      {#each benefits as benefit}
        <li class="benefit-item" class:section-header={isSectionHeader(benefit)}>
          {#if isSectionHeader(benefit)}
            <span class="section-text">{benefit}</span>
          {:else}
            <span class="check-icon">
              <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="benefit-text">{benefit}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .plan-card {
    position: relative;
    background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.3) 100%);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    height: 100%;
  }

  .plan-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  }

  .plan-card.highlight {
    border: 2px solid var(--brand-yellow);
    box-shadow: 0 8px 32px rgba(249, 210, 0, 0.2);
  }

  .plan-card.disabled {
    opacity: 0.7;
  }

  .badge-container {
    position: absolute;
    z-index: 10;
  }

  .badge-container.most-popular {
    top: -16px;
    right: 16px;
  }

  .badge-image {
    width: 100px;
    height: auto;
    transform: rotate(6deg);
  }

  .badge-container.most-private {
    top: -12px;
    left: 16px;
  }

  .private-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: var(--text-xs);
    font-weight: 700;
    background: #6366f1;
    color: #fff;
    transform: rotate(-3deg);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    border: 2px solid #e0e7ff;
  }

  .card-content {
    padding: var(--space-8);
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .plan-name {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-3);
  }

  .plan-tagline {
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
    min-height: 72px;
    margin-bottom: var(--space-6);
  }

  .pricing {
    margin-bottom: var(--space-6);
  }

  .price {
    font-family: var(--font-heading);
    font-size: var(--text-5xl);
    font-weight: 400;
    color: hsl(var(--foreground));
  }

  .period {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
  }

  .usage-note {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-1);
  }

  .cta-button {
    width: 100%;
    min-height: 52px;
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: var(--text-lg);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin-bottom: var(--space-8);
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
  }

  .cta-button.primary {
    background: var(--brand-yellow);
    color: #111;
  }

  .cta-button:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .cta-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loader {
    width: 20px;
    height: 20px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .subheading {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .benefits-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex-grow: 1;
  }

  .benefit-item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .benefit-item.section-header {
    margin-bottom: var(--space-2);
  }

  .section-text {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--foreground));
  }

  .check-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--brand-yellow);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .check-icon svg {
    width: 12px;
    height: 12px;
    color: #111;
  }

  .benefit-text {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }
</style>
