<script lang="ts">
  import { onMount } from "svelte";
  import { fly, fade, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import { Button, Card, Skeleton, toasts } from "$lib/design-system";
  import { currentWorkspace } from "../stores/workspace";
  import { organization } from "../stores/organization";
  import { user } from "../stores/auth";
  import { link } from "svelte-spa-router";

  // Types
  interface DashboardData {
    totalChats: number;
    totalLeads: number;
    totalConversions: number;
    topTopics: TopicData[];
    appSpecificData: AppData[];
  }

  interface TopicData {
    id: string;
    topic: string;
    count: number;
    percentage: number;
    sampleQuestions: string[];
    trend: "up" | "down" | "stable";
    trendValue: number;
    applicationId: string;
  }

  interface AppData {
    id: string;
    name: string;
    chats: number;
    leads: number;
  }

  interface SearchResult {
    id: string;
    title: string | null;
    applicationId: string;
    applicationName: string;
    userEmail: string | null;
    userName: string | null;
    createdAt: string;
    messagePreview: string | null;
    messageCount: number;
  }

  // State
  let dashboardData: DashboardData | null = null;
  let applications: { id: string; name: string }[] = [];
  let loading = true;
  let error = "";

  // Filters
  let selectedApp = "all";
  let selectedDateRange = "30d";
  let dateRangeOpen = false;
  let exportOpen = false;

  // Search
  let searchQuery = "";
  let searchResults: SearchResult[] = [];
  let searchTotal = 0;
  let isSearching = false;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Export
  let isExportingExcel = false;
  let isExportingPDF = false;

  const dateRanges = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "This month", value: "thisMonth" },
    { label: "Last month", value: "lastMonth" },
    { label: "All time", value: "all" },
  ];

  $: currentDateRangeLabel = dateRanges.find(r => r.value === selectedDateRange)?.label || "Last 30 days";
  $: subscriptionTier = $organization?.subscriptionTier || "FREE";
  $: isBusinessOrHigher = subscriptionTier === "BUSINESS" || subscriptionTier === "ENTERPRISE";

  async function loadDashboard() {
    if (!$currentWorkspace?.id) return;

    loading = true;
    error = "";

    try {
      // Load applications first
      const appsRes = await fetch(`/api/dashboard/workspace/applications?workspaceId=${$currentWorkspace.id}`, {
        credentials: "include",
      });
      if (appsRes.ok) {
        const appsData = await appsRes.json();
        applications = appsData.applications || [];
      }

      // Load dashboard data
      const params = new URLSearchParams({
        workspaceId: $currentWorkspace.id,
        dateRange: selectedDateRange,
      });
      if (selectedApp !== "all") {
        params.set("applicationId", selectedApp);
      }

      const res = await fetch(`/api/dashboard/v2?${params}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load dashboard");

      dashboardData = await res.json();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load dashboard";
      toasts.error("Dashboard Error", error);
    } finally {
      loading = false;
    }
  }

  async function searchChats() {
    if (!$currentWorkspace?.id || searchQuery.length < 2) {
      searchResults = [];
      searchTotal = 0;
      return;
    }

    isSearching = true;

    try {
      const params = new URLSearchParams({
        workspaceId: $currentWorkspace.id,
        q: searchQuery,
      });
      if (selectedApp !== "all") {
        params.set("applicationId", selectedApp);
      }

      const res = await fetch(`/api/dashboard/search-chats?${params}`, {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        searchResults = data.results || [];
        searchTotal = data.total || 0;
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      isSearching = false;
    }
  }

  function handleSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(searchChats, 300);
  }

  async function handleExportExcel() {
    if (isExportingExcel || !$currentWorkspace?.id) return;
    isExportingExcel = true;

    try {
      const params = new URLSearchParams({
        workspaceId: $currentWorkspace.id,
        dateRange: selectedDateRange,
        format: "xlsx",
      });
      if (selectedApp !== "all") {
        params.set("applicationId", selectedApp);
      }

      const res = await fetch(`/api/dashboard/export?${params}`, {
        credentials: "include",
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dashboard-report-${new Date().toISOString().split("T")[0]}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toasts.success("Export Complete", "Dashboard exported to Excel");
      } else {
        throw new Error("Export failed");
      }
    } catch (e) {
      toasts.error("Export Failed", "Could not export dashboard");
    } finally {
      isExportingExcel = false;
      exportOpen = false;
    }
  }

  async function handleExportPDF() {
    if (isExportingPDF || !$currentWorkspace?.id) return;
    isExportingPDF = true;

    try {
      const params = new URLSearchParams({
        workspaceId: $currentWorkspace.id,
        dateRange: selectedDateRange,
        format: "pdf",
      });
      if (selectedApp !== "all") {
        params.set("applicationId", selectedApp);
      }

      const res = await fetch(`/api/dashboard/export?${params}`, {
        credentials: "include",
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dashboard-report-${new Date().toISOString().split("T")[0]}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toasts.success("Export Complete", "Dashboard exported to PDF");
      } else {
        throw new Error("Export failed");
      }
    } catch (e) {
      toasts.error("Export Failed", "Could not export dashboard");
    } finally {
      isExportingPDF = false;
      exportOpen = false;
    }
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Reload when filters change
  $: if ($currentWorkspace?.id && (selectedApp || selectedDateRange)) {
    loadDashboard();
  }

  onMount(() => {
    if ($currentWorkspace?.id) {
      loadDashboard();
    }
  });
</script>

<svelte:head>
  <title>Dashboard - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="dashboard-container">
  <div class="dashboard-content">
    <!-- Header -->
    <header class="dashboard-header" in:fly={{ y: -20, duration: 400 }}>
      <div class="header-left">
        <p class="welcome-text">Welcome back,</p>
        <h1 class="header-title">{$user?.name || $currentWorkspace?.name || "Dashboard"}</h1>
      </div>

      <div class="header-filters">
        <!-- App Picker -->
        <div class="filter-select">
          <select bind:value={selectedApp} class="select-input">
            <option value="all">All Apps</option>
            {#each applications as app}
              <option value={app.id}>{app.name}</option>
            {/each}
          </select>
          <svg class="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>

        <!-- Date Range Picker -->
        <div class="dropdown">
          <button class="dropdown-trigger" on:click={() => dateRangeOpen = !dateRangeOpen}>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
            </svg>
            {currentDateRangeLabel}
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {#if dateRangeOpen}
            <div class="dropdown-menu" transition:scale={{ duration: 150, start: 0.95 }}>
              {#each dateRanges as range}
                <button
                  class="dropdown-item"
                  class:active={selectedDateRange === range.value}
                  on:click={() => { selectedDateRange = range.value; dateRangeOpen = false; }}
                >
                  {range.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Export Dropdown -->
        <div class="dropdown">
          <button class="dropdown-trigger" on:click={() => exportOpen = !exportOpen}>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" x2="12" y1="15" y2="3"/>
            </svg>
            Export
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {#if exportOpen}
            <div class="dropdown-menu" transition:scale={{ duration: 150, start: 0.95 }}>
              <button class="dropdown-item export-item" on:click={handleExportExcel} disabled={isExportingExcel}>
                <div class="export-icon excel">
                  {#if isExportingExcel}
                    <svg class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <path d="M8 13h2"/>
                      <path d="M8 17h2"/>
                      <path d="M14 13h2"/>
                      <path d="M14 17h2"/>
                    </svg>
                  {/if}
                </div>
                {isExportingExcel ? "Exporting..." : "Export to Excel"}
              </button>
              <button class="dropdown-item export-item" on:click={handleExportPDF} disabled={isExportingPDF}>
                <div class="export-icon pdf">
                  {#if isExportingPDF}
                    <svg class="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  {/if}
                </div>
                {isExportingPDF ? "Exporting..." : "Export to PDF"}
              </button>
            </div>
          {/if}
        </div>
      </div>
    </header>

    {#if loading}
      <!-- Loading State -->
      <div class="metrics-grid">
        {#each [1, 2, 3] as i}
          <div class="metric-card skeleton-card">
            <Skeleton className="skeleton-badge" />
            <Skeleton className="skeleton-value" />
            <Skeleton className="skeleton-link" />
          </div>
        {/each}
      </div>
    {:else if error}
      <!-- Error State -->
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" x2="12" y1="8" y2="12"/>
          <line x1="12" x2="12.01" y1="16" y2="16"/>
        </svg>
        <h3>Failed to load dashboard</h3>
        <p>{error}</p>
        <Button variant="outline" on:click={loadDashboard}>Try Again</Button>
      </div>
    {:else}
      <!-- Metrics Cards -->
      <div class="metrics-grid">
        <!-- Chats Card -->
        <div class="metric-card chats" in:fly={{ y: 20, duration: 400, delay: 0 }}>
          <div class="metric-header">
            <span class="metric-label">CHATS</span>
            <div class="metric-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
          </div>
          <div class="metric-value">{formatNumber(dashboardData?.totalChats || 0)}</div>
          <a href={selectedApp !== "all" ? `/apps/${selectedApp}/chats` : "/apps"} use:link class="metric-link yellow">
            View All Chats
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </a>
        </div>

        <!-- Leads Card -->
        <div class="metric-card leads" in:fly={{ y: 20, duration: 400, delay: 100 }}>
          <div class="metric-header">
            <span class="metric-label">LEADS</span>
            <div class="metric-icon emerald">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" x2="7.01" y1="7" y2="7"/>
              </svg>
            </div>
          </div>
          <div class="metric-value">{formatNumber(dashboardData?.totalLeads || 0)}</div>
          <a href={selectedApp !== "all" ? `/apps/${selectedApp}/chats?tab=tags` : "/apps"} use:link class="metric-link emerald">
            View/Edit Lead Criteria
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </a>
        </div>

        <!-- Conversions Card -->
        <div class="metric-card conversions" in:fly={{ y: 20, duration: 400, delay: 200 }}>
          {#if !isBusinessOrHigher}
            <div class="locked-overlay">
              <div class="lock-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <p>Upgrade to Business for Conversions</p>
              <a href="/plans" use:link>
                <Button variant="primary" size="sm">Upgrade</Button>
              </a>
            </div>
          {/if}
          <div class="metric-header">
            <span class="metric-label">CONVERSIONS</span>
            <div class="metric-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
          </div>
          <div class="metric-value">{isBusinessOrHigher ? formatNumber(dashboardData?.totalConversions || 0) : "-"}</div>
          <a href="/apps" use:link class="metric-link blue">
            View Conversions
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </a>
        </div>
      </div>

      <!-- Lead Tag Activity -->
      <section class="dashboard-section" in:fly={{ y: 20, duration: 400, delay: 300 }}>
        <div class="section-header">
          <div class="section-icon yellow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" x2="7.01" y1="7" y2="7"/>
            </svg>
          </div>
          <div>
            <h2>Lead Tag Activity</h2>
            <p>Most triggered lead capture tags from conversations</p>
          </div>
        </div>

        <div class="section-content">
          {#if dashboardData?.topTopics && dashboardData.topTopics.length > 0}
            <div class="topics-list">
              {#each dashboardData.topTopics.slice(0, 10) as topic, index}
                <a
                  href={`/apps/${topic.applicationId}/chats`}
                  use:link
                  class="topic-item"
                  in:fly={{ x: -20, duration: 300, delay: index * 60 }}
                >
                  <div class="topic-info">
                    <div class="topic-rank" class:gold={index === 0} class:silver={index === 1} class:bronze={index === 2}>
                      {index + 1}
                    </div>
                    <div class="topic-details">
                      <h4>{topic.topic}</h4>
                      {#if topic.sampleQuestions.length > 0}
                        <p class="sample-question">"{topic.sampleQuestions[0]}"</p>
                      {/if}
                    </div>
                  </div>
                  <div class="topic-stats">
                    <span class="topic-count">{formatNumber(topic.count)}</span>
                    {#if topic.trend !== "stable"}
                      <span class="topic-trend" class:up={topic.trend === "up"} class:down={topic.trend === "down"}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                          <polyline points="16 7 22 7 22 13"/>
                        </svg>
                        {topic.trendValue}%
                      </span>
                    {/if}
                  </div>
                  <div class="topic-progress">
                    <div
                      class="progress-bar"
                      class:gold={index === 0}
                      class:silver={index === 1}
                      class:bronze={index === 2}
                      style="width: {topic.percentage}%"
                    ></div>
                  </div>
                </a>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" x2="9.01" y1="9" y2="9"/>
                  <line x1="15" x2="15.01" y1="9" y2="9"/>
                </svg>
              </div>
              <h3>Capture Leads Automatically</h3>
              <p>Set up lead tags to identify and qualify potential customers from your conversations.</p>
              <div class="empty-badges">
                <span class="badge">Auto-qualify leads</span>
                <span class="badge">Track intent signals</span>
                <span class="badge">Export to CRM</span>
              </div>
              <a href={applications.length > 0 ? `/apps/${applications[0].id}/chats?tab=tags` : "/apps"} use:link>
                <Button variant="primary">Configure Lead Tags</Button>
              </a>
            </div>
          {/if}
        </div>
      </section>

      <!-- Search Chat History -->
      <section class="dashboard-section" in:fly={{ y: 20, duration: 400, delay: 400 }}>
        <div class="section-header">
          <div class="section-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <div>
            <h2>Search Chat History</h2>
            <p>Search through your conversations by keyword</p>
          </div>
        </div>

        <div class="section-content">
          <div class="search-container">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder="Search conversations..."
              bind:value={searchQuery}
              on:input={handleSearchInput}
            />
          </div>

          <div class="search-results">
            {#if isSearching}
              <div class="search-loading">
                <div class="spinner"></div>
              </div>
            {:else if searchResults.length > 0}
              <p class="results-count">Found {searchTotal} conversation{searchTotal !== 1 ? "s" : ""}</p>
              {#each searchResults as result, index}
                <a
                  href={`/apps/${result.applicationId}/chats?session=${result.id}`}
                  use:link
                  class="search-result"
                  in:fly={{ y: 10, duration: 200, delay: index * 50 }}
                >
                  <div class="result-content">
                    <div class="result-header">
                      <span class="result-title">{result.title || "Untitled conversation"}</span>
                      <span class="result-app">{result.applicationName}</span>
                    </div>
                    {#if result.messagePreview}
                      <p class="result-preview">{result.messagePreview}</p>
                    {/if}
                    <div class="result-meta">
                      {#if result.userName || result.userEmail}
                        <span>{result.userName || result.userEmail}</span>
                      {/if}
                      <span>{result.messageCount} message{result.messageCount !== 1 ? "s" : ""}</span>
                      <span>{formatDate(result.createdAt)}</span>
                    </div>
                  </div>
                  <svg class="result-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </a>
              {/each}
              {#if searchTotal > searchResults.length}
                <p class="results-more">Showing {searchResults.length} of {searchTotal} results</p>
              {/if}
            {:else if searchQuery.length >= 2}
              <div class="no-results">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>No conversations found</p>
                <span>Try a different search term</span>
              </div>
            {:else if (dashboardData?.totalChats || 0) === 0}
              <div class="empty-state">
                <div class="empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 8V4H8"/>
                    <rect width="16" height="12" x="4" y="8" rx="2"/>
                    <path d="M2 14h2"/>
                    <path d="M20 14h2"/>
                    <path d="M15 13v2"/>
                    <path d="M9 13v2"/>
                  </svg>
                </div>
                <h3>Your Chat History Awaits</h3>
                <p>Once users start chatting with your AI, their conversations will appear here.</p>
                <div class="empty-badges">
                  <span class="badge">Full-text search</span>
                  <span class="badge">Filter by app</span>
                  <span class="badge">Quick access</span>
                </div>
                <a href={applications.length > 0 ? `/apps/${applications[0].id}` : "/apps"} use:link>
                  <Button variant="primary">Preview Your Chatbot</Button>
                </a>
              </div>
            {:else}
              <div class="search-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Search your conversations</p>
                <span>Enter at least 2 characters to search</span>
                <div class="search-actions">
                  <a href={selectedApp !== "all" ? `/apps/${selectedApp}/chats` : (applications.length > 0 ? `/apps/${applications[0].id}/chats` : "/apps")} use:link>
                    <Button variant="primary" size="sm">View All Logs</Button>
                  </a>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<!-- Click outside handlers -->
<svelte:window on:click={(e) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".dropdown")) {
    dateRangeOpen = false;
    exportOpen = false;
  }
}} />

<style>
  .dashboard-container {
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .dashboard-content {
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }

  /* Header */
  .dashboard-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-bottom: var(--space-8);
  }

  @media (min-width: 1024px) {
    .dashboard-header {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }

  .welcome-text {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    letter-spacing: 0.025em;
  }

  .header-title {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  @media (min-width: 768px) {
    .header-title {
      font-size: var(--text-3xl);
    }
  }

  .header-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }

  /* Filter Select */
  .filter-select {
    position: relative;
  }

  .select-input {
    appearance: none;
    padding: var(--space-2) var(--space-10) var(--space-2) var(--space-3);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    min-width: 160px;
    transition: all var(--transition-fast);
  }

  .select-input:hover {
    border-color: hsl(var(--border));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .select-input:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  .select-icon {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }

  /* Dropdown */
  .dropdown {
    position: relative;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .dropdown-trigger:hover {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    color: hsl(var(--muted-foreground));
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 50;
    padding: var(--space-1);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .dropdown-item:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .dropdown-item.active {
    background: hsl(47 100% 50% / 0.1);
    color: hsl(45 100% 35%);
    font-weight: var(--font-medium);
  }

  .dropdown-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-item {
    gap: var(--space-3);
  }

  .export-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
  }

  .export-icon svg {
    width: 16px;
    height: 16px;
  }

  .export-icon.excel {
    background: hsl(142 76% 95%);
    color: hsl(142 76% 36%);
  }

  .export-icon.pdf {
    background: hsl(0 72% 95%);
    color: hsl(0 72% 50%);
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);
    margin-bottom: var(--space-10);
  }

  @media (min-width: 768px) {
    .metrics-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .metric-card {
    position: relative;
    background: hsl(var(--background));
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    transition: box-shadow var(--transition-fast);
  }

  .metric-card:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .metric-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .metric-label {
    font-size: 11px;
    font-weight: var(--font-semibold);
    letter-spacing: 0.1em;
    color: hsl(var(--muted-foreground));
  }

  .metric-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
  }

  .metric-icon svg {
    width: 20px;
    height: 20px;
  }

  .metric-icon.yellow {
    background: linear-gradient(135deg, hsl(47 100% 50% / 0.2), hsl(47 100% 50% / 0.1));
    color: hsl(45 100% 35%);
  }

  .metric-icon.emerald {
    background: linear-gradient(135deg, hsl(142 76% 50% / 0.2), hsl(142 76% 50% / 0.1));
    color: hsl(142 76% 36%);
  }

  .metric-icon.blue {
    background: linear-gradient(135deg, hsl(217 91% 60% / 0.2), hsl(217 91% 60% / 0.1));
    color: hsl(217 91% 50%);
  }

  .metric-value {
    font-size: var(--text-4xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-4);
    letter-spacing: -0.025em;
  }

  .metric-link {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    text-decoration: none;
    transition: all var(--transition-fast);
  }

  .metric-link svg {
    width: 16px;
    height: 16px;
    transition: transform var(--transition-fast);
  }

  .metric-link:hover svg {
    transform: translateX(4px);
  }

  .metric-link.yellow {
    color: hsl(45 100% 35%);
  }

  .metric-link.yellow:hover {
    color: hsl(45 100% 28%);
  }

  .metric-link.emerald {
    color: hsl(142 76% 36%);
  }

  .metric-link.emerald:hover {
    color: hsl(142 76% 28%);
  }

  .metric-link.blue {
    color: hsl(217 91% 50%);
  }

  .metric-link.blue:hover {
    color: hsl(217 91% 42%);
  }

  /* Locked Overlay */
  .locked-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, hsl(var(--muted) / 0.95), hsl(var(--muted)));
    backdrop-filter: blur(3px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    text-align: center;
  }

  .lock-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: hsl(var(--background));
    border-radius: var(--radius-xl);
    margin-bottom: var(--space-3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .lock-icon svg {
    width: 24px;
    height: 24px;
    color: hsl(var(--muted-foreground));
  }

  .locked-overlay p {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  /* Skeleton */
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  :global(.skeleton-badge) {
    width: 80px !important;
    height: 16px !important;
  }

  :global(.skeleton-value) {
    width: 100px !important;
    height: 40px !important;
  }

  :global(.skeleton-link) {
    width: 120px !important;
    height: 20px !important;
  }

  /* Dashboard Sections */
  .dashboard-section {
    background: hsl(var(--background));
    border-radius: var(--radius-xl);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    margin-bottom: var(--space-10);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-6);
    border-bottom: 1px solid hsl(var(--border));
  }

  .section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-xl);
  }

  .section-icon svg {
    width: 24px;
    height: 24px;
  }

  .section-icon.yellow {
    background: linear-gradient(135deg, hsl(47 100% 50% / 0.2), hsl(47 100% 40% / 0.1));
    color: hsl(45 100% 35%);
  }

  .section-icon.blue {
    background: linear-gradient(135deg, hsl(217 91% 60% / 0.2), hsl(221 83% 53% / 0.1));
    color: hsl(217 91% 50%);
  }

  .section-header h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .section-header p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0;
  }

  .section-content {
    padding: var(--space-6);
  }

  /* Topics List */
  .topics-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .topic-item {
    display: block;
    padding: var(--space-5);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    text-decoration: none;
    transition: all var(--transition-fast);
  }

  .topic-item:hover {
    border-color: hsl(47 100% 70%);
    box-shadow: 0 4px 12px hsl(47 100% 50% / 0.1);
    transform: translateY(-2px);
  }

  .topic-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .topic-rank {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .topic-rank.gold {
    background: hsl(47 100% 50%);
    color: white;
  }

  .topic-rank.silver {
    background: hsl(0 0% 20%);
    color: white;
  }

  .topic-rank.bronze {
    background: hsl(28 73% 45%);
    color: white;
  }

  .topic-details {
    flex: 1;
    min-width: 0;
  }

  .topic-details h4 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .sample-question {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 320px;
  }

  .topic-stats {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
  }

  .topic-count {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
  }

  .topic-trend {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
  }

  .topic-trend svg {
    width: 12px;
    height: 12px;
  }

  .topic-trend.up {
    background: hsl(142 76% 95%);
    color: hsl(142 76% 36%);
  }

  .topic-trend.down {
    background: hsl(0 72% 95%);
    color: hsl(0 72% 50%);
  }

  .topic-trend.down svg {
    transform: rotate(180deg);
  }

  .topic-progress {
    height: 8px;
    background: hsl(var(--muted));
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    border-radius: var(--radius-full);
    background: linear-gradient(90deg, hsl(0 0% 70%), hsl(0 0% 80%));
    transition: width 0.8s ease-out;
  }

  .progress-bar.gold {
    background: linear-gradient(90deg, hsl(47 100% 45%), hsl(47 100% 55%));
  }

  .progress-bar.silver {
    background: linear-gradient(90deg, hsl(0 0% 25%), hsl(0 0% 35%));
  }

  .progress-bar.bronze {
    background: linear-gradient(90deg, hsl(28 73% 40%), hsl(28 73% 50%));
  }

  /* Search */
  .search-container {
    position: relative;
    margin-bottom: var(--space-6);
  }

  .search-icon {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 48px;
    padding: 0 var(--space-4) 0 var(--space-12);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    font-size: var(--text-base);
    color: hsl(var(--foreground));
    transition: all var(--transition-fast);
  }

  .search-input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .search-input:focus {
    outline: none;
    border-color: hsl(217 91% 60% / 0.5);
    box-shadow: 0 0 0 3px hsl(217 91% 60% / 0.1);
  }

  .search-results {
    min-height: 280px;
  }

  .search-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--muted));
    border-top-color: hsl(var(--accent));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .results-count {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    text-decoration: none;
    margin-bottom: var(--space-3);
    transition: all var(--transition-fast);
  }

  .search-result:hover {
    border-color: hsl(217 91% 70%);
    box-shadow: 0 4px 12px hsl(217 91% 60% / 0.1);
  }

  .result-content {
    flex: 1;
    min-width: 0;
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }

  .result-title {
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .result-app {
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-2);
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
  }

  .result-preview {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .result-arrow {
    width: 20px;
    height: 20px;
    color: hsl(var(--muted-foreground) / 0.5);
    flex-shrink: 0;
  }

  .results-more {
    text-align: center;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    padding-top: var(--space-3);
  }

  .no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    text-align: center;
  }

  .no-results svg {
    width: 48px;
    height: 48px;
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .no-results p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1);
  }

  .no-results span {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .search-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    text-align: center;
  }

  .search-placeholder svg {
    width: 48px;
    height: 48px;
    color: hsl(var(--accent));
    margin-bottom: var(--space-4);
  }

  .search-placeholder p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1);
  }

  .search-placeholder span {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-6);
  }

  .search-actions {
    display: flex;
    gap: var(--space-3);
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-12) var(--space-6);
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-2xl);
    background: hsl(var(--accent));
    margin-bottom: var(--space-6);
    box-shadow: 0 8px 24px hsl(var(--accent) / 0.3);
  }

  .empty-icon svg {
    width: 40px;
    height: 40px;
    color: hsl(var(--accent-foreground));
  }

  .empty-state h3 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3);
  }

  .empty-state p {
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    max-width: 400px;
    margin: 0 0 var(--space-6);
  }

  .empty-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    margin-bottom: var(--space-8);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    background: hsl(var(--accent) / 0.15);
    border: 1px solid hsl(var(--accent) / 0.2);
    border-radius: var(--radius-full);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  /* Error State */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-16) var(--space-6);
    text-align: center;
  }

  .error-state svg {
    width: 48px;
    height: 48px;
    color: hsl(0 72% 50%);
    margin-bottom: var(--space-4);
  }

  .error-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2);
  }

  .error-state p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6);
  }
</style>
