<script lang="ts">
  type Side = "top" | "right" | "bottom" | "left";

  export let content: string = "";
  export let side: Side = "top";
  export let delay: number = 200;

  let visible = false;
  let timeout: ReturnType<typeof setTimeout>;

  function show() {
    timeout = setTimeout(() => {
      visible = true;
    }, delay);
  }

  function hide() {
    clearTimeout(timeout);
    visible = false;
  }
</script>

<div
  class="tooltip-wrapper"
  on:mouseenter={show}
  on:mouseleave={hide}
  on:focus={show}
  on:blur={hide}
>
  <slot />
  {#if visible && content}
    <div class="tooltip tooltip-{side}" role="tooltip">
      {content}
    </div>
  {/if}
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: absolute;
    z-index: 50;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-inverse);
    background-color: var(--bg-inverse);
    border-radius: var(--radius-md);
    white-space: nowrap;
    pointer-events: none;
    animation: fadeIn 0.15s ease;
  }

  .tooltip-top {
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 6px;
  }

  .tooltip-bottom {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 6px;
  }

  .tooltip-left {
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 6px;
  }

  .tooltip-right {
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 6px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
