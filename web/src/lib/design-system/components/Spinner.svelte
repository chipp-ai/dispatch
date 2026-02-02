<!--
  Spinner Component

  Simple loading spinner with size variants.
-->
<script lang="ts">
  export let size: "sm" | "md" | "lg" = "md";

  const sizeClasses = {
    sm: "spinner-sm",
    md: "spinner-md",
    lg: "spinner-lg",
  };
</script>

<div class="spinner {sizeClasses[size]}" role="status" aria-label="Loading">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      class="track"
    />
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-dasharray="31.4"
      stroke-dashoffset="23.55"
      class="indicator"
    />
  </svg>
</div>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .spinner svg {
    animation: spin 1s linear infinite;
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
  }

  .spinner-md {
    width: 24px;
    height: 24px;
  }

  .spinner-lg {
    width: 40px;
    height: 40px;
  }

  .track {
    opacity: 0.2;
  }

  .indicator {
    opacity: 1;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
