<script lang="ts">
  type Variant = "default" | "secondary" | "destructive" | "outline" | "success";

  export let variant: Variant = "default";
</script>

<span class="badge badge-{variant}" {...$$restProps}>
  <slot />
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: var(--radius-full);
    padding: 2px 10px;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    line-height: 1.4;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }

  .badge-default {
    background-color: var(--brand-color-ui);
    color: var(--brand-color-foreground);
  }

  .badge-secondary {
    background-color: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .badge-destructive {
    background-color: var(--color-error);
    color: white;
  }

  .badge-outline {
    background-color: transparent;
    border: 1px solid var(--border-primary);
    color: var(--text-primary);
  }

  .badge-success {
    background-color: var(--color-success);
    color: white;
  }
</style>
