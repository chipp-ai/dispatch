<script lang="ts">
</script>

<div class="sheet-header" {...$$restProps}>
  <slot />
</div>

<style>
  .sheet-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }
</style>
