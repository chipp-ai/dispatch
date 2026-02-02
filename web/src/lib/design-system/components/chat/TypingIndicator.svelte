<script lang="ts">
  /**
   * Typing Indicator
   *
   * Elegant pulsing dots that indicate the AI is processing.
   * Smooth wave animation with subtle opacity changes.
   */

  export let dotColor: string = "currentColor";
</script>

<div class="typing-indicator">
  {#each [0, 1, 2] as i}
    <span
      class="dot"
      style="--dot-color: {dotColor}; --delay: {i * 0.16}s"
    ></span>
  {/each}
</div>

<style>
  .typing-indicator {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 4px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--dot-color);
    opacity: 0.4;
    animation: pulse 1.2s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }
</style>
