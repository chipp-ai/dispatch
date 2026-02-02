<script lang="ts">
  import { onMount } from "svelte";
  import { toasts, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from "$lib/design-system";
  import { MessageSquare } from "lucide-svelte";
  import ChatSessionList from "$lib/design-system/components/chats/ChatSessionList.svelte";
  import ChatTranscript from "$lib/design-system/components/chats/ChatTranscript.svelte";

  export let appId: string;
  export let app: { id: string; name: string };

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

  // State
  let sessions: ChatSession[] = [];
  let viewedIds: string[] = [];
  let tags: Tag[] = [];
  let totalCount = 0;
  let currentPage = 1;
  let totalPages = 1;
  let isLoading = true;
  let isLoadingTranscript = false;

  // Selected session
  let selectedSession: ChatSession | null = null;
  let fullSessionData: ChatSession | null = null;

  // Filter state
  let searchTerm = "";
  let statusFilter = "all";
  let sourceFilter = "all";
  let tagFilter = "all";
  let phoneNumberFilter = "";

  // Delete confirmation
  let deleteDialogOpen = false;
  let sessionToDelete: ChatSession | null = null;
  let isDeleting = false;

  // Mobile state
  let showTranscript = false;

  const SESSIONS_PER_PAGE = 50;

  onMount(async () => {
    await Promise.all([loadSessions(), loadTags(), loadViewedIds()]);
  });

  async function loadSessions() {
    if (!appId) return;

    try {
      isLoading = true;

      const queryParams = new URLSearchParams();
      queryParams.set("limit", String(SESSIONS_PER_PAGE));
      queryParams.set("page", String(currentPage));

      if (sourceFilter && sourceFilter !== "all") {
        queryParams.set("source", sourceFilter);
      }
      if (searchTerm) {
        queryParams.set("search", searchTerm);
      }
      if (statusFilter === "unread") {
        queryParams.set("status", "unread");
      }
      if (tagFilter && tagFilter !== "all") {
        queryParams.set("tag", tagFilter);
      }
      if (phoneNumberFilter) {
        queryParams.set("phoneNumber", phoneNumberFilter);
      }

      const response = await fetch(
        `/api/chat/${appId}/sessions?${queryParams.toString()}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }

      const result = await response.json();

      // Transform the API response to match our expected format
      sessions = (result.data || []).map((session: any) => ({
        id: session.id,
        title: session.title,
        source: session.source || "APP",
        createdAt: session.started_at || session.createdAt,
        messages: session.messages || [],
        user: session.user || null,
        tags: session.tags || [],
        slackUser: session.slackUser || null,
      }));

      // Update pagination info
      totalCount = result.pagination?.total || sessions.length;
      totalPages = result.pagination?.totalPages || Math.ceil(totalCount / SESSIONS_PER_PAGE);

    } catch (e) {
      console.error("Failed to load sessions:", e);
      toasts.error("Error", "Failed to load chat sessions");
    } finally {
      isLoading = false;
    }
  }

  async function loadTags() {
    if (!appId) return;

    try {
      const response = await fetch(`/api/applications/${appId}/tags`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        tags = result.data || [];
      }
    } catch (e) {
      console.error("Failed to load tags:", e);
    }
  }

  async function loadViewedIds() {
    if (!appId) return;

    try {
      const response = await fetch(`/api/chat/${appId}/viewed`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        viewedIds = result.data || [];
      }
    } catch (e) {
      console.error("Failed to load viewed IDs:", e);
    }
  }

  async function loadFullSession(sessionId: string) {
    try {
      isLoadingTranscript = true;

      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load session");
      }

      const result = await response.json();
      const session = result.data;

      // Transform to expected format
      fullSessionData = {
        id: session.id,
        title: session.title,
        source: session.source || "APP",
        createdAt: session.started_at || session.created_at,
        messages: (session.messages || []).map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          senderType: msg.role === "user" ? "USER" : "BOT",
          createdAt: msg.created_at || msg.createdAt,
          tags: msg.tags || [],
        })),
        user: session.user || session.consumer || null,
        tags: session.tags || [],
        slackUser: session.slackUser || null,
      };

    } catch (e) {
      console.error("Failed to load session:", e);
      toasts.error("Error", "Failed to load chat transcript");
    } finally {
      isLoadingTranscript = false;
    }
  }

  async function markAsViewed(sessionId: string) {
    if (viewedIds.includes(sessionId)) return;

    // Optimistically update UI
    viewedIds = [...viewedIds, sessionId];

    // Update server in background
    try {
      await fetch(`/api/chat/${appId}/viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
    } catch (e) {
      console.error("Failed to mark as viewed:", e);
    }
  }

  // Event handlers
  function handleSessionSelect(session: ChatSession) {
    selectedSession = session;
    showTranscript = true;
    loadFullSession(session.id);
    markAsViewed(session.id);
  }

  function handlePageChange(page: number) {
    currentPage = page;
    loadSessions();
  }

  function handleSearchChange(term: string) {
    searchTerm = term;
    currentPage = 1;
    loadSessions();
  }

  function handleStatusFilterChange(status: string) {
    statusFilter = status;
    currentPage = 1;
    loadSessions();
  }

  function handleSourceFilterChange(source: string) {
    sourceFilter = source;
    currentPage = 1;
    loadSessions();
  }

  function handleTagFilterChange(tag: string) {
    tagFilter = tag;
    currentPage = 1;
    loadSessions();
  }

  function handlePhoneFilterChange(phone: string) {
    phoneNumberFilter = phone;
    currentPage = 1;
    loadSessions();
  }

  function handleBackToList() {
    showTranscript = false;
  }

  function confirmDelete(session: ChatSession) {
    sessionToDelete = session;
    deleteDialogOpen = true;
  }

  async function handleDelete() {
    if (!sessionToDelete) return;

    try {
      isDeleting = true;
      const response = await fetch(`/api/chat/sessions/${sessionToDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete session");
      }

      sessions = sessions.filter((s) => s.id !== sessionToDelete?.id);

      if (selectedSession?.id === sessionToDelete.id) {
        selectedSession = null;
        fullSessionData = null;
      }

      toasts.success("Deleted", "Chat session deleted");
    } catch (e) {
      console.error("Failed to delete:", e);
      toasts.error("Error", "Failed to delete session");
    } finally {
      isDeleting = false;
      deleteDialogOpen = false;
      sessionToDelete = null;
    }
  }
</script>

<div class="chats-layout">
  <!-- Sessions List Panel -->
  <div class="sessions-panel" class:hidden-mobile={showTranscript}>
    {#if isLoading && sessions.length === 0}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading chat sessions...</p>
      </div>
    {:else}
      <ChatSessionList
        {sessions}
        {viewedIds}
        {totalCount}
        {currentPage}
        {totalPages}
        isLoading={isLoading}
        {tags}
        selectedSessionId={selectedSession?.id || null}
        {searchTerm}
        {statusFilter}
        {sourceFilter}
        {tagFilter}
        {phoneNumberFilter}
        onSessionSelect={handleSessionSelect}
        onPageChange={handlePageChange}
        onSearchChange={handleSearchChange}
        onStatusFilterChange={handleStatusFilterChange}
        onSourceFilterChange={handleSourceFilterChange}
        onTagFilterChange={handleTagFilterChange}
        onPhoneFilterChange={handlePhoneFilterChange}
      />
    {/if}
  </div>

  <!-- Transcript Panel -->
  <div class="transcript-panel" class:hidden-mobile={!showTranscript}>
    {#if isLoadingTranscript}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading transcript...</p>
      </div>
    {:else if fullSessionData}
      <ChatTranscript
        session={fullSessionData}
        onBack={handleBackToList}
      />
    {:else if sessions.length > 0}
      <div class="empty-transcript">
        <MessageSquare size={48} />
        <h3>Select a conversation</h3>
        <p>Choose a chat session from the list to view the full transcript.</p>
      </div>
    {:else}
      <div class="empty-transcript">
        <MessageSquare size={48} />
        <h3>No chat sessions yet</h3>
        <p>Chat sessions will appear here once users start chatting with your app.</p>
      </div>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog bind:open={deleteDialogOpen}>
  <DialogHeader>
    <DialogTitle>Delete Chat Session</DialogTitle>
    <DialogDescription>
      Are you sure you want to delete this chat session? This action cannot be undone.
    </DialogDescription>
  </DialogHeader>

  <DialogFooter>
    <Button variant="ghost" on:click={() => (deleteDialogOpen = false)}>
      Cancel
    </Button>
    <Button variant="danger" on:click={handleDelete} disabled={isDeleting}>
      {#if isDeleting}
        Deleting...
      {:else}
        Delete
      {/if}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .chats-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg-primary);
  }

  /* Sessions Panel - Left Side */
  .sessions-panel {
    width: 380px;
    min-width: 320px;
    max-width: 420px;
    border-right: 1px solid var(--border-primary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  /* Transcript Panel - Right Side */
  .transcript-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-secondary);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-4);
    color: var(--text-tertiary);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-primary);
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .empty-transcript {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-4);
    color: var(--text-tertiary);
    text-align: center;
    padding: var(--space-6);
  }

  .empty-transcript h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .empty-transcript p {
    font-size: 14px;
    margin: 0;
    max-width: 300px;
    line-height: 1.5;
  }

  /* Mobile Layout */
  @media (max-width: 768px) {
    .sessions-panel {
      width: 100%;
      max-width: none;
      border-right: none;
    }

    .transcript-panel {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
    }

    .hidden-mobile {
      display: none;
    }
  }

  /* Tablet Layout */
  @media (min-width: 769px) and (max-width: 1024px) {
    .sessions-panel {
      width: 320px;
      min-width: 280px;
    }
  }
</style>
