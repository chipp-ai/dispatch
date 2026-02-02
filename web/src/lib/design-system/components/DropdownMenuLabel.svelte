<script lang="ts">
</script>

<div class="dropdown-label" {...$$restProps}>
  <slot />
</div>

<style>
  .dropdown-label {
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--text-muted);
  }
</style>
