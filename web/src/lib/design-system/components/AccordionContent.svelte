<script lang="ts">
  import { slide } from 'svelte/transition';

  export let open: boolean = false;
</script>

{#if open}
  <div class="accordion-content" transition:slide={{ duration: 200 }} {...$$restProps}>
    <div class="accordion-content-inner">
      <slot />
    </div>
  </div>
{/if}

<style>
  .accordion-content {
    overflow: hidden;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .accordion-content-inner {
    padding-bottom: var(--space-4);
  }
</style>
