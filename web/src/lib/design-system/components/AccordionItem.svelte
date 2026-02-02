<script lang="ts">
  export let value: string;
</script>

<div class="accordion-item" data-value={value} {...$$restProps}>
  <slot />
</div>

<style>
  .accordion-item {
    border-bottom: 1px solid var(--border-primary);
  }
</style>
