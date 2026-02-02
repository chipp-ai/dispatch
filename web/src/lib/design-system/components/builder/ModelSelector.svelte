<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { MODELS, FEATURED_MODELS, getModelById, getBlendedPrice, badgeColors, DEFAULT_MODEL_ID, type ModelConfig, type Badge } from "./modelConfig";

  export let value: string = DEFAULT_MODEL_ID;
  export let onDetailView: (model: ModelConfig) => void = () => {};
  export let onCompareClick: () => void = () => {};

  const dispatch = createEventDispatcher<{ change: { value: string } }>();

  let isOpen = false;
  let searchQuery = "";
  let dropdownRef: HTMLDivElement;

  $: selectedModel = getModelById(value);
  $: filteredModels = searchQuery
    ? MODELS.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : MODELS;

  function toggleDropdown() {
    isOpen = !isOpen;
    if (isOpen) {
      searchQuery = "";
    }
  }

  function selectModel(model: ModelConfig) {
    value = model.id;
    dispatch("change", { value: model.id });
    isOpen = false;
  }

  function handleInfoClick(e: MouseEvent, model: ModelConfig) {
    e.stopPropagation();
    onDetailView(model);
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

  function getBadgeStyle(badge: Badge): string {
    const colors = badgeColors[badge];
    return colors || "bg-gray-100 text-gray-800";
  }
</script>

<svelte:window on:click={handleClickOutside} on:keydown={handleKeydown} />

<div class="model-selector" bind:this={dropdownRef}>
  <!-- Trigger Button -->
  <button type="button" class="selector-trigger" on:click={toggleDropdown}>
    <div class="selected-model">
      <span class="model-name">{selectedModel?.name || "Select a model"}</span>
      {#if selectedModel?.badges?.[0]}
        <span class="badge {getBadgeStyle(selectedModel.badges[0])}">{selectedModel.badges[0]}</span>
      {/if}
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
      <!-- Search -->
      <div class="search-container">
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
          on:click|stopPropagation
        />
      </div>

      <div class="dropdown-scroll">
        {#if !searchQuery}
          <!-- Featured Models -->
          <div class="model-group">
            <div class="group-header">
              <span class="group-title">Featured Models</span>
              <span class="group-badge">Recommended</span>
            </div>
            {#each FEATURED_MODELS as model (model.id)}
              <div
                role="button"
                tabindex="0"
                class="model-option"
                class:selected={value === model.id}
                on:click={() => selectModel(model)}
                on:keydown={(e) => e.key === "Enter" && selectModel(model)}
              >
                <div class="option-content">
                  <div class="option-main">
                    <span class="option-name">{model.name}</span>
                    <div class="option-badges">
                      {#each model.badges.slice(0, 2) as badge}
                        <span class="mini-badge {getBadgeStyle(badge)}">{badge}</span>
                      {/each}
                    </div>
                  </div>
                  <div class="option-meta">
                    <span class="option-limit">{model.tokenLimit}</span>
                    <span class="option-price">{getBlendedPrice(model.pricing)}</span>
                  </div>
                </div>
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
            {/each}
          </div>
        {/if}

        <!-- All Models -->
        <div class="model-group">
          <div class="group-header">
            <span class="group-title">{searchQuery ? `Results (${filteredModels.length})` : "All Models"}</span>
          </div>
          {#each filteredModels as model (model.id)}
            <div
              role="button"
              tabindex="0"
              class="model-option"
              class:selected={value === model.id}
              on:click={() => selectModel(model)}
              on:keydown={(e) => e.key === "Enter" && selectModel(model)}
            >
              <div class="option-content">
                <div class="option-main">
                  <span class="option-name">{model.name}</span>
                  <div class="option-badges">
                    {#each model.badges.slice(0, 2) as badge}
                      <span class="mini-badge {getBadgeStyle(badge)}">{badge}</span>
                    {/each}
                  </div>
                </div>
                <div class="option-meta">
                  <span class="option-limit">{model.tokenLimit}</span>
                  <span class="option-price">{getBlendedPrice(model.pricing)}</span>
                </div>
              </div>
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
          {/each}

          {#if filteredModels.length === 0}
            <p class="no-results">No models found for "{searchQuery}"</p>
          {/if}
        </div>
      </div>

      <!-- Compare Button -->
      <div class="dropdown-footer">
        <button type="button" class="compare-btn" on:click={onCompareClick}>
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
            <path d="M16 3h5v5" />
            <path d="M8 3H3v5" />
            <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
            <path d="m15 9 6-6" />
          </svg>
          Compare all models
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
    width: 100%;
  }

  .selector-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
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

  .selected-model {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .model-name {
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  /* Used in dropdown options */
  .option-badges {
    display: flex;
    gap: 4px;
  }

  .badge {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 500;
    border-radius: var(--radius-full);
  }

  .chevron {
    color: var(--text-secondary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* Dropdown */
  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    z-index: 50;
    overflow: hidden;
  }

  .search-container {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-primary);
  }

  .search-container svg {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .search-container input {
    flex: 1;
    border: none;
    background: none;
    font-size: var(--text-sm);
    color: var(--text-primary);
    outline: none;
  }

  .search-container input::placeholder {
    color: var(--text-tertiary);
  }

  .dropdown-scroll {
    max-height: 320px;
    overflow-y: auto;
  }

  .model-group {
    padding: var(--space-2);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2);
    margin-bottom: var(--space-1);
  }

  .group-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-badge {
    padding: 2px 6px;
    font-size: 9px;
    font-weight: 600;
    color: var(--color-primary);
    background: var(--color-primary-alpha);
    border-radius: var(--radius-full);
  }

  .model-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .model-option:hover {
    background: var(--bg-secondary);
  }

  .model-option.selected {
    background: var(--color-primary-alpha);
  }

  .option-content {
    flex: 1;
    min-width: 0;
  }

  .option-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .option-name {
    font-weight: 500;
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .option-badges {
    display: flex;
    gap: 4px;
  }

  .mini-badge {
    padding: 1px 6px;
    font-size: 9px;
    font-weight: 500;
    border-radius: var(--radius-full);
  }

  .option-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: 2px;
    font-size: var(--text-xs);
    color: var(--text-secondary);
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

  .no-results {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-sm);
  }

  .dropdown-footer {
    padding: var(--space-3);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .compare-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .compare-btn:hover {
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
