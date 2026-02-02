<script lang="ts">
  type Type = "single" | "multiple";

  export let type: Type = "single";
  export let value: string | string[] = type === "single" ? "" : [];
</script>

<div class="accordion" {...$$restProps}>
  <slot {value} {type} />
</div>

<style>
  .accordion {
    width: 100%;
  }
</style>
