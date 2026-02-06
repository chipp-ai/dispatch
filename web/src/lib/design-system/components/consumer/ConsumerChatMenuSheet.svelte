<script lang="ts">
  /**
   * ConsumerChatMenuSheet
   *
   * The sheet content for the consumer chat menu.
   * Rendered at page level to avoid z-index stacking issues with the header.
   */
  import { createEventDispatcher } from 'svelte';
  import { captureException } from '$lib/sentry';
  import Sheet from '../Sheet.svelte';
  import ChatHistoryView from './ChatHistoryView.svelte';
  import InstallAppButton from './InstallAppButton.svelte';
  import CreditMeter from './CreditMeter.svelte';

  interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
  }

  export let open: boolean = false;
  export let isAuthenticated: boolean = false;
  export let sessionId: string | null = null;
  export let appName: string = 'Chat';
  export let appId: string = '';
  export let appNameId: string = '';
  export let primaryColor: string = '#4499ff';
  export let frozen: boolean = false;
  export let subscriptionActive: boolean = false;
  export let monetizationEnabled: boolean = false;
  export let customInstructionsEnabled: boolean = true;
  export let userCredits: number = 0;
  export let chatSessions: ChatSession[] = [];
  export let chatSessionsTotal: number = 0;
  export let chatSessionsLoading: boolean = false;
  export let chatSessionsPage: number = 1;
  export let isLastPage: boolean = false;

  let view: 'menu' | 'history' = 'menu';
  let isLoadingNewChat = false;
  let manageLoading = false;

  const dispatch = createEventDispatcher<{
    close: void;
    newChat: void;
    selectSession: { sessionId: string };
    deleteSession: { sessionId: string };
    updateSessionTitle: { sessionId: string; title: string };
    fetchSessions: { page: number };
    openBookmarks: void;
    openCustomInstructions: void;
    shareChat: void;
    buyCredits: void;
    logout: void;
  }>();

  // Reset view when sheet opens
  $: if (open) {
    view = 'menu';
    dispatch('fetchSessions', { page: 1 });
  }

  function closeMenu() {
    dispatch('close');
    // Reset view after animation completes
    setTimeout(() => {
      view = 'menu';
    }, 300);
  }

  function handleNewChat() {
    if (frozen || isLoadingNewChat) return;
    isLoadingNewChat = true;
    dispatch('newChat');
    closeMenu();
    setTimeout(() => {
      isLoadingNewChat = false;
    }, 1000);
  }

  function handleOpenHistory() {
    if (frozen) return;
    view = 'history';
  }

  function handleBackFromHistory() {
    view = 'menu';
  }

  function handleSelectSession(e: CustomEvent<{ sessionId: string }>) {
    dispatch('selectSession', e.detail);
    closeMenu();
  }

  function handleDeleteSession(e: CustomEvent<{ sessionId: string }>) {
    dispatch('deleteSession', e.detail);
  }

  function handleUpdateTitle(e: CustomEvent<{ sessionId: string; title: string }>) {
    dispatch('updateSessionTitle', e.detail);
  }

  function handleNextPage() {
    dispatch('fetchSessions', { page: chatSessionsPage + 1 });
  }

  function handlePrevPage() {
    dispatch('fetchSessions', { page: chatSessionsPage - 1 });
  }

  function handleOpenBookmarks() {
    dispatch('openBookmarks');
    closeMenu();
  }

  function handleOpenCustomInstructions() {
    dispatch('openCustomInstructions');
    closeMenu();
  }

  async function handleShareChat() {
    if (!sessionId) return;

    const shareUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      dispatch('shareChat');
    } catch (e) {
      captureException(e, {
        tags: { feature: "consumer-chat-menu" },
        extra: { action: "copy-share-link", sessionId },
      });
    }
    closeMenu();
  }

  function handleBuyCredits() {
    dispatch('buyCredits');
    closeMenu();
  }

  async function handleManageSubscription() {
    if (!appNameId || manageLoading) return;

    manageLoading = true;
    try {
      const response = await fetch(`/consumer/${appNameId}/credits/manage-subscription`, {
        credentials: 'include',
        headers: {
          'Referer': window.location.href,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to open billing portal');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "consumer-chat-menu" },
        extra: { action: "open-billing-portal", appNameId },
      });
    } finally {
      manageLoading = false;
    }
  }

  function handleLogout() {
    dispatch('logout');
    closeMenu();
  }
</script>

<Sheet {open} side="right" width="400px" on:close={closeMenu}>
  {#if view === 'history'}
    <!-- History View -->
    <div class="sheet-view">
      <button class="back-button" on:click={handleBackFromHistory}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <ChatHistoryView
        sessions={chatSessions}
        total={chatSessionsTotal}
        isLoading={chatSessionsLoading}
        currentPage={chatSessionsPage}
        {isLastPage}
        {primaryColor}
        on:selectSession={handleSelectSession}
        on:deleteSession={handleDeleteSession}
        on:updateTitle={handleUpdateTitle}
        on:nextPage={handleNextPage}
        on:prevPage={handlePrevPage}
      />
    </div>
  {:else}
    <!-- Main Menu View -->
    <div class="menu-view">
      <!-- Frozen Warning -->
      {#if frozen}
        <div class="frozen-warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <div class="frozen-text">
            <span class="frozen-title">Conversation Frozen</span>
            <span class="frozen-desc">This chat session is locked. Start a new chat to continue.</span>
          </div>
        </div>
      {/if}

      <!-- Credit Meter (when monetization is enabled) -->
      {#if monetizationEnabled}
        <div class="credit-section">
          <CreditMeter credits={userCredits} radius={60} {primaryColor} />
        </div>
      {/if}

      <!-- Menu Items -->
      <div class="menu-items">
        <!-- New Chat -->
        <button
          class="menu-item"
          class:menu-item-disabled={frozen || isLoadingNewChat}
          on:click={handleNewChat}
          disabled={frozen || isLoadingNewChat}
        >
          <div class="menu-icon menu-icon-primary">
            {#if isLoadingNewChat}
              <div class="spinner-small"></div>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            {/if}
          </div>
          <div class="menu-item-content">
            <span class="menu-item-title">New Chat</span>
            <span class="menu-item-desc">
              {frozen ? 'Unavailable when frozen' : 'Start a fresh conversation'}
            </span>
          </div>
        </button>

        <!-- History -->
        <button
          class="menu-item"
          class:menu-item-disabled={frozen}
          on:click={handleOpenHistory}
          disabled={frozen}
        >
          <div class="menu-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="menu-item-content">
            <span class="menu-item-title">History</span>
            <span class="menu-item-desc">
              {frozen ? 'Unavailable when frozen' : 'View past conversations'}
            </span>
          </div>
        </button>

        <!-- Bookmarks (authenticated only) -->
        {#if isAuthenticated}
          <button class="menu-item" on:click={handleOpenBookmarks}>
            <div class="menu-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <div class="menu-item-content">
              <span class="menu-item-title">Bookmarks</span>
              <span class="menu-item-desc">View saved messages</span>
            </div>
          </button>

          <!-- Custom Instructions (if enabled) -->
          {#if customInstructionsEnabled}
            <button class="menu-item" on:click={handleOpenCustomInstructions}>
              <div class="menu-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div class="menu-item-content">
                <span class="menu-item-title">Custom Instructions</span>
                <span class="menu-item-desc">Personalize your experience</span>
              </div>
            </button>
          {/if}

          <!-- Share Chat -->
          {#if sessionId}
            <button class="menu-item" on:click={handleShareChat}>
              <div class="menu-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
              <div class="menu-item-content">
                <span class="menu-item-title">Share Chat</span>
                <span class="menu-item-desc">Copy link to conversation</span>
              </div>
            </button>
          {/if}
        {/if}

        <!-- Install App -->
        <InstallAppButton {appName} {appId} {primaryColor} variant="menu" />
      </div>

      <!-- Sign Out (authenticated only) -->
      {#if isAuthenticated}
        <div class="menu-section-divider"></div>
        <button class="menu-item menu-item-danger" on:click={handleLogout}>
          <div class="menu-icon menu-icon-danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <span class="menu-item-title">Sign Out</span>
        </button>
      {/if}

      <!-- Monetization Section -->
      {#if monetizationEnabled && isAuthenticated}
        <div class="menu-section-divider"></div>
        <div class="monetization-section">
          {#if subscriptionActive}
            <button
              class="manage-subscription-btn"
              on:click={handleManageSubscription}
              disabled={manageLoading}
            >
              {manageLoading ? 'Loading...' : 'Manage Subscription'}
            </button>
          {:else}
            <button
              class="buy-credits-btn"
              style="--btn-color: {primaryColor}"
              on:click={handleBuyCredits}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              Buy Credits
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .sheet-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-bottom: 16px;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s;
  }

  .back-button:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .back-button svg {
    width: 16px;
    height: 16px;
  }

  .menu-view {
    display: flex;
    flex-direction: column;
  }

  .frozen-warning {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background-color: hsl(45 93% 94%);
    border: 1px solid hsl(45 90% 80%);
    border-radius: var(--radius-lg);
    margin-bottom: 16px;
  }

  .frozen-warning svg {
    width: 20px;
    height: 20px;
    color: hsl(45 93% 35%);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .frozen-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .frozen-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(45 93% 25%);
  }

  .frozen-desc {
    font-size: var(--text-xs);
    color: hsl(45 60% 35%);
  }

  .credit-section {
    display: flex;
    justify-content: center;
    padding: 24px 0;
    border-bottom: 1px solid hsl(var(--border));
    margin-bottom: 16px;
  }

  .menu-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 16px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: all 0.2s;
  }

  .menu-item:hover {
    background-color: hsl(var(--muted));
  }

  .menu-item:active {
    background-color: hsl(var(--border));
  }

  .menu-item-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .menu-item-disabled:hover {
    background-color: transparent;
  }

  .menu-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .menu-item:hover .menu-icon {
    transform: scale(1.05);
  }

  .menu-icon svg {
    width: 20px;
    height: 20px;
  }

  .menu-icon-primary {
    background-color: hsl(var(--foreground));
    color: hsl(var(--background));
  }

  .menu-icon-danger {
    background-color: hsl(var(--muted));
  }

  .menu-item-danger:hover .menu-icon-danger {
    background-color: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .menu-item-content {
    flex: 1;
    min-width: 0;
  }

  .menu-item-title {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .menu-item-desc {
    display: block;
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin-top: 2px;
  }

  .menu-item-danger .menu-item-title {
    color: hsl(var(--foreground));
    transition: color 0.2s;
  }

  .menu-item-danger:hover .menu-item-title {
    color: hsl(var(--destructive));
  }

  .menu-section-divider {
    height: 1px;
    background-color: hsl(var(--border));
    margin: 16px 0;
  }

  .monetization-section {
    padding: 8px 0;
  }

  .buy-credits-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 16px;
    border: none;
    border-radius: var(--radius-lg);
    background-color: var(--btn-color, hsl(var(--primary)));
    color: white;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .buy-credits-btn:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .buy-credits-btn:active {
    transform: scale(0.98);
  }

  .buy-credits-btn svg {
    width: 18px;
    height: 18px;
  }

  .manage-subscription-btn {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background-color: transparent;
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all 0.2s;
  }

  .manage-subscription-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
  }

  .manage-subscription-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner-small {
    width: 20px;
    height: 20px;
    border: 2px solid hsl(var(--background) / 0.3);
    border-top-color: hsl(var(--background));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile adjustments */
  @media (max-width: 640px) {
    .menu-item {
      padding: 20px 16px;
    }

    .menu-icon {
      width: 48px;
      height: 48px;
    }

    .menu-icon svg {
      width: 24px;
      height: 24px;
    }

    .menu-item-title {
      font-size: var(--text-base);
    }

    .menu-item-desc {
      font-size: var(--text-sm);
    }
  }
</style>
