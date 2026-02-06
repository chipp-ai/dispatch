<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ArrowLeft, Globe, Loader2 } from 'lucide-svelte';
  import { captureException } from '$lib/sentry';

  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    back: void;
    close: void;
    sourceAdded: { id: string; type: string; name: string; url?: string };
  }>();

  let urlInputValue = '';
  let crawlAllLinks = false;
  let isProcessing = false;
  let processingPhase = '';
  let processingProgress = 0;
  let error: string | null = null;
  let success = false;

  function normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  }

  function isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async function handleAddWebsite() {
    const url = normalizeUrl(urlInputValue);

    if (!isValidUrl(url)) {
      error = 'Please enter a valid URL';
      return;
    }

    isProcessing = true;
    error = null;
    processingPhase = 'starting';
    processingProgress = 0;

    try {
      const params = new URLSearchParams({
        applicationId,
        url,
        crawlLinks: crawlAllLinks.toString(),
      });

      const response = await fetch(`/api/upload/url?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to start URL upload');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              processingPhase = data.phase || processingPhase;
              processingProgress = data.progress || processingProgress;

              if (data.phase === 'completed' && data.result) {
                success = true;
                dispatch('sourceAdded', {
                  id: data.result.id,
                  type: 'url',
                  name: new URL(url).hostname,
                  url,
                });
              }

              if (data.phase === 'error') {
                error = data.error || 'Upload failed';
                isProcessing = false;
              }
            } catch (e) {
              captureException(e, {
                tags: { feature: "website-upload" },
                extra: { context: "sse-parse" },
              });
            }
          }
        }
      }

      if (!success && !error) {
        error = 'Upload completed but no result received';
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "website-upload" },
        extra: { applicationId },
      });
      error = e instanceof Error ? e.message : 'Upload failed';
    } finally {
      if (!success) {
        isProcessing = false;
      }
    }
  }

  function getPhaseLabel(phase: string): string {
    switch (phase) {
      case 'starting': return 'Starting...';
      case 'fetching': return 'Fetching page content...';
      case 'parsing': return 'Parsing content...';
      case 'chunking': return 'Splitting into chunks...';
      case 'embedding': return 'Creating embeddings...';
      case 'completed': return 'Complete!';
      default: return 'Processing...';
    }
  }

  function handleBack() {
    dispatch('back');
  }

  function handleClose() {
    dispatch('close');
  }
</script>

<div class="ks-upload-screen">
  <div class="ks-upload-content">
    <!-- Header with back button -->
    <div class="ks-upload-header">
      <button class="ks-back-btn" on:click={handleBack}>
        <ArrowLeft size={20} />
        Back
      </button>
      <h2 class="ks-upload-title">Add Website</h2>
      <p class="ks-upload-description">
        Add a website URL as a knowledge source for your AI assistant
      </p>
    </div>

    {#if !isProcessing && !success}
      <!-- URL Input Form -->
      <div class="ks-form-section">
        <div class="ks-form-group">
          <label for="website-url" class="ks-label">Website URL</label>
          <input
            id="website-url"
            type="url"
            class="ks-input"
            placeholder="https://example.com"
            bind:value={urlInputValue}
            on:keydown={(e) => e.key === 'Enter' && handleAddWebsite()}
          />
        </div>

        <!-- Crawl Toggle -->
        <div class="ks-crawl-toggle">
          <label class="ks-toggle-container">
            <input
              type="checkbox"
              bind:checked={crawlAllLinks}
              class="ks-toggle-input"
            />
            <div class="ks-toggle-track">
              <div class="ks-toggle-thumb"></div>
            </div>
            <span class="ks-toggle-label">
              Crawl linked pages
              <span class="ks-toggle-description">
                Also process pages linked from this URL (up to 50 pages)
              </span>
            </span>
          </label>
        </div>

        {#if error}
          <div class="ks-error-message">
            {error}
          </div>
        {/if}
      </div>
    {:else if isProcessing}
      <!-- Processing State -->
      <div class="ks-processing-state">
        <div class="ks-processing-icon">
          <Globe size={48} class="ks-globe-icon" />
          <div class="ks-processing-spinner">
            <Loader2 size={64} class="ks-spinner" />
          </div>
        </div>

        <div class="ks-processing-info">
          <h3 class="ks-processing-title">{getPhaseLabel(processingPhase)}</h3>
          <p class="ks-processing-url">{urlInputValue}</p>
        </div>

        <div class="ks-progress-container">
          <div class="ks-progress-bar">
            <div
              class="ks-progress-fill"
              style="width: {processingProgress}%"
            ></div>
          </div>
          <span class="ks-progress-text">{processingProgress}%</span>
        </div>
      </div>
    {:else if success}
      <!-- Success State -->
      <div class="ks-success-state">
        <div class="ks-success-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <h3 class="ks-success-title">Website Added Successfully!</h3>
        <p class="ks-success-url">{urlInputValue}</p>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="ks-upload-footer">
    {#if success}
      <button class="ks-btn ks-btn-primary" on:click={handleClose}>
        Done
      </button>
    {:else}
      <button
        class="ks-btn ks-btn-primary"
        on:click={handleAddWebsite}
        disabled={!urlInputValue || isProcessing}
      >
        {#if isProcessing}
          <Loader2 size={16} class="ks-btn-spinner" />
          Processing...
        {:else}
          Add Website
        {/if}
      </button>
    {/if}
  </div>
</div>

<style>
  .ks-upload-screen {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
  }

  .ks-upload-content {
    flex: 1;
    overflow-y: auto;
  }

  .ks-upload-header {
    margin-bottom: var(--space-6);
  }

  .ks-back-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: var(--space-4);
  }

  .ks-back-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-color: var(--border-secondary);
  }

  .ks-upload-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .ks-upload-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .ks-form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ks-form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ks-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ks-input {
    padding: var(--space-3) var(--space-4);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
    font-size: var(--text-sm);
    transition: all 0.2s ease;
  }

  .ks-input:focus {
    outline: none;
    border-color: var(--brand-blue);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
  }

  .ks-input::placeholder {
    color: var(--text-tertiary);
  }

  /* Crawl Toggle */
  .ks-crawl-toggle {
    margin-top: var(--space-2);
  }

  .ks-toggle-container {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    cursor: pointer;
  }

  .ks-toggle-input {
    display: none;
  }

  .ks-toggle-track {
    width: 44px;
    height: 24px;
    background: var(--bg-tertiary);
    border-radius: 12px;
    padding: 2px;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .ks-toggle-input:checked + .ks-toggle-track {
    background: var(--brand-blue);
  }

  .ks-toggle-thumb {
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .ks-toggle-input:checked + .ks-toggle-track .ks-toggle-thumb {
    transform: translateX(20px);
  }

  .ks-toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ks-toggle-description {
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--text-secondary);
  }

  /* Error Message */
  .ks-error-message {
    padding: var(--space-3) var(--space-4);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-lg);
    color: #f87171;
    font-size: var(--text-sm);
  }

  /* Processing State */
  .ks-processing-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    padding: var(--space-8) 0;
  }

  .ks-processing-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.ks-globe-icon) {
    color: var(--brand-blue);
  }

  .ks-processing-spinner {
    position: absolute;
    inset: -8px;
  }

  :global(.ks-spinner) {
    color: var(--brand-blue);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .ks-processing-info {
    text-align: center;
  }

  .ks-processing-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .ks-processing-url {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .ks-progress-container {
    width: 100%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
  }

  .ks-progress-bar {
    width: 100%;
    height: 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .ks-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--brand-blue), var(--brand-purple));
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .ks-progress-text {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  /* Success State */
  .ks-success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8) 0;
  }

  .ks-success-icon {
    color: #22c55e;
  }

  .ks-success-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .ks-success-url {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Footer */
  .ks-upload-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-primary);
    margin-top: var(--space-4);
  }

  .ks-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .ks-btn-primary {
    background: linear-gradient(135deg, var(--brand-blue), var(--brand-purple));
    color: white;
  }

  .ks-btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .ks-btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.ks-btn-spinner) {
    animation: spin 1s linear infinite;
  }
</style>
