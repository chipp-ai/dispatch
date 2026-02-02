<script lang="ts">
  import { Search, Phone, ChevronLeft, ChevronRight, Filter } from "lucide-svelte";
  import ChatSessionCard from "./ChatSessionCard.svelte";

  // Types
  interface SlackUser {
    email?: string;
    realName?: string;
    displayName?: string;
    avatar?: string;
  }

  interface Message {
    id: string;
    content: string;
    senderType: string;
    createdAt: string;
    tags?: { id: string; name: string }[];
  }

  interface ChatSession {
    id: string;
    title: string | null;
    source: string;
    createdAt: string;
    messages: Message[];
    user: {
      id: string;
      name: string | null;
      email: string | null;
      identifier: string | null;
    } | null;
    tags?: { id: string; name: string }[];
    slackUser?: SlackUser;
  }

  interface Tag {
    id: string;
    name: string;
  }

  // Props
  export let sessions: ChatSession[] = [];
  export let viewedIds: string[] = [];
  export let totalCount: number = 0;
  export let currentPage: number = 1;
  export let totalPages: number = 1;
  export let isLoading: boolean = false;
  export let tags: Tag[] = [];
  export let selectedSessionId: string | null = null;

  // Filter state
  export let searchTerm: string = "";
  export let statusFilter: string = "all";
  export let sourceFilter: string = "all";
  export let tagFilter: string = "all";
  export let phoneNumberFilter: string = "";

  // Event handlers
  export let onSessionSelect: (session: ChatSession) => void = () => {};
  export let onPageChange: (page: number) => void = () => {};
  export let onSearchChange: (term: string) => void = () => {};
  export let onStatusFilterChange: (status: string) => void = () => {};
  export let onSourceFilterChange: (source: string) => void = () => {};
  export let onTagFilterChange: (tag: string) => void = () => {};
  export let onPhoneFilterChange: (phone: string) => void = () => {};

  // Local state for debouncing
  let localSearchTerm = searchTerm;
  let localPhoneNumber = phoneNumberFilter;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let phoneTimeout: ReturnType<typeof setTimeout> | null = null;
  let showFilters = true;

  // Debounced search
  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    localSearchTerm = value;

    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      onSearchChange(value);
    }, 500);
  }

  // Debounced phone filter
  function handlePhoneInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    localPhoneNumber = value;

    if (phoneTimeout) clearTimeout(phoneTimeout);
    phoneTimeout = setTimeout(() => {
      onPhoneFilterChange(value);
    }, 500);
  }

  // Reset phone filter when source changes away from WhatsApp
  $: if (sourceFilter !== "WHATSAPP" && localPhoneNumber) {
    localPhoneNumber = "";
    onPhoneFilterChange("");
  }

  // Time grouping logic (native Date, no moment.js)
  function groupSessionsByTime(sessions: ChatSession[]) {
    const groups: Record<string, ChatSession[]> = {};
    const groupOrder = ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Older"];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Start of this week (Sunday)
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());

    // Start of last week
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);

    // Start of this month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    sessions.forEach((session) => {
      // Use last message time if available
      const lastMessageDate = session.messages?.length > 0
        ? new Date(session.messages[session.messages.length - 1].createdAt)
        : new Date(session.createdAt);

      let groupName: string;

      if (lastMessageDate >= today) {
        groupName = "Today";
      } else if (lastMessageDate >= yesterday && lastMessageDate < today) {
        groupName = "Yesterday";
      } else if (lastMessageDate >= thisWeekStart) {
        groupName = "This Week";
      } else if (lastMessageDate >= lastWeekStart && lastMessageDate <= lastWeekEnd) {
        groupName = "Last Week";
      } else if (lastMessageDate >= thisMonthStart) {
        groupName = "This Month";
      } else {
        groupName = "Older";
      }

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(session);
    });

    // Return in order, filtering empty groups
    return groupOrder
      .filter((name) => groups[name]?.length > 0)
      .map((name) => ({ name, sessions: groups[name] }));
  }

  // Get display sessions based on status filter
  $: displaySessions = statusFilter === "unread"
    ? sessions.filter((s) => !viewedIds.includes(s.id))
    : sessions;

  // Group sessions by time
  $: groupedSessions = groupSessionsByTime(displaySessions);

  // Count unread sessions
  $: unreadCount = sessions.filter((s) => !viewedIds.includes(s.id)).length;

  // Count sessions by tag (for current page)
  $: tagCounts = (() => {
    const counts: Record<string, number> = { all: totalCount };
    sessions.forEach((session) => {
      const sessionTagIds = new Set<string>();
      session.messages?.forEach((msg) => {
        msg.tags?.forEach((tag) => sessionTagIds.add(tag.id));
      });
      sessionTagIds.forEach((tagId) => {
        counts[tagId] = (counts[tagId] || 0) + 1;
      });
    });
    return counts;
  })();

  // Generate page numbers for pagination
  function generatePageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      if (start > 2) pages.push("...");

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) pages.push("...");

      pages.push(totalPages);
    }

    return pages;
  }

  function handleSessionClick(session: ChatSession) {
    onSessionSelect(session);
  }

  function handlePageClick(page: number | string) {
    if (typeof page === "number" && page !== currentPage) {
      onPageChange(page);
    }
  }

  // Check if any filters are active
  $: hasActiveFilters = statusFilter !== "all" || sourceFilter !== "all" || tagFilter !== "all" || phoneNumberFilter;
</script>

<div class="chat-list">
  <!-- Search and Filters -->
  <div class="filters-container">
    <!-- Search Input -->
    <div class="search-wrapper">
      <Search size={16} class="search-icon" />
      <input
        type="text"
        placeholder="Search chats..."
        value={localSearchTerm}
        on:input={handleSearchInput}
        class="search-input"
      />
    </div>

    <!-- Filter Toggle Button -->
    <button
      class="filter-toggle"
      class:active={showFilters || hasActiveFilters}
      on:click={() => (showFilters = !showFilters)}
    >
      <Filter size={16} />
      <span>Filters</span>
      {#if hasActiveFilters}
        <span class="filter-badge"></span>
      {/if}
    </button>

    <!-- Expandable Filters -->
    {#if showFilters}
      <div class="filters-expanded">
        <!-- Status Filter -->
        <div class="filter-group">
          <label class="filter-label">Status</label>
          <select
            class="filter-select"
            value={statusFilter}
            on:change={(e) => onStatusFilterChange(e.currentTarget.value)}
          >
            <option value="all">All ({totalCount})</option>
            <option value="unread">Unread ({unreadCount})</option>
          </select>
        </div>

        <!-- Source Filter -->
        <div class="filter-group">
          <label class="filter-label">Source</label>
          <select
            class="filter-select"
            value={sourceFilter}
            on:change={(e) => onSourceFilterChange(e.currentTarget.value)}
          >
            <option value="all">All Sources</option>
            <option value="APP">Web</option>
            <option value="API">API</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SLACK">Slack</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>

        <!-- Phone Number Filter (WhatsApp only) -->
        {#if sourceFilter === "WHATSAPP"}
          <div class="filter-group">
            <label class="filter-label">Phone Number</label>
            <div class="phone-input-wrapper">
              <Phone size={14} class="phone-icon" />
              <input
                type="text"
                placeholder="Filter by phone..."
                value={localPhoneNumber}
                on:input={handlePhoneInput}
                class="phone-input"
              />
            </div>
          </div>
        {/if}

        <!-- Tag Filter -->
        {#if tags.length > 0}
          <div class="filter-group">
            <label class="filter-label">Tag</label>
            <select
              class="filter-select"
              value={tagFilter}
              on:change={(e) => onTagFilterChange(e.currentTarget.value)}
            >
              <option value="all">All Tags</option>
              {#each tags.filter((t) => tagCounts[t.id] > 0) as tag}
                <option value={tag.id}>{tag.name} ({tagCounts[tag.id] || 0})</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Sessions List -->
  <div class="sessions-container" class:loading={isLoading}>
    {#if isLoading}
      <div class="loading-bar"></div>
    {/if}

    {#if displaySessions.length === 0}
      <div class="empty-state">
        {#if searchTerm}
          <div class="empty-title">No chats match "{searchTerm}"</div>
          <div class="empty-subtitle">Try different keywords</div>
        {:else if statusFilter === "unread"}
          <div class="empty-title">No unread chats</div>
          <div class="empty-subtitle">All caught up!</div>
        {:else}
          <div class="empty-title">No chat sessions</div>
          <div class="empty-subtitle">Chats will appear here when users start conversations</div>
        {/if}
      </div>
    {:else}
      {#each groupedSessions as group}
        <!-- Time Group Header -->
        <div class="time-group-header">
          <span>{group.name}</span>
        </div>

        <!-- Sessions in Group -->
        {#each group.sessions as session}
          <ChatSessionCard
            {session}
            isSelected={selectedSessionId === session.id}
            isUnread={!viewedIds.includes(session.id)}
            searchTerm={localSearchTerm}
            onClick={() => handleSessionClick(session)}
          />
        {/each}
      {/each}
    {/if}
  </div>

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="pagination">
      <button
        class="page-btn nav-btn"
        disabled={currentPage === 1 || isLoading}
        on:click={() => handlePageClick(currentPage - 1)}
      >
        <ChevronLeft size={16} />
      </button>

      <div class="page-numbers">
        {#each generatePageNumbers() as page}
          {#if page === "..."}
            <span class="page-ellipsis">...</span>
          {:else}
            <button
              class="page-btn"
              class:active={currentPage === page}
              disabled={isLoading}
              on:click={() => handlePageClick(page)}
            >
              {page}
            </button>
          {/if}
        {/each}
      </div>

      <button
        class="page-btn nav-btn"
        disabled={currentPage === totalPages || isLoading}
        on:click={() => handlePageClick(currentPage + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>

    <div class="pagination-info">
      Page {currentPage} of {totalPages} • {displaySessions.length} of {totalCount} sessions
    </div>
  {/if}
</div>

<style>
  .chat-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Filters */
  .filters-container {
    padding: var(--space-3);
    border-bottom: 1px solid var(--border-primary);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-wrapper :global(.search-icon) {
    position: absolute;
    left: 12px;
    color: var(--text-tertiary);
  }

  .search-input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    font-size: 14px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .search-input::placeholder {
    color: var(--text-tertiary);
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
  }

  .filter-toggle:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .filter-toggle.active {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
    color: hsl(var(--primary));
  }

  .filter-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: hsl(var(--primary));
    border-radius: 50%;
  }

  .filters-expanded {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-2);
    padding-top: var(--space-2);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .filter-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .filter-select {
    padding: 8px 10px;
    font-size: 13px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
  }

  .filter-select:focus {
    border-color: hsl(var(--primary));
  }

  .phone-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .phone-input-wrapper :global(.phone-icon) {
    position: absolute;
    left: 10px;
    color: var(--text-tertiary);
  }

  .phone-input {
    width: 100%;
    padding: 8px 10px 8px 30px;
    font-size: 13px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .phone-input:focus {
    border-color: hsl(var(--primary));
  }

  /* Sessions List */
  .sessions-container {
    flex: 1;
    overflow-y: auto;
    position: relative;
    transition: opacity 0.15s;
  }

  .sessions-container.loading {
    opacity: 0.5;
    pointer-events: none;
  }

  .loading-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, hsl(var(--primary)), transparent);
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .time-group-header {
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-primary);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .time-group-header span {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    text-align: center;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: var(--space-1);
  }

  .empty-subtitle {
    font-size: 13px;
    color: var(--text-tertiary);
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-primary);
  }

  .page-numbers {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .page-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .page-btn.active {
    background: hsl(var(--primary));
    color: white;
    border-color: hsl(var(--primary));
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-btn {
    border: 1px solid var(--border-primary);
  }

  .page-ellipsis {
    padding: 0 4px;
    color: var(--text-tertiary);
  }

  .pagination-info {
    text-align: center;
    font-size: 12px;
    color: var(--text-tertiary);
    padding-bottom: var(--space-2);
  }
</style>
