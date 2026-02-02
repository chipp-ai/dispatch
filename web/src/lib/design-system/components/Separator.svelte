<script lang="ts">
  type Orientation = "horizontal" | "vertical";

  export let orientation: Orientation = "horizontal";
  export let decorative: boolean = true;
</script>

<div
  class="separator separator-{orientation}"
  role={decorative ? "none" : "separator"}
  aria-orientation={decorative ? undefined : orientation}
  {...$$restProps}
/>

<style>
  .separator {
    flex-shrink: 0;
    background-color: var(--border-primary);
  }

  .separator-horizontal {
    height: 1px;
    width: 100%;
  }

  .separator-vertical {
    height: 100%;
    width: 1px;
  }
</style>
