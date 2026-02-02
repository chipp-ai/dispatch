<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Check, Sparkles, Globe, Headphones, Target } from "lucide-svelte";
  import { Card } from "$lib/design-system";

  export let id: string;
  export let name: string;
  export let description: string;
  export let subtitle: string = "";
  export let icon: string = "Sparkles";
  export let brandColor: string = "";
  export let isSelected: boolean = false;
  export let index: number = 0;

  const dispatch = createEventDispatcher<{ select: string }>();

  const TEMPLATE_ICONS: Record<string, typeof Sparkles> = {
    Globe,
    Headphones,
    Target,
    Sparkles,
  };

  $: Icon = TEMPLATE_ICONS[icon] || Sparkles;

  function handleClick() {
    dispatch("select", id);
  }
</script>

<button
  class="template-card-wrapper"
  class:selected={isSelected}
  on:click={handleClick}
  style:--delay="{index * 0.08}s"
>
  <Card class="template-card {isSelected ? 'selected' : ''}">
    <div class="card-content">
      <!-- Template icon -->
      <div
        class="icon-wrapper"
        class:selected={isSelected}
        style:--brand-bg={brandColor ? `${brandColor}15` : "var(--brand-muted)"}
        style:--brand={brandColor || "var(--brand-color)"}
      >
        <Icon size={20} />
      </div>

      <div class="text-content">
        <div class="title-row">
          <h3 class="title">{name}</h3>
          {#if index === 0}
            <span class="popular-badge">
              <Sparkles size={10} />
              Popular
            </span>
          {/if}
        </div>
        <p class="description">{description}</p>
      </div>

      <!-- Selection indicator -->
      <div class="selection-indicator" class:selected={isSelected}>
        {#if isSelected}
          <Check size={12} />
        {/if}
      </div>
    </div>

    <!-- Decorative gradient on selected -->
    {#if isSelected}
      <div
        class="gradient-decoration"
        style:--brand-bg={brandColor ? `${brandColor}15` : "var(--brand-color)"}
      />
    {/if}
  </Card>
</button>

<style>
  .template-card-wrapper {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    animation: fadeIn 0.5s cubic-bezier(0.23, 1, 0.32, 1) var(--delay) backwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .template-card-wrapper :global(.template-card) {
    position: relative;
    padding: var(--space-3);
    border-radius: var(--radius-xl);
    border: 2px solid hsl(var(--border));
    background: hsl(var(--card));
    transition: all 0.2s;
    overflow: hidden;
  }

  .template-card-wrapper :global(.template-card:hover) {
    border-color: color-mix(in srgb, var(--brand-color) 50%, transparent);
    background: hsl(var(--accent) / 0.3);
  }

  .template-card-wrapper :global(.template-card.selected) {
    border-color: var(--brand-color);
    background: var(--brand-muted, color-mix(in srgb, var(--brand-color) 10%, transparent));
    box-shadow: 0 1px 3px color-mix(in srgb, var(--brand-color) 10%, transparent);
  }

  .card-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    position: relative;
    z-index: 1;
  }

  .icon-wrapper {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--brand-bg);
    color: var(--brand);
    transition: transform 0.2s;
  }

  .icon-wrapper.selected {
    transform: scale(1.05);
  }

  .text-content {
    flex: 1;
    min-width: 0;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .title {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: hsl(var(--card-foreground));
    margin: 0;
  }

  .popular-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: var(--font-medium);
    background: color-mix(in srgb, var(--brand-color) 10%, transparent);
    color: var(--brand-color);
  }

  .description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-0-5) 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selection-indicator {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid hsl(var(--muted-foreground) / 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
    transition: all 0.2s;
  }

  .selection-indicator.selected {
    border-color: var(--brand-color);
    background: var(--brand-color);
    color: var(--brand-color-foreground);
  }

  .gradient-decoration {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-xl);
    pointer-events: none;
    overflow: hidden;
  }

  .gradient-decoration::before {
    content: "";
    position: absolute;
    right: -40px;
    top: -40px;
    width: 128px;
    height: 128px;
    border-radius: 50%;
    background: var(--brand-bg);
    opacity: 0.3;
    filter: blur(32px);
  }

  .gradient-decoration::after {
    content: "";
    position: absolute;
    left: -20px;
    bottom: -20px;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: var(--brand-bg);
    opacity: 0.2;
    filter: blur(24px);
  }
</style>
