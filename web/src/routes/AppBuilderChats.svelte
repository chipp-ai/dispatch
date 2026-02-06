<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import { Card, Button, toasts, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "$lib/design-system";
  import { MessageSquare, Filter, Search, Trash2, ExternalLink, Clock, User } from "lucide-svelte";
  import { captureException } from "$lib/sentry";

  export let params: { appId?: string } = {};

  // App data
  let app: { id: string; name: string } | null = null;

  // Sessions data
  interface ChatSession {
    id: string;
    title: string | null;
    source: string;
    createdAt: string;
    endedAt: string | null;
    isBookmarked: boolean;
    mode: string | null;
    messageCount?: number;
  }

  let sessions: ChatSession[] = [];
  let isLoading = true;
  let hasMore = false;
  let nextCursor: string | null = null;

  // Filters
  let sourceFilter = "";
  let searchQuery = "";

  // Transcript dialog
  let transcriptOpen = false;
  let selectedSession: ChatSession | null = null;
  let transcriptMessages: { role: string; content: string; created_at: string }[] = [];
  let isLoadingTranscript = false;

  // Delete confirmation
  let deleteDialogOpen = false;
  let sessionToDelete: ChatSession | null = null;
  let isDeleting = false;

  const SOURCES = [
    { value: "", label: "All Sources" },
    { value: "APP", label: "App" },
    { value: "API", label: "API" },
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "SLACK", label: "Slack" },
    { value: "EMAIL", label: "Email" },
  ];

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await loadApp();
    await loadSessions();
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.hash = "#/login";
          return;
        }
        throw new Error("Failed to load app");
      }

      const result = await response.json();
      app = result.data;
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-chats", feature: "load-app" }, extra: { appId: params.appId } });
      toasts.error("Error", "Failed to load application");
    }
  }

  async function loadSessions(append = false) {
    if (!params.appId) return;

    try {
      if (!append) {
        isLoading = true;
      }

      const queryParams = new URLSearchParams();
      queryParams.set("limit", "20");
      if (sourceFilter) {
        queryParams.set("source", sourceFilter);
      }
      if (nextCursor && append) {
        queryParams.set("cursor", nextCursor);
      }

      const response = await fetch(
        `/api/chat/${params.appId}/sessions?${queryParams.toString()}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }

      const result = await response.json();

      if (append) {
        sessions = [...sessions, ...result.data];
      } else {
        sessions = result.data;
      }

      hasMore = result.pagination?.hasMore ?? false;
      nextCursor = result.pagination?.nextCursor ?? null;
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-chats", feature: "load-sessions" }, extra: { appId: params.appId } });
      toasts.error("Error", "Failed to load chat sessions");
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (hasMore && nextCursor) {
      await loadSessions(true);
    }
  }

  function handleSourceChange() {
    nextCursor = null;
    loadSessions();
  }

  async function viewTranscript(session: ChatSession) {
    selectedSession = session;
    transcriptOpen = true;
    isLoadingTranscript = true;
    transcriptMessages = [];

    try {
      const response = await fetch(`/api/chat/sessions/${session.id}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load transcript");
      }

      const result = await response.json();
      transcriptMessages = result.data.messages || [];
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-chats", feature: "load-transcript" }, extra: { sessionId: session.id } });
      toasts.error("Error", "Failed to load transcript");
    } finally {
      isLoadingTranscript = false;
    }
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
      toasts.success("Deleted", "Chat session deleted");
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-chats", feature: "delete-session" }, extra: { sessionId: sessionToDelete?.id } });
      toasts.error("Error", "Failed to delete session");
    } finally {
      isDeleting = false;
      deleteDialogOpen = false;
      sessionToDelete = null;
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getSourceBadgeClass(source: string): string {
    switch (source) {
      case "APP":
        return "badge-app";
      case "API":
        return "badge-api";
      case "WHATSAPP":
        return "badge-whatsapp";
      case "SLACK":
        return "badge-slack";
      case "EMAIL":
        return "badge-email";
      default:
        return "badge-default";
    }
  }

  $: filteredSessions = searchQuery
    ? sessions.filter(
        (s) =>
          s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;
</script>

<svelte:head>
  <title>Chat History - Chipp</title>
</svelte:head>

<div class="app-builder">
  <BuilderSidebar appId={params.appId} activeTab="chats" />

  <div class="main-content">
    <BuilderHeader
      appName={app?.name || "Loading..."}
      lastSaved={null}
      isSaving={false}
      hasUnsavedChanges={false}
      onSave={() => {}}
      onPublish={() => {}}
      isPublishing={false}
      hidePublish={true}
    />

    <div class="chats-content">
      {#if isLoading && sessions.length === 0}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading chat sessions...</p>
        </div>
      {:else}
        <!-- Filters -->
        <div class="filters-bar">
          <div class="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search chats..."
              bind:value={searchQuery}
              class="search-input"
            />
          </div>

          <div class="filter-group">
            <Filter size={16} />
            <select
              bind:value={sourceFilter}
              on:change={handleSourceChange}
              class="filter-select"
            >
              {#each SOURCES as source}
                <option value={source.value}>{source.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Sessions list -->
        {#if filteredSessions.length === 0}
          <div class="empty-state">
            <MessageSquare size={48} />
            <h3>No chat sessions yet</h3>
            <p>Chat sessions will appear here once users start chatting with your app.</p>
          </div>
        {:else}
          <div class="sessions-list">
            {#each filteredSessions as session}
              <Card padding="md" class="session-card">
                <div class="session-row">
                  <div class="session-info">
                    <div class="session-header">
                      <span class="session-title">
                        {session.title || `Chat ${session.id.slice(0, 8)}`}
                      </span>
                      <span class={`source-badge ${getSourceBadgeClass(session.source)}`}>
                        {session.source}
                      </span>
                    </div>
                    <div class="session-meta">
                      <span class="meta-item">
                        <Clock size={14} />
                        {formatDate(session.createdAt)}
                      </span>
                      {#if session.endedAt}
                        <span class="meta-item">
                          Duration: {Math.round(
                            (new Date(session.endedAt).getTime() -
                              new Date(session.createdAt).getTime()) /
                              60000
                          )} min
                        </span>
                      {/if}
                    </div>
                  </div>
                  <div class="session-actions">
                    <Button variant="ghost" size="sm" on:click={() => viewTranscript(session)}>
                      <ExternalLink size={16} />
                      View
                    </Button>
                    <Button variant="ghost" size="sm" on:click={() => confirmDelete(session)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </Card>
            {/each}
          </div>

          {#if hasMore}
            <div class="load-more">
              <Button variant="outline" on:click={loadMore}>
                Load More
              </Button>
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Transcript Dialog -->
<Dialog bind:open={transcriptOpen}>
  <DialogHeader>
    <DialogTitle>Chat Transcript</DialogTitle>
    <DialogDescription>
      {selectedSession?.title || `Chat ${selectedSession?.id.slice(0, 8)}`}
    </DialogDescription>
  </DialogHeader>

  <div class="transcript-content">
    {#if isLoadingTranscript}
      <div class="loading-state small">
        <div class="spinner"></div>
        <p>Loading transcript...</p>
      </div>
    {:else if transcriptMessages.length === 0}
      <p class="no-messages">No messages in this conversation.</p>
    {:else}
      <div class="messages-list">
        {#each transcriptMessages as msg}
          <div class={`message ${msg.role}`}>
            <div class="message-header">
              <span class="message-role">{msg.role === "user" ? "User" : "Assistant"}</span>
              <span class="message-time">{formatDate(msg.created_at)}</span>
            </div>
            <div class="message-content">{msg.content}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <DialogFooter>
    <Button variant="ghost" on:click={() => (transcriptOpen = false)}>
      Close
    </Button>
  </DialogFooter>
</Dialog>

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
  .app-builder {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin-left: 80px;
    min-width: 0;
  }

  .chats-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .loading-state.small {
    height: 200px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .filters-bar {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
    flex: 1;
    max-width: 400px;
  }

  .search-box :global(svg) {
    color: hsl(var(--muted-foreground));
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    outline: none;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
  }

  .filter-select {
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 400px;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state p {
    margin: 0;
    max-width: 400px;
  }

  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .session-card :global(.card) {
    background: hsl(var(--card));
  }

  .session-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
  }

  .session-info {
    flex: 1;
    min-width: 0;
  }

  .session-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .session-title {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-badge {
    font-size: var(--text-xs);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-weight: var(--font-medium);
    text-transform: uppercase;
  }

  .badge-app {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .badge-api {
    background: hsl(220 70% 50% / 0.1);
    color: hsl(220 70% 50%);
  }

  .badge-whatsapp {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 40%);
  }

  .badge-slack {
    background: hsl(300 70% 40% / 0.1);
    color: hsl(300 70% 40%);
  }

  .badge-email {
    background: hsl(30 70% 50% / 0.1);
    color: hsl(30 70% 50%);
  }

  .badge-default {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .session-meta {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .session-actions {
    display: flex;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .load-more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-4);
  }

  .transcript-content {
    padding: var(--space-4);
    max-height: 400px;
    overflow-y: auto;
  }

  .no-messages {
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .message {
    padding: var(--space-3);
    border-radius: var(--radius-lg);
  }

  .message.user {
    background: hsl(var(--primary) / 0.1);
  }

  .message.assistant {
    background: hsl(var(--muted));
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
  }

  .message-role {
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .message-time {
    color: hsl(var(--muted-foreground));
  }

  .message-content {
    color: hsl(var(--foreground));
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 768px) {
    .main-content {
      margin-left: 0;
    }

    .chats-content {
      padding: var(--space-4);
    }

    .filters-bar {
      flex-direction: column;
    }

    .search-box {
      max-width: none;
    }

    .session-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .session-actions {
      margin-top: var(--space-2);
    }
  }
</style>
