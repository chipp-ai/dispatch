<script lang="ts">
  export let align: "left" | "center" | "right" = "left";
</script>

<th class="table-head" style="text-align: {align}" {...$$restProps}>
  <slot />
</th>

<style>
  .table-head {
    height: 48px;
    padding: 0 var(--space-4);
    font-weight: var(--font-medium);
    color: var(--text-muted);
    vertical-align: middle;
  }
</style>
