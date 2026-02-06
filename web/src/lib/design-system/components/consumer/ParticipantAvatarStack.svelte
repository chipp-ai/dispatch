<script lang="ts">
  /**
   * ParticipantAvatarStack
   *
   * Google Docs-style overlapping avatar circles showing who's in the chat.
   * Active participants have a green presence ring, recently-left participants
   * appear dimmed. Avatars pop in with a spring animation when someone joins.
   */
  import { createEventDispatcher } from "svelte";

  export let participants: Array<{
    id: string;
    displayName: string;
    avatarColor: string;
    isActive: boolean;
    leftAt?: string | null;
  }> = [];
  export let maxVisible: number = 5;
  export let forceDarkMode: boolean = false;

  const dispatch = createEventDispatcher<{ click: void }>();

  // Active participants shown with full presence
  $: active = participants.filter((p) => p.isActive);
  // Recently-left (within 30 min) shown as dimmed ghosts
  $: recentlyLeft = participants
    .filter((p) => {
      if (p.isActive || !p.leftAt) return false;
      const leftMs = Date.now() - new Date(p.leftAt).getTime();
      return leftMs < 30 * 60 * 1000; // 30 minutes
    })
    .slice(0, 2); // Max 2 ghost avatars

  $: allVisible = [...active, ...recentlyLeft];
  $: visibleAvatars = allVisible.slice(0, maxVisible);
  $: overflowCount = Math.max(0, allVisible.length - maxVisible);
  $: totalInChat = active.length;

  function getInitial(name: string): string {
    // Use first letter of each word for 2-word names
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }

  function handleClick() {
    dispatch("click");
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="presence-stack"
  class:dark={forceDarkMode}
  on:click={handleClick}
  title="{totalInChat} active participant{totalInChat !== 1 ? 's' : ''}"
>
  <div class="avatars">
    {#each visibleAvatars as participant, i (participant.id)}
      <div
        class="avatar-wrapper"
        class:is-active={participant.isActive}
        class:is-ghost={!participant.isActive}
        style="z-index: {maxVisible - i}; animation-delay: {i * 40}ms;"
      >
        <div
          class="avatar-circle"
          style="background-color: {participant.avatarColor};"
          title={participant.displayName}
        >
          <span class="avatar-initials">{getInitial(participant.displayName)}</span>
        </div>
        {#if participant.isActive}
          <div class="presence-dot"></div>
        {/if}
      </div>
    {/each}
    {#if overflowCount > 0}
      <div class="avatar-wrapper" style="z-index: 0;">
        <div class="avatar-circle overflow-badge">
          <span class="overflow-text">+{overflowCount}</span>
        </div>
      </div>
    {/if}
  </div>

  {#if totalInChat > 0}
    <span class="count-label">{totalInChat}</span>
  {/if}
</div>

<style>
  .presence-stack {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 4px 8px 4px 4px;
    border-radius: 20px;
    transition: background 0.2s ease;
  }

  .presence-stack:hover {
    background: hsl(var(--muted) / 0.4);
  }

  .dark.presence-stack:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .avatars {
    display: flex;
    align-items: center;
  }

  .avatar-wrapper {
    position: relative;
    margin-left: -6px;
    animation: avatar-pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .avatar-wrapper:first-child {
    margin-left: 0;
  }

  @keyframes avatar-pop-in {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Fan out on hover */
  .presence-stack:hover .avatar-wrapper {
    margin-left: -3px;
    transition: margin-left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .presence-stack:hover .avatar-wrapper:first-child {
    margin-left: 0;
  }

  .avatar-circle {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2.5px solid hsl(var(--background));
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    flex-shrink: 0;
  }

  .dark .avatar-circle {
    border-color: #1a1a1a;
  }

  /* Active participants: subtle glow on hover */
  .is-active .avatar-circle {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
    transition: box-shadow 0.3s ease, transform 0.2s ease;
  }

  .presence-stack:hover .is-active .avatar-circle {
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
  }

  /* Ghost (recently-left) participants: dimmed */
  .is-ghost .avatar-circle {
    opacity: 0.4;
    filter: grayscale(40%);
  }

  .is-ghost:hover .avatar-circle {
    opacity: 0.6;
    filter: grayscale(20%);
  }

  /* Green presence dot (bottom-right of active avatars) */
  .presence-dot {
    position: absolute;
    bottom: 0px;
    right: 0px;
    width: 9px;
    height: 9px;
    background: #22c55e;
    border-radius: 50%;
    border: 2px solid hsl(var(--background));
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.5);
  }

  .dark .presence-dot {
    border-color: #1a1a1a;
  }

  .avatar-initials {
    font-size: 10px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    line-height: 1;
    user-select: none;
    letter-spacing: -0.02em;
  }

  .overflow-badge {
    background-color: hsl(var(--muted)) !important;
    border-color: hsl(var(--background));
  }

  .dark .overflow-badge {
    background-color: #333 !important;
    border-color: #1a1a1a;
  }

  .overflow-text {
    font-size: 10px;
    font-weight: 700;
    color: hsl(var(--muted-foreground));
    line-height: 1;
    user-select: none;
  }

  /* Participant count label */
  .count-label {
    font-size: 12px;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    line-height: 1;
    user-select: none;
    min-width: 12px;
    text-align: center;
  }

  .dark .count-label {
    color: rgba(255, 255, 255, 0.5);
  }
</style>
