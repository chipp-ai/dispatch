<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { captureException } from "$lib/sentry";
  import { toasts, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from "$lib/design-system";
  import { MessageSquare } from "lucide-svelte";
  import ChatSessionList from "$lib/design-system/components/chats/ChatSessionList.svelte";
  import ChatSessionCard from "$lib/design-system/components/chats/ChatSessionCard.svelte";
  import ChatTranscript from "$lib/design-system/components/chats/ChatTranscript.svelte";
  import { subscribe as wsSubscribe, send as wsSend } from "../../stores/websocket";

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
    isBuilderMessage?: boolean;
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

  // Live sessions state
  interface LiveSession {
    sessionId: string;
    applicationId: string;
    consumerEmail?: string;
    consumerName?: string;
    messagePreview?: string;
    lastActivity: number; // Date.now()
    consumerStatus?: "active" | "away";
  }

  let liveSessions: LiveSession[] = [];
  let liveSessionIds = new Set<string>();
  let unsubscribers: (() => void)[] = [];
  let staleTimer: ReturnType<typeof setInterval>;

  // Takeover state
  let activelyTakenOverSessionId: string | null = null;
  let isTakingOver = false;

  const SESSIONS_PER_PAGE = 50;
  const ACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  onMount(async () => {
    await Promise.all([loadSessions(), loadTags(), loadViewedIds(), loadActiveSessions()]);
    setupWebSocketListeners();
    staleTimer = setInterval(expireStale, 30_000);
  });

  onDestroy(() => {
    unsubscribers.forEach((unsub) => unsub());
    clearInterval(staleTimer);
  });

  async function loadActiveSessions() {
    try {
      const response = await fetch(`/api/chat/${appId}/sessions/active`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const result = await response.json();
      for (const s of result.data || []) {
        addLiveSession({
          sessionId: s.id,
          applicationId: appId,
          consumerEmail: s.consumer?.email,
          consumerName: s.consumer?.name,
          lastActivity: new Date(s.lastActivityAt).getTime(),
        });
      }
    } catch (e) {
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "load-active-sessions", appId } });
    }
  }

  function setupWebSocketListeners() {
    unsubscribers.push(
      wsSubscribe("conversation:started", (event: any) => {
        if (event.applicationId !== appId) return;
        addLiveSession({
          sessionId: event.sessionId,
          applicationId: event.applicationId,
          consumerEmail: event.consumerEmail,
          consumerName: event.consumerName,
          lastActivity: Date.now(),
        });
      }),
      wsSubscribe("conversation:activity", (event: any) => {
        if (event.applicationId !== appId) return;
        updateLiveSession(event.sessionId, {
          messagePreview: event.messagePreview,
          lastActivity: Date.now(),
          consumerStatus: "active",
        });
      }),
      wsSubscribe("conversation:ended", (event: any) => {
        if (event.applicationId !== appId) return;
        // If we were taking over this session, release our local state
        if (activelyTakenOverSessionId === event.sessionId) {
          activelyTakenOverSessionId = null;
        }
        // Brief delay for smooth transition
        setTimeout(() => removeLiveSession(event.sessionId), 1000);
      }),
      wsSubscribe("conversation:takeover", (event: any) => {
        if (event.sessionId === activelyTakenOverSessionId && event.mode === "ai") {
          // Someone else released, or server-side release
          activelyTakenOverSessionId = null;
        }
      }),
      // Revert takeover state on server error
      wsSubscribe("system:notification", (event: any) => {
        if (event.severity === "error" && activelyTakenOverSessionId) {
          if (event.title === "Takeover failed" || event.title === "Release failed" || event.title === "Send failed") {
            activelyTakenOverSessionId = null;
            isTakingOver = false;
          }
        }
      }),
      // Consumer closed their tab - remove from live sessions
      wsSubscribe("consumer:disconnected", (event: any) => {
        if (event.applicationId && event.applicationId !== appId) return;
        // Auto-release takeover if we were speaking to this consumer
        if (activelyTakenOverSessionId === event.sessionId) {
          activelyTakenOverSessionId = null;
          isTakingOver = false;
        }
        removeLiveSession(event.sessionId);
      }),
      // Consumer tabbed away or came back
      wsSubscribe("consumer:presence", (event: any) => {
        if (event.applicationId && event.applicationId !== appId) return;
        if (!liveSessionIds.has(event.sessionId)) return;
        updateLiveSession(event.sessionId, {
          consumerStatus: event.status,
          // Refresh activity timestamp when they come back
          ...(event.status === "active" ? { lastActivity: Date.now() } : {}),
        });
      }),
      // When consumer sends a message during takeover, update our transcript
      wsSubscribe("consumer:message", (event: any) => {
        if (!activelyTakenOverSessionId) return;
        if (event.sessionId !== activelyTakenOverSessionId) return;
        if (!fullSessionData) return;
        // Append the consumer message to our local transcript
        fullSessionData = {
          ...fullSessionData,
          messages: [
            ...fullSessionData.messages,
            {
              id: crypto.randomUUID(),
              content: event.content,
              senderType: "USER",
              createdAt: event.timestamp || new Date().toISOString(),
            },
          ],
        };
      })
    );
  }

  function addLiveSession(session: LiveSession) {
    if (liveSessionIds.has(session.sessionId)) {
      updateLiveSession(session.sessionId, session);
      return;
    }
    liveSessionIds.add(session.sessionId);
    liveSessions = [session, ...liveSessions];
  }

  function updateLiveSession(sessionId: string, updates: Partial<LiveSession>) {
    liveSessions = liveSessions.map((s) =>
      s.sessionId === sessionId ? { ...s, ...updates } : s
    );
  }

  function removeLiveSession(sessionId: string) {
    liveSessionIds.delete(sessionId);
    liveSessions = liveSessions.filter((s) => s.sessionId !== sessionId);
  }

  function expireStale() {
    const cutoff = Date.now() - ACTIVITY_TIMEOUT_MS;
    const stale = liveSessions.filter((s) => s.lastActivity < cutoff);
    for (const s of stale) {
      removeLiveSession(s.sessionId);
    }
  }

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
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "load-sessions", appId } });
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
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "load-tags", appId } });
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
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "load-viewed-ids", appId } });
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
          isBuilderMessage: msg.model === "human",
        })),
        user: session.user || session.consumer || null,
        tags: session.tags || [],
        slackUser: session.slackUser || null,
      };

    } catch (e) {
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "load-session", sessionId } });
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
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "mark-viewed", sessionId, appId } });
    }
  }

  // Takeover handlers
  async function handleTakeover(sessionId: string) {
    isTakingOver = true;
    wsSend({ action: "takeover", sessionId, mode: "human" });
    activelyTakenOverSessionId = sessionId;

    // Load the full session if not already loaded
    if (!fullSessionData || fullSessionData.id !== sessionId) {
      await loadFullSession(sessionId);
    }
    showTranscript = true;
    isTakingOver = false;
  }

  function handleReleaseTakeover() {
    if (!activelyTakenOverSessionId) return;
    wsSend({ action: "release", sessionId: activelyTakenOverSessionId });
    activelyTakenOverSessionId = null;
  }

  function handleSendTakeoverMessage(content: string) {
    if (!activelyTakenOverSessionId || !fullSessionData) return;
    wsSend({ action: "send_message", sessionId: activelyTakenOverSessionId, content });
    // Optimistically add to transcript
    fullSessionData = {
      ...fullSessionData,
      messages: [
        ...fullSessionData.messages,
        {
          id: crypto.randomUUID(),
          content,
          senderType: "BOT",
          createdAt: new Date().toISOString(),
          isBuilderMessage: true,
        },
      ],
    };
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
      captureException(e, { tags: { feature: "builder-chats" }, extra: { action: "delete-session", sessionId: sessionToDelete?.id } });
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
    {#if liveSessions.length > 0}
      <div class="live-section">
        <div class="live-header">
          <span class="live-indicator"></span>
          <span class="live-label">Live Now</span>
          <span class="live-count">{liveSessions.length}</span>
        </div>
        <div class="live-list">
          {#each liveSessions as live (live.sessionId)}
            <div class="live-card-row">
              <button
                class="live-card"
                class:taken-over={activelyTakenOverSessionId === live.sessionId}
                on:click={() => {
                  const existing = sessions.find((s) => s.id === live.sessionId);
                  if (existing) handleSessionSelect(existing);
                  else loadFullSession(live.sessionId);
                  showTranscript = true;
                }}
              >
                <div
                  class="live-card-dot"
                  class:taken-over-dot={activelyTakenOverSessionId === live.sessionId}
                  class:away-dot={live.consumerStatus === "away" && activelyTakenOverSessionId !== live.sessionId}
                ></div>
                <div class="live-card-content">
                  <span class="live-card-name">
                    {live.consumerName || live.consumerEmail || "Anonymous"}
                    {#if live.consumerStatus === "away"}
                      <span class="live-card-away-badge">Away</span>
                    {/if}
                  </span>
                  {#if activelyTakenOverSessionId === live.sessionId}
                    <span class="live-card-takeover-badge">You are speaking</span>
                  {:else if live.messagePreview}
                    <span class="live-card-preview">{live.messagePreview}</span>
                  {/if}
                </div>
              </button>
              {#if activelyTakenOverSessionId !== live.sessionId}
                <button
                  class="takeover-btn"
                  disabled={isTakingOver || !!activelyTakenOverSessionId}
                  on:click|stopPropagation={() => handleTakeover(live.sessionId)}
                  title="Take over this chat"
                >
                  Take Over
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

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
        isLiveTakeover={activelyTakenOverSessionId === fullSessionData?.id}
        onSendMessage={activelyTakenOverSessionId === fullSessionData?.id ? handleSendTakeoverMessage : null}
        onRelease={activelyTakenOverSessionId === fullSessionData?.id ? handleReleaseTakeover : null}
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

  /* Live Now Section */
  .live-section {
    border-bottom: 1px solid var(--border-primary);
    padding: var(--space-3) 0;
    flex-shrink: 0;
  }

  .live-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-4) var(--space-2);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(142, 71%, 40%);
  }

  .live-indicator {
    width: 8px;
    height: 8px;
    background: hsl(142, 71%, 45%);
    border-radius: 50%;
    box-shadow: 0 0 6px hsl(142, 71%, 45%, 0.6);
    animation: live-dot-pulse 2s ease-in-out infinite;
  }

  @keyframes live-dot-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .live-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full);
    background: hsl(142, 71%, 45%, 0.12);
    font-size: 11px;
    font-weight: 700;
    color: hsl(142, 71%, 35%);
  }

  .live-list {
    display: flex;
    flex-direction: column;
  }

  .live-card {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-left: 3px solid hsl(142, 71%, 45%);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
    width: 100%;
  }

  .live-card:hover {
    background: hsl(142, 71%, 45%, 0.06);
  }

  .live-card-dot {
    width: 6px;
    height: 6px;
    margin-top: 6px;
    background: hsl(142, 71%, 45%);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .live-card-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .live-card-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live-card-preview {
    font-size: 12px;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .live-card-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .live-card.taken-over {
    border-left-color: hsl(36, 100%, 50%);
    background: hsl(36, 100%, 50%, 0.06);
  }

  .taken-over-dot {
    background: hsl(36, 100%, 50%) !important;
  }

  .away-dot {
    background: hsl(0, 0%, 60%) !important;
    animation: none !important;
  }

  .live-card-away-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    margin-left: 4px;
    border-radius: var(--radius-sm);
    background: hsl(0, 0%, 50%, 0.12);
    font-size: 10px;
    font-weight: 500;
    color: hsl(0, 0%, 50%);
    vertical-align: middle;
  }

  .live-card-takeover-badge {
    font-size: 11px;
    font-weight: 600;
    color: hsl(36, 100%, 40%);
  }

  .takeover-btn {
    flex-shrink: 0;
    padding: 4px 10px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
    margin-right: var(--space-2);
  }

  .live-card-row:hover .takeover-btn {
    opacity: 1;
  }

  .takeover-btn:hover:not(:disabled) {
    background: hsl(36, 100%, 50%, 0.1);
    border-color: hsl(36, 100%, 50%, 0.4);
    color: hsl(36, 100%, 35%);
  }

  .takeover-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
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
