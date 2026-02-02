<script lang="ts">
  export let value: string;
  export let active: boolean = false;
</script>

{#if active}
  <div class="tabs-content" role="tabpanel" data-value={value} {...$$restProps}>
    <slot />
  </div>
{/if}

<style>
  .tabs-content {
    margin-top: var(--space-4);
  }
</style>
