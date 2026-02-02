<script lang="ts">
  /**
   * LeadGenForm
   *
   * Renders a lead generation form for consumer chat.
   * Supports email, phone, and text field types with validation.
   * Shows skip button if all fields are optional.
   */
  import { createEventDispatcher } from 'svelte';

  interface FormField {
    name: string;
    type: 'text' | 'email' | 'phone';
    icon?: string;
    required: boolean;
    ordinal: number;
  }

  interface LeadGenFormData {
    id: number;
    applicationId: number;
    active: boolean;
    formPrompt: string | null;
    name: string;
    description: string | null;
    fields: FormField[];
  }

  export let form: LeadGenFormData;
  export let chatSessionId: string;
  export let canSkip: boolean | undefined = undefined;

  const dispatch = createEventDispatcher<{
    submit: { formData: Record<string, string>; chatSessionId: string };
    skip: void;
  }>();

  let formData: Record<string, string> = {};

  // Map field types to input types
  const mapValidationTypes: Record<string, string> = {
    email: 'email',
    phone: 'tel',
    text: 'text',
  };

  // Sort fields by ordinal
  $: sortedFields = [...(form.fields || [])].sort((a, b) => a.ordinal - b.ordinal);

  // Check if all fields are optional
  $: allFieldsOptional = sortedFields.every((field) => !field.required);

  // Check if all required fields are filled
  $: allRequiredFieldsFilled = sortedFields.every(
    (field) => !field.required || !!formData[field.name]?.trim()
  );

  // Determine if submit should be disabled
  $: isSubmitDisabled = !allRequiredFieldsFilled;

  // Show skip button if explicitly allowed or all fields are optional
  $: showSkipButton = canSkip ?? allFieldsOptional;

  function handleInputChange(fieldName: string, value: string) {
    formData = {
      ...formData,
      [fieldName]: value,
    };
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    dispatch('submit', { formData, chatSessionId });
  }

  function handleSkip() {
    dispatch('skip');
  }
</script>

<div class="lead-gen-form-container">
  <div class="lead-gen-form-content">
    {#if form.formPrompt}
      <p class="form-prompt">{form.formPrompt}</p>
    {/if}

    <form on:submit={handleSubmit}>
      <div class="form-fields-container">
        <div class="form-fields">
          {#each sortedFields as field (field.name)}
            <div class="form-field">
              <label for="field-{field.name}">
                {field.name}{field.required ? '*' : ''}
              </label>
              <input
                id="field-{field.name}"
                type={mapValidationTypes[field.type] || 'text'}
                placeholder="Enter {field.name}"
                required={field.required}
                value={formData[field.name] || ''}
                on:input={(e) => handleInputChange(field.name, e.currentTarget.value)}
              />
            </div>
          {/each}
        </div>
      </div>

      <div class="form-actions">
        {#if showSkipButton}
          <button type="button" class="skip-button" on:click={handleSkip}>
            Skip
          </button>
        {:else}
          <div></div>
        {/if}
        <button
          type="submit"
          class="submit-button"
          disabled={isSubmitDisabled}
          class:disabled={isSubmitDisabled}
        >
          Continue
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .lead-gen-form-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    margin-top: 4rem;
    font-family: var(--font-sans, system-ui, sans-serif);
    color: hsl(var(--foreground));
  }

  .lead-gen-form-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 300px;
  }

  @media (min-width: 1024px) {
    .lead-gen-form-content {
      width: 400px;
    }
  }

  .form-prompt {
    text-align: left;
    margin: 0;
    font-size: var(--text-base);
    line-height: 1.5;
  }

  .form-fields-container {
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    padding: 1rem;
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-field label {
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    font-weight: var(--font-medium);
  }

  .form-field input {
    width: 100%;
    height: 2.5rem;
    padding: 0.75rem;
    font-size: var(--text-sm);
    background-color: hsl(var(--muted));
    border: 2px solid hsl(var(--border));
    border-radius: 1rem;
    color: hsl(var(--foreground));
    transition: border-color 0.2s ease-in-out;
  }

  .form-field input:focus {
    outline: none;
    border-color: var(--consumer-primary, hsl(var(--primary)));
  }

  .form-field input::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .form-actions {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.5rem;
  }

  .skip-button {
    padding: 0.5rem 0.75rem;
    font-size: var(--text-sm);
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s;
  }

  .skip-button:hover {
    background-color: hsl(var(--muted));
  }

  .submit-button {
    padding: 0.5rem 0.75rem;
    font-size: var(--text-sm);
    background-color: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: var(--radius-xl);
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.2s;
  }

  .submit-button:hover:not(.disabled) {
    opacity: 0.9;
  }

  .submit-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
