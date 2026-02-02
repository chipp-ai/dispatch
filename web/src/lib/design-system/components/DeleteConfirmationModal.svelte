<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import { Button } from "./index";

  export let open: boolean = false;
  export let title: string = "Confirm Delete";
  export let message: string = "Are you sure you want to delete this item? This action cannot be undone.";
  export let itemName: string | undefined = undefined;
  export let loading: boolean = false;

  const dispatch = createEventDispatcher();

  function close() {
    open = false;
  }

  function handleConfirm() {
    dispatch("confirm");
  }
</script>

<Modal bind:open on:close={close}>
  <div class="modal-header">
    <h2>{title}</h2>
    <p class="modal-message">
      {#if itemName}
        {message.replace("{name}", itemName)}
      {:else}
        {message}
      {/if}
    </p>
  </div>

  <div class="modal-footer">
    <Button
      type="button"
      variant="outline"
      on:click={close}
      disabled={loading}
    >
      Cancel
    </Button>
    <Button
      type="button"
      variant="primary"
      on:click={handleConfirm}
      disabled={loading}
      style="background-color: hsl(var(--destructive));"
    >
      {loading ? "Deleting..." : "Delete"}
    </Button>
  </div>
</Modal>

<style>
  .modal-header {
    margin-bottom: var(--space-6);
  }

  .modal-header h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .modal-message {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
</style>

