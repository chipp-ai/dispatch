<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { Card, ChippLogo } from "$lib/design-system";
  import { Check } from "lucide-svelte";

  // Eagerly import all step content components
  import OnboardingProfileContent from "./onboarding/ProfileContent.svelte";
  import OnboardingPersonaContent from "./onboarding/PersonaContent.svelte";
  import OnboardingInviteContent from "./onboarding/InviteContent.svelte";
  import OnboardingTemplatesContent from "./onboarding/TemplatesContent.svelte";

  export let params: { wild?: string } = {};

  // Step configuration
  const STEPS = ["profile", "persona", "invite", "templates"] as const;
  type Step = (typeof STEPS)[number];

  // Parse current step from URL
  $: currentStep = parseStep(params.wild);
  $: currentStepIndex = STEPS.indexOf(currentStep);

  function parseStep(wild: string | undefined): Step {
    if (!wild || wild === "") return "profile";
    const step = wild.split("/")[0] as Step;
    return STEPS.includes(step) ? step : "profile";
  }

  // Navigate to next step
  function goToNextStep() {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      push(`/onboarding/${STEPS[nextIndex]}`);
    }
  }

  // Navigate to specific step
  function goToStep(step: Step) {
    push(`/onboarding/${step}`);
  }

  // Check if step is completed (before current step)
  function isStepCompleted(stepIndex: number): boolean {
    return stepIndex < currentStepIndex;
  }

  // Check if step is active (current step)
  function isStepActive(stepIndex: number): boolean {
    return stepIndex === currentStepIndex;
  }

  // Check if step line should be active (connects completed steps)
  function isStepLineActive(lineIndex: number): boolean {
    // Line at index N is active if step N is completed
    return lineIndex < currentStepIndex;
  }

  // Title for the page
  $: pageTitle = getPageTitle(currentStep);

  function getPageTitle(step: Step): string {
    const titles: Record<Step, string> = {
      profile: "Profile",
      persona: "Persona",
      invite: "Invite Team",
      templates: "Create Your First App",
    };
    return titles[step];
  }
</script>

<svelte:head>
  <title>{pageTitle} - Onboarding - Chipp</title>
</svelte:head>

<div class="onboarding-page">
  <div class="onboarding-header">
    <ChippLogo size="md" />
  </div>

  <div class="onboarding-content">
    <Card padding="lg" class="onboarding-card">
      <!-- Step Indicator -->
      <div class="step-indicator">
        {#each STEPS as step, index}
          {#if index > 0}
            <span class="step-line" class:active={isStepLineActive(index - 1)}></span>
          {/if}
          <span
            class="step"
            class:active={isStepActive(index)}
            class:completed={isStepCompleted(index)}
          >
            {#if isStepCompleted(index)}
              <Check size={14} />
            {:else}
              {index + 1}
            {/if}
          </span>
        {/each}
      </div>

      <!-- Step Content -->
      <div class="step-content">
        {#if currentStep === "profile"}
          <OnboardingProfileContent on:next={goToNextStep} />
        {:else if currentStep === "persona"}
          <OnboardingPersonaContent on:next={goToNextStep} />
        {:else if currentStep === "invite"}
          <OnboardingInviteContent on:next={goToNextStep} />
        {:else if currentStep === "templates"}
          <OnboardingTemplatesContent />
        {/if}
      </div>
    </Card>
  </div>
</div>

<style>
  .onboarding-page {
    min-height: 100vh;
    background: hsl(var(--background));
    padding: var(--space-6);
  }

  .onboarding-header {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-8);
  }

  .onboarding-content {
    max-width: 560px;
    margin: 0 auto;
  }

  .onboarding-content :global(.onboarding-card) {
    text-align: center;
  }

  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }

  .step {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    transition: all 0.2s;
  }

  .step.active {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
  }

  .step.completed {
    background: var(--color-success, #22c55e);
    color: white;
  }

  .step-line {
    width: 32px;
    height: 2px;
    background: hsl(var(--border));
    transition: background 0.2s;
  }

  .step-line.active {
    background: var(--color-success, #22c55e);
  }

  .step-content {
    /* Content styling handled by child components */
  }

  @media (max-width: 640px) {
    .onboarding-page {
      padding: var(--space-4);
    }
  }
</style>
