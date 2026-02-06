<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { captureException } from "$lib/sentry";

  export let appUrl: string;
  export let appNameId: string;

  let isOpen = false;
  let showPreview = false;
  let appInfo: {
    name?: string;
    brandStyles?: {
      primaryColor?: string;
      logoUrl?: string;
    };
    welcomeMessages?: string[];
  } | null = null;

  // Fetch app info for branding
  async function fetchAppInfo() {
    try {
      const response = await fetch(`${appUrl}/api/consumer/app/${appNameId}`);
      if (response.ok) {
        const data = await response.json();
        appInfo = data.data;
        // Show preview bubble after a delay
        setTimeout(() => {
          showPreview = true;
        }, 2000);
      }
    } catch (error) {
      captureException(error, { tags: { page: "widget" }, extra: { action: "fetchAppInfo", appNameId } });
    }
  }

  function toggleChat() {
    isOpen = !isOpen;
    showPreview = false;
  }

  function closePreview() {
    showPreview = false;
  }

  onMount(() => {
    fetchAppInfo();

    // Listen for close events from iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "chipp:close") {
        isOpen = false;
      }
    };
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  });

  $: primaryColor = appInfo?.brandStyles?.primaryColor || "#f9db00";
  $: logoUrl = appInfo?.brandStyles?.logoUrl;
  $: welcomeMessage = appInfo?.welcomeMessages?.[0];
  $: chatUrl = `${appUrl}/#/w/chat/${appNameId}`;
</script>

<div class="chipp-widget">
  <!-- Preview Message Bubble -->
  {#if showPreview && welcomeMessage && !isOpen}
    <div class="preview-bubble" on:click={toggleChat} on:keydown={(e) => e.key === 'Enter' && toggleChat()} role="button" tabindex="0">
      <button class="preview-close" on:click|stopPropagation={closePreview} aria-label="Close preview">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
      <p class="preview-text">{welcomeMessage}</p>
    </div>
  {/if}

  <!-- Chat Iframe -->
  {#if isOpen}
    <div class="iframe-container">
      <iframe
        src={chatUrl}
        title="Chat with {appInfo?.name || 'AI Assistant'}"
        allow="microphone"
      ></iframe>
    </div>
  {/if}

  <!-- Chat Button -->
  <button
    class="chat-button"
    style="--primary-color: {primaryColor}"
    on:click={toggleChat}
    aria-label={isOpen ? "Close chat" : "Open chat"}
  >
    {#if isOpen}
      <!-- Close Icon -->
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
      </svg>
    {:else}
      <!-- Chat Icon or Logo -->
      {#if logoUrl}
        <img src={logoUrl} alt="" class="logo" />
      {:else}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      {/if}
    {/if}

    <!-- Notification dot -->
    {#if showPreview && !isOpen}
      <span class="notification-dot" style="background-color: {primaryColor}"></span>
    {/if}
  </button>
</div>

<style>
  .chipp-widget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483646;
  }

  .chat-button {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: none;
    background: var(--primary-color, #f9db00);
    color: #1f2937;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    position: relative;
  }

  .chat-button:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }

  .chat-button:active {
    transform: scale(0.95);
  }

  .chat-button .logo {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .notification-dot {
    position: absolute;
    top: 0;
    right: 0;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid white;
  }

  .preview-bubble {
    position: absolute;
    bottom: 70px;
    right: 0;
    background: white;
    border-radius: 16px;
    padding: 16px;
    padding-right: 32px;
    max-width: 280px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .preview-close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
  }

  .preview-close:hover {
    background: #e5e7eb;
  }

  .preview-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: #1f2937;
  }

  .iframe-container {
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 400px;
    height: 600px;
    max-height: calc(100vh - 100px);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    animation: slideUp 0.3s ease;
  }

  .iframe-container iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  @media (max-width: 480px) {
    .iframe-container {
      width: calc(100vw - 40px);
      height: calc(100vh - 100px);
      bottom: 70px;
      right: 0;
    }

    .chipp-widget {
      bottom: 10px;
      right: 10px;
    }
  }
</style>
