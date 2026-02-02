<script lang="ts">
  // DialogContent is a simple wrapper for content within a Dialog
  // It provides semantic structure but the actual styling is handled by Dialog
</script>

<div class="dialog-body">
  <slot />
</div>

<style>
  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
