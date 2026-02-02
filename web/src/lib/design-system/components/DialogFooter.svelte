<script lang="ts">
</script>

<div class="dialog-footer" {...$$restProps}>
  <slot />
</div>

<style>
  .dialog-footer {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--space-2);
    margin-top: var(--space-6);
  }

  @media (min-width: 640px) {
    .dialog-footer {
      flex-direction: row;
      justify-content: flex-end;
    }
  }
</style>
