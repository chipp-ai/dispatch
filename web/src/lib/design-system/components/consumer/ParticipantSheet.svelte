<script lang="ts">
  /**
   * ParticipantSheet
   *
   * Google Docs-style participant panel showing who's in the chat.
   * Split into "Active now" and "Were here" sections with relative time stamps.
   */
  import { createEventDispatcher } from "svelte";

  export let open: boolean = false;
  export let participants: Array<{
    id: string;
    displayName: string;
    avatarColor: string;
    isActive: boolean;
    isAnonymous: boolean;
    joinedAt?: string;
    leftAt?: string | null;
  }> = [];
  export let shareUrl: string | null = null;
  export let myParticipantId: string | null = null;
  export let forceDarkMode: boolean = false;

  let linkCopied = false;
  let copyTimeout: ReturnType<typeof setTimeout>;

  const dispatch = createEventDispatcher<{ close: void }>();

  function handleClose() {
    dispatch("close");
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") handleClose();
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      linkCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        linkCopied = false;
      }, 2000);
    } catch {
      // Fallback: select text
    }
  }

  function getInitials(name: string): string {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }

  function timeAgo(dateStr: string | undefined | null): string {
    if (!dateStr) return "";
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) {
      const m = Math.floor(seconds / 60);
      return `${m}m ago`;
    }
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      return `${h}h ago`;
    }
    const d = Math.floor(seconds / 86400);
    return `${d}d ago`;
  }

  $: activeList = participants.filter((p) => p.isActive);
  $: inactiveList = participants
    .filter((p) => !p.isActive)
    .sort((a, b) => {
      const aTime = a.leftAt ? new Date(a.leftAt).getTime() : 0;
      const bTime = b.leftAt ? new Date(b.leftAt).getTime() : 0;
      return bTime - aTime;
    });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-backdrop" on:click={handleBackdropClick} class:dark={forceDarkMode}>
    <div class="sheet-panel" class:dark={forceDarkMode}>
      <!-- Header -->
      <div class="sheet-header">
        <div class="header-text">
          <h3 class="sheet-title">People in this chat</h3>
          <span class="sheet-subtitle">{activeList.length} active</span>
        </div>
        <button class="close-btn" on:click={handleClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Share link -->
      {#if shareUrl}
        <div class="share-section">
          <button class="share-btn" on:click={copyShareLink}>
            {#if linkCopied}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="share-icon">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span class="share-text">Copied!</span>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="share-icon">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span class="share-text">Copy invite link</span>
            {/if}
          </button>
        </div>
      {/if}

      <div class="participant-sections">
        <!-- Active participants -->
        {#if activeList.length > 0}
          <div class="section">
            <div class="section-header">
              <span class="section-dot active"></span>
              <span class="section-label">Active now</span>
            </div>
            {#each activeList as participant (participant.id)}
              <div class="participant-row">
                <div class="participant-avatar" style="background-color: {participant.avatarColor};">
                  <span class="avatar-initials">{getInitials(participant.displayName)}</span>
                </div>
                <div class="participant-info">
                  <span class="participant-name">
                    {participant.displayName}
                    {#if participant.id === myParticipantId}
                      <span class="badge you">you</span>
                    {/if}
                    {#if participant.isAnonymous}
                      <span class="badge anon">guest</span>
                    {/if}
                  </span>
                  <span class="participant-meta">Viewing now</span>
                </div>
                <div class="status-indicator online"></div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Previously here -->
        {#if inactiveList.length > 0}
          <div class="section">
            <div class="section-header">
              <span class="section-dot inactive"></span>
              <span class="section-label">Were here</span>
            </div>
            {#each inactiveList as participant (participant.id)}
              <div class="participant-row dimmed">
                <div class="participant-avatar ghost" style="background-color: {participant.avatarColor};">
                  <span class="avatar-initials">{getInitials(participant.displayName)}</span>
                </div>
                <div class="participant-info">
                  <span class="participant-name">
                    {participant.displayName}
                    {#if participant.id === myParticipantId}
                      <span class="badge you">you</span>
                    {/if}
                  </span>
                  <span class="participant-meta">Left {timeAgo(participant.leftAt)}</span>
                </div>
                <div class="status-indicator"></div>
              </div>
            {/each}
          </div>
        {/if}

        {#if participants.length === 0}
          <div class="empty-state">
            <span>No participants yet</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fade-in 0.15s ease;
  }

  .sheet-backdrop.dark {
    background: rgba(0, 0, 0, 0.6);
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .sheet-panel {
    width: 100%;
    max-width: 420px;
    max-height: 70vh;
    background: hsl(var(--background));
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    animation: slide-up 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
  }

  .sheet-panel.dark {
    background: #1e1e1e;
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.3);
  }

  @keyframes slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 12px;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sheet-title {
    font-size: 16px;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
    letter-spacing: -0.01em;
  }

  .dark .sheet-title {
    color: #f0f0f0;
  }

  .sheet-subtitle {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  .share-section {
    padding: 0 20px 16px;
  }

  .share-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: hsl(var(--muted) / 0.4);
    border: 1px solid hsl(var(--border) / 0.5);
    border-radius: 10px;
    color: hsl(var(--foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .share-btn:hover {
    background: hsl(var(--muted) / 0.7);
  }

  .dark .share-btn {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
  }

  .dark .share-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .share-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .share-text {
    flex: 1;
    text-align: left;
  }

  .participant-sections {
    overflow-y: auto;
    padding: 0 0 20px;
  }

  .section {
    padding: 0;
  }

  .section + .section {
    margin-top: 8px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
  }

  .section-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .section-dot.active {
    background: #22c55e;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
  }

  .section-dot.inactive {
    background: hsl(var(--muted-foreground) / 0.3);
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
  }

  .participant-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    transition: background 0.1s;
  }

  .participant-row:hover {
    background: hsl(var(--muted) / 0.3);
  }

  .dark .participant-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .participant-row.dimmed {
    opacity: 0.6;
  }

  .participant-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity 0.2s, filter 0.2s;
  }

  .participant-avatar.ghost {
    filter: grayscale(30%);
    opacity: 0.7;
  }

  .avatar-initials {
    font-size: 13px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    letter-spacing: -0.02em;
  }

  .participant-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .participant-name {
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 1.3;
  }

  .dark .participant-name {
    color: #f0f0f0;
  }

  .badge {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 10px;
    line-height: 1.4;
  }

  .badge.you {
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
  }

  .badge.anon {
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted) / 0.6);
    font-style: italic;
  }

  .participant-meta {
    font-size: 12px;
    color: hsl(var(--muted-foreground));
    line-height: 1.3;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: hsl(var(--muted-foreground) / 0.2);
    flex-shrink: 0;
  }

  .status-indicator.online {
    background: #22c55e;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
  }

  .empty-state {
    padding: 32px 20px;
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-size: 13px;
  }
</style>
