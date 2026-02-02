<script lang="ts">
  import { Sparkles, BookOpen, Share2, Unlock, Check } from "lucide-svelte";
  import {
    ONBOARDING_STEPS,
    STEP_CONFIG,
    type OnboardingStep,
  } from "$lib/onboarding-v2/flow";

  export let currentStep: OnboardingStep;
  export let completedSteps: OnboardingStep[] = [];
  export let compact: boolean = false;

  const STEP_ICONS = {
    build: Sparkles,
    train: BookOpen,
    share: Share2,
    unlock: Unlock,
  };

  $: currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  $: currentConfig = STEP_CONFIG[currentStep];

  function isCompleted(step: OnboardingStep): boolean {
    return completedSteps.includes(step);
  }

  function isCurrent(step: OnboardingStep): boolean {
    return step === currentStep;
  }

  function isUpcoming(step: OnboardingStep): boolean {
    return !isCompleted(step) && !isCurrent(step);
  }
</script>

{#if compact}
  <!-- Compact stepper for mobile -->
  <div class="compact-stepper">
    {#each ONBOARDING_STEPS as step, index}
      {@const Icon = STEP_ICONS[step]}
      {@const completed = isCompleted(step)}
      {@const current = isCurrent(step)}
      <div class="step-item">
        <div
          class="step-icon"
          class:current
          class:completed={completed && !current}
        >
          {#if completed && !current}
            <Check size={16} />
          {:else}
            <Icon size={16} />
          {/if}
        </div>
        {#if index < ONBOARDING_STEPS.length - 1}
          <div
            class="step-line"
            class:active={index < currentIndex}
          />
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <!-- Full stepper for desktop -->
  <div class="stepper">
    <!-- Horizontal progress bar -->
    <div class="step-bar">
      {#each ONBOARDING_STEPS as step, index}
        {@const Icon = STEP_ICONS[step]}
        {@const completed = isCompleted(step)}
        {@const current = isCurrent(step)}
        {@const upcoming = isUpcoming(step)}
        <div class="step-container">
          <div class="step-content">
            <div
              class="step-icon"
              class:current
              class:completed
              class:upcoming
            >
              {#if completed}
                <Check size={16} />
              {:else}
                <Icon size={16} />
              {/if}
            </div>
            <span
              class="step-label"
              class:current
              class:completed
              class:upcoming
            >
              {STEP_CONFIG[step].label}
            </span>
          </div>
          {#if index < ONBOARDING_STEPS.length - 1}
            <div
              class="step-connector"
              class:active={index < currentIndex}
            />
          {/if}
        </div>
      {/each}
    </div>

    <!-- Current step header -->
    <div class="step-header">
      <p class="step-progress">
        Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
      </p>
      <h1 class="step-title">{currentConfig.label}</h1>
      <p class="step-description">{currentConfig.description}</p>
    </div>
  </div>
{/if}

<style>
  /* Compact stepper (mobile) */
  .compact-stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .step-item {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .compact-stepper .step-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .compact-stepper .step-icon.current {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-color) 20%, transparent);
  }

  .compact-stepper .step-icon.completed {
    background: color-mix(in srgb, var(--brand-color) 20%, transparent);
    color: var(--brand-color);
  }

  .compact-stepper .step-line {
    flex: 1;
    height: 2px;
    margin: 0 var(--space-1);
    border-radius: var(--radius-full);
    background: hsl(var(--muted));
    transition: background 0.2s;
  }

  .compact-stepper .step-line.active {
    background: color-mix(in srgb, var(--brand-color) 30%, transparent);
  }

  /* Full stepper (desktop) */
  .stepper {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .step-bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .step-container {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
  }

  .step-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .step-icon.current,
  .step-icon.completed {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-color) 20%, transparent);
  }

  .step-icon.upcoming {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .step-label {
    font-size: var(--text-xs);
    text-align: center;
  }

  .step-label.current {
    color: hsl(var(--foreground));
    font-weight: var(--font-medium);
  }

  .step-label.completed {
    color: var(--brand-color);
  }

  .step-label.upcoming {
    color: hsl(var(--muted-foreground));
  }

  .step-connector {
    height: 2px;
    flex: 1;
    margin: 0 var(--space-1);
    margin-top: calc(var(--space-4) * -1);
    border-radius: var(--radius-full);
    background: hsl(var(--muted));
    transition: background 0.2s;
  }

  .step-connector.active {
    background: color-mix(in srgb, var(--brand-color) 40%, transparent);
  }

  /* Step header */
  .step-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .step-progress {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .step-title {
    font-size: var(--text-2xl);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    letter-spacing: -0.02em;
  }

  .step-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }
</style>
