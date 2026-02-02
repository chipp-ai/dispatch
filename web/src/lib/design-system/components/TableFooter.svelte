<tfoot class="table-footer" {...$$restProps}>
  <slot />
</tfoot>

<style>
  .table-footer {
    border-top: 1px solid var(--border-primary);
    background-color: var(--bg-secondary);
    font-weight: var(--font-medium);
  }

  .table-footer :global(tr:last-child) {
    border-bottom: 0;
  }
</style>
