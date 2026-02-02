<script lang="ts">
  import { onMount } from "svelte";
  import {
    ChevronRight,
    ChevronLeft,
    Globe,
    FileText,
    Plug,
    Upload,
    Check,
    Loader2,
    Link as LinkIcon,
    X,
    SkipForward,
    ExternalLink,
    Sparkles,
  } from "lucide-svelte";
  import { Card, Button, Input } from "$lib/design-system";
  import {
    TRAIN_SUB_STEP_CONFIG,
    TRAIN_SUB_STEPS,
    INTEGRATIONS,
    type TrainSubStep,
    getNextTrainSubStep,
    getPreviousTrainSubStep,
    getTrainSubStepProgress,
  } from "$lib/onboarding-v2/flow";
  import {
    onboardingV2Store,
    currentApplicationId,
  } from "../../stores/onboardingV2";

  const SUB_STEP_ICONS: Record<TrainSubStep, typeof Globe> = {
    website: Globe,
    files: FileText,
    integrations: Plug,
  };

  let isLoading = false;
  let urlError: string | null = null;
  let crawlComplete = false;
  let pagesCrawled = 0;

  $: subStepConfig = TRAIN_SUB_STEP_CONFIG[$onboardingV2Store.trainSubStep];
  $: progress = getTrainSubStepProgress($onboardingV2Store.trainSubStep);
  $: appId = $currentApplicationId;

  // Redirect to Build step if no application is selected
  $: if ($onboardingV2Store.isHydrated && !appId) {
    onboardingV2Store.setCurrentStep("build");
  }

  function handleNext() {
    const nextSubStep = getNextTrainSubStep($onboardingV2Store.trainSubStep);

    if (nextSubStep) {
      onboardingV2Store.setTrainSubStep(nextSubStep);
      // Reset state for next sub-step
      crawlComplete = false;
      pagesCrawled = 0;
      urlError = null;
    } else {
      // All sub-steps complete, move to Share step
      onboardingV2Store.markStepCompleted("train");
      onboardingV2Store.setCurrentStep("share");
    }
  }

  function handleBack() {
    const prevSubStep = getPreviousTrainSubStep($onboardingV2Store.trainSubStep);

    if (prevSubStep) {
      onboardingV2Store.setTrainSubStep(prevSubStep);
    } else {
      // Go back to Build step
      onboardingV2Store.setCurrentStep("build");
    }
  }

  function handleSkip() {
    onboardingV2Store.markSubStepSkipped($onboardingV2Store.trainSubStep);
    handleNext();
  }

  async function handleCrawlWebsite() {
    if (!$onboardingV2Store.websiteUrl.trim()) {
      urlError = "Please enter a website URL";
      return;
    }

    // Basic URL validation
    let normalizedUrl: string;
    try {
      normalizedUrl = $onboardingV2Store.websiteUrl.startsWith("http")
        ? $onboardingV2Store.websiteUrl
        : `https://${$onboardingV2Store.websiteUrl}`;
      new URL(normalizedUrl);
      urlError = null;
    } catch {
      urlError = "Please enter a valid URL";
      return;
    }

    if (!appId) {
      urlError = "No application selected. Please go back and select a template.";
      return;
    }

    isLoading = true;

    try {
      const params = new URLSearchParams({
        url: normalizedUrl,
        applicationId: String(appId),
        knowledgeSourceType: "URL",
        crawlAllLinks: "true",
      });

      const response = await fetch(`/api/upload/url?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to start crawl: ${response.statusText}`);
      }

      // Read the SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let done = false;
      let lastError: string | null = null;
      let pagesProcessed = 0;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.progress?.current) {
                  pagesProcessed = data.progress.current;
                }
                if (!data.success && (data.error || data.message)) {
                  if (typeof data.error === "string") {
                    lastError = data.error;
                  } else if (typeof data.message === "string") {
                    lastError = data.message;
                  } else if (data.error?.message) {
                    lastError = data.error.message;
                  } else {
                    lastError = "Crawl failed";
                  }
                }
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }
      }

      if (lastError) {
        urlError = lastError;
        isLoading = false;
        return;
      }

      pagesCrawled = pagesProcessed || 1;
      crawlComplete = true;
      isLoading = false;
    } catch (error) {
      console.error("[TrainContent] Crawl error:", error);
      urlError = error instanceof Error ? error.message : "Failed to crawl website";
      isLoading = false;
    }
  }

  // File upload state
  let isDragActive = false;
  let uploadingFiles: Array<{
    id: string;
    name: string;
    status: "uploading" | "complete" | "error";
    error?: string;
  }> = [];

  async function handleFileUpload(file: File) {
    if (!appId) {
      return;
    }

    const tempId = `temp-${Date.now()}-${file.name}`;
    uploadingFiles = [
      ...uploadingFiles,
      { id: tempId, name: file.name, status: "uploading" },
    ];

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/upload/documents?applicationId=${appId}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to upload file");
      }

      const uploadData = await response.json();
      // Deno backend returns array: { data: [{ knowledgeSourceId, fileName, status }] }
      const firstResult = Array.isArray(uploadData.data) ? uploadData.data[0] : uploadData.data;
      const fileId = firstResult?.knowledgeSourceId || firstResult?.id || `file-${Date.now()}`;

      uploadingFiles = uploadingFiles.map((f) =>
        f.id === tempId ? { ...f, id: fileId, status: "complete" } : f
      );

      onboardingV2Store.addUploadedFile(`${fileId}:${file.name}`);

      setTimeout(() => {
        uploadingFiles = uploadingFiles.filter((f) => f.id !== fileId);
      }, 1000);
    } catch (error) {
      uploadingFiles = uploadingFiles.map((f) =>
        f.id === tempId
          ? {
              ...f,
              status: "error",
              error: error instanceof Error ? error.message : "Upload failed",
            }
          : f
      );
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragActive = false;
    const files = e.dataTransfer?.files;
    if (files) {
      Array.from(files).forEach(handleFileUpload);
    }
  }

  function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files) {
      Array.from(files).forEach(handleFileUpload);
    }
    target.value = "";
  }

  function parseFileInfo(storedId: string) {
    const colonIndex = storedId.indexOf(":");
    if (colonIndex > -1) {
      return {
        fileId: storedId.slice(0, colonIndex),
        fileName: storedId.slice(colonIndex + 1),
      };
    }
    return { fileId: storedId, fileName: storedId };
  }

  async function handleDeleteFile(storedId: string) {
    if (!appId) return;
    const { fileId } = parseFileInfo(storedId);
    
    try {
      await fetch(`/api/application/${appId}/files/${fileId}`, {
        method: "DELETE",
        credentials: "include",
      });
      onboardingV2Store.removeUploadedFile(storedId);
    } catch (error) {
      console.error("[TrainContent] Delete error:", error);
    }
  }

  // Integration state
  let connectingId: string | null = null;
  let selectedIntegration: (typeof INTEGRATIONS)[0] | null = null;
  let integrationInputValue = "";
  let isSubmittingIntegration = false;

  async function handleIntegrationClick(integration: (typeof INTEGRATIONS)[0]) {
    if (!appId) return;
    if ($onboardingV2Store.connectedIntegrations.includes(integration.id)) return;

    if (integration.authType === "apiKey" || integration.authType === "urlParam") {
      selectedIntegration = integration;
      integrationInputValue = "";
      return;
    }

    // OAuth flow would redirect here
    connectingId = integration.id;
    // For now, just mark as connected (real implementation would do OAuth)
    setTimeout(() => {
      onboardingV2Store.toggleIntegration(integration.id);
      connectingId = null;
    }, 1000);
  }

  async function connectWithInput() {
    if (!selectedIntegration || !appId || !integrationInputValue.trim()) return;
    isSubmittingIntegration = true;

    try {
      // In real implementation, this would save the integration
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onboardingV2Store.toggleIntegration(selectedIntegration.id);
      selectedIntegration = null;
      integrationInputValue = "";
    } catch (error) {
      console.error("Failed to connect integration:", error);
    } finally {
      isSubmittingIntegration = false;
    }
  }

  const INTEGRATION_LOGOS: Record<string, string> = {
    hubspot: "/assets/icons/mcp-providers/hubspot.png",
    zapier: "/assets/icons/mcp-providers/zapier.png",
    linear: "/assets/icons/mcp-providers/linear.png",
    shopify: "/assets/icons/mcp-providers/shopify.png",
  };
</script>

<div class="train-step">
  <!-- Sub-step progress -->
  <div class="sub-step-progress">
    <span class="progress-text">
      {subStepConfig.label} ({progress.current}/{progress.total})
    </span>
  </div>

  <!-- Sub-step icons -->
  <div class="sub-step-icons">
    {#each TRAIN_SUB_STEPS as subStep, index}
      {@const SubStepIcon = SUB_STEP_ICONS[subStep]}
      {@const subStepCfg = TRAIN_SUB_STEP_CONFIG[subStep]}
      {@const isCurrent = subStep === $onboardingV2Store.trainSubStep}
      {@const isCompleted =
        TRAIN_SUB_STEPS.indexOf(subStep) <
        TRAIN_SUB_STEPS.indexOf($onboardingV2Store.trainSubStep)}
      {@const isSkipped = $onboardingV2Store.skippedSubSteps.includes(subStep)}
      <div class="sub-step-item">
        <div
          class="sub-step-icon {subStepCfg.iconBackground}"
          class:current={isCurrent}
          class:skipped={isSkipped}
        >
          {#if isCompleted && !isSkipped}
            <Check size={20} class={subStepCfg.iconColor} />
          {:else}
            <SubStepIcon size={20} class={subStepCfg.iconColor} />
          {/if}
        </div>
        {#if index < TRAIN_SUB_STEPS.length - 1}
          <div class="sub-step-connector" class:active={isCompleted} />
        {/if}
      </div>
    {/each}
  </div>

  <!-- Sub-step content -->
  <div class="sub-step-content">
    {#if $onboardingV2Store.trainSubStep === "website"}
      <!-- Website sub-step -->
      <Card class="content-card">
        <div class="card-header">
          <div class="card-icon {crawlComplete ? 'bg-green-100' : 'bg-blue-100'}">
            {#if crawlComplete}
              <Check size={24} class="text-green-600" />
            {:else}
              <Globe size={24} class="text-blue-600" />
            {/if}
          </div>
          <div class="card-text">
            <h3 class="card-title">
              {crawlComplete ? "Website crawled!" : "Add your website"}
            </h3>
            <p class="card-description">
              {crawlComplete
                ? `We indexed ${pagesCrawled} page${pagesCrawled !== 1 ? "s" : ""} from your website`
                : "We'll crawl your website to train your AI on your content"}
            </p>
          </div>
        </div>

        {#if crawlComplete}
          <div class="success-message">
            <Check size={16} />
            <p>Your AI can now answer questions about your website content</p>
          </div>
          <div class="upsell-message">
            <Sparkles size={16} />
            <p>
              <strong>Want more?</strong> Upgrade to Pro or Team to crawl up to 100 pages and index deeper site content.
            </p>
          </div>
        {:else}
          <div class="url-input-container">
            <div class="url-input-wrapper">
              <LinkIcon size={20} class="url-icon" />
              <input
                type="url"
                placeholder="https://yourwebsite.com"
                value={$onboardingV2Store.websiteUrl}
                on:input={(e) => onboardingV2Store.setWebsiteUrl(e.currentTarget.value)}
                class="url-input"
                class:error={urlError}
                disabled={isLoading}
              />
            </div>
            {#if urlError}
              <p class="error-text">{urlError}</p>
            {/if}
            <Button
              on:click={handleCrawlWebsite}
              disabled={!$onboardingV2Store.websiteUrl.trim() || isLoading}
              variant="outline"
              class="crawl-button"
            >
              {#if isLoading}
                <Loader2 size={16} class="spinning" />
                Crawling website...
              {:else}
                <Globe size={16} />
                Crawl website
              {/if}
            </Button>
            <p class="tier-note">
              On the free tier, we'll crawl up to 10 pages. Upgrade to Pro or Team to crawl up to 100 pages.
            </p>
          </div>
        {/if}
      </Card>
    {:else if $onboardingV2Store.trainSubStep === "files"}
      <!-- Files sub-step -->
      <Card class="content-card">
        <div class="card-header">
          <div class="card-icon bg-green-100">
            <FileText size={24} class="text-green-600" />
          </div>
          <div class="card-text">
            <h3 class="card-title">Upload documents</h3>
            <p class="card-description">
              Add PDFs, Word docs, or text files to train your AI
            </p>
          </div>
        </div>

        <!-- Upload area -->
        <div
          class="upload-area"
          class:active={isDragActive}
          class:uploading={uploadingFiles.some((f) => f.status === "uploading")}
          on:drop={handleDrop}
          on:dragover|preventDefault={() => (isDragActive = true)}
          on:dragleave={() => (isDragActive = false)}
          role="button"
          tabindex="0"
        >
          <div class="upload-icon">
            <Upload size={20} />
          </div>
          <p class="upload-text">
            <label class="upload-link">
              Click to upload
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx"
                on:change={handleFileSelect}
                disabled={uploadingFiles.some((f) => f.status === "uploading")}
              />
            </label>
            {" "}or drag and drop
          </p>
          <p class="upload-hint">PDF, DOC, TXT, CSV, XLSX (max 10MB)</p>
        </div>

        <p class="tier-note with-icon">
          <Sparkles size={14} />
          <span><strong>Pro & Team:</strong> Upload files up to 50MB</span>
        </p>

        <!-- Uploading files -->
        {#if uploadingFiles.length > 0}
          <div class="file-list">
            {#each uploadingFiles as file (file.id)}
              <div class="file-item" class:error={file.status === "error"}>
                {#if file.status === "uploading"}
                  <Loader2 size={20} class="spinning" />
                {:else if file.status === "complete"}
                  <Check size={20} class="text-green-600" />
                {:else}
                  <X size={20} class="text-red-600" />
                {/if}
                <span class="file-name">{file.name}</span>
                <span class="file-status">
                  {file.status === "uploading"
                    ? "Uploading..."
                    : file.status === "complete"
                      ? "Complete"
                      : file.error || "Failed"}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Uploaded files -->
        {#if $onboardingV2Store.uploadedFileIds.length > 0}
          <div class="file-list uploaded">
            {#each $onboardingV2Store.uploadedFileIds as storedId (storedId)}
              {@const { fileId, fileName } = parseFileInfo(storedId)}
              <div class="file-item success">
                <Check size={20} />
                <span class="file-name">{fileName}</span>
                <button
                  class="delete-button"
                  on:click={() => handleDeleteFile(storedId)}
                >
                  <X size={16} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {:else if $onboardingV2Store.trainSubStep === "integrations"}
      <!-- Integrations sub-step -->
      <Card class="content-card">
        <div class="card-header">
          <div class="card-icon bg-purple-100">
            <Plug size={24} class="text-purple-600" />
          </div>
          <div class="card-text">
            <h3 class="card-title">Connect integrations</h3>
            <p class="card-description">
              Connect tools to supercharge your app
            </p>
          </div>
        </div>

        <div class="integrations-grid">
          {#each INTEGRATIONS as integration (integration.id)}
            {@const isConnected = $onboardingV2Store.connectedIntegrations.includes(integration.id)}
            {@const isConnecting = connectingId === integration.id}
            {@const logoPath = INTEGRATION_LOGOS[integration.id]}
            <button
              class="integration-card"
              class:connected={isConnected}
              class:connecting={isConnecting}
              on:click={() => handleIntegrationClick(integration)}
              disabled={isConnecting || isConnected}
            >
              <div class="integration-logo">
                {#if logoPath}
                  <img src={logoPath} alt={integration.name} />
                {:else}
                  <span style:color={integration.iconColor || "#6b7280"}>
                    {integration.name.charAt(0)}
                  </span>
                {/if}
              </div>
              <div class="integration-text">
                <p class="integration-name">{integration.name}</p>
                <p class="integration-description">
                  {isConnecting
                    ? "Connecting..."
                    : isConnected
                      ? "Connected"
                      : integration.description}
                </p>
              </div>
              {#if isConnecting}
                <Loader2 size={20} class="spinning" />
              {:else if isConnected}
                <div class="connected-badge">
                  <Check size={14} />
                </div>
              {:else if integration.authType === "oauth"}
                <ExternalLink size={16} />
              {:else}
                <ChevronRight size={16} />
              {/if}
            </button>
          {/each}
        </div>

        <p class="tier-note center">
          More integrations available after onboarding in the app builder.
        </p>
      </Card>
    {/if}
  </div>

  <!-- Navigation buttons -->
  <div class="navigation">
    <Button variant="outline" on:click={handleBack} class="nav-button">
      <ChevronLeft size={20} />
      Back
    </Button>

    <div class="nav-spacer" />

    {#if subStepConfig.skippable}
      <Button variant="ghost" on:click={handleSkip} class="skip-button">
        Skip
        <SkipForward size={16} />
      </Button>
    {/if}

    <Button on:click={handleNext} disabled={isLoading} class="nav-button">
      {#if isLoading}
        <Loader2 size={20} class="spinning" />
        Processing...
      {:else}
        Continue
        <ChevronRight size={20} />
      {/if}
    </Button>
  </div>
</div>

<!-- Integration Input Modal -->
{#if selectedIntegration}
  <div class="modal-overlay" on:click={() => (selectedIntegration = null)} role="presentation">
    <div class="modal-content" on:click|stopPropagation role="dialog">
      <div class="modal-header">
        <div class="modal-logo">
          {#if INTEGRATION_LOGOS[selectedIntegration.id]}
            <img
              src={INTEGRATION_LOGOS[selectedIntegration.id]}
              alt={selectedIntegration.name}
            />
          {:else}
            <span style:color={selectedIntegration.iconColor || "#6b7280"}>
              {selectedIntegration.name.charAt(0)}
            </span>
          {/if}
        </div>
        <div>
          <h3 class="modal-title">Connect {selectedIntegration.name}</h3>
          <p class="modal-description">{selectedIntegration.description}</p>
        </div>
      </div>

      <div class="modal-body">
        <label class="input-label">
          {selectedIntegration.authType === "apiKey"
            ? selectedIntegration.apiKeyLabel
            : selectedIntegration.urlParamLabel}
        </label>
        <input
          type={selectedIntegration.authType === "apiKey" ? "password" : "text"}
          bind:value={integrationInputValue}
          placeholder={selectedIntegration.authType === "apiKey"
            ? selectedIntegration.apiKeyPlaceholder
            : selectedIntegration.urlParamPlaceholder}
          class="modal-input"
        />
        {#if selectedIntegration.apiKeyHelpUrl}
          <a
            href={selectedIntegration.apiKeyHelpUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="help-link"
          >
            Get your API key
            <ExternalLink size={12} />
          </a>
        {/if}
      </div>

      <div class="modal-footer">
        <Button
          variant="outline"
          on:click={() => {
            selectedIntegration = null;
            integrationInputValue = "";
          }}
          disabled={isSubmittingIntegration}
        >
          Cancel
        </Button>
        <Button
          on:click={connectWithInput}
          disabled={!integrationInputValue.trim() || isSubmittingIntegration}
        >
          {#if isSubmittingIntegration}
            <Loader2 size={16} class="spinning" />
            Connecting...
          {:else}
            Connect
          {/if}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .train-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .sub-step-progress {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .progress-text {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  /* Sub-step icons */
  .sub-step-icons {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .sub-step-item {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .sub-step-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .sub-step-icon.current {
    ring: 2px;
    ring-offset: 2px;
    ring-color: var(--brand-color);
    box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px var(--brand-color);
  }

  .sub-step-icon.skipped {
    opacity: 0.5;
  }

  .sub-step-connector {
    flex: 1;
    height: 2px;
    margin: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: hsl(var(--muted));
    transition: background 0.2s;
  }

  .sub-step-connector.active {
    background: color-mix(in srgb, var(--brand-color) 30%, transparent);
  }

  /* Content card */
  :global(.content-card) {
    padding: var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
    border: 1px solid hsl(var(--border)) !important;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-text {
    flex: 1;
  }

  .card-title {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  /* URL input */
  .url-input-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .url-input-wrapper {
    position: relative;
  }

  .url-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
  }

  .url-input {
    width: 100%;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-10);
    border-radius: var(--radius-xl);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    font-size: var(--text-sm);
  }

  .url-input.error {
    border-color: hsl(var(--destructive));
  }

  .error-text {
    font-size: var(--text-sm);
    color: hsl(var(--destructive));
    margin: 0;
  }

  :global(.crawl-button) {
    width: 100%;
    height: 44px !important;
    border-radius: var(--radius-xl) !important;
  }

  .tier-note {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin: 0;
  }

  .tier-note.with-icon {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    justify-content: flex-start;
    margin-top: var(--space-3);
  }

  .tier-note.center {
    text-align: center;
    margin-top: var(--space-4);
  }

  /* Success/upsell messages */
  .success-message {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(142 76% 96%);
    border: 1px solid hsl(142 76% 80%);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-3);
  }

  .success-message p {
    font-size: var(--text-sm);
    color: hsl(142 64% 24%);
    margin: 0;
  }

  .success-message :global(svg) {
    color: hsl(142 64% 40%);
    flex-shrink: 0;
  }

  .upsell-message {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
  }

  .upsell-message p {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .upsell-message strong {
    color: hsl(var(--foreground));
  }

  .upsell-message :global(svg) {
    color: var(--brand-color);
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* Upload area */
  .upload-area {
    border: 2px dashed hsl(var(--muted-foreground) / 0.25);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
  }

  .upload-area:hover {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent);
    background: hsl(var(--muted) / 0.3);
  }

  .upload-area.active {
    border-color: var(--brand-color);
    background: color-mix(in srgb, var(--brand-color) 5%, transparent);
  }

  .upload-area.uploading {
    opacity: 0.5;
    pointer-events: none;
  }

  .upload-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--space-2);
    color: hsl(var(--muted-foreground));
  }

  .upload-text {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .upload-link {
    color: var(--brand-color);
    font-weight: var(--font-medium);
    cursor: pointer;
  }

  .upload-link:hover {
    text-decoration: underline;
  }

  .upload-link input {
    display: none;
  }

  .upload-hint {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  /* File list */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
  }

  .file-item.error {
    background: hsl(var(--destructive) / 0.1);
  }

  .file-item.success {
    background: hsl(142 76% 96%);
    border: 1px solid hsl(142 76% 80%);
  }

  .file-name {
    flex: 1;
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-status {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .delete-button {
    padding: var(--space-1);
    border-radius: var(--radius);
    background: none;
    border: none;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
  }

  .delete-button:hover {
    background: hsl(142 76% 90%);
  }

  /* Integrations grid */
  .integrations-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  @media (max-width: 640px) {
    .integrations-grid {
      grid-template-columns: 1fr;
    }
  }

  .integration-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-xl);
    border: 2px solid hsl(var(--border));
    background: hsl(var(--card));
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .integration-card:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent);
  }

  .integration-card.connected {
    border-color: hsl(142 76% 50%);
    background: hsl(142 76% 96%);
    cursor: default;
  }

  .integration-card.connecting {
    border-color: var(--brand-color);
    background: color-mix(in srgb, var(--brand-color) 5%, transparent);
    cursor: wait;
  }

  .integration-logo {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: white;
    border: 1px solid hsl(var(--border) / 0.5);
  }

  .integration-logo img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }

  .integration-logo span {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
  }

  .integration-text {
    flex: 1;
    min-width: 0;
  }

  .integration-name {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .integration-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connected-badge {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: hsl(142 76% 50%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  /* Navigation */
  .navigation {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-top: var(--space-4);
  }

  :global(.nav-button) {
    height: 48px !important;
    padding: 0 var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
  }

  :global(.skip-button) {
    height: 48px !important;
    padding: 0 var(--space-6) !important;
    border-radius: var(--radius-xl) !important;
    color: hsl(var(--muted-foreground)) !important;
  }

  .nav-spacer {
    flex: 1;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: var(--space-4);
  }

  .modal-content {
    background: hsl(var(--card));
    border-radius: var(--radius-2xl);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    max-width: 28rem;
    width: 100%;
    padding: var(--space-6);
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .modal-logo {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
    background: white;
    border: 1px solid hsl(var(--border) / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .modal-logo img {
    width: 32px;
    height: 32px;
    object-fit: contain;
  }

  .modal-logo span {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
  }

  .modal-title {
    font-size: var(--text-lg);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .modal-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .input-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .modal-input {
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    font-size: var(--text-sm);
  }

  .help-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--brand-color);
    text-decoration: none;
  }

  .help-link:hover {
    text-decoration: underline;
  }

  .modal-footer {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }

  .modal-footer :global(button) {
    flex: 1;
  }

  /* Color utilities */
  .bg-blue-100 {
    background: hsl(217 91% 95%);
  }

  .bg-green-100 {
    background: hsl(142 76% 95%);
  }

  .bg-purple-100 {
    background: hsl(270 91% 95%);
  }

  :global(.text-blue-600) {
    color: hsl(217 91% 60%);
  }

  :global(.text-green-600) {
    color: hsl(142 76% 40%);
  }

  :global(.text-purple-600) {
    color: hsl(270 91% 60%);
  }

  :global(.text-red-600) {
    color: hsl(0 84% 60%);
  }

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
