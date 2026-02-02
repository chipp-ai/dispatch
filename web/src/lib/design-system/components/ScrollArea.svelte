<script lang="ts">
  type Orientation = "vertical" | "horizontal" | "both";

  export let orientation: Orientation = "vertical";
  export let maxHeight: string = "";
</script>

<div
  class="scroll-area scroll-area-{orientation}"
  style={maxHeight ? `max-height: ${maxHeight}` : ""}
  {...$$restProps}
>
  <slot />
</div>

<style>
  .scroll-area {
    position: relative;
    overflow: hidden;
  }

  .scroll-area-vertical {
    overflow-y: auto;
  }

  .scroll-area-horizontal {
    overflow-x: auto;
  }

  .scroll-area-both {
    overflow: auto;
  }

  /* Custom scrollbar */
  .scroll-area::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }

  .scroll-area::-webkit-scrollbar-thumb {
    background-color: var(--border-secondary);
    border-radius: var(--radius-full);
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .scroll-area::-webkit-scrollbar-thumb:hover {
    background-color: var(--text-muted);
  }
</style>
