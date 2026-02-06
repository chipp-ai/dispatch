<script lang="ts">
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";
  import type { NotificationCategory } from "../stores/notificationToast";

  export let notificationType: string;
  export let category: NotificationCategory = "engagement";
  export let title: string;
  export let body: string;
  export let actionUrl: string | undefined = undefined;
  export let actionLabel: string | undefined = undefined;
  export let duration: number = 8000;
  export let onDismiss: () => void = () => {};

  // Category color config
  const CATEGORY_COLORS: Record<NotificationCategory, string> = {
    engagement: "217, 91%, 55%",
    billing: "30, 90%, 55%",
    team: "263, 70%, 60%",
  };

  $: hsl = CATEGORY_COLORS[category] || CATEGORY_COLORS.engagement;

  // Icon SVG paths per notification type
  const ICONS: Record<string, string> = {
    consumer_signup:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19 8v6M22 11h-6",
    credit_purchase:
      "M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM1 10h22",
    credit_low:
      "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    credit_exhausted:
      "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    payment_failed:
      "M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM1 10h22M18 15l-4 4m0-4l4 4",
    subscription_changed:
      "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    workspace_member_joined:
      "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    app_engagement:
      "M22 12h-4l-3 9L9 3l-3 9H2",
    live_chat_started:
      "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM16 8a2 2 0 1 1 0 0.01",
  };

  $: iconPath = ICONS[notificationType] || ICONS.consumer_signup;

  // Auto-dismiss
  let dismissed = false;
  onMount(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        if (!dismissed) onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  });

  function handleAction() {
    if (actionUrl) {
      window.location.hash = actionUrl.startsWith("/#/")
        ? actionUrl.slice(1)
        : actionUrl;
    }
    dismissed = true;
    onDismiss();
  }

  function handleDismiss() {
    dismissed = true;
    onDismiss();
  }
</script>

<div
  class="notification-toast"
  class:category-engagement={category === "engagement"}
  class:category-billing={category === "billing"}
  class:category-team={category === "team"}
  style="--cat-hsl: {hsl};"
  transition:fly={{ x: 400, duration: 400, opacity: 0 }}
  role="alert"
>
  <!-- Icon with sonar rings -->
  <div class="icon-container">
    <div class="sonar-ring ring-1"></div>
    <div class="sonar-ring ring-2"></div>
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={iconPath} />
    </svg>
  </div>

  <!-- Content -->
  <div class="content">
    <div class="title">{title}</div>
    <div class="body">{body}</div>
    {#if actionUrl && actionLabel}
      <button class="action-btn" on:click={handleAction}>
        {actionLabel}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="action-arrow">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Dismiss button -->
  <button class="dismiss-btn" on:click={handleDismiss} aria-label="Dismiss">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  </button>

  <!-- Countdown progress bar -->
  {#if duration > 0}
    <div class="countdown-bar" style="animation-duration: {duration}ms;"></div>
  {/if}
</div>

<style>
  .notification-toast {
    position: relative;
    width: 380px;
    max-width: calc(100vw - 2rem);
    padding: 14px 16px;
    border-radius: 12px;
    background: hsla(var(--cat-hsl), 0.06);
    backdrop-filter: blur(16px) saturate(1.2);
    -webkit-backdrop-filter: blur(16px) saturate(1.2);
    border: 1px solid hsla(var(--cat-hsl), 0.15);
    border-left: 3px solid hsl(var(--cat-hsl));
    box-shadow:
      0 4px 24px -4px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.05),
      0 0 32px -8px hsla(var(--cat-hsl), 0.2);
    display: flex;
    gap: 12px;
    align-items: flex-start;
    overflow: hidden;
    color: var(--foreground);
  }

  /* Icon container with sonar */
  .icon-container {
    position: relative;
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: hsla(var(--cat-hsl), 0.15);
  }

  .icon {
    width: 18px;
    height: 18px;
    color: hsl(var(--cat-hsl));
    position: relative;
    z-index: 1;
  }

  .sonar-ring {
    position: absolute;
    inset: 0;
    border-radius: 10px;
    border: 1.5px solid hsla(var(--cat-hsl), 0.4);
    animation: notification-sonar 2s ease-out infinite;
    pointer-events: none;
  }

  .ring-2 {
    animation-delay: 0.3s;
  }

  @keyframes notification-sonar {
    0% {
      transform: scale(1);
      opacity: 0.6;
    }
    100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }

  /* Content */
  .content {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.3;
    margin-bottom: 2px;
  }

  .body {
    font-size: 0.8125rem;
    line-height: 1.4;
    opacity: 0.8;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Action button */
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 4px 10px;
    border: none;
    border-radius: 999px;
    background: hsla(var(--cat-hsl), 0.1);
    color: hsl(var(--cat-hsl));
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .action-btn:hover {
    background: hsla(var(--cat-hsl), 0.2);
  }

  .action-arrow {
    width: 12px;
    height: 12px;
  }

  /* Dismiss */
  .dismiss-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: var(--foreground);
    opacity: 0.4;
    cursor: pointer;
    transition: opacity 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dismiss-btn:hover {
    opacity: 0.8;
  }

  .dismiss-btn svg {
    width: 14px;
    height: 14px;
  }

  /* Countdown progress bar */
  .countdown-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: hsla(var(--cat-hsl), 0.6);
    transform-origin: left;
    animation: countdown-shrink linear forwards;
    border-radius: 0 0 0 12px;
  }

  @keyframes countdown-shrink {
    0% {
      transform: scaleX(1);
    }
    100% {
      transform: scaleX(0);
    }
  }
</style>
