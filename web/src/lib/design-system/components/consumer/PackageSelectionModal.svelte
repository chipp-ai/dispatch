<script lang="ts">
  /**
   * PackageSelectionModal
   *
   * Modal for selecting and purchasing credit packages.
   * Fetches available packages and redirects to Stripe checkout.
   */
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import Button from '../Button.svelte';
  import Spinner from '../Spinner.svelte';

  export let open: boolean = false;
  export let appNameId: string = '';
  export let appName: string = 'App';
  export let primaryColor: string = '#4499ff';
  export let logoUrl: string | null = null;

  interface Package {
    id: number;
    name: string;
    credits: number;
    price: number;
    type: 'ONE_TIME' | 'SUBSCRIPTION';
  }

  let packages: Package[] = [];
  let loading = true;
  let error: string | null = null;
  let purchasingPackageId: number | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  // Fetch packages when modal opens
  $: if (open && appNameId) {
    fetchPackages();
  }

  async function fetchPackages() {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/credits/packages`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load packages');
      }

      const data = await response.json();
      packages = data.data || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load packages';
    } finally {
      loading = false;
    }
  }

  async function handlePurchase(pkg: Package) {
    purchasingPackageId = pkg.id;

    try {
      const response = await fetch(
        `/consumer/${appNameId}/credits/payment-url?packageId=${pkg.id}`,
        {
          credentials: 'include',
          headers: {
            'Referer': window.location.href,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to start checkout';
      purchasingPackageId = null;
    }
  }

  function close() {
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  }

  function formatCredits(credits: number): string {
    return new Intl.NumberFormat('en-US').format(credits);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="modal-overlay"
    transition:fade={{ duration: 150 }}
    on:click={handleOverlayClick}
  >
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-selection-title"
      transition:scale={{ duration: 200, start: 0.95 }}
    >
      <button class="close-button" on:click={close} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div class="modal-header">
        {#if logoUrl}
          <img src={logoUrl} alt={appName} class="app-logo" />
        {:else}
          <div class="icon-container" style="background-color: {primaryColor}20;">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={primaryColor}
              stroke-width="1.5"
              class="credits-icon"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
        {/if}

        <h2 id="package-selection-title">Get More Credits</h2>
        <p class="subtitle">Choose a package to continue your conversation with {appName}</p>
      </div>

      <div class="modal-body">
        {#if loading}
          <div class="loading-state">
            <Spinner size="md" />
            <span>Loading packages...</span>
          </div>
        {:else if error}
          <div class="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
            <Button variant="secondary" size="sm" on:click={fetchPackages}>
              Try Again
            </Button>
          </div>
        {:else if packages.length === 0}
          <div class="empty-state">
            <span>No credit packages available at this time.</span>
          </div>
        {:else}
          <div class="packages-list">
            {#each packages as pkg (pkg.id)}
              <button
                class="package-card"
                class:purchasing={purchasingPackageId === pkg.id}
                on:click={() => handlePurchase(pkg)}
                disabled={purchasingPackageId !== null}
              >
                <div class="package-info">
                  <span class="package-name">{pkg.name}</span>
                  <span class="package-credits">
                    {#if pkg.type === 'SUBSCRIPTION'}
                      Unlimited credits/month
                    {:else}
                      {formatCredits(pkg.credits)} credits
                    {/if}
                  </span>
                </div>
                <div class="package-price">
                  {#if purchasingPackageId === pkg.id}
                    <Spinner size="sm" />
                  {:else}
                    <span class="price">{formatPrice(pkg.price)}</span>
                    {#if pkg.type === 'SUBSCRIPTION'}
                      <span class="period">/month</span>
                    {/if}
                  {/if}
                </div>
                {#if pkg.type === 'SUBSCRIPTION'}
                  <div class="subscription-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                    Subscription
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <p class="secure-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Secure payment via Stripe
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    padding: var(--space-6);
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
  }

  .close-button {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s;
  }

  .close-button:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .close-button svg {
    width: 20px;
    height: 20px;
  }

  .modal-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    text-align: center;
  }

  .app-logo {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
    object-fit: cover;
  }

  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg);
  }

  .credits-icon {
    width: 28px;
    height: 28px;
  }

  h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    line-height: 1.5;
  }

  .modal-body {
    margin-bottom: var(--space-4);
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-8) var(--space-4);
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .error-state svg {
    width: 32px;
    height: 32px;
    color: hsl(var(--destructive));
  }

  .packages-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .package-card {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-4);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background-color: hsl(var(--background));
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .package-card:hover:not(:disabled) {
    border-color: var(--consumer-primary, hsl(var(--primary)));
    box-shadow: 0 0 0 1px var(--consumer-primary, hsl(var(--primary)));
  }

  .package-card:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .package-card.purchasing {
    border-color: var(--consumer-primary, hsl(var(--primary)));
  }

  .package-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .package-name {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .package-credits {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .package-price {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .price {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .period {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .subscription-badge {
    position: absolute;
    top: -8px;
    right: var(--space-3);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--primary-foreground));
    background-color: var(--consumer-primary, hsl(var(--primary)));
    border-radius: var(--radius-full);
  }

  .subscription-badge svg {
    width: 10px;
    height: 10px;
  }

  .modal-footer {
    text-align: center;
  }

  .secure-note {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .secure-note svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: 480px) {
    .modal-content {
      padding: var(--space-5);
    }

    .package-card {
      padding: var(--space-3);
    }
  }
</style>
