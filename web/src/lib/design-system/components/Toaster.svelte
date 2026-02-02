<script lang="ts">
  import { toasts } from '../stores/toast';
  import Toast from './Toast.svelte';
</script>

<div class="toaster">
  {#each $toasts as toast (toast.id)}
    <Toast
      title={toast.title}
      description={toast.description}
      variant={toast.variant}
      duration={toast.duration}
      dismissible={toast.dismissible ?? true}
      on:close={() => toasts.dismiss(toast.id)}
    />
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    bottom: var(--space-4);
    right: var(--space-4);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    pointer-events: none;
  }

  .toaster > :global(*) {
    pointer-events: auto;
  }
</style>
