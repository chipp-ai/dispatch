<script lang="ts">
  import { onMount } from "svelte";
  import {
    GlobalNavBar,
    Input,
    Button,
    Spinner,
    MarketplaceCard,
    Badge,
    Skeleton,
  } from "../lib/design-system";
  import {
    marketplaceStore,
    initMarketplace,
    searchMarketplace,
    filterByCategory,
    clearMarketplaceFilters,
  } from "../stores/marketplace";

  let searchInput = "";
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Load marketplace data on mount
  onMount(() => {
    initMarketplace();
  });

  // Debounced search
  function handleSearch() {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      searchMarketplace(searchInput);
    }, 300);
  }

  function handleCategoryClick(categoryId: string) {
    if ($marketplaceStore.selectedCategory === categoryId) {
      clearMarketplaceFilters();
    } else {
      searchInput = "";
      filterByCategory(categoryId);
    }
  }

  function handleClearFilters() {
    searchInput = "";
    clearMarketplaceFilters();
  }

  // Category icons mapping
  const categoryIcons: Record<string, string> = {
    marketing: "M11 5.882V19.24a1.76 1.76 0 0 1-3.417.592l-2.147-6.15M18 13a3 3 0 1 0 0-6M5.436 13.683A4.001 4.001 0 0 1 7 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 0 1-1.564-.317z",
    sales: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    "customer-support": "M3 18v-6a9 9 0 0 1 18 0v6",
    productivity: "M13 10V3L4 14h7v7l9-11h-7z",
    education: "M12 14l9-5-9-5-9 5 9 5zm0 0v6",
    writing: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 1 1 3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    research: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    analytics: "M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z",
    other: "M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6zM4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2z",
  };
</script>

<svelte:head>
  <title>Marketplace - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="marketplace-container">
  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-content">
      <h1>Discover AI Assistants</h1>
      <p class="hero-subtitle">
        Browse hundreds of AI-powered apps built by the Chipp community.
        Find the perfect assistant for your needs.
      </p>

      <div class="search-wrapper">
        <div class="search-icon">
          <svg
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search apps..."
          bind:value={searchInput}
          on:input={handleSearch}
          class="search-input"
        />
        {#if searchInput}
          <button class="clear-button" on:click={handleClearFilters}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </section>

  <!-- Categories -->
  <section class="categories-section">
    <div class="categories-scroll">
      {#each $marketplaceStore.categories as category}
        <button
          class="category-pill"
          class:active={$marketplaceStore.selectedCategory === category.id}
          on:click={() => handleCategoryClick(category.id)}
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
            <path d={categoryIcons[category.id] || categoryIcons.other} />
          </svg>
          <span>{category.name}</span>
          {#if category.count && category.count > 0}
            <span class="category-count">{category.count}</span>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <!-- Featured Apps -->
  {#if !$marketplaceStore.searchQuery && !$marketplaceStore.selectedCategory && $marketplaceStore.featuredApps.length > 0}
    <section class="featured-section">
      <div class="section-header">
        <h2>Featured Apps</h2>
        <p class="section-subtitle">Handpicked by the Chipp team</p>
      </div>

      {#if $marketplaceStore.isFeaturedLoading}
        <div class="apps-grid featured-grid">
          {#each Array(3) as _}
            <div class="skeleton-card">
              <Skeleton className="skeleton-logo" />
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-desc" />
            </div>
          {/each}
        </div>
      {:else}
        <div class="apps-grid featured-grid">
          {#each $marketplaceStore.featuredApps as app}
            <MarketplaceCard
              applicationId={app.applicationId}
              name={app.name}
              description={app.description}
              pictureUrl={app.pictureUrl}
              creatorName={app.creatorName}
              creatorPictureUrl={app.creatorPictureUrl}
              category={app.category}
              isFeatured={true}
            />
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- All Apps -->
  <section class="all-apps-section">
    <div class="section-header">
      <h2>
        {#if $marketplaceStore.searchQuery}
          Search Results
        {:else if $marketplaceStore.selectedCategory}
          {$marketplaceStore.categories.find(c => c.id === $marketplaceStore.selectedCategory)?.name || "Apps"}
        {:else}
          All Apps
        {/if}
      </h2>
      {#if $marketplaceStore.total > 0}
        <span class="results-count">{$marketplaceStore.total} apps</span>
      {/if}
    </div>

    {#if $marketplaceStore.isLoading}
      <div class="apps-grid">
        {#each Array(6) as _}
          <div class="skeleton-card">
            <Skeleton className="skeleton-logo" />
            <Skeleton className="skeleton-title" />
            <Skeleton className="skeleton-desc" />
          </div>
        {/each}
      </div>
    {:else if $marketplaceStore.apps.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <h3>No apps found</h3>
        <p>
          {#if $marketplaceStore.searchQuery}
            No apps match "{$marketplaceStore.searchQuery}". Try a different search term.
          {:else}
            No apps in this category yet. Check back soon!
          {/if}
        </p>
        <Button variant="outline" on:click={handleClearFilters}>
          Clear filters
        </Button>
      </div>
    {:else}
      <div class="apps-grid">
        {#each $marketplaceStore.apps as app}
          <MarketplaceCard
            applicationId={app.applicationId}
            name={app.name}
            description={app.description}
            pictureUrl={app.pictureUrl}
            creatorName={app.creatorName}
            creatorPictureUrl={app.creatorPictureUrl}
            category={app.category}
            isFeatured={app.isFeatured}
          />
        {/each}
      </div>
    {/if}
  </section>

  <!-- CTA Section -->
  <section class="cta-section">
    <div class="cta-content">
      <h2>Build Your Own AI Assistant</h2>
      <p>Create a custom AI app and share it with the world. No coding required.</p>
      <Button href="/#/applications" size="lg">
        Start Building
      </Button>
    </div>
  </section>
</div>

<style>
  .marketplace-container {
    min-height: 100vh;
    background: hsl(var(--background));
  }

  /* Hero Section */
  .hero {
    background: linear-gradient(
      180deg,
      hsl(var(--muted)) 0%,
      hsl(var(--background)) 100%
    );
    padding: var(--space-16) var(--space-8) var(--space-12);
  }

  .hero-content {
    max-width: 700px;
    margin: 0 auto;
    text-align: center;
  }

  .hero h1 {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-4);
  }

  .hero-subtitle {
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-8);
    line-height: 1.6;
  }

  .search-wrapper {
    position: relative;
    max-width: 500px;
    margin: 0 auto;
  }

  .search-icon {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-12);
    font-size: var(--text-base);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    color: hsl(var(--foreground));
    transition: all 0.2s ease;
  }

  .search-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .search-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .clear-button {
    position: absolute;
    right: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-button:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--muted));
  }

  /* Categories Section */
  .categories-section {
    padding: var(--space-6) var(--space-8);
    border-bottom: 1px solid hsl(var(--border));
  }

  .categories-scroll {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: var(--space-2);
    max-width: 1400px;
    margin: 0 auto;
    scrollbar-width: none;
  }

  .categories-scroll::-webkit-scrollbar {
    display: none;
  }

  .category-pill {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .category-pill:hover {
    background: hsl(var(--muted));
    border-color: hsl(var(--primary) / 0.5);
  }

  .category-pill.active {
    background: hsl(var(--primary));
    border-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
  }

  .category-count {
    font-size: var(--text-xs);
    padding: var(--space-0-5) var(--space-2);
    background: hsl(var(--muted));
    border-radius: var(--radius-full);
    color: hsl(var(--muted-foreground));
  }

  .category-pill.active .category-count {
    background: hsl(var(--primary-foreground) / 0.2);
    color: hsl(var(--primary-foreground));
  }

  /* Section Headers */
  .section-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .section-header h2 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .results-count {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  /* Featured Section */
  .featured-section {
    padding: var(--space-12) var(--space-8);
    max-width: 1400px;
    margin: 0 auto;
  }

  .featured-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  /* All Apps Section */
  .all-apps-section {
    padding: var(--space-12) var(--space-8);
    max-width: 1400px;
    margin: 0 auto;
  }

  /* Apps Grid */
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-6);
  }

  /* Skeleton Loading */
  .skeleton-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  :global(.skeleton-logo) {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
  }

  :global(.skeleton-title) {
    width: 60%;
    height: 24px;
    border-radius: var(--radius-md);
  }

  :global(.skeleton-desc) {
    width: 100%;
    height: 40px;
    border-radius: var(--radius-md);
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: var(--space-16) var(--space-8);
  }

  .empty-icon {
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .empty-state h3 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2);
  }

  .empty-state p {
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6);
  }

  /* CTA Section */
  .cta-section {
    background: linear-gradient(
      135deg,
      hsl(var(--primary)) 0%,
      hsl(var(--primary) / 0.8) 100%
    );
    padding: var(--space-16) var(--space-8);
    margin-top: var(--space-12);
  }

  .cta-content {
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
  }

  .cta-content h2 {
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: hsl(var(--primary-foreground));
    margin: 0 0 var(--space-4);
  }

  .cta-content p {
    font-size: var(--text-lg);
    color: hsl(var(--primary-foreground) / 0.9);
    margin: 0 0 var(--space-8);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .hero h1 {
      font-size: var(--text-3xl);
    }

    .hero-subtitle {
      font-size: var(--text-base);
    }

    .featured-grid {
      grid-template-columns: 1fr;
    }

    .apps-grid {
      grid-template-columns: 1fr;
    }

    .section-header {
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
