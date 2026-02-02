<script lang="ts">
</script>

<div class="dialog-header" {...$$restProps}>
  <slot />
</div>

<style>
  .dialog-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
    margin-bottom: var(--space-4);
  }
</style>
