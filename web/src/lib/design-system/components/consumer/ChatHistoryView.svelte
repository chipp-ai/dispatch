<script lang="ts">
  /**
   * ChatHistoryView
   *
   * Displays a paginated list of chat history with edit/delete actions.
   * Used within the chat menu sheet.
   *
   * Works for both authenticated users (server-side history) and
   * anonymous users (localStorage history).
   */
  import { createEventDispatcher } from 'svelte';

  interface ChatSession {
    id: string;
    title: string;
    updatedAt: string;
  }

  export let sessions: ChatSession[] = [];
  export let total: number = 0;
  export let isLoading: boolean = false;
  export let currentPage: number = 1;
  export let isLastPage: boolean = false;
  export let primaryColor: string = '#8B5CF6';

  const dispatch = createEventDispatcher<{
    selectSession: { sessionId: string };
    deleteSession: { sessionId: string };
    updateTitle: { sessionId: string; title: string };
    nextPage: void;
    prevPage: void;
  }>();

  let editingSessionId: string | null = null;
  let editTitle: string = '';

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${month} ${day}, ${hour12}:${minutes}${ampm}`;
  }

  function handleSelectSession(sessionId: string) {
    if (editingSessionId === sessionId) return;
    dispatch('selectSession', { sessionId });
  }

  function startEditing(session: ChatSession, e: Event) {
    e.stopPropagation();
    editingSessionId = session.id;
    editTitle = session.title;
  }

  function cancelEditing(e: Event) {
    e.stopPropagation();
    editingSessionId = null;
    editTitle = '';
  }

  function saveTitle(e: Event) {
    e.stopPropagation();
    if (!editingSessionId || !editTitle.trim()) return;
    dispatch('updateTitle', { sessionId: editingSessionId, title: editTitle.trim() });
    editingSessionId = null;
    editTitle = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      saveTitle(e);
    } else if (e.key === 'Escape') {
      cancelEditing(e);
    }
  }

  function handleDelete(sessionId: string, e: Event) {
    e.stopPropagation();
    dispatch('deleteSession', { sessionId });
  }

  function handleNextPage() {
    if (!isLastPage) {
      dispatch('nextPage');
    }
  }

  function handlePrevPage() {
    if (currentPage > 1) {
      dispatch('prevPage');
    }
  }
</script>

<div class="history-view">
  <!-- Header -->
  <div class="history-header">
    <div class="history-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <div>
      <h2 class="history-title">History</h2>
      <p class="history-subtitle">
        {#if typeof total !== 'undefined'}
          {total} conversations
        {:else}
          Loading...
        {/if}
      </p>
    </div>
  </div>

  <!-- Content -->
  <div class="history-content">
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner" />
        <p>Loading conversations...</p>
      </div>
    {:else if sessions.length === 0}
      <div class="empty-state">
        <div class="empty-icon-wrapper" style="--primary-color: {primaryColor}">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>
        <h3>No conversations yet</h3>
        <p>Start a new chat to begin</p>
      </div>
    {:else}
      <div class="session-list">
        {#each sessions as session (session.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="session-item"
            on:click={() => handleSelectSession(session.id)}
          >
            <div class="session-info">
              {#if editingSessionId === session.id}
                <input
                  type="text"
                  class="edit-input"
                  bind:value={editTitle}
                  on:keydown={handleKeydown}
                  on:click|stopPropagation
                  autofocus
                />
              {:else}
                <p class="session-title">{session.title}</p>
                <p class="session-date">{formatDate(session.updatedAt)}</p>
              {/if}
            </div>

            <div class="session-actions">
              {#if editingSessionId === session.id}
                <button class="action-btn save" on:click={saveTitle} aria-label="Save">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </button>
                <button class="action-btn cancel" on:click={cancelEditing} aria-label="Cancel">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              {:else}
                <button class="action-btn edit" on:click={(e) => startEditing(session, e)} aria-label="Edit title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button class="action-btn delete" on:click={(e) => handleDelete(session.id, e)} aria-label="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Pagination -->
  {#if sessions.length > 0}
    <div class="pagination">
      <span class="page-info">Page {currentPage}</span>
      <div class="page-buttons">
        <button
          class="page-btn"
          on:click={handlePrevPage}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        <button
          class="page-btn"
          on:click={handleNextPage}
          disabled={isLastPage}
        >
          Next
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .history-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .history-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .history-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background-color: hsl(var(--muted));
  }

  .history-icon svg {
    width: 20px;
    height: 20px;
    color: hsl(var(--foreground));
  }

  .history-title {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .history-subtitle {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .history-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 0;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 2px solid hsl(var(--border));
    border-top-color: hsl(var(--foreground) / 0.6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-state p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
    text-align: center;
  }

  .empty-icon-wrapper {
    position: relative;
    margin-bottom: 16px;
  }

  .empty-icon {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(to bottom right, hsl(var(--muted) / 0.5), hsl(var(--muted)));
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .empty-icon svg {
    width: 40px;
    height: 40px;
    color: hsl(var(--muted-foreground));
  }

  .empty-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 8px;
  }

  .empty-state p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
    max-width: 280px;
  }

  .session-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .session-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .session-item:hover {
    background-color: hsl(var(--muted) / 0.5);
  }

  .session-info {
    flex: 1;
    min-width: 0;
  }

  .session-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-date {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: 4px 0 0;
  }

  .edit-input {
    width: 100%;
    padding: 6px 10px;
    font-size: var(--text-sm);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    outline: none;
  }

  .edit-input:focus {
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  .session-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 12px;
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
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.2s;
  }

  .action-btn svg {
    width: 16px;
    height: 16px;
  }

  .action-btn.edit {
    color: hsl(var(--muted-foreground));
  }

  .action-btn.edit:hover {
    color: hsl(var(--foreground));
    background-color: hsl(var(--muted));
  }

  .action-btn.delete {
    color: hsl(var(--muted-foreground));
  }

  .action-btn.delete:hover {
    color: hsl(var(--destructive));
    background-color: hsl(var(--destructive) / 0.1);
  }

  .action-btn.save {
    color: hsl(142 76% 36%);
  }

  .action-btn.save:hover {
    background-color: hsl(142 76% 36% / 0.1);
  }

  .action-btn.cancel {
    color: hsl(var(--destructive));
  }

  .action-btn.cancel:hover {
    background-color: hsl(var(--destructive) / 0.1);
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 16px;
    border-top: 1px solid hsl(var(--border));
  }

  .page-info {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .page-buttons {
    display: flex;
    gap: 8px;
  }

  .page-btn {
    padding: 6px 12px;
    font-size: var(--text-sm);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background-color: transparent;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    background-color: hsl(var(--muted));
  }

  .page-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
