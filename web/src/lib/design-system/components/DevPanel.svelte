<script lang="ts">
  /**
   * Dev Panel Component
   *
   * Floating developer panel for testing subscription tiers and other dev tools.
   * Appears as a small toggle button on the left edge that opens a sliding sidebar.
   *
   * Visibility:
   * - Local dev: Always visible
   * - Staging: Enable via ?devPanel=chipp-dev-2024 or window.enableDevPanel('chipp-dev-2024')
   * - Production: Never visible
   */
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { cubicOut, cubicIn } from "svelte/easing";
  import {
    devPanel,
    isDevPanelEnabled,
    isDevPanelOpen,
    devPanelEnvironment,
  } from "../../../stores/devPanel";
  import {
    organization,
    clearOrganizationCache,
    fetchOrganization,
  } from "../../../stores/organization";
  import {
    clearWorkspaceCache,
    fetchWorkspaces,
  } from "../../../stores/workspace";
  import { toasts } from "../stores/toast";
  import Badge from "./Badge.svelte";
  import Select from "./Select.svelte";
  import SelectItem from "./SelectItem.svelte";
  import Spinner from "./Spinner.svelte";
  import {
    featureMatrix,
    tierOrder,
    tierAbbreviations,
    type SubscriptionTier as FeatureTier,
  } from "../../config/feature-matrix";
  import {
    modelOverride,
    availableModels,
  } from "../../../stores/modelOverride";

  type SubscriptionTier = "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE";

  const tiers: SubscriptionTier[] = [
    "FREE",
    "PRO",
    "TEAM",
    "BUSINESS",
    "ENTERPRISE",
  ];

  let isLoading = false;
  let error: string | null = null;
  let portalContainer: HTMLDivElement | null = null;
  let mounted = false;

  // Resize state
  const MIN_WIDTH = 280;
  const MAX_WIDTH = 600;
  const DEFAULT_WIDTH = 320;
  const WIDTH_STORAGE_KEY = "chipp_dev_panel_width";

  let panelWidth = DEFAULT_WIDTH;
  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  // Load saved width from localStorage
  function loadSavedWidth() {
    try {
      const saved = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (saved) {
        const width = parseInt(saved, 10);
        if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
          panelWidth = width;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  function saveWidth(width: number) {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Ignore storage errors
    }
  }

  function handleResizeStart(e: MouseEvent) {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartWidth = panelWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  function handleResizeMove(e: MouseEvent) {
    if (!isResizing) return;
    const delta = e.clientX - resizeStartX;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStartWidth + delta));
    panelWidth = newWidth;
  }

  function handleResizeEnd() {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveWidth(panelWidth);
  }

  // Current tier from organization store
  $: currentTier = $organization?.subscriptionTier || "FREE";

  async function handleTierChange(newTier: string) {
    if (newTier === currentTier || !newTier) return;

    isLoading = true;
    error = null;

    try {
      const response = await fetch("/api/dev/set-tier", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier: newTier }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update tier");
      }

      // Clear cache and refresh organization data
      clearOrganizationCache();
      await fetchOrganization();
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && $isDevPanelOpen) {
      devPanel.close();
    }
  }

  function handleBackdropClick() {
    devPanel.close();
  }

  // Slide animation
  function slideIn(
    node: Element,
    { duration = 300 }: { duration?: number } = {}
  ) {
    return {
      duration,
      css: (t: number) => {
        const eased = cubicOut(t);
        return `transform: translateX(${-(1 - eased) * 100}%);`;
      },
    };
  }

  function slideOut(
    node: Element,
    { duration = 200 }: { duration?: number } = {}
  ) {
    return {
      duration,
      css: (t: number) => {
        const eased = cubicIn(t);
        return `transform: translateX(${-(1 - eased) * 100}%);`;
      },
    };
  }

  // Portal action
  function portal(node: HTMLElement) {
    if (portalContainer) {
      portalContainer.appendChild(node);
    }
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      },
    };
  }

  onMount(() => {
    devPanel.init();
    loadSavedWidth();
    portalContainer = document.createElement("div");
    portalContainer.className = "dev-panel-portal";
    document.body.appendChild(portalContainer);
    mounted = true;

    // Add resize event listeners
    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", handleResizeEnd);
  });

  onDestroy(() => {
    if (portalContainer && portalContainer.parentNode) {
      portalContainer.parentNode.removeChild(portalContainer);
    }
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
    // Cleanup console auto-refresh interval
    if (consoleAutoRefreshInterval) {
      clearInterval(consoleAutoRefreshInterval);
    }
    // Cleanup WebSocket status polling interval
    if (wsStatusInterval) {
      clearInterval(wsStatusInterval);
    }
    // Cleanup resize event listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", handleResizeEnd);
    }
  });

  // Lock body scroll when open
  $: if (typeof document !== "undefined") {
    if ($isDevPanelOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }

  function getTierBadgeVariant(
    tier: string
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (tier) {
      case "ENTERPRISE":
        return "default";
      case "BUSINESS":
      case "TEAM":
        return "secondary";
      case "PRO":
        return "outline";
      default:
        return "outline";
    }
  }

  // Quick Actions state
  let showResetConfirm = false;

  // Stripe info state
  interface StripeInfo {
    mode: "test" | "live";
    customerId: string | null;
    dashboardUrl: string;
    customerUrl: string | null;
  }
  let stripeInfo: StripeInfo | null = null;
  let stripeLoading = false;
  let stripeError: string | null = null;

  async function fetchStripeInfo() {
    if (stripeInfo || stripeLoading) return; // Already loaded or loading

    stripeLoading = true;
    stripeError = null;

    try {
      const response = await fetch("/api/dev/stripe-info", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch Stripe info");
      }

      stripeInfo = await response.json();
    } catch (err) {
      stripeError = err instanceof Error ? err.message : "Unknown error";
    } finally {
      stripeLoading = false;
    }
  }

  // Fetch stripe info when panel opens
  $: if ($isDevPanelOpen && !stripeInfo && !stripeLoading) {
    fetchStripeInfo();
  }

  async function handleClearCaches() {
    clearOrganizationCache();
    clearWorkspaceCache();
    localStorage.removeItem("chipp_organization");
    localStorage.removeItem("chipp_workspace");

    // Refresh stores
    await Promise.all([fetchOrganization(), fetchWorkspaces()]);

    toasts.success("Caches cleared", "Organization and workspace data refreshed");
  }

  function handleResetSession() {
    showResetConfirm = true;
  }

  function confirmResetSession() {
    // Clear the session cookie
    document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    // Also try with domain for production
    document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.chipp.ai;";

    toasts.info("Session cleared", "Redirecting to login...");

    // Redirect to login after a short delay
    setTimeout(() => {
      window.location.href = "/#/login";
      window.location.reload();
    }, 500);
  }

  function cancelResetSession() {
    showResetConfirm = false;
  }

  function handleClearTheme() {
    localStorage.removeItem("theme");

    // Dispatch storage event to trigger theme reset in other components
    window.dispatchEvent(new StorageEvent("storage", {
      key: "theme",
      newValue: null,
      oldValue: localStorage.getItem("theme"),
      storageArea: localStorage,
    }));

    // Also dispatch a custom event for components that listen for theme changes
    window.dispatchEvent(new CustomEvent("theme-change", { detail: null }));

    toasts.success("Theme cleared", "Reset to system preference");
  }

  // Console Logs state
  interface ParsedLogEntry {
    timestamp: string;
    level: "log" | "warn" | "error" | "info" | "debug";
    message: string;
    raw: string;
  }

  let consoleLogs: ParsedLogEntry[] = [];
  let consoleLogsLoading = false;
  let consoleLogsError: string | null = null;
  let consoleAutoRefresh = false;
  let consoleAutoRefreshInterval: number | null = null;
  let expandedLogIndex: number | null = null;

  function parseLogLine(line: string): ParsedLogEntry {
    // Try to parse format: "2024-01-15T14:32:05.123Z [LEVEL] message" or with emoji
    // Pattern: timestamp, optional emoji, [LEVEL], message
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*[^\[]*\[(\w+)\]\s*(.*)$/);
    if (match) {
      const [, timestamp, level, message] = match;
      const normalizedLevel = level.toLowerCase() as ParsedLogEntry["level"];
      const validLevels = ["log", "warn", "error", "info", "debug"];
      return {
        timestamp,
        level: validLevels.includes(normalizedLevel) ? normalizedLevel : "log",
        message,
        raw: line,
      };
    }
    // Fallback: treat entire line as message
    return {
      timestamp: "",
      level: "log",
      message: line,
      raw: line,
    };
  }

  function formatTimestamp(isoString: string): string {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("en-US", { hour12: false });
    } catch {
      return isoString.slice(11, 19) || "";
    }
  }

  async function fetchConsoleLogs() {
    consoleLogsLoading = true;
    consoleLogsError = null;

    try {
      const response = await fetch("/debug/logs?lines=50", {
        credentials: "include",
      });

      if (response.status === 404) {
        consoleLogsError = "Debug endpoint not available (only works in local dev)";
        consoleLogs = [];
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }

      const text = await response.text();
      if (text === "No logs yet" || !text.trim()) {
        consoleLogs = [];
      } else {
        consoleLogs = text
          .split("\n")
          .filter(Boolean)
          .map(parseLogLine)
          .reverse(); // Most recent first
      }
    } catch (err) {
      consoleLogsError = err instanceof Error ? err.message : "Unknown error";
      consoleLogs = [];
    } finally {
      consoleLogsLoading = false;
    }
  }

  async function clearConsoleLogs() {
    try {
      const response = await fetch("/debug/logs", {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        consoleLogs = [];
        expandedLogIndex = null;
        toasts.success("Logs cleared", "Console logs have been cleared");
      }
    } catch {
      toasts.error("Failed to clear logs", "Could not clear console logs");
    }
  }

  function toggleAutoRefresh() {
    consoleAutoRefresh = !consoleAutoRefresh;

    if (consoleAutoRefresh) {
      consoleAutoRefreshInterval = window.setInterval(fetchConsoleLogs, 3000);
    } else if (consoleAutoRefreshInterval) {
      clearInterval(consoleAutoRefreshInterval);
      consoleAutoRefreshInterval = null;
    }
  }

  function toggleLogExpand(index: number) {
    expandedLogIndex = expandedLogIndex === index ? null : index;
  }

  function truncateMessage(message: string, maxLength: number = 100): string {
    if (message.length <= maxLength) return message;
    return message.slice(0, maxLength) + "...";
  }

  // Fetch console logs when panel opens
  $: if ($isDevPanelOpen && consoleLogs.length === 0 && !consoleLogsLoading && !consoleLogsError) {
    fetchConsoleLogs();
  }

  // WebSocket Status state
  interface WsStatus {
    userConnections: number;
    totalConnections: number;
    connectedUserIds: string[];
  }
  let wsStatus: WsStatus | null = null;
  let wsStatusLoading = false;
  let wsStatusError: string | null = null;
  let wsStatusInterval: number | null = null;

  async function fetchWsStatus() {
    wsStatusLoading = true;
    wsStatusError = null;

    try {
      const response = await fetch("/api/dev/ws-status", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch WebSocket status");
      }

      wsStatus = await response.json();
    } catch (err) {
      wsStatusError = err instanceof Error ? err.message : "Unknown error";
    } finally {
      wsStatusLoading = false;
    }
  }

  // Fetch WS status when panel opens and poll every 5s
  $: if ($isDevPanelOpen) {
    if (!wsStatus && !wsStatusLoading) {
      fetchWsStatus();
    }
    if (!wsStatusInterval) {
      wsStatusInterval = window.setInterval(fetchWsStatus, 5000);
    }
  } else {
    // Clean up polling when panel closes
    if (wsStatusInterval) {
      clearInterval(wsStatusInterval);
      wsStatusInterval = null;
    }
  }

  // Model Override
  $: currentModelOverride = $modelOverride;

  function handleModelOverrideChange(newModel: string) {
    modelOverride.set(newModel);
    if (newModel) {
      toasts.success("Model override set", `Using ${availableModels.find(m => m.id === newModel)?.label || newModel}`);
    } else {
      toasts.info("Model override cleared", "Using app default model");
    }
  }

  function clearModelOverride() {
    modelOverride.clear();
    toasts.info("Model override cleared", "Using app default model");
  }

</script>

<svelte:window on:keydown={handleKeydown} />

{#if $isDevPanelEnabled}
  <!-- Toggle Button -->
  <button
    class="dev-panel-toggle"
    on:click={() => devPanel.toggle()}
    aria-label="Toggle developer panel"
    title="Developer Panel"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>

  <!-- Panel (portal-based) -->
  {#if $isDevPanelOpen && mounted}
    <div use:portal class="dev-panel-wrapper">
      <!-- Backdrop -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="dev-panel-backdrop"
        on:click={handleBackdropClick}
        transition:fade={{ duration: 200 }}
      ></div>

      <!-- Panel -->
      <div
        class="dev-panel"
        class:resizing={isResizing}
        style="width: {panelWidth}px;"
        role="dialog"
        aria-modal="true"
        aria-label="Developer Panel"
        in:slideIn={{ duration: 300 }}
        out:slideOut={{ duration: 200 }}
      >
        <!-- Resize Handle -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="dev-panel-resize-handle"
          on:mousedown={handleResizeStart}
        ></div>
        <!-- Header -->
        <div class="dev-panel-header">
          <div class="dev-panel-title">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="title-icon"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Dev Panel</span>
          </div>
          <button
            class="dev-panel-close"
            on:click={() => devPanel.close()}
            aria-label="Close panel"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="dev-panel-content">
          <!-- Subscription Tier Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">Subscription Tier</h3>
            <p class="dev-section-description">
              Change your organization's subscription tier for testing.
            </p>

            <div class="tier-current">
              <span class="tier-label">Current:</span>
              <Badge variant={getTierBadgeVariant(currentTier)}
                >{currentTier}</Badge
              >
            </div>

            <div class="tier-select">
              <Select
                value={currentTier}
                onValueChange={handleTierChange}
                disabled={isLoading}
              >
                {#each tiers as tier}
                  <SelectItem value={tier}>{tier}</SelectItem>
                {/each}
              </Select>
              {#if isLoading}
                <Spinner size="sm" />
              {/if}
            </div>

            {#if error}
              <p class="tier-error">{error}</p>
            {/if}
          </section>

          <!-- Quick Actions Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">Quick Actions</h3>
            <p class="dev-section-description">
              Cache management and session utilities for development.
            </p>

            <div class="quick-actions">
              <button class="action-btn" on:click={handleClearCaches}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
                Clear Caches
              </button>

              <button class="action-btn" on:click={handleClearTheme}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
                Clear Theme
              </button>

              {#if showResetConfirm}
                <div class="reset-confirm">
                  <p class="reset-confirm-text">This will log you out. Continue?</p>
                  <div class="reset-confirm-actions">
                    <button class="action-btn action-btn-secondary" on:click={cancelResetSession}>
                      Cancel
                    </button>
                    <button class="action-btn action-btn-destructive" on:click={confirmResetSession}>
                      Yes, Reset
                    </button>
                  </div>
                </div>
              {:else}
                <button class="action-btn action-btn-destructive" on:click={handleResetSession}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Reset Session
                </button>
              {/if}
            </div>
          </section>

          <!-- Stripe Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">Stripe</h3>
            <p class="dev-section-description">
              Current Stripe environment and quick links.
            </p>

            {#if stripeLoading}
              <div class="stripe-loading">
                <Spinner size="sm" />
                <span>Loading Stripe info...</span>
              </div>
            {:else if stripeError}
              <p class="stripe-error">{stripeError}</p>
            {:else if stripeInfo}
              <div class="stripe-info">
                <div class="stripe-mode">
                  <span class="stripe-label">Mode:</span>
                  <Badge variant={stripeInfo.mode === "test" ? "outline" : "default"} class="stripe-mode-badge {stripeInfo.mode === 'test' ? 'stripe-mode-test' : 'stripe-mode-live'}">
                    {stripeInfo.mode === "test" ? "Test Mode" : "Live Mode"}
                  </Badge>
                </div>

                {#if stripeInfo.customerId}
                  <div class="stripe-customer">
                    <span class="stripe-label">Customer:</span>
                    <code class="stripe-customer-id">{stripeInfo.customerId}</code>
                  </div>
                {/if}

                <div class="stripe-links">
                  <a
                    href={stripeInfo.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="action-btn"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Open Dashboard
                  </a>

                  {#if stripeInfo.customerUrl}
                    <a
                      href={stripeInfo.customerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="action-btn"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      View Customer
                    </a>
                  {/if}

                  <a
                    href="https://docs.stripe.com/testing#cards"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="action-btn"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    Test Cards
                  </a>
                </div>
              </div>
            {/if}
          </section>

          <!-- Feature Matrix Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">Feature Access</h3>
            <p class="dev-section-description">
              Features available at each subscription tier.
            </p>

            <div class="feature-matrix-container">
              <table class="feature-matrix">
                <thead>
                  <tr>
                    <th class="feature-name-header">Feature</th>
                    {#each tierOrder as tier}
                      <th class="tier-header" class:current-tier={tier === currentTier}>
                        {tierAbbreviations[tier]}
                      </th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each featureMatrix as feature}
                    <tr>
                      <td class="feature-name">{feature.name}</td>
                      {#each tierOrder as tier}
                        <td class="feature-cell" class:current-tier={tier === currentTier}>
                          {#if typeof feature.tiers[tier] === "boolean"}
                            {#if feature.tiers[tier]}
                              <span class="feature-check">&#10003;</span>
                            {:else}
                              <span class="feature-dash">-</span>
                            {/if}
                          {:else}
                            <span class="feature-limit">{feature.tiers[tier]}</span>
                          {/if}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <div class="feature-matrix-legend">
              <span class="legend-item"><span class="legend-key">F</span> Free</span>
              <span class="legend-item"><span class="legend-key">P</span> Pro</span>
              <span class="legend-item"><span class="legend-key">T</span> Team</span>
              <span class="legend-item"><span class="legend-key">B</span> Business</span>
              <span class="legend-item"><span class="legend-key">E</span> Enterprise</span>
            </div>
          </section>

          <!-- Console Logs Section -->
          <section class="dev-section">
            <div class="console-header">
              <h3 class="dev-section-title">
                Console Logs
                {#if consoleLogs.length > 0}
                  <Badge variant="outline" class="console-count-badge">{consoleLogs.length}</Badge>
                {/if}
              </h3>
              <div class="console-actions">
                <button
                  class="console-action-btn"
                  on:click={fetchConsoleLogs}
                  disabled={consoleLogsLoading}
                  title="Refresh logs"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class:spinning={consoleLogsLoading}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
                <button
                  class="console-action-btn"
                  class:active={consoleAutoRefresh}
                  on:click={toggleAutoRefresh}
                  title={consoleAutoRefresh ? "Disable auto-refresh" : "Enable auto-refresh (3s)"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </button>
                <button
                  class="console-action-btn"
                  on:click={clearConsoleLogs}
                  disabled={consoleLogs.length === 0}
                  title="Clear logs"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>
            </div>
            <p class="dev-section-description">
              Browser console output captured from the SPA.
            </p>

            {#if consoleLogsLoading && consoleLogs.length === 0}
              <div class="console-loading">
                <Spinner size="sm" />
                <span>Loading logs...</span>
              </div>
            {:else if consoleLogsError}
              <p class="console-error">{consoleLogsError}</p>
            {:else if consoleLogs.length === 0}
              <p class="console-empty">No logs captured yet</p>
            {:else}
              <div class="console-log-container">
                {#each consoleLogs as log, index}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div
                    class="console-log-entry console-level-{log.level}"
                    class:expanded={expandedLogIndex === index}
                    on:click={() => toggleLogExpand(index)}
                  >
                    <span class="console-log-indicator"></span>
                    {#if log.timestamp}
                      <span class="console-log-timestamp">{formatTimestamp(log.timestamp)}</span>
                    {/if}
                    <span class="console-log-message">
                      {#if expandedLogIndex === index}
                        {log.message}
                      {:else}
                        {truncateMessage(log.message)}
                      {/if}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </section>

          <!-- WebSocket Status Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">WebSocket</h3>
            <p class="dev-section-description">
              Real-time connection status and metrics.
            </p>

            {#if wsStatusLoading && !wsStatus}
              <div class="ws-loading">
                <Spinner size="sm" />
                <span>Loading status...</span>
              </div>
            {:else if wsStatusError}
              <p class="ws-error">{wsStatusError}</p>
            {:else if wsStatus}
              <div class="ws-status-info">
                <div class="ws-connection-status">
                  <span class="ws-indicator" class:ws-connected={wsStatus.userConnections > 0}></span>
                  <span class="ws-connection-label">
                    {wsStatus.userConnections > 0 ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div class="ws-stats">
                  <div class="ws-stat">
                    <span class="ws-stat-label">Your connections:</span>
                    <span class="ws-stat-value">{wsStatus.userConnections}</span>
                  </div>
                  <div class="ws-stat">
                    <span class="ws-stat-label">Total server connections:</span>
                    <span class="ws-stat-value">{wsStatus.totalConnections}</span>
                  </div>
                </div>
              </div>
            {/if}
          </section>

          <!-- LLM Model Override Section -->
          <section class="dev-section">
            <h3 class="dev-section-title">LLM Model Override</h3>
            <p class="dev-section-description">
              Override the AI model for testing. Only affects your session.
            </p>

            {#if currentModelOverride}
              <div class="model-current">
                <span class="model-label">Active override:</span>
                <Badge variant="secondary">{availableModels.find(m => m.id === currentModelOverride)?.label || currentModelOverride}</Badge>
              </div>
            {/if}

            <div class="model-select">
              <Select
                value={currentModelOverride}
                onValueChange={handleModelOverrideChange}
              >
                {#each availableModels as model}
                  <SelectItem value={model.id}>{model.label}</SelectItem>
                {/each}
              </Select>
            </div>

            {#if currentModelOverride}
              <button class="action-btn action-btn-secondary model-clear-btn" on:click={clearModelOverride}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Clear Override
              </button>
            {/if}
          </section>
        </div>

        <!-- Footer -->
        <div class="dev-panel-footer">
          <Badge variant="outline">
            {$devPanelEnvironment === "development"
              ? "Development"
              : "Staging"}
          </Badge>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* Toggle Button */
  .dev-panel-toggle {
    position: fixed;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 9998;
    width: 32px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: 0 8px 8px 0;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      2px 0 8px rgba(139, 92, 246, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.1) inset;
    transition: all 0.2s ease;
  }

  .dev-panel-toggle:hover {
    width: 36px;
    background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
    box-shadow:
      4px 0 12px rgba(139, 92, 246, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  }

  .dev-panel-toggle svg {
    width: 18px;
    height: 18px;
  }

  /* Panel Wrapper */
  .dev-panel-wrapper {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
  }

  /* Backdrop */
  .dev-panel-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.6);
    pointer-events: auto;
  }

  /* Panel */
  .dev-panel {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    max-width: calc(100vw - 40px);
    background-color: hsl(var(--background));
    border-right: 1px solid hsl(var(--border));
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
  }

  .dev-panel.resizing {
    transition: none;
    user-select: none;
  }

  /* Resize Handle */
  .dev-panel-resize-handle {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
    z-index: 10;
  }

  .dev-panel-resize-handle::before {
    content: "";
    position: absolute;
    top: 0;
    right: 3px;
    bottom: 0;
    width: 4px;
    background-color: hsl(var(--muted-foreground) / 0.3);
    transition: background-color 0.2s;
  }

  .dev-panel-resize-handle:hover::before,
  .dev-panel.resizing .dev-panel-resize-handle::before {
    background-color: hsl(var(--primary));
  }

  .dev-panel-resize-handle::after {
    content: "";
    position: absolute;
    top: 50%;
    right: 2px;
    transform: translateY(-50%);
    width: 6px;
    height: 48px;
    background-color: hsl(var(--muted-foreground) / 0.8);
    border-radius: 3px;
    transition: background-color 0.2s;
    box-shadow: 0 0 0 1px hsl(var(--border));
  }

  .dev-panel-resize-handle:hover::after,
  .dev-panel.resizing .dev-panel-resize-handle::after {
    background-color: hsl(var(--primary));
    box-shadow: 0 0 0 1px hsl(var(--primary) / 0.5);
  }

  /* Header */
  .dev-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid hsl(var(--border));
    background: linear-gradient(
      135deg,
      rgba(139, 92, 246, 0.1) 0%,
      rgba(99, 102, 241, 0.05) 100%
    );
  }

  .dev-panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    font-size: 16px;
    color: hsl(var(--foreground));
  }

  .title-icon {
    width: 20px;
    height: 20px;
    color: #8b5cf6;
  }

  .dev-panel-close {
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
    border-radius: 6px;
    transition: all 0.2s;
  }

  .dev-panel-close:hover {
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .dev-panel-close svg {
    width: 18px;
    height: 18px;
  }

  /* Content */
  .dev-panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  /* Section */
  .dev-section {
    margin-bottom: 24px;
  }

  .dev-section-title {
    font-size: 14px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 4px 0;
  }

  .dev-section-description {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
    margin: 0 0 16px 0;
    line-height: 1.5;
  }

  /* Tier */
  .tier-current {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .tier-label {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  .tier-select {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tier-error {
    margin-top: 8px;
    font-size: 13px;
    color: hsl(var(--destructive));
  }

  /* Footer */
  .dev-panel-footer {
    padding: 12px 20px;
    border-top: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Quick Actions */
  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background-color: hsl(var(--muted));
    border-color: hsl(var(--border));
  }

  .action-btn svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .action-btn-secondary {
    background-color: hsl(var(--muted));
  }

  .action-btn-secondary:hover {
    background-color: hsl(var(--accent));
  }

  .action-btn-destructive {
    border-color: hsl(var(--destructive) / 0.3);
    color: hsl(var(--destructive));
  }

  .action-btn-destructive:hover {
    background-color: hsl(var(--destructive) / 0.1);
    border-color: hsl(var(--destructive) / 0.5);
  }

  /* Reset Confirmation */
  .reset-confirm {
    padding: 12px;
    border: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: 8px;
    background-color: hsl(var(--destructive) / 0.05);
  }

  .reset-confirm-text {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: hsl(var(--destructive));
    font-weight: 500;
  }

  .reset-confirm-actions {
    display: flex;
    gap: 8px;
  }

  .reset-confirm-actions .action-btn {
    flex: 1;
    justify-content: center;
  }

  /* Stripe Section */
  .stripe-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  .stripe-error {
    margin: 0;
    font-size: 13px;
    color: hsl(var(--destructive));
  }

  .stripe-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stripe-mode {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stripe-label {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  :global(.stripe-mode-badge.stripe-mode-test) {
    background-color: hsl(45 93% 47% / 0.15) !important;
    color: hsl(45 93% 35%) !important;
    border-color: hsl(45 93% 47% / 0.3) !important;
  }

  :global(.stripe-mode-badge.stripe-mode-live) {
    background-color: hsl(142 76% 36% / 0.15) !important;
    color: hsl(142 76% 30%) !important;
    border-color: hsl(142 76% 36% / 0.3) !important;
  }

  .stripe-customer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stripe-customer-id {
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    background-color: hsl(var(--muted));
    padding: 2px 6px;
    border-radius: 4px;
    color: hsl(var(--foreground));
  }

  .stripe-links {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }

  .stripe-links .action-btn {
    text-decoration: none;
  }

  /* Feature Matrix */
  .feature-matrix-container {
    overflow-x: auto;
    margin: 0 -4px;
    padding: 0 4px;
  }

  .feature-matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .feature-matrix th,
  .feature-matrix td {
    padding: 6px 4px;
    text-align: center;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  .feature-matrix th {
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    font-size: 11px;
  }

  .feature-name-header {
    text-align: left !important;
    width: 45%;
  }

  .tier-header {
    width: 11%;
    min-width: 28px;
  }

  .tier-header.current-tier {
    background-color: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    border-radius: 4px 4px 0 0;
  }

  .feature-name {
    text-align: left !important;
    color: hsl(var(--foreground));
    font-weight: 500;
    white-space: nowrap;
  }

  .feature-cell {
    color: hsl(var(--muted-foreground));
  }

  .feature-cell.current-tier {
    background-color: hsl(var(--primary) / 0.05);
  }

  .feature-check {
    color: hsl(142 76% 36%);
    font-weight: 600;
  }

  .feature-dash {
    color: hsl(var(--muted-foreground) / 0.5);
  }

  .feature-limit {
    font-size: 10px;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .feature-matrix-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid hsl(var(--border) / 0.5);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: hsl(var(--muted-foreground));
  }

  .legend-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    font-size: 9px;
    font-weight: 600;
    background-color: hsl(var(--muted));
    border-radius: 3px;
    color: hsl(var(--foreground));
  }

  /* Console Logs Section */
  .console-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .console-header .dev-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }

  :global(.console-count-badge) {
    font-size: 10px !important;
    padding: 2px 6px !important;
  }

  .console-actions {
    display: flex;
    gap: 4px;
  }

  .console-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    background-color: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .console-action-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .console-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .console-action-btn.active {
    background-color: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
    color: hsl(var(--primary));
  }

  .console-action-btn svg {
    width: 14px;
    height: 14px;
  }

  .console-action-btn svg.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .console-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }

  .console-error {
    margin: 0;
    font-size: 12px;
    color: hsl(var(--destructive));
  }

  .console-empty {
    margin: 0;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .console-log-container {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    background-color: hsl(var(--muted) / 0.3);
  }

  .console-log-entry {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .console-log-entry:last-child {
    border-bottom: none;
  }

  .console-log-entry:hover {
    background-color: hsl(var(--muted) / 0.5);
  }

  .console-log-entry.expanded {
    background-color: hsl(var(--muted) / 0.5);
  }

  .console-log-entry.expanded .console-log-message {
    white-space: pre-wrap;
    word-break: break-all;
  }

  .console-log-indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 4px;
    background-color: hsl(var(--muted-foreground));
  }

  .console-level-error .console-log-indicator {
    background-color: hsl(var(--destructive));
  }

  .console-level-warn .console-log-indicator {
    background-color: hsl(45 93% 47%);
  }

  .console-level-info .console-log-indicator {
    background-color: hsl(217 91% 60%);
  }

  .console-level-debug .console-log-indicator {
    background-color: hsl(var(--muted-foreground) / 0.6);
  }

  .console-log-timestamp {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
    font-size: 11px;
  }

  .console-log-message {
    flex: 1;
    min-width: 0;
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .console-level-error .console-log-message {
    color: hsl(var(--destructive));
  }

  .console-level-warn .console-log-message {
    color: hsl(45 93% 35%);
  }

  /* WebSocket Status Section */
  .ws-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }

  .ws-error {
    margin: 0;
    font-size: 12px;
    color: hsl(var(--destructive));
  }

  .ws-status-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ws-connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ws-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: hsl(var(--destructive));
    flex-shrink: 0;
  }

  .ws-indicator.ws-connected {
    background-color: hsl(142 76% 36%);
  }

  .ws-connection-label {
    font-size: 13px;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .ws-stats {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ws-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }

  .ws-stat-label {
    color: hsl(var(--muted-foreground));
  }

  .ws-stat-value {
    font-weight: 600;
    color: hsl(var(--foreground));
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  /* Model Override Section */
  .model-current {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .model-label {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  .model-select {
    margin-bottom: 12px;
  }

  .model-clear-btn {
    margin-top: 8px;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .dev-panel {
      width: 100% !important;
      max-width: 100%;
    }

    .dev-panel-resize-handle {
      display: none;
    }

    .feature-matrix {
      font-size: 11px;
    }

    .feature-limit {
      font-size: 9px;
    }

    .console-log-entry {
      font-size: 11px;
    }

    .console-log-timestamp {
      font-size: 10px;
    }
  }
</style>
