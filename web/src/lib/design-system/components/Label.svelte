<script lang="ts">
  export let htmlFor: string = "";
</script>

<label for={htmlFor} class="label" {...$$restProps}>
  <slot />
</label>

<style>
  .label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-primary);
    line-height: 1;
    cursor: default;
  }

  .label:has(+ :disabled) {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
