<script lang="ts">
  export let padding: "none" | "sm" | "md" | "lg" = "md";
  export let hoverable: boolean = false;
  export let animate: boolean = true;

  // Extract class from $$restProps to merge with base classes
  $: ({ class: extraClass, ...rest } = $$restProps);
  $: mergedClass = ["card", `padding-${padding}`, extraClass].filter(Boolean).join(" ");
</script>

<div
  class={mergedClass}
  class:hoverable
  class:animate
  on:click
  {...rest}
>
  <slot />
</div>

<style>
  .card {
    position: relative;
    background-color: hsl(var(--surface-elevated));
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-sm);
    transition:
      box-shadow var(--transition-fast),
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  /* Animation on mount */
  .card.animate {
    animation: cardFadeIn 0.3s ease-out forwards;
  }

  @keyframes cardFadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Padding variants */
  .padding-none {
    padding: 0;
  }

  .padding-sm {
    padding: var(--space-3);
  }

  .padding-md {
    padding: var(--space-4);
  }

  .padding-lg {
    padding: var(--space-6);
  }

  /* Hoverable state */
  .hoverable {
    cursor: pointer;
  }

  .hoverable:hover {
    box-shadow: var(--shadow-md), 0 0 20px var(--brand-color-card-glow);
    transform: translateY(-2px);
    border-color: hsl(var(--card-border-hover));
    background-color: hsl(var(--card-hover));
  }
</style>
