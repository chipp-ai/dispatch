<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fly, slide } from "svelte/transition";

  export let value: string = "local";
  export let customEndpoint: string = "";
  export let customApiKey: string = "";
  export let customModel: string = "";

  const dispatch = createEventDispatcher<{
    change: {
      value: string;
      customEndpoint?: string;
      customApiKey?: string;
      customModel?: string;
    };
  }>();

  interface EmbeddingProvider {
    id: string;
    name: string;
    description: string;
    speed: "fast" | "medium" | "slow";
    accuracy: "good" | "great" | "excellent";
    warning?: string;
  }

  const PROVIDERS: EmbeddingProvider[] = [
    {
      id: "local",
      name: "Local (BGE)",
      description: "Fast, privacy-focused - no data leaves your infrastructure",
      speed: "fast",
      accuracy: "good",
    },
    {
      id: "openai",
      name: "OpenAI",
      description: "Industry-leading accuracy for production apps",
      speed: "medium",
      accuracy: "excellent",
    },
    {
      id: "custom",
      name: "Custom Endpoint",
      description: "Bring your own OpenAI-compatible embedding API",
      speed: "medium",
      accuracy: "great",
      warning: "Requires API configuration",
    },
  ];

  let isOpen = false;
  let dropdownRef: HTMLDivElement;

  $: selectedProvider = PROVIDERS.find(p => p.id === value) || PROVIDERS[0];
  $: isCustom = value === "custom";

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function selectProvider(provider: EmbeddingProvider) {
    value = provider.id;
    dispatchChange();
    isOpen = false;
  }

  function dispatchChange() {
    if (value === "custom") {
      dispatch("change", {
        value,
        customEndpoint,
        customApiKey,
        customModel,
      });
    } else {
      dispatch("change", { value });
    }
  }

  function handleCustomConfigChange() {
    dispatchChange();
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      isOpen = false;
    }
  }

  function getSpeedLabel(speed: string): string {
    switch (speed) {
      case "fast": return "Fast";
      case "medium": return "Medium";
      case "slow": return "Slow";
      default: return speed;
    }
  }

  function getAccuracyLabel(accuracy: string): string {
    switch (accuracy) {
      case "excellent": return "Excellent";
      case "great": return "Great";
      case "good": return "Good";
      default: return accuracy;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} on:keydown={handleKeydown} />

<div class="provider-selector" bind:this={dropdownRef}>
  <!-- Trigger Button -->
  <button type="button" class="selector-trigger" on:click={toggleDropdown}>
    <div class="selected-provider">
      <span class="provider-name">{selectedProvider.name}</span>
      <span class="provider-meta">{getSpeedLabel(selectedProvider.speed)} · {getAccuracyLabel(selectedProvider.accuracy)} accuracy</span>
    </div>
    <svg
      class="chevron"
      class:open={isOpen}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>

  <!-- Dropdown -->
  {#if isOpen}
    <div class="dropdown" transition:fly={{ y: -10, duration: 150 }}>
      <!-- Header with explanation -->
      <div class="dropdown-header">
        <p class="header-text">
          Choose how your documents are converted to searchable vectors.
          <strong>Switching providers requires re-uploading documents.</strong>
        </p>
      </div>

      <!-- Provider list -->
      <div class="provider-list">
        {#each PROVIDERS as provider}
          <button
            type="button"
            class="provider-option"
            class:selected={provider.id === value}
            on:click={() => selectProvider(provider)}
          >
            <div class="option-row">
              <span class="option-name">{provider.name}</span>
              <span class="option-meta">{getSpeedLabel(provider.speed)} · {getAccuracyLabel(provider.accuracy)}</span>
            </div>
            <p class="option-description">
              {provider.description}
              {#if provider.warning}
                <span class="option-warning">({provider.warning})</span>
              {/if}
            </p>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Custom endpoint configuration panel -->
  {#if isCustom}
    <div class="custom-config" transition:slide={{ duration: 200 }}>
      <div class="config-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>Custom Endpoint Configuration</span>
      </div>

      <div class="config-fields">
        <div class="config-field">
          <label for="custom-endpoint">
            API Endpoint URL
            <span class="required">*</span>
          </label>
          <input
            id="custom-endpoint"
            type="url"
            placeholder="https://api.example.com/v1/embeddings"
            bind:value={customEndpoint}
            on:blur={handleCustomConfigChange}
          />
          <p class="field-hint">Must be OpenAI-compatible (accepts same request/response format)</p>
        </div>

        <div class="config-field">
          <label for="custom-api-key">
            API Key
            <span class="optional">(optional)</span>
          </label>
          <input
            id="custom-api-key"
            type="password"
            placeholder="sk-..."
            bind:value={customApiKey}
            on:blur={handleCustomConfigChange}
          />
          <p class="field-hint">Bearer token for authentication, if required</p>
        </div>

        <div class="config-field">
          <label for="custom-model">
            Model Name
            <span class="optional">(optional)</span>
          </label>
          <input
            id="custom-model"
            type="text"
            placeholder="text-embedding-3-small"
            bind:value={customModel}
            on:blur={handleCustomConfigChange}
          />
          <p class="field-hint">Defaults to the endpoint's default model if not specified</p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .provider-selector {
    position: relative;
    width: 100%;
  }

  .selector-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    background: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .selector-trigger:hover {
    border-color: var(--border-secondary);
  }

  .selector-trigger:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }

  .selected-provider {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .provider-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .provider-meta {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .chevron {
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + var(--space-2));
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    z-index: 50;
    overflow: hidden;
  }

  .dropdown-header {
    padding: var(--space-2) var(--space-3);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
  }

  .header-text {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .header-text strong {
    color: var(--color-warning);
  }

  .provider-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .provider-option {
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-primary);
    cursor: pointer;
    text-align: left;
    transition: background 0.2s ease;
  }

  .provider-option:last-child {
    border-bottom: none;
  }

  .provider-option:hover {
    background: var(--bg-secondary);
  }

  .provider-option.selected {
    background: var(--color-primary-alpha);
  }

  .option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .option-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .option-meta {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .option-description {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.3;
  }

  .option-warning {
    color: var(--text-tertiary);
    font-style: italic;
  }

  /* Custom endpoint configuration */
  .custom-config {
    margin-top: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-secondary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
  }

  .config-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .config-header svg {
    color: var(--text-tertiary);
  }

  .config-fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .config-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .config-field label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .config-field .required {
    color: var(--color-error);
    font-weight: 400;
  }

  .config-field .optional {
    color: var(--text-tertiary);
    font-weight: 400;
    font-size: var(--text-xs);
  }

  .config-field input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
  }

  .config-field input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }

  .config-field input::placeholder {
    color: var(--text-tertiary);
  }

  .field-hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    line-height: 1.4;
  }
</style>
