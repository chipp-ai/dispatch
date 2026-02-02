<script lang="ts">
  export let value: string = "";
</script>

<div class="tabs" {...$$restProps}>
  <slot {value} />
</div>

<style>
  .tabs {
    width: 100%;
  }
</style>
