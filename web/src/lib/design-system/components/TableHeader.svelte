<thead class="table-header" {...$$restProps}>
  <slot />
</thead>

<style>
  .table-header {
    border-bottom: 1px solid var(--border-primary);
  }

  .table-header :global(tr) {
    border-bottom: 1px solid var(--border-primary);
  }
</style>
