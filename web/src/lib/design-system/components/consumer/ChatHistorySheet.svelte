<script lang="ts">
  /**
   * ChatHistorySheet
   *
   * Displays chat history for consumers with the ability to:
   * - View past conversations
   * - Delete conversations
   * - Rename conversations
   * - Start a new chat
   *
   * Works for both authenticated users (server-side history) and
   * anonymous users (localStorage history managed by parent component).
   */
  import { createEventDispatcher } from 'svelte';
  import { captureException } from '$lib/sentry';
  import { fade, fly } from 'svelte/transition';
  import Button from '../Button.svelte';
  import Input from '../Input.svelte';
  import Spinner from '../Spinner.svelte';

  export let open: boolean = false;
  export let appNameId: string;
  export let currentSessionId: string | null = null;

  interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    lastMessageAt: string;
    messageCount: number;
  }

  let sessions: ChatSession[] = [];
  let loading = false;
  let error: string | null = null;
  let editingSessionId: string | null = null;
  let editingTitle = '';

  const dispatch = createEventDispatcher<{
    close: void;
    selectSession: { sessionId: string };
    newChat: void;
    deleteSession: { sessionId: string };
  }>();

  function close() {
    open = false;
    dispatch('close');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  async function loadSessions() {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/sessions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load chat history');
      }

      const data = await response.json();
      sessions = data.data || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load chat history';
    } finally {
      loading = false;
    }
  }

  function handleSelectSession(sessionId: string) {
    dispatch('selectSession', { sessionId });
    close();
  }

  function handleNewChat() {
    dispatch('newChat');
    close();
  }

  async function handleDeleteSession(e: MouseEvent, sessionId: string) {
    e.stopPropagation();

    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      sessions = sessions.filter(s => s.id !== sessionId);
      dispatch('deleteSession', { sessionId });
    } catch (e) {
      captureException(e, {
        tags: { feature: "chat-history" },
        extra: { action: "delete-session", sessionId, appNameId },
      });
    }
  }

  function startEditing(e: MouseEvent, session: ChatSession) {
    e.stopPropagation();
    editingSessionId = session.id;
    editingTitle = session.title || '';
  }

  async function saveTitle() {
    if (!editingSessionId || !editingTitle.trim()) {
      editingSessionId = null;
      return;
    }

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/sessions/${editingSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (response.ok) {
        const session = sessions.find(s => s.id === editingSessionId);
        if (session) {
          session.title = editingTitle.trim();
          sessions = [...sessions];
        }
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "chat-history" },
        extra: { action: "update-title", sessionId: editingSessionId, appNameId },
      });
    } finally {
      editingSessionId = null;
    }
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      saveTitle();
    } else if (e.key === 'Escape') {
      editingSessionId = null;
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  // Load sessions when sheet opens
  $: if (open) {
    loadSessions();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="sheet-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="sheet-content"
      role="dialog"
      aria-modal="true"
      aria-label="Chat History"
      transition:fly={{ x: -300, duration: 200 }}
    >
      <div class="sheet-header">
        <h2>Chat History</h2>
        <button class="sheet-close" on:click={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="new-chat-section">
        <Button variant="primary" on:click={handleNewChat} class="new-chat-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Chat
        </Button>
      </div>

      <div class="sessions-list">
        {#if loading}
          <div class="loading-state">
            <Spinner size="md" />
            <p>Loading conversations...</p>
          </div>
        {:else if error}
          <div class="error-state">
            <p>{error}</p>
            <Button variant="secondary" size="sm" on:click={loadSessions}>
              Try Again
            </Button>
          </div>
        {:else if sessions.length === 0}
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3>No conversations yet</h3>
            <p>Start a new chat to begin</p>
          </div>
        {:else}
          {#each sessions as session (session.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="session-item"
              class:active={session.id === currentSessionId}
              on:click={() => handleSelectSession(session.id)}
            >
              <div class="session-content">
                {#if editingSessionId === session.id}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div on:click|stopPropagation>
                    <Input
                      bind:value={editingTitle}
                      on:keydown={handleTitleKeydown}
                      on:blur={saveTitle}
                      autofocus
                      class="title-input"
                    />
                  </div>
                {:else}
                  <span class="session-title">{session.title || 'New Chat'}</span>
                  <span class="session-date">{formatDate(session.lastMessageAt || session.createdAt)}</span>
                {/if}
              </div>

              <div class="session-actions">
                <button
                  class="action-btn"
                  on:click={(e) => startEditing(e, session)}
                  aria-label="Rename"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  class="action-btn delete"
                  on:click={(e) => handleDeleteSession(e, session.id)}
                  aria-label="Delete"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .sheet-content {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 100%;
    max-width: 320px;
    background-color: hsl(var(--background));
    border-right: 1px solid hsl(var(--border));
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .sheet-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .sheet-close {
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

  .sheet-close:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .sheet-close svg {
    width: 18px;
    height: 18px;
  }

  .new-chat-section {
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .new-chat-section :global(.new-chat-btn) {
    width: 100%;
    justify-content: center;
    gap: var(--space-2);
  }

  .icon {
    width: 18px;
    height: 18px;
  }

  .sessions-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-icon {
    width: 48px;
    height: 48px;
    opacity: 0.5;
  }

  .empty-icon svg {
    width: 100%;
    height: 100%;
  }

  .empty-state h3 {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--space-3);
    margin-bottom: var(--space-1);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .session-item:hover {
    background-color: hsl(var(--muted) / 0.5);
  }

  .session-item.active {
    background-color: hsl(var(--muted));
    border-color: hsl(var(--border));
  }

  .session-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .session-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-date {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .session-actions {
    display: flex;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .session-item:hover .session-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s;
  }

  .action-btn:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .action-btn.delete:hover {
    color: hsl(var(--destructive));
  }

  .action-btn svg {
    width: 16px;
    height: 16px;
  }

  .session-content :global(.title-input) {
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
  }

  @media (max-width: 640px) {
    .sheet-content {
      max-width: 100%;
    }
  }
</style>
