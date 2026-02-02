<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import BuilderCard from "./BuilderCard.svelte";
  import { Input } from "$lib/design-system";
  import { toasts } from "$lib/design-system";
  import ModelSelector from "./ModelSelector.svelte";
  import ModelDetailSheet from "./ModelDetailSheet.svelte";
  import ModelComparisonModal from "./ModelComparisonModal.svelte";
  import EmbeddingProviderSelector from "./EmbeddingProviderSelector.svelte";
  import KnowledgeSourceModal from "../KnowledgeSourceModal/KnowledgeSourceModal.svelte";
  import { getModelById, DEFAULT_MODEL_ID, type ModelConfig } from "./modelConfig";
  import { currentOrganization } from "../../../../stores/organization";
  import { subscribe as wsSubscribe, connect as wsConnect, type JobCompletedEvent, type JobFailedEvent } from "../../../../stores/websocket";

  export let model: string = DEFAULT_MODEL_ID;
  export let systemPrompt: string = "";
  export let embeddingProvider: string = "local";
  export let customEmbeddingEndpoint: string = "";
  export let customEmbeddingApiKey: string = "";
  export let customEmbeddingModel: string = "";
  export let knowledgeSources: Array<{ id: string; type: "file" | "url"; name: string; url?: string }> = [];
  export let applicationId: string = "";

  export let onModelChange: (value: string) => void = () => {};
  export let onSystemPromptChange: (value: string) => void = () => {};
  export let onEmbeddingProviderChange: (config: {
    value: string;
    customEndpoint?: string;
    customApiKey?: string;
    customModel?: string;
  }) => void = () => {};
  export let onKnowledgeSourcesChange: (sources: typeof knowledgeSources) => void = () => {};

  let fileInput: HTMLInputElement;
  let urlInput: string = "";
  let isAddingUrl: boolean = false;
  let isUploading: boolean = false;

  // Model selector state
  let showDetailSheet = false;
  let showComparisonModal = false;
  let selectedModelForDetail: ModelConfig | null = null;

  // Knowledge source modal state
  let showKnowledgeSourceModal = false;

  // Track pending uploads for WebSocket notifications
  // Using a reactive statement to trigger UI updates
  // Store both name and toast ID for each pending upload
  let pendingUploads = new Map<string, { name: string; toastId: string }>();
  let pendingUploadIds: string[] = [];
  $: pendingUploadIds = Array.from(pendingUploads.keys());

  // Sort knowledge sources: processing items first, then by original order
  $: sortedKnowledgeSources = [...knowledgeSources].sort((a, b) => {
    const aProcessing = pendingUploadIds.includes(a.id);
    const bProcessing = pendingUploadIds.includes(b.id);
    if (aProcessing && !bProcessing) return -1;
    if (!aProcessing && bProcessing) return 1;
    return 0;
  });

  // WebSocket unsubscribe functions
  let unsubscribeCompleted: (() => void) | null = null;
  let unsubscribeFailed: (() => void) | null = null;

  // Get subscription tier from organization store
  $: subscriptionTier = $currentOrganization?.subscriptionTier ?? "PRO";

  // Subscribe to WebSocket events for processing status
  onMount(() => {
    // Ensure WebSocket is connected
    wsConnect();

    // Handle job completed events
    unsubscribeCompleted = wsSubscribe("job:completed", (event) => {
      const data = event as JobCompletedEvent;
      if (data.result?.type === "knowledge_source_processed") {
        const knowledgeSourceId = data.result.knowledgeSourceId || data.jobId;
        const pending = pendingUploads.get(knowledgeSourceId);

        if (pending) {
          // Transform the loading toast into a success toast
          toasts.update(pending.toastId, {
            title: `"${pending.name}" is ready`,
            description: `${data.result.chunkCount} chunks created`,
            variant: "success",
            duration: 5000,
          });

          pendingUploads.delete(knowledgeSourceId);
          pendingUploadIds = Array.from(pendingUploads.keys()); // Trigger reactivity
        }
      }
    });

    // Handle job failed events
    unsubscribeFailed = wsSubscribe("job:failed", (event) => {
      const data = event as JobFailedEvent;
      const pending = pendingUploads.get(data.jobId);

      if (pending) {
        // Transform the loading toast into an error toast
        toasts.update(pending.toastId, {
          title: `Processing failed`,
          description: `"${pending.name}": ${data.error}`,
          variant: "error",
          duration: 5000,
        });

        pendingUploads.delete(data.jobId);
        pendingUploadIds = Array.from(pendingUploads.keys()); // Trigger reactivity

        // Remove failed source from the list
        const remainingSources = knowledgeSources.filter(s => s.id !== data.jobId);
        onKnowledgeSourcesChange(remainingSources);
      }
    });
  });

  // Cleanup subscriptions on destroy
  onDestroy(() => {
    unsubscribeCompleted?.();
    unsubscribeFailed?.();
  });

  const ACCEPTED_FILE_TYPES = ".pdf,.txt,.docx,.doc";
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  function handleModelChange(e: CustomEvent<{ value: string }>) {
    onModelChange(e.detail.value);
  }

  function handleEmbeddingProviderChange(e: CustomEvent<{
    value: string;
    customEndpoint?: string;
    customApiKey?: string;
    customModel?: string;
  }>) {
    embeddingProvider = e.detail.value;
    if (e.detail.customEndpoint !== undefined) customEmbeddingEndpoint = e.detail.customEndpoint;
    if (e.detail.customApiKey !== undefined) customEmbeddingApiKey = e.detail.customApiKey;
    if (e.detail.customModel !== undefined) customEmbeddingModel = e.detail.customModel;
    onEmbeddingProviderChange(e.detail);
  }

  function handleDetailView(modelConfig: ModelConfig) {
    selectedModelForDetail = modelConfig;
    showDetailSheet = true;
  }

  function handleCompareClick() {
    showComparisonModal = true;
  }

  function handleModelSelect(modelId: string) {
    onModelChange(modelId);
  }

  function handleFileUpload() {
    fileInput?.click();
  }

  async function handleFilesSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files || files.length === 0) return;

    // Validate files first
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toasts.error(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }

      // Validate file type
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !['pdf', 'txt', 'docx', 'doc'].includes(extension)) {
        toasts.error(`File "${file.name}" has an unsupported format. Please use PDF, TXT, or DOCX.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      target.value = "";
      return;
    }

    // Upload files to server
    isUploading = true;
    try {
      const formData = new FormData();
      validFiles.forEach(file => formData.append('file', file));

      // Build upload URL with embedding config
      const uploadParams = new URLSearchParams({
        applicationId,
        embeddingProvider,
      });
      if (embeddingProvider === 'custom') {
        if (customEmbeddingEndpoint) uploadParams.set('customEndpoint', customEmbeddingEndpoint);
        if (customEmbeddingApiKey) uploadParams.set('customApiKey', customEmbeddingApiKey);
        if (customEmbeddingModel) uploadParams.set('customModel', customEmbeddingModel);
      }

      const response = await fetch(`/api/upload/documents?${uploadParams.toString()}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      const uploadedSources = result.data || [];

      // Add uploaded sources to the list (mapping API response fields)
      const newSources = [
        ...knowledgeSources,
        ...uploadedSources.map((s: { knowledgeSourceId: string; fileName: string; filePath?: string }) => ({
          id: s.knowledgeSourceId,
          type: "file" as const,
          name: s.fileName,
          url: s.filePath,
        }))
      ];

      // Track pending uploads for WebSocket notifications BEFORE updating sources
      // Create a loading toast for each file and store the toast ID
      for (const source of uploadedSources) {
        const toastId = toasts.loading(
          `Processing "${source.fileName}"`,
          "This may take a few seconds..."
        );
        pendingUploads.set(source.knowledgeSourceId, { name: source.fileName, toastId });
      }
      pendingUploadIds = Array.from(pendingUploads.keys()); // Trigger reactivity

      onKnowledgeSourcesChange(newSources);
    } catch (error) {
      console.error('Upload error:', error);
      toasts.error(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      isUploading = false;
      target.value = "";
    }
  }

  function toggleUrlInput() {
    isAddingUrl = !isAddingUrl;
    if (!isAddingUrl) {
      urlInput = "";
    }
  }

  async function handleAddUrl() {
    const trimmedUrl = urlInput.trim();

    if (!trimmedUrl) {
      toasts.error("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      const url = new URL(trimmedUrl);
      if (!url.protocol.startsWith('http')) {
        throw new Error("Invalid protocol");
      }
    } catch {
      toasts.error("Please enter a valid URL (must start with http:// or https://)");
      return;
    }

    // Check for duplicates
    if (knowledgeSources.some(s => s.url === trimmedUrl)) {
      toasts.error("This URL has already been added");
      return;
    }

    // Upload URL to server via SSE
    isUploading = true;
    try {
      // Build URL upload params with embedding config
      const urlParams = new URLSearchParams({
        applicationId,
        url: trimmedUrl,
        embeddingProvider,
      });
      if (embeddingProvider === 'custom') {
        if (customEmbeddingEndpoint) urlParams.set('customEndpoint', customEmbeddingEndpoint);
        if (customEmbeddingApiKey) urlParams.set('customApiKey', customEmbeddingApiKey);
        if (customEmbeddingModel) urlParams.set('customModel', customEmbeddingModel);
      }

      const eventSource = new EventSource(`/api/upload/url?${urlParams.toString()}`);

      interface SSEResult { knowledgeSourceId?: string; id?: string }

      const result = await new Promise<SSEResult>((resolve, reject) => {
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.phase === 'error') {
            eventSource.close();
            reject(new Error(data.error));
          } else if (data.phase === 'completed') {
            eventSource.close();
            resolve(data.result as SSEResult);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          reject(new Error('Connection error'));
        };
      });

      const sourceId = result.knowledgeSourceId || result.id;
      if (result && sourceId) {
        const newSources = [
          ...knowledgeSources,
          {
            id: sourceId,
            type: "url" as const,
            name: trimmedUrl,
            url: trimmedUrl,
          }
        ];

        onKnowledgeSourcesChange(newSources);
        toasts.success("URL added successfully");
      }

      urlInput = "";
      isAddingUrl = false;
    } catch (error) {
      console.error('URL upload error:', error);
      toasts.error(error instanceof Error ? error.message : 'Failed to add URL');
    } finally {
      isUploading = false;
    }
  }

  async function handleRemoveSource(id: string) {
    try {
      const response = await fetch(`/api/knowledge-sources/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete knowledge source');
      }

      const newSources = knowledgeSources.filter(s => s.id !== id);
      onKnowledgeSourcesChange(newSources);
      toasts.success("Knowledge source removed");
    } catch (error) {
      console.error('Delete error:', error);
      toasts.error(error instanceof Error ? error.message : 'Failed to remove knowledge source');
    }
  }

  function getSourceIcon(type: "file" | "url") {
    if (type === "url") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>`;
  }

  function openKnowledgeSourceModal() {
    showKnowledgeSourceModal = true;
  }

  function handleSourceAdded(event: CustomEvent<{ id: string; type: string; name: string; url?: string }>) {
    const source = event.detail;

    // Create a loading toast and track in pendingUploads BEFORE adding to list
    const toastId = toasts.loading(
      `Processing "${source.name}"`,
      "This may take a few seconds..."
    );
    pendingUploads.set(source.id, { name: source.name, toastId });
    pendingUploadIds = Array.from(pendingUploads.keys()); // Trigger reactivity

    const newSources = [
      ...knowledgeSources,
      {
        id: source.id,
        type: (source.type === 'url' || source.type === 'website' || source.type === 'youtube') ? 'url' as const : 'file' as const,
        name: source.name,
        url: source.url,
      }
    ];
    onKnowledgeSourcesChange(newSources);
  }
</script>

<BuilderCard title="Intelligence" rightIcon="dropdown">
  <div class="form">
    <div class="field">
      <div class="label-row">
        <label for="model">Model</label>
        <span class="tooltip" title="The AI model that powers your assistant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <ModelSelector
        value={model}
        on:change={handleModelChange}
        onDetailView={handleDetailView}
        onCompareClick={handleCompareClick}
      />
    </div>

    <div class="field">
      <div class="label-row">
        <label for="embeddingProvider">Embedding Provider</label>
        <span class="tooltip" title="How your documents are converted to searchable vectors for RAG">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <EmbeddingProviderSelector
        value={embeddingProvider}
        customEndpoint={customEmbeddingEndpoint}
        customApiKey={customEmbeddingApiKey}
        customModel={customEmbeddingModel}
        on:change={handleEmbeddingProviderChange}
      />
    </div>

    <!-- Model Detail Sheet -->
    <ModelDetailSheet
      bind:open={showDetailSheet}
      model={selectedModelForDetail}
      onSelect={handleModelSelect}
      {subscriptionTier}
    />

    <!-- Model Comparison Modal -->
    <ModelComparisonModal
      bind:open={showComparisonModal}
      currentModelId={model}
      onSelect={handleModelSelect}
      onDetailView={handleDetailView}
      {subscriptionTier}
    />

    <!-- Knowledge Source Modal -->
    <KnowledgeSourceModal
      bind:open={showKnowledgeSourceModal}
      {applicationId}
      on:sourceAdded={handleSourceAdded}
    />

    <div class="field">
      <div class="label-row">
        <label for="systemPrompt">System Prompt</label>
        <span
          class="tooltip"
          title="Instructions that define your AI's personality and behavior"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <textarea
        placeholder="You are a helpful assistant that..."
        value={systemPrompt}
        on:input={(e) => {
          const target = e.currentTarget as HTMLTextAreaElement;
          if (target) onSystemPromptChange(target.value);
        }}
        maxlength={10000}
      ></textarea>
      <p class="char-count">{systemPrompt.length}/10,000</p>
    </div>

    <div class="field">
      <div class="label-row">
        <label>Knowledge Sources</label>
        <span class="tooltip" title="Add documents and data to train your AI">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>

      <!-- Hidden file input -->
      <input
        type="file"
        bind:this={fileInput}
        on:change={handleFilesSelected}
        accept={ACCEPTED_FILE_TYPES}
        multiple
        style="display: none;"
      />

      {#if knowledgeSources.length === 0}
        <!-- Empty state -->
        <div class="knowledge-placeholder">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p>Upload files, add URLs, videos, and more to train your AI</p>
          <div class="button-group">
            <button type="button" class="add-source-btn" on:click={openKnowledgeSourceModal}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8"/>
                <path d="M8 12h8"/>
              </svg>
              Add Knowledge Source
            </button>
          </div>
        </div>
      {:else}
        <!-- Sources list - sorted with processing items first -->
        <div class="sources-container">
          <div class="sources-list">
            {#each sortedKnowledgeSources as source (source.id)}
              {@const isProcessing = pendingUploadIds.includes(source.id)}
              <div class="source-item" class:processing={isProcessing}>
                <div class="source-icon">
                  {#if isProcessing}
                    <div class="processing-spinner"></div>
                  {:else}
                    {@html getSourceIcon(source.type)}
                  {/if}
                </div>
                <div class="source-info">
                  <span class="source-name" title={source.name}>{source.name}</span>
                  <span class="source-type">
                    {#if isProcessing}
                      Processing...
                    {:else}
                      {source.type === 'file' ? 'File' : 'URL'}
                    {/if}
                  </span>
                </div>
                <button
                  type="button"
                  class="remove-btn"
                  on:click={() => handleRemoveSource(source.id)}
                  aria-label="Remove {source.name}"
                  disabled={isProcessing}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6 6 18"/>
                    <path d="m6 6 12 12"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>

          <div class="add-more-actions">
            <button type="button" class="add-more-btn" on:click={openKnowledgeSourceModal}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8"/>
                <path d="M8 12h8"/>
              </svg>
              Add More Sources
            </button>
          </div>
        </div>
      {/if}

      <!-- URL input section -->
      {#if isAddingUrl}
        <div class="url-input-section">
          <div class="url-input-wrapper">
            <Input
              type="url"
              placeholder="https://example.com"
              value={urlInput}
              on:input={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                if (target) urlInput = target.value;
              }}
              on:keydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddUrl();
                } else if (e.key === 'Escape') {
                  toggleUrlInput();
                }
              }}
            />
            <div class="url-actions">
              <button type="button" class="url-action-btn primary" on:click={handleAddUrl} disabled={isUploading}>
                {#if isUploading}
                  <span class="spinner small"></span>
                  Adding...
                {:else}
                  Add
                {/if}
              </button>
              <button type="button" class="url-action-btn" on:click={toggleUrlInput} disabled={isUploading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</BuilderCard>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .tooltip {
    color: var(--text-tertiary);
    cursor: help;
    display: flex;
    align-items: center;
  }

  .tooltip:hover {
    color: var(--text-secondary);
  }

  textarea {
    width: 100%;
    min-height: 200px;
    padding: var(--space-3);
    border-radius: var(--radius-xl);
    border: 2px solid var(--border-primary);
    font-size: var(--text-sm);
    font-family: inherit;
    resize: vertical;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }

  .char-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: right;
    margin: 0;
  }

  .knowledge-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8);
    border: 2px dashed var(--border-primary);
    border-radius: var(--radius-xl);
    color: var(--text-secondary);
    text-align: center;
  }

  .knowledge-placeholder p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .button-group {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .add-source-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-source-btn:hover {
    background: var(--color-primary);
    color: white;
  }

  .add-source-btn.secondary {
    color: var(--text-secondary);
    border-color: var(--border-primary);
  }

  .add-source-btn.secondary:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  /* Sources container */
  .sources-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
    background: var(--bg-primary);
    max-height: 300px;
    overflow-y: auto;
  }

  .source-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    transition: background 0.2s ease;
  }

  .source-item:hover {
    background: var(--bg-tertiary);
  }

  .source-item.processing {
    background: var(--bg-secondary);
    opacity: 0.9;
  }

  .source-item.processing .source-type {
    color: var(--brand-color);
    font-weight: 500;
  }

  .processing-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-secondary);
    border-top-color: var(--brand-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .source-icon {
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .source-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .source-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-type {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .remove-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .remove-btn:hover:not(:disabled) {
    color: var(--color-error);
    background: var(--color-error-light);
  }

  .remove-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .add-more-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .add-more-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-more-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  /* URL input section */
  .url-input-section {
    margin-top: var(--space-3);
    padding: var(--space-4);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
    background: var(--bg-secondary);
  }

  .url-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .url-actions {
    display: flex;
    gap: var(--space-2);
  }

  .url-action-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--border-primary);
    background: transparent;
    color: var(--text-secondary);
  }

  .url-action-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .url-action-btn.primary {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .url-action-btn.primary:hover {
    background: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
  }

  .url-action-btn:disabled,
  .add-source-btn:disabled,
  .add-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .spinner.small {
    width: 12px;
    height: 12px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
