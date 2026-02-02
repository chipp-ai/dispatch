<script lang="ts">
</script>

<h2 class="dialog-title" {...$$restProps}>
  <slot />
</h2>

<style>
  .dialog-title {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    line-height: 1.2;
    color: var(--text-primary);
    margin: 0;
  }
</style>
