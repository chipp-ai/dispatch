<script lang="ts">
  export let align: "left" | "center" | "right" = "left";
</script>

<td class="table-cell" style="text-align: {align}" {...$$restProps}>
  <slot />
</td>

<style>
  .table-cell {
    padding: var(--space-3) var(--space-4);
    vertical-align: middle;
  }
</style>
