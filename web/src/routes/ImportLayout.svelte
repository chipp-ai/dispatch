<script lang="ts">
  import { push } from "svelte-spa-router";
  import { captureException } from "$lib/sentry";
  import { Card, ChippLogo } from "$lib/design-system";

  // Eagerly import all content components to prevent flash
  import CheckContent from "./import/CheckContent.svelte";
  import PreviewContent from "./import/PreviewContent.svelte";
  import ProgressContent from "./import/ProgressContent.svelte";

  export let params: { wild?: string } = {};

  // Parse current step and params from URL
  // Routes: /import, /import/preview/:developerId, /import/progress/:sessionId
  type Step = "check" | "preview" | "progress";

  $: parsedRoute = parseRoute(params.wild);
  $: currentStep = parsedRoute.step;

  interface ParsedRoute {
    step: Step;
    developerId?: number;
    sessionId?: string;
  }

  function parseRoute(wild: string | undefined): ParsedRoute {
    if (!wild || wild === "" || wild === "check") {
      return { step: "check" };
    }

    const segments = wild.split("/");
    const firstSegment = segments[0];

    if (firstSegment === "preview" && segments[1]) {
      const developerId = parseInt(segments[1], 10);
      if (!isNaN(developerId)) {
        return { step: "preview", developerId };
      }
    }

    if (firstSegment === "progress" && segments[1]) {
      return { step: "progress", sessionId: segments[1] };
    }

    // Default to check
    return { step: "check" };
  }

  // Event handlers
  function handleHasData(event: CustomEvent<{ developerId: number }>) {
    push(`/import/preview/${event.detail.developerId}`);
  }

  async function handleNoData() {
    // No existing data, mark as complete and skip to onboarding
    try {
      await fetch("/api/import/skip", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      captureException(err, { tags: { page: "import", feature: "no-data-skip" } });
    }
    push("/onboarding");
  }

  async function handleCheckError(event: CustomEvent<{ message: string }>) {
    // On error checking, mark as skipped and continue to onboarding
    captureException(new Error(event.detail.message), { tags: { page: "import", feature: "check-error" } });
    try {
      await fetch("/api/import/skip", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      captureException(err, { tags: { page: "import", feature: "error-skip" } });
    }
    push("/onboarding");
  }

  async function handleStartImport(
    event: CustomEvent<{ developerId: number; appIds: number[] }>
  ) {
    try {
      const res = await fetch("/api/import/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          developerId: event.detail.developerId,
          appIds: event.detail.appIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start import");
      }

      const { data } = await res.json();
      push(`/import/progress/${data.importSessionId}`);
    } catch (err) {
      captureException(err, { tags: { page: "import", feature: "start-import" } });
      // On error, continue to onboarding
      push("/onboarding");
    }
  }

  async function handleSkipImport() {
    // Mark as skipped so user won't be prompted again
    try {
      await fetch("/api/import/skip", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      captureException(err, { tags: { page: "import", feature: "skip-import" } });
    }
    push("/onboarding");
  }

  function handleImportComplete() {
    // Import complete, go directly to dashboard (skip onboarding)
    push("/dashboard");
  }

  function handleImportError(event: CustomEvent<{ message: string }>) {
    captureException(new Error(event.detail.message), { tags: { page: "import", feature: "import-error" } });
    // On error, continue to onboarding
    push("/onboarding");
  }

  // Page title
  $: pageTitle = getPageTitle(currentStep);

  function getPageTitle(step: Step): string {
    const titles: Record<Step, string> = {
      check: "Checking for existing data",
      preview: "Import your data",
      progress: "Importing...",
    };
    return titles[step];
  }
</script>

<svelte:head>
  <title>{pageTitle} - Chipp</title>
</svelte:head>

<div class="import-page">
  <div class="import-header">
    <ChippLogo size="md" />
  </div>

  <div class="import-content">
    <Card padding="lg" class="import-card">
      {#if currentStep === "check"}
        <CheckContent
          on:hasData={handleHasData}
          on:noData={handleNoData}
          on:error={handleCheckError}
        />
      {:else if currentStep === "preview" && parsedRoute.developerId}
        <PreviewContent
          developerId={parsedRoute.developerId}
          on:startImport={handleStartImport}
          on:skip={handleSkipImport}
        />
      {:else if currentStep === "progress" && parsedRoute.sessionId}
        <ProgressContent
          importSessionId={parsedRoute.sessionId}
          on:complete={handleImportComplete}
          on:error={handleImportError}
        />
      {:else}
        <!-- Fallback to check -->
        <CheckContent
          on:hasData={handleHasData}
          on:noData={handleNoData}
          on:error={handleCheckError}
        />
      {/if}
    </Card>
  </div>
</div>

<style>
  .import-page {
    min-height: 100vh;
    background: hsl(var(--background));
    padding: var(--space-6);
    position: relative;
    overflow: hidden;
  }

  /* Gradient orbs in background */
  .import-page::before {
    content: "";
    position: absolute;
    top: -20%;
    left: -10%;
    width: 50%;
    height: 50%;
    background: radial-gradient(
      circle,
      hsl(45 100% 50% / 0.08) 0%,
      transparent 70%
    );
    pointer-events: none;
  }

  .import-page::after {
    content: "";
    position: absolute;
    bottom: -20%;
    right: -10%;
    width: 60%;
    height: 60%;
    background: radial-gradient(
      circle,
      hsl(280 100% 50% / 0.05) 0%,
      transparent 70%
    );
    pointer-events: none;
  }

  .import-header {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-8);
    position: relative;
    z-index: 1;
  }

  .import-content {
    max-width: 600px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }

  .import-content :global(.import-card) {
    text-align: center;
    background: linear-gradient(
      180deg,
      hsl(var(--card) / 0.95) 0%,
      hsl(var(--card) / 0.9) 100%
    );
    backdrop-filter: blur(8px);
    border: 1px solid hsl(var(--border) / 0.5);
    box-shadow:
      0 4px 24px hsl(0 0% 0% / 0.1),
      0 1px 2px hsl(0 0% 0% / 0.05);
  }

  @media (max-width: 640px) {
    .import-page {
      padding: var(--space-4);
    }
  }
</style>
