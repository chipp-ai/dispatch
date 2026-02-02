<tbody class="table-body" {...$$restProps}>
  <slot />
</tbody>

<style>
  .table-body :global(tr:last-child) {
    border-bottom: 0;
  }
</style>
