<script lang="ts">
  /**
   * BookmarksSheet
   *
   * Sheet/sidebar displaying all bookmarks with:
   * - Search functionality
   * - Edit/delete notes
   * - Navigate to original message
   */
  import { createEventDispatcher } from 'svelte';
  import { captureException } from '$lib/sentry';
  import { fade, fly } from 'svelte/transition';
  import Button from '../Button.svelte';
  import Input from '../Input.svelte';
  import Spinner from '../Spinner.svelte';

  export let open: boolean = false;
  export let appNameId: string;

  interface Bookmark {
    id: string;
    messageId: string;
    note: string | null;
    createdAt: string;
    message: {
      content: string;
      role: string;
    };
    session: {
      id: string;
      title: string | null;
    };
  }

  let bookmarks: Bookmark[] = [];
  let loading = false;
  let error: string | null = null;
  let searchQuery = '';
  let editingId: string | null = null;
  let editingNote = '';

  const dispatch = createEventDispatcher<{
    close: void;
    navigateToMessage: { sessionId: string; messageId: string };
    deleteBookmark: { bookmarkId: string };
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

  async function loadBookmarks() {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/bookmarks`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load bookmarks');
      }

      const data = await response.json();
      bookmarks = data.data || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load bookmarks';
    } finally {
      loading = false;
    }
  }

  function handleNavigate(bookmark: Bookmark) {
    dispatch('navigateToMessage', {
      sessionId: bookmark.session.id,
      messageId: bookmark.messageId,
    });
    close();
  }

  function startEditing(bookmark: Bookmark) {
    editingId = bookmark.id;
    editingNote = bookmark.note || '';
  }

  async function saveNote() {
    if (!editingId) return;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/bookmarks/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: editingNote || null }),
      });

      if (response.ok) {
        const bookmark = bookmarks.find(b => b.id === editingId);
        if (bookmark) {
          bookmark.note = editingNote || null;
          bookmarks = [...bookmarks];
        }
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "bookmarks" },
        extra: { action: "update-note", bookmarkId: editingId, appNameId },
      });
    } finally {
      editingId = null;
    }
  }

  function handleNoteKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveNote();
    } else if (e.key === 'Escape') {
      editingId = null;
    }
  }

  async function handleDelete(bookmarkId: string) {
    if (!confirm('Remove this bookmark?')) return;

    try {
      const response = await fetch(`/consumer/${appNameId}/chat/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
        dispatch('deleteBookmark', { bookmarkId });
      }
    } catch (e) {
      captureException(e, {
        tags: { feature: "bookmarks" },
        extra: { action: "delete-bookmark", bookmarkId, appNameId },
      });
    }
  }

  function truncateContent(content: string, maxLength: number = 150): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength).trim() + '...';
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

  $: filteredBookmarks = searchQuery
    ? bookmarks.filter(b =>
        b.message.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.session.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : bookmarks;

  // Load bookmarks when sheet opens
  $: if (open) {
    loadBookmarks();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="sheet-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="sheet-content"
      role="dialog"
      aria-modal="true"
      aria-label="Bookmarks"
      transition:fly={{ x: 300, duration: 200 }}
    >
      <div class="sheet-header">
        <h2>Bookmarks</h2>
        <button class="sheet-close" on:click={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if bookmarks.length > 0}
        <div class="search-section">
          <Input
            type="search"
            placeholder="Search bookmarks..."
            bind:value={searchQuery}
          />
        </div>
      {/if}

      <div class="bookmarks-list">
        {#if loading}
          <div class="loading-state">
            <Spinner size="md" />
            <p>Loading bookmarks...</p>
          </div>
        {:else if error}
          <div class="error-state">
            <p>{error}</p>
            <Button variant="secondary" size="sm" on:click={loadBookmarks}>
              Try Again
            </Button>
          </div>
        {:else if bookmarks.length === 0}
          <div class="empty-state">
            <div class="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <h3>No bookmarks yet</h3>
            <p>Bookmark messages to save them here</p>
          </div>
        {:else if filteredBookmarks.length === 0}
          <div class="empty-state">
            <p>No bookmarks match your search</p>
          </div>
        {:else}
          {#each filteredBookmarks as bookmark (bookmark.id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <div
              class="bookmark-item"
              on:click={() => handleNavigate(bookmark)}
            >
              <div class="bookmark-header">
                <span class="session-title">
                  {bookmark.session.title || 'Untitled Chat'}
                </span>
                <span class="bookmark-date">{formatDate(bookmark.createdAt)}</span>
              </div>

              <div class="message-content" class:assistant={bookmark.message.role === 'assistant'}>
                {truncateContent(bookmark.message.content)}
              </div>

              {#if editingId === bookmark.id}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div class="note-edit" on:click|stopPropagation>
                  <textarea
                    bind:value={editingNote}
                    on:keydown={handleNoteKeydown}
                    on:blur={saveNote}
                    placeholder="Add a note..."
                    rows="2"
                  />
                </div>
              {:else if bookmark.note}
                <div class="bookmark-note">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="note-icon">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>{bookmark.note}</span>
                </div>
              {/if}

              <div class="bookmark-actions">
                <button
                  class="action-btn"
                  on:click|stopPropagation={() => startEditing(bookmark)}
                  aria-label="Edit note"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  class="action-btn delete"
                  on:click|stopPropagation={() => handleDelete(bookmark.id)}
                  aria-label="Remove bookmark"
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
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 380px;
    background-color: hsl(var(--background));
    border-left: 1px solid hsl(var(--border));
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

  .search-section {
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .bookmarks-list {
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

  .bookmark-item {
    position: relative;
    padding: var(--space-3);
    margin-bottom: var(--space-2);
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .bookmark-item:hover {
    background-color: hsl(var(--muted) / 0.5);
    border-color: hsl(var(--border));
  }

  .bookmark-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .session-title {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .bookmark-date {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .message-content {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    line-height: 1.5;
    margin-bottom: var(--space-2);
  }

  .message-content.assistant {
    color: hsl(var(--muted-foreground));
  }

  .bookmark-note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    padding: var(--space-2);
    background-color: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
  }

  .note-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .note-edit {
    margin-bottom: var(--space-2);
  }

  .note-edit textarea {
    width: 100%;
    padding: var(--space-2);
    font-size: var(--text-sm);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    resize: none;
    font-family: inherit;
  }

  .note-edit textarea:focus {
    outline: none;
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  .bookmark-actions {
    display: flex;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .bookmark-item:hover .bookmark-actions {
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
    width: 14px;
    height: 14px;
  }

  @media (max-width: 640px) {
    .sheet-content {
      max-width: 100%;
    }
  }
</style>
