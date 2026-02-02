<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { push, querystring } from "svelte-spa-router";
  import { appGenerator, type TaskItem } from "../stores/appGenerator";
  import { currentWorkspaceId } from "../../../stores/workspace";
  import { get } from "svelte/store";
  import AppGeneratorProgress from "./AppGeneratorProgress.svelte";
  import AppGeneratorSuccess from "./AppGeneratorSuccess.svelte";

  export let initialPrompt: string = "";

  const dispatch = createEventDispatcher();

  // Reactive: Subscribe to store
  $: isCreating = $appGenerator.isCreating;
  $: error = $appGenerator.error;
  $: showSuccess = $appGenerator.showSuccess;
  $: appDetails = $appGenerator.appDetails;
  $: appFacts = $appGenerator.appFacts;
  $: createdApplicationId = $appGenerator.createdApplicationId;
  $: currentStageIndex = $appGenerator.currentStageIndex;

  // Calculate task statuses based on current stage
  $: tasks = $appGenerator.tasks.map((task, index) => {
    if (index < currentStageIndex) {
      return { ...task, status: "completed" as const, completedAt: new Date() };
    } else if (index === currentStageIndex) {
      return { ...task, status: "active" as const };
    }
    return { ...task, status: "pending" as const };
  });

  // Get generation time
  function getGenerationTime(): string {
    return appGenerator.getGenerationTime();
  }

  // Start generation immediately from query param
  async function startGenerationFromPrompt(prompt: string) {
    const workspaceId = get(currentWorkspaceId);

    if (!workspaceId) {
      console.error("No active workspace");
      appGenerator.setError("No active workspace found. Please try again.");
      return;
    }

    await appGenerator.startGeneration(
      prompt,
      workspaceId.toString(),
      (applicationId) => {
        dispatch("complete", { applicationId });
      }
    );
  }

  // Navigate to builder
  function handleNavigateToBuilder(event: CustomEvent<{ applicationId: string; appName: string }>) {
    const { applicationId, appName } = event.detail;
    push(`/apps/${applicationId}`);
  }

  // Handle retry after error
  function handleRetry() {
    // Re-trigger generation with the same prompt
    if (initialPrompt) {
      appGenerator.reset();
      startGenerationFromPrompt(initialPrompt);
    } else {
      // No prompt available, redirect to home
      push("/");
    }
  }

  // Handle going home on error
  function handleGoHome() {
    appGenerator.reset();
    push("/");
  }

  // Start generation immediately on mount
  onMount(() => {
    appGenerator.reset();

    if (initialPrompt) {
      startGenerationFromPrompt(initialPrompt);
    } else {
      // No prompt provided - this shouldn't happen, redirect to home
      console.error("No prompt provided for app generation");
      push("/");
    }
  });
</script>

<div class="app-generator">
  <!-- Dot pattern background -->
  <div class="dot-pattern" />

  <!-- Logo -->
  <div class="logo-container">
    <img
      src="/assets/icons/chipp-logo.svg"
      alt="Chipp"
      class="logo"
    />
  </div>

  <div class="content-container">
    <!-- Error State -->
    {#if error}
      <div class="error-container" in:fade={{ duration: 300 }}>
        <div class="error-card">
          <h1 class="error-title">Oops! Something went wrong</h1>
          <p class="error-message">{error}</p>
          <div class="error-buttons">
            <button class="error-button primary" on:click={handleRetry}>
              Try Again
            </button>
            <button class="error-button secondary" on:click={handleGoHome}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>

    <!-- Progress State -->
    {:else if !showSuccess}
      <div class="progress-container" in:fade={{ duration: 300 }}>
        <AppGeneratorProgress
          items={tasks}
          title="Creating Your AI Assistant"
          subtitle="We're building something amazing for you..."
        />
      </div>

    <!-- Success State -->
    {:else if showSuccess}
      <div class="success-container" in:fade={{ duration: 300 }}>
        <AppGeneratorSuccess
          {appDetails}
          {appFacts}
          generationTime={getGenerationTime()}
          {createdApplicationId}
          on:navigate={handleNavigateToBuilder}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .app-generator {
    min-height: 100vh;
    background: #FCFBF7;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .dot-pattern {
    position: absolute;
    inset: 0;
    opacity: 0.05;
    background-image: radial-gradient(#000 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
  }

  .logo-container {
    position: fixed;
    top: var(--space-4);
    left: var(--space-4);
    z-index: 50;
  }

  @media (min-width: 640px) {
    .logo-container {
      top: var(--space-6);
      left: var(--space-6);
    }
  }

  .logo {
    width: 80px;
    height: 24px;
    color: hsl(var(--foreground));
  }

  @media (min-width: 640px) {
    .logo {
      width: 100px;
      height: 30px;
    }
  }

  .content-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
  }

  /* Error State */
  .error-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .error-card {
    text-align: center;
    max-width: 28rem;
  }

  .error-title {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4);
  }

  .error-message {
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6);
  }

  .error-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  @media (min-width: 640px) {
    .error-buttons {
      flex-direction: row;
      justify-content: center;
    }
  }

  .error-button {
    padding: 10px 24px;
    border: none;
    border-radius: var(--radius-xl);
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .error-button.primary {
    background: hsl(var(--foreground));
    color: hsl(var(--background));
  }

  .error-button.secondary {
    background: transparent;
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
  }

  .error-button:hover {
    opacity: 0.9;
  }

  /* Progress State */
  .progress-container {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Success State */
  .success-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
