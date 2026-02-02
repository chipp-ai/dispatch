<script lang="ts">
  /**
   * CreditMeter
   *
   * Circular progress meter showing consumer credits remaining.
   * - Green: > 60% credits
   * - Amber: 30-60% credits
   * - Red: < 30% credits
   * - Shows ∞ for unlimited (subscription active)
   */

  export let credits: number | string = 0;
  export let maxCredits: number = 100;
  export let subscriptionActive: boolean = false;
  export let primaryColor: string = '#4499ff';
  export let radius: number = 32;
  export let showLabel: boolean = false;

  $: strokeWidth = radius >= 50 ? 6 : 4;
  $: innerRadius = radius - strokeWidth / 2;
  $: circumference = innerRadius * 2 * Math.PI;
  $: sizePx = radius * 2;

  // Calculate percentage and display values
  $: displayedCredits = (() => {
    if (subscriptionActive) return '∞';
    const numCredits = Number(credits);
    if (numCredits >= 1000) {
      return `${Math.floor(numCredits / 1000)}k`;
    }
    return String(numCredits);
  })();

  $: percentage = (() => {
    if (subscriptionActive) return 100;
    const numCredits = Number(credits);
    if (numCredits >= maxCredits) return 100;
    return (numCredits / maxCredits) * 100;
  })();

  $: isLowCredits = !subscriptionActive && Number(credits) <= 1;

  // Dynamic color based on percentage
  $: progressColor = (() => {
    if (subscriptionActive) return primaryColor;
    if (percentage > 60) return '#10b981'; // green
    if (percentage > 30) return '#f59e0b'; // amber
    return '#ef4444'; // red
  })();

  $: dashOffset = circumference - (percentage / 100) * circumference;
</script>

<div class="credit-meter" class:pulse={isLowCredits}>
  <div
    class="meter-container"
    style="width: {sizePx}px; height: {sizePx}px;"
  >
    <svg
      class="meter-svg"
      style="width: {sizePx}px; height: {sizePx}px;"
    >
      <!-- Background circle -->
      <circle
        stroke-width={strokeWidth}
        stroke="hsl(var(--border))"
        fill="transparent"
        r={innerRadius}
        cx={radius}
        cy={radius}
      />

      <!-- Progress circle -->
      <circle
        class="progress-ring"
        stroke-width={strokeWidth}
        stroke-dasharray={circumference}
        stroke-dashoffset={dashOffset}
        stroke-linecap="round"
        stroke={progressColor}
        fill="transparent"
        r={innerRadius}
        cx={radius}
        cy={radius}
      />
    </svg>

    <!-- Center content -->
    <div class="meter-content">
      <span
        class="credits-value"
        class:unlimited={subscriptionActive}
        class:large={radius >= 50}
        style="color: {progressColor};"
      >
        {displayedCredits}
      </span>
      {#if showLabel && radius >= 50}
        <span class="credits-label">
          {subscriptionActive ? 'Unlimited' : 'Credits'}
        </span>
      {/if}
    </div>
  </div>
</div>

<style>
  .credit-meter {
    position: relative;
  }

  .pulse {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .meter-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background-color: hsl(var(--background));
    box-shadow: var(--shadow-sm);
    transition: transform 0.3s ease;
  }

  .meter-container:hover {
    transform: scale(1.05);
  }

  .meter-svg {
    overflow: visible;
    transform: rotate(-90deg);
  }

  .progress-ring {
    transition: stroke-dashoffset 0.7s ease-out, stroke 0.3s ease;
  }

  .meter-content {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .credits-value {
    font-weight: var(--font-bold);
    font-size: var(--text-sm);
    user-select: none;
    transition: all 0.3s ease;
  }

  .credits-value.large {
    font-size: var(--text-xl);
  }

  .credits-value.unlimited {
    font-size: var(--text-lg);
  }

  .credits-value.unlimited.large {
    font-size: var(--text-2xl);
  }

  .credits-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    font-weight: var(--font-medium);
    margin-top: 2px;
  }
</style>
