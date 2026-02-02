<script lang="ts">
  /**
   * StreamingAnimationCard
   *
   * Builder settings card for configuring streaming text animation.
   * Controls how text appears during AI response streaming.
   */
  import BuilderCard from "./BuilderCard.svelte";
  import { Switch, Slider, Select, SelectItem } from "$lib/design-system";
  import type {
    AnimationType,
    AnimationTokenize,
    AnimationTimingFunction,
  } from "$lib/design-system/components/chat/types";

  // Props
  export let enabled: boolean = true;
  export let type: AnimationType = "fade";
  export let duration: number = 100;
  export let tokenize: AnimationTokenize = "char";
  export let timingFunction: AnimationTimingFunction = "ease-out";
  export let preserveNewlines: boolean = true;

  // Callbacks
  export let onEnabledChange: (value: boolean) => void = () => {};
  export let onTypeChange: (value: AnimationType) => void = () => {};
  export let onDurationChange: (value: number) => void = () => {};
  export let onTokenizeChange: (value: AnimationTokenize) => void = () => {};
  export let onTimingFunctionChange: (value: AnimationTimingFunction) => void = () => {};
  export let onPreserveNewlinesChange: (value: boolean) => void = () => {};

  // Animation type options
  const animationTypes: { value: AnimationType; label: string; description: string }[] = [
    { value: "fade", label: "Fade", description: "Smooth fade in effect" },
    { value: "blur", label: "Blur", description: "Focus from blur effect" },
    { value: "slideUp", label: "Slide Up", description: "Slide in from below" },
    { value: "slideDown", label: "Slide Down", description: "Slide in from above" },
  ];

  // Tokenize options
  const tokenizeOptions: { value: AnimationTokenize; label: string; description: string }[] = [
    { value: "char", label: "Character", description: "Animate each character" },
    { value: "word", label: "Word", description: "Animate each word" },
  ];

  // Timing function options
  const timingOptions: { value: AnimationTimingFunction; label: string }[] = [
    { value: "ease-out", label: "Ease Out" },
    { value: "ease", label: "Ease" },
    { value: "ease-in", label: "Ease In" },
    { value: "ease-in-out", label: "Ease In-Out" },
    { value: "linear", label: "Linear" },
  ];
</script>

<BuilderCard title="Text Effects" rightIcon="dropdown" defaultOpen={false}>
  <div class="form">
    <!-- Enable Toggle -->
    <div class="toggle-field">
      <div class="toggle-info">
        <label>Enable Animation</label>
        <p class="description">Animate text as it streams in</p>
      </div>
      <Switch
        checked={enabled}
        on:change={(e) => onEnabledChange(e.detail)}
      />
    </div>

    {#if enabled}
      <div class="divider"></div>

      <!-- Animation Type -->
      <div class="field">
        <div class="label-row">
          <label>Animation Type</label>
          <span class="tooltip" title="The visual effect when text appears">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
        </div>
        <Select value={type} on:change={(e) => onTypeChange(e.detail as AnimationType)}>
          {#each animationTypes as option}
            <SelectItem value={option.value}>{option.label}</SelectItem>
          {/each}
        </Select>
        <p class="helper-text">{animationTypes.find(t => t.value === type)?.description}</p>
      </div>

      <!-- Duration Slider -->
      <div class="field">
        <div class="label-row">
          <label>Duration</label>
          <span class="tooltip" title="How long each animation takes">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
          <span class="value-display">{duration}ms</span>
        </div>
        <Slider
          value={duration}
          min={50}
          max={500}
          step={10}
          on:change={(e) => onDurationChange(e.detail)}
        />
        <div class="slider-labels">
          <span>Fast</span>
          <span>Slow</span>
        </div>
      </div>

      <!-- Tokenize By -->
      <div class="field">
        <div class="label-row">
          <label>Tokenize By</label>
          <span class="tooltip" title="Whether to animate characters or words">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
        </div>
        <Select value={tokenize} on:change={(e) => onTokenizeChange(e.detail as AnimationTokenize)}>
          {#each tokenizeOptions as option}
            <SelectItem value={option.value}>{option.label}</SelectItem>
          {/each}
        </Select>
        <p class="helper-text">{tokenizeOptions.find(t => t.value === tokenize)?.description}</p>
      </div>

      <!-- Timing Function -->
      <div class="field">
        <div class="label-row">
          <label>Timing Function</label>
          <span class="tooltip" title="The easing curve for the animation">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
        </div>
        <Select value={timingFunction} on:change={(e) => onTimingFunctionChange(e.detail as AnimationTimingFunction)}>
          {#each timingOptions as option}
            <SelectItem value={option.value}>{option.label}</SelectItem>
          {/each}
        </Select>
      </div>

      <div class="divider"></div>

      <!-- Preserve Newlines Toggle -->
      <div class="toggle-field">
        <div class="toggle-info">
          <label>Preserve Newlines</label>
          <p class="description">Keep single line breaks in AI responses</p>
        </div>
        <Switch
          checked={preserveNewlines}
          on:change={(e) => onPreserveNewlinesChange(e.detail)}
        />
      </div>
    {/if}
  </div>
</BuilderCard>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .tooltip {
    color: var(--text-tertiary);
    cursor: help;
    display: flex;
    align-items: center;
  }

  .tooltip:hover {
    color: var(--text-secondary);
  }

  .value-display {
    margin-left: auto;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: var(--color-primary-alpha);
    padding: 2px var(--space-2);
    border-radius: var(--radius-md);
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .helper-text {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    margin: 0;
  }

  .divider {
    height: 1px;
    background: var(--border-primary);
    margin: var(--space-2) 0;
  }

  .toggle-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-info label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .description {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    margin: 0;
  }
</style>
