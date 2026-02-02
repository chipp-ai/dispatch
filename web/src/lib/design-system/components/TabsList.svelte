<script lang="ts">
</script>

<div class="tabs-list" role="tablist" {...$$restProps}>
  <slot />
</div>

<style>
  .tabs-list {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1);
    background-color: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }
</style>
