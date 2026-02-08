<script lang="ts">
  import { onMount } from "svelte";
  import { Wand2, ChevronRight, ChevronDown, Loader2, Check } from "lucide-svelte";
  import { captureException } from "$lib/sentry";
  import { Card, Button, Textarea } from "$lib/design-system";
  import { TemplateCard } from "$lib/design-system/components/onboarding";
  import { ONBOARDING_TEMPLATES } from "$lib/onboarding-v2/flow";
  import {
    onboardingV2Store,
    currentApplicationId,
  } from "../../stores/onboardingV2";
  import { currentWorkspace } from "../../stores/workspace";

  const GENERATION_STEPS = [
    { id: "analyzing", label: "Analyzing your description..." },
    { id: "generating", label: "Generating AI personality..." },
    { id: "configuring", label: "Configuring capabilities..." },
    { id: "creating", label: "Creating your assistant..." },
  ];

  let isBuildYourOwnExpanded = false;
  let isCreatingApp = false;

  $: hasSelection =
    $onboardingV2Store.selectedTemplate ||
    ($onboardingV2Store.isCustomApp && $onboardingV2Store.customPrompt.trim());
  $: canContinue =
    hasSelection && !$onboardingV2Store.isGenerating && !isCreatingApp;

  // Create an application from a template
  async function createAppFromTemplate(
    template: (typeof ONBOARDING_TEMPLATES)[0]
  ): Promise<{ id: string; appNameId: string } | null> {
    if (!$currentWorkspace?.id) {
      captureException(new Error("No workspace ID available"), { tags: { feature: "onboarding-build" }, extra: { action: "create-app-from-template" } });
      return null;
    }

    try {
      // Step 1: Create the app with basic fields
      const createResponse = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          workspaceId: $currentWorkspace.id,
          systemPrompt: template.systemPrompt,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({}));
        captureException(new Error("Failed to create app"), { tags: { feature: "onboarding-build" }, extra: { action: "create-app-from-template", error } });
        return null;
      }

      const createResult = await createResponse.json();
      const app = createResult.data;

      if (!app?.id || !app?.appNameId) {
        captureException(new Error("No app ID or appNameId returned"), { tags: { feature: "onboarding-build" }, extra: { action: "create-app-from-template", app } });
        return null;
      }

      // Step 2: Update with additional settings (welcomeMessages, suggestedMessages, brandStyles)
      const updateResponse = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          welcomeMessages: [template.startingMessage],
          suggestedMessages: template.suggestions,
          brandStyles: {
            primaryColor: template.brandColor,
          },
        }),
      });

      if (!updateResponse.ok) {
        console.warn("[BuildContent] Failed to update app settings, but app was created");
      }

      console.log("[BuildContent] Created app from template:", app.id, "slug:", app.appNameId);
      return { id: app.id, appNameId: app.appNameId };
    } catch (error) {
      captureException(error, { tags: { feature: "onboarding-build" }, extra: { action: "create-app-from-template" } });
      return null;
    }
  }

  async function handleTemplateSelect(event: CustomEvent<string>) {
    const templateId = event.detail;
    onboardingV2Store.selectTemplate(templateId);
    isBuildYourOwnExpanded = false;

    // Check if we already have an app for this template
    if ($onboardingV2Store.templateApplicationIds[templateId]) {
      console.log(
        "[BuildContent] Template already has app:",
        $onboardingV2Store.templateApplicationIds[templateId]
      );
      return;
    }

    // Find the template and create an application
    const template = ONBOARDING_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    isCreatingApp = true;
    const result = await createAppFromTemplate(template);
    if (result) {
      onboardingV2Store.setTemplateApplicationIds({
        ...$onboardingV2Store.templateApplicationIds,
        [templateId]: result.id,
      });
      onboardingV2Store.setTemplateAppNameIds({
        ...$onboardingV2Store.templateAppNameIds,
        [templateId]: result.appNameId,
      });
    }
    isCreatingApp = false;
  }

  function handleBuildYourOwnToggle() {
    isBuildYourOwnExpanded = !isBuildYourOwnExpanded;
    if (isBuildYourOwnExpanded) {
      onboardingV2Store.setIsCustomApp(true);
    }
  }

  function handleCustomPromptChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const value = target.value;
    onboardingV2Store.setCustomPrompt(value);
    if (value.trim()) {
      onboardingV2Store.setIsCustomApp(true);
    }
  }

  async function handleContinue() {
    if ($onboardingV2Store.isCustomApp && $onboardingV2Store.customPrompt.trim()) {
      // Start AI generation flow for custom app
      onboardingV2Store.setIsGenerating(true);
      onboardingV2Store.setGenerationError(null);

      try {
        // Show generation steps with actual API call
        for (let i = 0; i < GENERATION_STEPS.length; i++) {
          const step = GENERATION_STEPS[i];
          onboardingV2Store.setGenerationStep(step.id);

          // On the last step, actually create the application
          if (i === GENERATION_STEPS.length - 1) {
            if (!$currentWorkspace?.id) {
              throw new Error("No workspace available");
            }

            // Step 1: Create the app with basic fields
            const createResponse = await fetch("/api/applications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                name: "Custom AI Assistant",
                description: "AI assistant built with custom instructions",
                workspaceId: $currentWorkspace.id,
                systemPrompt: $onboardingV2Store.customPrompt,
              }),
            });

            if (!createResponse.ok) {
              const error = await createResponse.json().catch(() => ({}));
              throw new Error(error.error || "Failed to create application");
            }

            const result = await createResponse.json();
            const app = result.data;
            console.log("[BuildContent] Created custom app:", app.id, "slug:", app.appNameId);

            // Step 2: Update with welcome message
            await fetch(`/api/applications/${app.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                welcomeMessages: ["Hi! I'm your custom AI assistant. How can I help you today?"],
              }),
            });

            onboardingV2Store.setCustomAppData({
              applicationId: app.id,
              appNameId: app.appNameId,
              chatSessionId: "",
              name: app.name || "Custom AI Assistant",
            });
          } else {
            // Brief pause for animation on earlier steps
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }

        onboardingV2Store.setIsGenerating(false);
        onboardingV2Store.setGenerationStep(null);
        onboardingV2Store.markStepCompleted("build");
        onboardingV2Store.setCurrentStep("train");
      } catch (error) {
        captureException(error, { tags: { feature: "onboarding-build" }, extra: { action: "create-custom-app", customPrompt: $onboardingV2Store.customPrompt?.slice(0, 100) } });
        onboardingV2Store.setGenerationError(
          error instanceof Error
            ? error.message
            : "Failed to create your assistant. Please try again."
        );
        onboardingV2Store.setIsGenerating(false);
        onboardingV2Store.setGenerationStep(null);
      }
    } else if ($onboardingV2Store.selectedTemplate) {
      // Template selected - verify app exists and move to next step
      const appId =
        $onboardingV2Store.templateApplicationIds[
          $onboardingV2Store.selectedTemplate
        ];
      if (!appId) {
        // App creation may have failed silently, try again
        const template = ONBOARDING_TEMPLATES.find(
          (t) => t.id === $onboardingV2Store.selectedTemplate
        );
        if (template) {
          isCreatingApp = true;
          const result = await createAppFromTemplate(template);
          if (result) {
            onboardingV2Store.setTemplateApplicationIds({
              ...$onboardingV2Store.templateApplicationIds,
              [$onboardingV2Store.selectedTemplate]: result.id,
            });
            onboardingV2Store.setTemplateAppNameIds({
              ...$onboardingV2Store.templateAppNameIds,
              [$onboardingV2Store.selectedTemplate]: result.appNameId,
            });
          } else {
            onboardingV2Store.setGenerationError(
              "Failed to create application. Please try again."
            );
            isCreatingApp = false;
            return;
          }
          isCreatingApp = false;
        }
      }

      onboardingV2Store.markStepCompleted("build");
      onboardingV2Store.setCurrentStep("train");
    }
  }

  // Initialize on mount
  onMount(() => {
    isBuildYourOwnExpanded = $onboardingV2Store.isCustomApp;
  });
</script>

<div class="build-step">
  <!-- Template selection -->
  <div class="section">
    <h2 class="section-title">Choose a template</h2>
    <div class="templates">
      {#each ONBOARDING_TEMPLATES as template, index}
        <TemplateCard
          id={template.id}
          name={template.name}
          description={template.description}
          subtitle={template.subtitle}
          icon={template.icon}
          brandColor={template.brandColor}
          isSelected={$onboardingV2Store.selectedTemplate === template.id}
          {index}
          on:select={handleTemplateSelect}
        />
      {/each}
    </div>
  </div>

  <!-- Divider -->
  <div class="divider">
    <div class="divider-line" />
    <span class="divider-text">or</span>
    <div class="divider-line" />
  </div>

  <!-- Build Your Own -->
  <Card
    class="build-your-own {$onboardingV2Store.isCustomApp ? 'selected' : ''}"
  >
    <!-- Header - always visible -->
    <button class="byo-header" on:click={handleBuildYourOwnToggle}>
      <div
        class="byo-icon"
        class:selected={$onboardingV2Store.isCustomApp}
      >
        <Wand2 size={20} />
      </div>
      <div class="byo-text">
        <h3 class="byo-title">Build Your Own</h3>
        <p class="byo-description">Describe your AI and we'll create it</p>
      </div>
      <div class="byo-chevron" class:expanded={isBuildYourOwnExpanded}>
        <ChevronDown size={20} />
      </div>
    </button>

    <!-- Expandable content -->
    {#if isBuildYourOwnExpanded}
      <div class="byo-content">
        <Textarea
          placeholder="Describe what you want your AI assistant to do..."
          value={$onboardingV2Store.customPrompt}
          on:input={handleCustomPromptChange}
          disabled={$onboardingV2Store.isGenerating}
          rows={4}
        />

        <!-- Generation progress -->
        {#if $onboardingV2Store.isGenerating}
          <div class="generation-progress">
            {#each GENERATION_STEPS as step, index}
              {@const currentIndex = GENERATION_STEPS.findIndex(
                (s) => s.id === $onboardingV2Store.generationStep
              )}
              {@const isComplete = index < currentIndex}
              {@const isCurrent = step.id === $onboardingV2Store.generationStep}
              {@const isPending = index > currentIndex}
              <div
                class="generation-step"
                class:complete={isComplete}
                class:current={isCurrent}
                class:pending={isPending}
              >
                <div class="step-indicator">
                  {#if isComplete}
                    <Check size={14} />
                  {:else if isCurrent}
                    <Loader2 size={14} class="spinning" />
                  {:else}
                    <span class="step-dot" />
                  {/if}
                </div>
                <span class="step-label">{step.label}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Error message -->
        {#if $onboardingV2Store.generationError}
          <p class="error-message">{$onboardingV2Store.generationError}</p>
        {/if}
      </div>
    {/if}
  </Card>

  <!-- Continue button -->
  <div class="continue-section">
    <Button
      on:click={handleContinue}
      disabled={!canContinue}
      class="continue-button"
    >
      {#if $onboardingV2Store.isGenerating}
        <Loader2 size={16} class="spinning" />
        Creating...
      {:else}
        Continue
        <ChevronRight size={16} />
      {/if}
    </Button>
  </div>
</div>

<style>
  .build-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground) / 0.8);
    margin: 0;
  }

  .templates {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Divider */
  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) 0;
  }

  .divider-line {
    flex: 1;
    height: 1px;
    background: hsl(var(--border));
  }

  .divider-text {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  /* Build Your Own Card */
  :global(.build-your-own) {
    border-radius: var(--radius-xl) !important;
    border: 2px solid hsl(var(--border)) !important;
    transition: all 0.3s !important;
    overflow: hidden !important;
    padding: 0 !important;
  }

  :global(.build-your-own:hover) {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent) !important;
  }

  :global(.build-your-own.selected) {
    border-color: var(--brand-color) !important;
    background: var(--brand-muted, color-mix(in srgb, var(--brand-color) 10%, transparent)) !important;
  }

  .byo-header {
    width: 100%;
    padding: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }

  .byo-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    transition: all 0.2s;
  }

  .byo-icon.selected {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
  }

  .byo-text {
    flex: 1;
    min-width: 0;
  }

  .byo-title {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--card-foreground));
    margin: 0;
  }

  .byo-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .byo-chevron {
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s;
  }

  .byo-chevron.expanded {
    transform: rotate(180deg);
  }

  .byo-content {
    padding: 0 var(--space-3) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* Generation progress */
  .generation-progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }

  .generation-step {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .step-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .generation-step.complete .step-indicator,
  .generation-step.current .step-indicator {
    background: var(--brand-color);
    color: var(--brand-color-foreground);
  }

  .generation-step.pending .step-indicator {
    background: hsl(var(--muted));
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: hsl(var(--muted-foreground) / 0.3);
  }

  .step-label {
    font-size: var(--text-sm);
  }

  .generation-step.complete .step-label,
  .generation-step.current .step-label {
    color: hsl(var(--foreground));
  }

  .generation-step.pending .step-label {
    color: hsl(var(--muted-foreground));
  }

  .error-message {
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    margin: 0;
  }

  /* Continue section */
  .continue-section {
    padding-top: var(--space-2);
  }

  :global(.continue-button) {
    width: 100%;
    height: 40px;
    font-size: var(--text-sm);
    border-radius: var(--radius-lg);
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
