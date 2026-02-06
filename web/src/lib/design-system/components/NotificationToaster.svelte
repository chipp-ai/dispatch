<script lang="ts">
  import { notificationToasts } from "../stores/notificationToast";
  import NotificationToast from "./NotificationToast.svelte";
</script>

<div class="notification-toaster">
  {#each $notificationToasts as item (item.id)}
    <NotificationToast
      notificationType={item.notificationType}
      category={item.category}
      title={item.title}
      body={item.body}
      actionUrl={item.actionUrl}
      actionLabel={item.actionLabel}
      duration={item.duration}
      onDismiss={() => notificationToasts.dismiss(item.id)}
    />
  {/each}
</div>

<style>
  .notification-toaster {
    position: fixed;
    top: var(--space-4, 1rem);
    right: var(--space-4, 1rem);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 0.5rem);
    pointer-events: none;
  }

  .notification-toaster > :global(*) {
    pointer-events: auto;
  }
</style>
