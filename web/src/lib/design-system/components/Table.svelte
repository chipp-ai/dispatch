<script lang="ts">
</script>

<div class="table-wrapper" {...$$restProps}>
  <table class="table">
    <slot />
  </table>
</div>

<style>
  .table-wrapper {
    width: 100%;
    overflow: auto;
  }

  .table {
    width: 100%;
    caption-side: bottom;
    font-size: var(--text-sm);
    border-collapse: collapse;
  }
</style>
