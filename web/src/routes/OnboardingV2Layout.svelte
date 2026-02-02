<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { OnboardingStepper } from "$lib/design-system/components/onboarding";
  import { onboardingV2Store } from "../stores/onboardingV2";
  import { initWorkspace } from "../stores/workspace";

  // Eagerly import all step content components
  import BuildContent from "./onboarding-v2/BuildContent.svelte";
  import TrainContent from "./onboarding-v2/TrainContent.svelte";
  import ShareContent from "./onboarding-v2/ShareContent.svelte";
  import UnlockContent from "./onboarding-v2/UnlockContent.svelte";
  import OnboardingChatPreview from "./onboarding-v2/OnboardingChatPreview.svelte";

  export let params: { wild?: string } = {};

  let isMobileChatExpanded = false;

  // Hydrate store on mount
  onMount(async () => {
    onboardingV2Store.hydrate();
    // Initialize workspace for app creation
    await initWorkspace();
  });

  // Use stable default values during SSR to prevent hydration mismatch
  $: currentStep = $onboardingV2Store.isHydrated
    ? $onboardingV2Store.currentStep
    : "build";
  $: completedSteps = $onboardingV2Store.isHydrated
    ? $onboardingV2Store.completedSteps
    : [];
</script>

<svelte:head>
  <title>Get Started - Chipp</title>
</svelte:head>

<div class="onboarding-layout">
  <!-- Decorative background elements -->
  <div class="background-decorations">
    <div class="decoration decoration-1"></div>
    <div class="decoration decoration-2"></div>
    <div class="decoration decoration-3"></div>
  </div>

  <!-- Desktop: Split view -->
  <div class="desktop-layout">
    <!-- Left panel: Steps -->
    <div class="left-panel">
      <div class="stepper-container">
        <OnboardingStepper {currentStep} {completedSteps} />
      </div>
      <div class="step-content">
        {#if currentStep === "build"}
          <BuildContent />
        {:else if currentStep === "train"}
          <TrainContent />
        {:else if currentStep === "share"}
          <ShareContent />
        {:else if currentStep === "unlock"}
          <UnlockContent />
        {/if}
      </div>
    </div>

    <!-- Right panel: Chat preview -->
    <div class="right-panel">
      <div class="chat-preview-container">
        <OnboardingChatPreview />
      </div>
    </div>
  </div>

  <!-- Mobile: Stacked view -->
  <div class="mobile-layout">
    <!-- Top: Steps -->
    <div class="mobile-content">
      <div class="mobile-stepper">
        <OnboardingStepper {currentStep} {completedSteps} compact />
      </div>
      <div class="mobile-step-content">
        {#if currentStep === "build"}
          <BuildContent />
        {:else if currentStep === "train"}
          <TrainContent />
        {:else if currentStep === "share"}
          <ShareContent />
        {:else if currentStep === "unlock"}
          <UnlockContent />
        {/if}
      </div>
    </div>

    <!-- Bottom: Chat preview (collapsible) -->
    <div class="mobile-chat-panel">
      <OnboardingChatPreview compact bind:isExpanded={isMobileChatExpanded} />
    </div>
  </div>
</div>

<style>
  .onboarding-layout {
    min-height: 100vh;
    background: hsl(var(--background));
    position: relative;
  }

  /* Background decorations */
  .background-decorations {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }

  .decoration {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0;
    animation: fadeIn 1.5s ease-out forwards;
  }

  .decoration-1 {
    right: -160px;
    top: -160px;
    width: 500px;
    height: 500px;
    background: var(--brand-color);
    opacity: 0.05;
    animation-delay: 0s;
  }

  .decoration-2 {
    left: -80px;
    top: 50%;
    width: 400px;
    height: 400px;
    background: var(--brand-color);
    opacity: 0.03;
    animation-delay: 0.2s;
  }

  .decoration-3 {
    right: 25%;
    bottom: 0;
    width: 300px;
    height: 300px;
    background: var(--brand-secondary, var(--brand-color));
    opacity: 0.05;
    animation-delay: 0.4s;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: var(--target-opacity, 0.05);
    }
  }

  .decoration-1 { --target-opacity: 0.05; }
  .decoration-2 { --target-opacity: 0.03; }
  .decoration-3 { --target-opacity: 0.04; }

  /* Mobile layout - default (shown on mobile) */
  .mobile-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* Desktop layout - hidden by default */
  .desktop-layout {
    display: none;
    height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* At desktop breakpoint: show desktop, hide mobile */
  @media (min-width: 1024px) {
    .desktop-layout {
      display: flex;
    }

    .mobile-layout {
      display: none;
    }
  }

  .left-panel {
    display: flex;
    flex-direction: column;
    padding: var(--space-6) var(--space-8);
    overflow-y: auto;
    width: 100%;
    max-width: 768px;
  }

  .stepper-container {
    margin-bottom: var(--space-4);
    animation: slideInLeft 0.6s cubic-bezier(0.23, 1, 0.32, 1);
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .step-content {
    flex: 1;
    animation: slideUp 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.2s backwards;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .right-panel {
    flex: 1;
    background: hsl(var(--muted) / 0.3);
    border-left: 1px solid hsl(var(--border));
    padding: var(--space-6) var(--space-8);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .chat-preview-container {
    width: 100%;
    max-width: 512px;
    height: 768px;
    max-height: calc(100vh - 8rem);
    display: flex;
    flex-direction: column;
    animation: slideInRight 0.6s cubic-bezier(0.23, 1, 0.32, 1) 0.3s backwards;
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .mobile-content {
    flex: 1;
    padding: var(--space-4) var(--space-4);
    overflow-y: auto;
  }

  @media (min-width: 640px) {
    .mobile-content {
      padding: var(--space-6);
    }
  }

  .mobile-stepper {
    margin-bottom: var(--space-6);
    animation: slideDown 0.5s cubic-bezier(0.23, 1, 0.32, 1);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .mobile-step-content {
    animation: slideUp 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.1s backwards;
  }

  .mobile-chat-panel {
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
    padding: var(--space-4);
    animation: slideUp 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.2s backwards;
  }
</style>
