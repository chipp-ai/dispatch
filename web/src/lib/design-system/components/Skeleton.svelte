<script lang="ts">
  // Accept both 'class' and 'className' for compatibility with different usage patterns
  let classFromProp: string = "";
  export { classFromProp as class };
  export let className: string = "";

  // Combine both class sources
  $: combinedClass = [classFromProp, className].filter(Boolean).join(" ");
</script>

<div class="skeleton {combinedClass}"></div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg-secondary) 0%,
      var(--bg-tertiary) 50%,
      var(--bg-secondary) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-md);
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
