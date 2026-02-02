<script lang="ts">
  export let value: number = 0;
  export let max: number = 100;

  $: percentage = Math.min(100, Math.max(0, (value / max) * 100));
</script>

<div class="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} {...$$restProps}>
  <div class="progress-indicator" style="transform: translateX(-{100 - percentage}%)" />
</div>

<style>
  .progress {
    position: relative;
    height: 8px;
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius-full);
    background-color: var(--bg-tertiary);
  }

  .progress-indicator {
    height: 100%;
    width: 100%;
    flex: 1;
    background-color: var(--brand-color-ui);
    transition: transform 0.3s ease;
  }
</style>
