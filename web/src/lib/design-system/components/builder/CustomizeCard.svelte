<script lang="ts">
  import BuilderCard from "./BuilderCard.svelte";
  import { Switch, Slider } from "$lib/design-system";

  export let temperature: number = 0.7;
  export let maxTokens: number = 4096;
  export let streamResponses: boolean = true;
  export let requireAuth: boolean = false;
  export let showSources: boolean = true;

  export let onTemperatureChange: (value: number) => void = () => {};
  export let onMaxTokensChange: (value: number) => void = () => {};
  export let onStreamResponsesChange: (value: boolean) => void = () => {};
  export let onRequireAuthChange: (value: boolean) => void = () => {};
  export let onShowSourcesChange: (value: boolean) => void = () => {};
</script>

<BuilderCard title="Behavior" rightIcon="dropdown" defaultOpen={false}>
  <div class="form">
    <div class="field">
      <div class="label-row">
        <label>Temperature</label>
        <span class="tooltip" title="Controls randomness in responses. Lower = more focused, Higher = more creative">
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
        <span class="value-display">{temperature.toFixed(1)}</span>
      </div>
      <Slider
        value={temperature}
        min={0}
        max={2}
        step={0.1}
        on:change={(e) => onTemperatureChange(e.detail)}
      />
      <div class="slider-labels">
        <span>Focused</span>
        <span>Creative</span>
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label>Max Tokens</label>
        <span class="tooltip" title="Maximum length of AI responses">
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
        <span class="value-display">{maxTokens.toLocaleString()}</span>
      </div>
      <Slider
        value={maxTokens}
        min={256}
        max={16384}
        step={256}
        on:change={(e) => onMaxTokensChange(e.detail)}
      />
      <div class="slider-labels">
        <span>Shorter</span>
        <span>Longer</span>
      </div>
    </div>

    <div class="divider"></div>

    <div class="toggle-field">
      <div class="toggle-info">
        <label>Stream Responses</label>
        <p class="description">Show responses as they're generated</p>
      </div>
      <Switch
        checked={streamResponses}
        on:change={(e) => onStreamResponsesChange(e.detail)}
      />
    </div>

    <div class="toggle-field">
      <div class="toggle-info">
        <label>Require Authentication</label>
        <p class="description">Users must sign in to chat</p>
      </div>
      <Switch
        checked={requireAuth}
        on:change={(e) => onRequireAuthChange(e.detail)}
      />
    </div>

    <div class="toggle-field">
      <div class="toggle-info">
        <label>Show Sources</label>
        <p class="description">Display knowledge source citations</p>
      </div>
      <Switch
        checked={showSources}
        on:change={(e) => onShowSourcesChange(e.detail)}
      />
    </div>
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
