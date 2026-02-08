<script lang="ts">
  /**
   * ChatHeader
   *
   * Header component for consumer chat with:
   * - App logo with online status indicator
   * - App name with "AI Assistant" subtitle
   * - Credit meter (if monetization enabled)
   * - Menu button (hamburger) that opens a sheet menu
   * - Dark mode support
   */
  import { createEventDispatcher } from "svelte";
  import CreditMeter from "./CreditMeter.svelte";
  import ConsumerChatMenuTrigger from "./ConsumerChatMenuTrigger.svelte";
  import ParticipantAvatarStack from "./ParticipantAvatarStack.svelte";

  export let appName: string = "Chat";
  export let logoUrl: string | null = null;
  export let primaryColor: string = "#4499ff";
  export let forceDarkMode: boolean = false;
  export let showCreditMeter: boolean = false;
  export let credits: number | string = 0;
  export let maxCredits: number = 100;
  export let subscriptionActive: boolean = false;
  export let menuOpen: boolean = false;
  /** Multiplayer participants for avatar stack */
  export let participants: Array<{
    id: string;
    displayName: string;
    avatarColor: string;
    isActive: boolean;
  }> = [];
  /** Whether this is a multiplayer session */
  export let isMultiplayer: boolean = false;

  const dispatch = createEventDispatcher<{ toggleMenu: void; openParticipants: void }>();

  function handleMenuToggle() {
    dispatch('toggleMenu');
  }

  function handleParticipantsClick() {
    dispatch('openParticipants');
  }
</script>

<header class="chat-header" class:dark={forceDarkMode}>
  <div class="header-container">
    <!-- Left: Logo and app name -->
    <div class="header-left">
      <div class="logo-container">
        <div class="logo-wrapper">
          {#if logoUrl}
            <img src={logoUrl} alt="{appName} logo" class="app-logo" />
          {:else}
            <div class="default-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          {/if}
        </div>
        <!-- Online status dot -->
        <div class="status-dot"></div>
      </div>

      <div class="app-info">
        <h1 class="app-name">{appName}</h1>
        <span class="app-subtitle">AI Assistant</span>
      </div>
    </div>

    <!-- Right: Participants, credit meter and menu -->
    <div class="header-right">
      {#if isMultiplayer && participants.length > 0}
        <ParticipantAvatarStack
          {participants}
          {forceDarkMode}
          on:click={handleParticipantsClick}
        />
      {/if}

      {#if showCreditMeter}
        <div class="credit-meter-wrapper" title="Credits remaining">
          <CreditMeter
            {credits}
            {maxCredits}
            {subscriptionActive}
            {primaryColor}
            radius={18}
          />
        </div>
      {/if}

      <ConsumerChatMenuTrigger
        open={menuOpen}
        on:toggle={handleMenuToggle}
      />
    </div>
  </div>
</header>

<style>
  .chat-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    backdrop-filter: blur(12px);
    background-color: hsl(var(--background) / 0.8);
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    box-shadow: 0 1px 3px hsl(var(--foreground) / 0.05);
  }

  .chat-header.dark {
    background-color: rgba(26, 26, 26, 0.9);
    border-bottom-color: rgba(75, 75, 75, 0.5);
  }

  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 64px;
    max-width: 800px;
    margin: 0 auto;
    padding: 0 var(--space-4);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .logo-container {
    position: relative;
    flex-shrink: 0;
  }

  .logo-wrapper {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: transform 0.2s ease;
    background-color: hsl(var(--background));
  }

  .logo-wrapper:hover {
    transform: scale(1.05);
  }

  .app-logo {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .default-logo {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .default-logo svg {
    width: 24px;
    height: 24px;
  }

  .status-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    background-color: #22c55e;
    border-radius: 50%;
    border: 2px solid hsl(var(--background));
  }

  .dark .status-dot {
    border-color: #1a1a1a;
  }

  .app-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .app-name {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .dark .app-name {
    color: white;
  }

  .app-subtitle {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    display: none;
  }

  @media (min-width: 640px) {
    .app-subtitle {
      display: block;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .credit-meter-wrapper {
    transition: transform 0.2s ease;
    cursor: pointer;
  }

  .credit-meter-wrapper:hover {
    transform: scale(1.05);
  }

  @media (max-width: 640px) {
    .header-container {
      padding: 0 var(--space-3);
    }

    .logo-wrapper {
      width: 36px;
      height: 36px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
    }
  }
</style>
