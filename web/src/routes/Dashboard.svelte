<!--
  Dashboard Page

  Main analytics dashboard with metrics, lead tags, and chat search.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { link } from "svelte-spa-router";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import {
    Card,
    Button,
    Input,
    Badge,
    Skeleton,
    Spinner,
    Select,
    SelectItem,
    Progress,
  } from "../lib/design-system";
  import { workspaceStore, type Workspace } from "../stores/workspace";
  import { developerStore } from "../stores/auth";
  import {
    dashboardStore,
    dashboardData,
    dashboardApplications,
    dashboardSearchResults,
    isDashboardLoading,
    isDashboardSearching,
    dashboardSelectedApp,
    dashboardSelectedDateRange,
    dateRanges,
    initDashboard,
    setSelectedApp,
    setSelectedDateRange,
    searchChats,
    type TopicData,
  } from "../stores/dashboard";

  let workspace: Workspace | null = null;
  let developerName: string = "";
  let searchQuery = "";
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let dashboardInitialized = false;

  const unsubscribeWorkspace = workspaceStore.subscribe((state) => {
    workspace = state.currentWorkspace;
  });

  const unsubscribeDeveloper = developerStore.subscribe((d) => {
    if (d) {
      developerName = d.name || d.email || "User";
    }
  });

  // Reactively initialize dashboard when workspace becomes available
  $: if (workspace && !dashboardInitialized) {
    dashboardInitialized = true;
    initDashboard(workspace.id);
  }

  onDestroy(() => {
    unsubscribeWorkspace();
    unsubscribeDeveloper();
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  function handleAppChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (workspace) {
      setSelectedApp(select.value, workspace.id);
    }
  }

  function handleDateRangeChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    if (workspace) {
      setSelectedDateRange(select.value, workspace.id);
    }
  }

  function handleSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    searchQuery = input.value;

    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      if (workspace) {
        searchChats({
          workspaceId: workspace.id,
          query: searchQuery,
          applicationId: $dashboardSelectedApp,
        });
      }
    }, 300);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getTopicRankColor(index: number): string {
    if (index === 0) return "bg-yellow-500";
    if (index === 1) return "bg-gray-700";
    if (index === 2) return "bg-amber-600";
    return "bg-gray-400";
  }

  function getProgressColor(index: number): string {
    if (index === 0) return "from-yellow-400 to-yellow-500";
    if (index === 1) return "from-gray-700 to-gray-800";
    if (index === 2) return "from-amber-500 to-amber-600";
    return "from-gray-300 to-gray-400";
  }

  $: maxTopicCount = Math.max(
    ...($dashboardData?.topTopics?.map((t) => t.count) || [1])
  );
  $: currentDateRange = dateRanges.find(
    (r) => r.value === $dashboardSelectedDateRange
  );
</script>

<svelte:head>
  <title>Dashboard - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="dashboard-container">
  <div class="dashboard-content">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="welcome">
        <p class="welcome-label">Welcome back,</p>
        <h1 class="welcome-name">{developerName}</h1>
      </div>

      <div class="filters">
        <!-- App Picker -->
        <select
          class="filter-select"
          value={$dashboardSelectedApp}
          on:change={handleAppChange}
        >
          <option value="all">All Apps</option>
          {#each $dashboardApplications as app}
            <option value={app.id.toString()}>{app.name}</option>
          {/each}
        </select>

        <!-- Date Range Picker -->
        <select
          class="filter-select"
          value={$dashboardSelectedDateRange}
          on:change={handleDateRangeChange}
        >
          {#each dateRanges as range}
            <option value={range.value}>{range.label}</option>
          {/each}
        </select>
      </div>
    </header>

    {#if $isDashboardLoading}
      <!-- Loading Skeleton -->
      <div class="metrics-grid">
        {#each [1, 2, 3] as _}
          <div class="metric-card">
            <div class="metric-header">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-icon" />
            </div>
            <Skeleton className="skeleton-value" />
            <Skeleton className="skeleton-link" />
          </div>
        {/each}
      </div>
    {:else if $dashboardData}
      <!-- Metric Cards -->
      <div class="metrics-grid">
        <!-- Chats -->
        <div class="metric-card metric-yellow">
          <div class="metric-header">
            <span class="metric-label">CHATS</span>
            <div class="metric-icon yellow">
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
                <path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                />
              </svg>
            </div>
          </div>
          <div class="metric-value">
            {$dashboardData.totalChats.toLocaleString()}
          </div>
          {#if $dashboardSelectedApp !== "all"}
            <a
              href="#/app_builder/{$dashboardSelectedApp}/chats"
              class="metric-link yellow"
            >
              View All Chats
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          {:else}
            <a href="#/applications" class="metric-link yellow">
              View Applications
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          {/if}
        </div>

        <!-- Leads -->
        <div class="metric-card metric-green">
          <div class="metric-header">
            <span class="metric-label">LEADS</span>
            <div class="metric-icon green">
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
                <path
                  d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
          </div>
          <div class="metric-value">
            {$dashboardData.totalLeads.toLocaleString()}
          </div>
          {#if $dashboardSelectedApp !== "all" && $dashboardApplications.length > 0}
            <a
              href="#/app_builder/{$dashboardSelectedApp}/chats?tab=tags"
              class="metric-link green"
            >
              View/Edit Lead Criteria
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          {:else}
            <a href="#/applications" class="metric-link green">
              View Applications
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
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          {/if}
        </div>

        <!-- Conversions -->
        <div class="metric-card metric-blue">
          <div class="metric-header">
            <span class="metric-label">CONVERSIONS</span>
            <div class="metric-icon blue">
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
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
          </div>
          <div class="metric-value">
            {$dashboardData.totalConversions.toLocaleString()}
          </div>
          <a href="#/applications" class="metric-link blue">
            View Conversions
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
              <path d="m9 18 6-6-6-6" />
            </svg>
          </a>
        </div>
      </div>

      <!-- Lead Tag Activity -->
      <section class="section-card">
        <div class="section-header">
          <div class="section-icon yellow">
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
              <path
                d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
              />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div class="section-title-group">
            <h2 class="section-title">Lead Tag Activity</h2>
            <p class="section-description">
              Most triggered lead capture tags from conversations
            </p>
          </div>
        </div>

        <div class="section-content">
          {#if $dashboardData.topTopics.length > 0}
            <div class="topics-list">
              {#each $dashboardData.topTopics.slice(0, 10) as topic, index}
                <a
                  href="#/app_builder/{topic.applicationId}/chats"
                  class="topic-item"
                >
                  <div class="topic-main">
                    <div class="topic-info">
                      <div
                        class="topic-rank {getTopicRankColor(index)}"
                        class:text-white={index < 3}
                      >
                        {index + 1}
                      </div>
                      <div class="topic-details">
                        <h4 class="topic-name">{topic.topic}</h4>
                        {#if topic.sampleQuestions.length > 0}
                          <p class="topic-sample">
                            "{topic.sampleQuestions[0]}"
                          </p>
                        {/if}
                      </div>
                    </div>
                    <div class="topic-stats">
                      <span class="topic-count"
                        >{topic.count.toLocaleString()}</span
                      >
                      {#if topic.trend !== "stable"}
                        <span
                          class="topic-trend"
                          class:trend-up={topic.trend === "up"}
                          class:trend-down={topic.trend === "down"}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class:rotate-180={topic.trend === "down"}
                          >
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                            <polyline points="17 6 23 6 23 12" />
                          </svg>
                          {topic.trendValue}%
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="topic-progress">
                    <div
                      class="topic-progress-bar bg-gradient-to-r {getProgressColor(
                        index
                      )}"
                      style="width: {(topic.count / maxTopicCount) * 100}%"
                    ></div>
                  </div>
                </a>
              {/each}
            </div>
          {:else}
            <div class="empty-state">
              <div class="empty-icon">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 class="empty-title">Capture Leads Automatically</h3>
              <p class="empty-description">
                Set up lead tags to identify and qualify potential customers
                from your conversations.
              </p>
              {#if $dashboardApplications.length > 0}
                <a
                  href="#/app_builder/{$dashboardApplications[0].id}/chats?tab=tags"
                  class="empty-cta"
                >
                  Configure Lead Tags
                </a>
              {/if}
            </div>
          {/if}
        </div>
      </section>

      <!-- Search Chat History -->
      <section class="section-card">
        <div class="section-header">
          <div class="section-icon blue">
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div class="section-title-group">
            <h2 class="section-title">Search Chat History</h2>
            <p class="section-description">
              Search through your conversations by keyword
            </p>
          </div>
        </div>

        <div class="section-content">
          <div class="search-input-wrapper">
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
              class="search-icon"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
            {#if $isDashboardSearching}
              <div class="search-loading">
                <Spinner size="md" />
              </div>
            {:else if $dashboardSearchResults.length > 0}
              <p class="search-count">
                Found {$dashboardStore.searchTotal} conversation{$dashboardStore.searchTotal !==
                1
                  ? "s"
                  : ""}
              </p>
              {#each $dashboardSearchResults as result}
                <a
                  href="#/app_builder/{result.applicationId}/chats?session={result.id}"
                  class="search-result"
                >
                  <div class="search-result-main">
                    <div class="search-result-header">
                      <span class="search-result-title">
                        {result.title || "Untitled conversation"}
                      </span>
                      <Badge variant="outline">{result.applicationName}</Badge>
                    </div>
                    {#if result.messagePreview}
                      <p class="search-result-preview">{result.messagePreview}</p>
                    {/if}
                    <div class="search-result-meta">
                      {#if result.userName || result.userEmail}
                        <span class="search-result-user">
                          {result.userName || result.userEmail}
                        </span>
                      {/if}
                      <span>{result.messageCount} messages</span>
                      <span>{formatDate(result.createdAt)}</span>
                    </div>
                  </div>
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
                    class="search-result-chevron"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </a>
              {/each}
              {#if $dashboardStore.searchTotal > $dashboardSearchResults.length}
                <p class="search-more">
                  Showing {$dashboardSearchResults.length} of {$dashboardStore.searchTotal}
                  results
                </p>
              {/if}
            {:else if searchQuery.length >= 2}
              <div class="search-empty">
                <div class="search-empty-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    />
                  </svg>
                </div>
                <p class="search-empty-title">No conversations found</p>
                <p class="search-empty-hint">Try a different search term</p>
              </div>
            {:else if $dashboardData.totalChats === 0}
              <div class="empty-state">
                <div class="empty-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <h3 class="empty-title">Your Chat History Awaits</h3>
                <p class="empty-description">
                  Once users start chatting with your AI, their conversations
                  will appear here.
                </p>
                {#if $dashboardApplications.length > 0}
                  <a
                    href="#/app_builder/{$dashboardApplications[0]
                      .id}/preview"
                    class="empty-cta"
                  >
                    Preview Your Chatbot
                  </a>
                {/if}
              </div>
            {:else}
              <div class="search-prompt">
                <div class="search-prompt-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    />
                  </svg>
                </div>
                <p class="search-prompt-title">Search your conversations</p>
                <p class="search-prompt-hint">
                  Enter at least 2 characters to search
                </p>
                <div class="search-prompt-actions">
                  {#if $dashboardApplications.length > 0}
                    <a
                      href="#/app_builder/{$dashboardSelectedApp !== 'all'
                        ? $dashboardSelectedApp
                        : $dashboardApplications[0].id}/chats"
                      class="search-action-btn primary"
                    >
                      View All Logs
                    </a>
                    <a
                      href="#/app_builder/{$dashboardSelectedApp !== 'all'
                        ? $dashboardSelectedApp
                        : $dashboardApplications[0].id}/chats?tab=tags"
                      class="search-action-btn secondary"
                    >
                      View Most Frequent Topics
                    </a>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </section>
    {:else}
      <div class="error-state">
        <p>Failed to load dashboard data</p>
        <Button
          on:click={() => workspace && initDashboard(workspace.id)}
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    {/if}
  </div>
</div>

<style>
  .dashboard-container {
    min-height: 100vh;
    background: hsl(var(--background));
    padding-bottom: var(--space-10);
  }

  .dashboard-content {
    max-width: 80rem;
    margin: 0 auto;
    padding: var(--space-4);
  }

  @media (min-width: 1024px) {
    .dashboard-content {
      padding: var(--space-8);
    }
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
      margin-top: var(--space-6);
    }
  }

  .welcome-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-1);
    letter-spacing: 0.025em;
  }

  .welcome-name {
    font-size: var(--text-2xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  @media (min-width: 768px) {
    .welcome-name {
      font-size: var(--text-3xl);
    }
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .filter-select {
    padding: var(--space-2) var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    min-width: 160px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-select:hover {
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .filter-select:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
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
    padding: var(--space-6);
    background: hsl(var(--card));
    border-radius: var(--radius-xl);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
    overflow: hidden;
  }

  .metric-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      hsl(var(--background)) 0%,
      hsl(var(--card)) 100%
    );
    pointer-events: none;
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .metric-header {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .metric-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
  }

  .metric-icon {
    padding: var(--space-2-5);
    border-radius: var(--radius-xl);
  }

  .metric-icon.yellow {
    background: linear-gradient(
      135deg,
      rgba(250, 204, 21, 0.2) 0%,
      rgba(234, 179, 8, 0.1) 100%
    );
    color: rgb(202, 138, 4);
  }

  .metric-icon.green {
    background: linear-gradient(
      135deg,
      rgba(52, 211, 153, 0.2) 0%,
      rgba(16, 185, 129, 0.1) 100%
    );
    color: rgb(5, 150, 105);
  }

  .metric-icon.blue {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.2) 0%,
      rgba(59, 130, 246, 0.1) 100%
    );
    color: rgb(37, 99, 235);
  }

  .metric-value {
    position: relative;
    font-size: var(--text-4xl);
    font-weight: 700;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-5);
    letter-spacing: -0.02em;
  }

  .metric-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .metric-link.yellow {
    color: rgb(161, 98, 7);
  }
  .metric-link.yellow:hover {
    color: rgb(133, 77, 14);
  }

  .metric-link.green {
    color: rgb(4, 120, 87);
  }
  .metric-link.green:hover {
    color: rgb(6, 95, 70);
  }

  .metric-link.blue {
    color: rgb(29, 78, 216);
  }
  .metric-link.blue:hover {
    color: rgb(30, 64, 175);
  }

  .metric-link svg {
    transition: transform 0.2s ease;
  }

  .metric-link:hover svg {
    transform: translateX(4px);
  }

  /* Section Card */
  .section-card {
    background: hsl(var(--card));
    border-radius: var(--radius-xl);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
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
    padding: var(--space-3);
    border-radius: var(--radius-xl);
  }

  .section-icon.yellow {
    background: linear-gradient(
      135deg,
      rgba(250, 204, 21, 0.2) 0%,
      rgba(245, 158, 11, 0.1) 100%
    );
    color: rgb(202, 138, 4);
  }

  .section-icon.blue {
    background: linear-gradient(
      135deg,
      rgba(96, 165, 250, 0.2) 0%,
      rgba(99, 102, 241, 0.1) 100%
    );
    color: rgb(37, 99, 235);
  }

  .section-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .section-description {
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
    color: inherit;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .topic-item:hover {
    border-color: hsl(var(--primary) / 0.3);
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }

  .topic-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-4);
  }

  .topic-info {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .topic-rank {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    font-weight: 700;
    flex-shrink: 0;
  }

  .topic-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .topic-sample {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topic-stats {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .topic-count {
    font-size: var(--text-xl);
    font-weight: 700;
    color: hsl(var(--foreground));
    font-variant-numeric: tabular-nums;
  }

  .topic-trend {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2-5);
    border-radius: 9999px;
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .topic-trend.trend-up {
    background: rgba(16, 185, 129, 0.1);
    color: rgb(5, 150, 105);
  }

  .topic-trend.trend-down {
    background: rgba(244, 63, 94, 0.1);
    color: rgb(225, 29, 72);
  }

  .rotate-180 {
    transform: rotate(180deg);
  }

  .topic-progress {
    height: 8px;
    background: hsl(var(--muted));
    border-radius: 9999px;
    overflow: hidden;
  }

  .topic-progress-bar {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.8s cubic-bezier(0.23, 1, 0.32, 1);
  }

  .bg-gradient-to-r {
    background-image: linear-gradient(to right, var(--tw-gradient-stops));
  }

  .from-yellow-400 {
    --tw-gradient-from: #facc15;
    --tw-gradient-stops: var(--tw-gradient-from),
      var(--tw-gradient-to, rgba(250, 204, 21, 0));
  }
  .to-yellow-500 {
    --tw-gradient-to: #eab308;
  }

  .from-gray-700 {
    --tw-gradient-from: #374151;
    --tw-gradient-stops: var(--tw-gradient-from),
      var(--tw-gradient-to, rgba(55, 65, 81, 0));
  }
  .to-gray-800 {
    --tw-gradient-to: #1f2937;
  }

  .from-amber-500 {
    --tw-gradient-from: #f59e0b;
    --tw-gradient-stops: var(--tw-gradient-from),
      var(--tw-gradient-to, rgba(245, 158, 11, 0));
  }
  .to-amber-600 {
    --tw-gradient-to: #d97706;
  }

  .from-gray-300 {
    --tw-gradient-from: #d1d5db;
    --tw-gradient-stops: var(--tw-gradient-from),
      var(--tw-gradient-to, rgba(209, 213, 219, 0));
  }
  .to-gray-400 {
    --tw-gradient-to: #9ca3af;
  }

  /* Search */
  .search-input-wrapper {
    position: relative;
    margin-bottom: var(--space-6);
  }

  .search-icon {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
  }

  .search-input {
    width: 100%;
    height: 48px;
    padding: 0 var(--space-4) 0 var(--space-12);
    font-size: var(--text-base);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    color: hsl(var(--foreground));
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
  }

  .search-input::placeholder {
    color: hsl(var(--muted-foreground));
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

  .search-count {
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    text-decoration: none;
    color: inherit;
    margin-bottom: var(--space-4);
    transition: all 0.2s ease;
  }

  .search-result:hover {
    border-color: hsl(var(--primary) / 0.3);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .search-result-main {
    flex: 1;
    min-width: 0;
  }

  .search-result-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .search-result-title {
    font-weight: 600;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-result-preview {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .search-result-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .search-result-user::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    background: hsl(var(--border));
    border-radius: 50%;
    margin-right: var(--space-1);
  }

  .search-result-chevron {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground) / 0.5);
  }

  .search-more {
    text-align: center;
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    padding-top: var(--space-3);
  }

  .search-empty,
  .search-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
  }

  .search-empty-icon,
  .search-prompt-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    border-radius: var(--radius-2xl);
    margin-bottom: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .search-prompt-icon {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .search-empty-title,
  .search-prompt-title {
    font-weight: 500;
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1);
  }

  .search-empty-hint,
  .search-prompt-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .search-prompt-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }

  .search-action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .search-action-btn.primary {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .search-action-btn.primary:hover {
    opacity: 0.9;
  }

  .search-action-btn.secondary {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    color: hsl(var(--foreground));
  }

  .search-action-btn.secondary:hover {
    background: hsl(var(--muted) / 0.5);
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--primary) / 0.1);
    border-radius: var(--radius-2xl);
    margin-bottom: var(--space-6);
    color: hsl(var(--primary));
    box-shadow:
      0 10px 15px -3px hsl(var(--primary) / 0.1),
      0 4px 6px -2px hsl(var(--primary) / 0.05);
  }

  .empty-title {
    font-size: var(--text-xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-3);
  }

  .empty-description {
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-6);
    max-width: 400px;
  }

  .empty-cta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-radius: var(--radius-lg);
    font-weight: 500;
    text-decoration: none;
    box-shadow:
      0 4px 6px -1px hsl(var(--primary) / 0.2),
      0 2px 4px -1px hsl(var(--primary) / 0.1);
    transition: all 0.2s ease;
  }

  .empty-cta:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  /* Error State */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: var(--space-4);
  }

  .error-state p {
    color: hsl(var(--muted-foreground));
  }

  /* Skeleton */
  :global(.skeleton-title) {
    width: 80px;
    height: 12px;
  }

  :global(.skeleton-icon) {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-xl);
  }

  :global(.skeleton-value) {
    width: 120px;
    height: 40px;
    margin-bottom: var(--space-5);
  }

  :global(.skeleton-link) {
    width: 100px;
    height: 16px;
  }

  /* Utility */
  .text-white {
    color: white;
  }
</style>
