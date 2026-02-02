<script lang="ts">
  export let selected: boolean = false;
</script>

<tr
  class="table-row"
  class:selected
  data-state={selected ? "selected" : undefined}
  {...$$restProps}
>
  <slot />
</tr>

<style>
  .table-row {
    border-bottom: 1px solid var(--border-primary);
    transition: background-color var(--transition-fast);
  }

  .table-row:hover {
    background-color: var(--bg-secondary);
  }

  .table-row.selected {
    background-color: var(--bg-secondary);
  }
</style>
