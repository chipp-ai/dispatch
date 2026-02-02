<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import {
    MODELS,
    sortModels,
    getBlendedPrice,
    badgeColors,
    type ModelConfig,
    type Badge,
    type ModelProvider
  } from "./modelConfig";

  export let open: boolean = false;
  export let currentModelId: string = "";
  export let onSelect: (modelId: string) => void = () => {};
  export let onDetailView: (model: ModelConfig) => void = () => {};
  export let subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE" = "PRO";

  const dispatch = createEventDispatcher();

  let searchQuery = "";
  let sortBy: "quality" | "price" | "speed" | "context" | "name" = "quality";
  let filterProvider: ModelProvider | "all" = "all";
  let filterCapabilities: Badge[] = [];

  const providers: { value: ModelProvider | "all"; label: string }[] = [
    { value: "all", label: "All Providers" },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "google", label: "Google" },
    { value: "other", label: "Other" },
  ];

  const capabilities: Badge[] = [
    "Best Quality",
    "Reasoning",
    "Speedy",
    "Cost Effective",
    "Long Context",
    "Vision",
  ];

  type SortBy = "quality" | "price" | "speed" | "context" | "name";
  const sortOptions: { value: SortBy; label: string }[] = [
    { value: "quality", label: "Quality" },
    { value: "price", label: "Price (Low to High)" },
    { value: "speed", label: "Speed" },
    { value: "context", label: "Context Window" },
    { value: "name", label: "Name (A-Z)" },
  ];

  $: filteredModels = (() => {
    let models = [...MODELS];

    // Apply search
    if (searchQuery) {
      models = models.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply provider filter
    if (filterProvider !== "all") {
      models = models.filter(m => m.provider === filterProvider);
    }

    // Apply capability filters
    if (filterCapabilities.length > 0) {
      models = models.filter(m =>
        filterCapabilities.some(cap => m.badges.includes(cap))
      );
    }

    // Apply sorting
    return sortModels(models, sortBy);
  })();

  function close() {
    open = false;
    dispatch("close");
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function handleSelect(model: ModelConfig) {
    onSelect(model.id);
    close();
  }

  function handleInfoClick(e: MouseEvent, model: ModelConfig) {
    e.stopPropagation();
    onDetailView(model);
  }

  function toggleCapability(cap: Badge) {
    if (filterCapabilities.includes(cap)) {
      filterCapabilities = filterCapabilities.filter(c => c !== cap);
    } else {
      filterCapabilities = [...filterCapabilities, cap];
    }
  }

  function clearFilters() {
    searchQuery = "";
    filterProvider = "all";
    filterCapabilities = [];
    sortBy = "quality";
  }

  function getBadgeStyle(badge: Badge): string {
    return badgeColors[badge] || "bg-gray-100 text-gray-800";
  }

  $: hasActiveFilters = searchQuery || filterProvider !== "all" || filterCapabilities.length > 0;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="modal-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="Compare Models"
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <h2 class="modal-title">Compare Models</h2>
          <span class="model-count">{filteredModels.length} models</span>
        </div>
        <button class="close-btn" on:click={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <!-- Search -->
        <div class="search-box">
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search models..."
            bind:value={searchQuery}
          />
        </div>

        <div class="filter-row">
          <!-- Provider Filter -->
          <select bind:value={filterProvider} class="filter-select">
            {#each providers as provider}
              <option value={provider.value}>{provider.label}</option>
            {/each}
          </select>

          <!-- Sort -->
          <select bind:value={sortBy} class="filter-select">
            {#each sortOptions as option}
              <option value={option.value}>Sort: {option.label}</option>
            {/each}
          </select>
        </div>

        <!-- Capability Filters -->
        <div class="capability-filters">
          {#each capabilities as cap}
            <button
              type="button"
              class="cap-filter"
              class:active={filterCapabilities.includes(cap)}
              on:click={() => toggleCapability(cap)}
            >
              {cap}
            </button>
          {/each}
        </div>

        {#if hasActiveFilters}
          <button type="button" class="clear-filters" on:click={clearFilters}>
            Clear all filters
          </button>
        {/if}
      </div>

      <!-- Model Grid -->
      <div class="model-grid">
        {#each filteredModels as model (model.id)}
          <div
            role="button"
            tabindex="0"
            class="model-card"
            class:current={model.id === currentModelId}
            on:click={() => handleSelect(model)}
            on:keydown={(e) => e.key === "Enter" && handleSelect(model)}
          >
            {#if model.id === currentModelId}
              <span class="current-badge">Current</span>
            {/if}

            <div class="card-header">
              <h3 class="card-name">{model.name}</h3>
              <span class="card-provider">{model.provider}</span>
            </div>

            <p class="card-description">{model.description}</p>

            <div class="card-badges">
              {#each model.badges as badge}
                <span class="card-badge {getBadgeStyle(badge)}">{badge}</span>
              {/each}
            </div>

            <div class="card-stats">
              <div class="card-stat">
                <span class="stat-label">Context</span>
                <span class="stat-value">{model.tokenLimit}</span>
              </div>
              <div class="card-stat">
                <span class="stat-label">Input</span>
                <span class="stat-value">${model.pricing.prompt.toFixed(2)}/M</span>
              </div>
              <div class="card-stat">
                <span class="stat-label">Output</span>
                <span class="stat-value">${model.pricing.completion.toFixed(2)}/M</span>
              </div>
            </div>

            <div class="card-footer">
              <span class="avg-price">Avg: {getBlendedPrice(model.pricing)}</span>
              <button
                type="button"
                class="info-btn"
                on:click={(e) => handleInfoClick(e, model)}
                aria-label="View model details"
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
              </button>
            </div>
          </div>
        {/each}

        {#if filteredModels.length === 0}
          <div class="no-results">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <p>No models found matching your filters</p>
            <button type="button" class="clear-btn" on:click={clearFilters}>
              Clear filters
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    padding: var(--space-4);
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 1000px;
    max-height: 90vh;
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .modal-title {
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .model-count {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Filters */
  .filters {
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-3);
  }

  .search-box svg {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--text-sm);
    color: var(--text-primary);
    outline: none;
  }

  .search-box input::placeholder {
    color: var(--text-tertiary);
  }

  .filter-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .filter-select {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  .capability-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .cap-filter {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cap-filter:hover {
    border-color: var(--border-secondary);
  }

  .cap-filter.active {
    color: var(--color-primary);
    background: var(--color-primary-alpha);
    border-color: var(--color-primary);
  }

  .clear-filters {
    margin-top: var(--space-2);
    padding: 0;
    font-size: var(--text-xs);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  .clear-filters:hover {
    text-decoration: underline;
  }

  /* Model Grid */
  .model-grid {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-6);
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 768px) {
    .model-grid {
      grid-template-columns: 1fr;
    }
  }

  .model-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-xl);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s ease;
  }

  .model-card:hover {
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .model-card.current {
    border-color: var(--color-primary);
    background: var(--color-primary-alpha);
  }

  .current-badge {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    color: white;
    background: var(--color-primary);
    border-radius: var(--radius-full);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .card-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .card-provider {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: capitalize;
    flex-shrink: 0;
  }

  .card-description {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .card-badge {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 500;
    border-radius: var(--radius-full);
  }

  .card-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .card-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: center;
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-tertiary);
  }

  .stat-value {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .avg-price {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-primary);
  }

  .info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .info-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* No Results */
  .no-results {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-8);
    text-align: center;
  }

  .no-results svg {
    color: var(--text-tertiary);
  }

  .no-results p {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .clear-btn {
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

  .clear-btn:hover {
    background: var(--color-primary);
    color: white;
  }

  /* Badge colors */
  .bg-orange-100 { background-color: #ffedd5; }
  .text-orange-800 { color: #9a3412; }
  .bg-purple-100 { background-color: #f3e8ff; }
  .text-purple-800 { color: #6b21a8; }
  .bg-blue-100 { background-color: #dbeafe; }
  .text-blue-800 { color: #1e40af; }
  .bg-green-100 { background-color: #dcfce7; }
  .text-green-800 { color: #166534; }
  .bg-yellow-100 { background-color: #fef9c3; }
  .text-yellow-800 { color: #854d0e; }
  .bg-pink-100 { background-color: #fce7f3; }
  .text-pink-800 { color: #9d174d; }
  .bg-gray-100 { background-color: #f3f4f6; }
  .text-gray-800 { color: #1f2937; }
</style>
