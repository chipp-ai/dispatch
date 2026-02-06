<script context="module" lang="ts">
  // Re-export types for backwards compatibility
  export type { VariableType, ApplicationVariable } from "./types";
</script>

<script lang="ts">
  import type { VariableType, ApplicationVariable } from "./types";
  import { createEventDispatcher } from "svelte";
  import { slide } from "svelte/transition";
  import { Input, Select, SelectItem, Button, toasts } from "$lib/design-system";
  import { api } from "$lib/api";
  import { captureException } from "$lib/sentry";

  export let applicationId: string;

  const dispatch = createEventDispatcher<{
    variableSelect: { name: string };
  }>();

  let variables: ApplicationVariable[] = [];
  let loading = true;
  let saving = false;
  let isAddingVariable = false;
  let showValues: Record<string, boolean> = {};

  // New variable form
  let newVariable: Omit<ApplicationVariable, "id" | "applicationId"> = {
    name: "",
    label: "",
    type: "string",
    description: "",
    required: false,
    placeholder: "",
    value: "",
  };

  // Fetch variables on mount
  $: if (applicationId) {
    fetchVariables();
  }

  async function fetchVariables() {
    try {
      loading = true;
      const response = await api.get<{ data: ApplicationVariable[] }>(
        `/applications/${applicationId}/variables`
      );
      variables = response.data;
    } catch (error) {
      captureException(error, {
        tags: { feature: "application-variables" },
        extra: { applicationId },
      });
      toasts.error("Failed to load variables");
    } finally {
      loading = false;
    }
  }

  function isValidVariableName(name: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  async function handleAddVariable() {
    if (!newVariable.name) {
      toasts.error("Variable name is required");
      return;
    }
    if (!isValidVariableName(newVariable.name)) {
      toasts.error("Name must start with a letter or underscore and contain only letters, numbers, and underscores");
      return;
    }
    if (variables.some(v => v.name === newVariable.name)) {
      toasts.error("Variable name must be unique");
      return;
    }
    if (!newVariable.label) {
      toasts.error("Label is required");
      return;
    }

    try {
      saving = true;
      const response = await api.post<{ data: ApplicationVariable }>(
        `/applications/${applicationId}/variables`,
        newVariable
      );
      variables = [...variables, response.data];
      resetNewVariable();
      isAddingVariable = false;
      toasts.success("Variable created");
    } catch (error) {
      captureException(error, {
        tags: { feature: "application-variables" },
        extra: { applicationId, variableName: newVariable.name },
      });
      toasts.error("Failed to create variable");
    } finally {
      saving = false;
    }
  }

  async function handleUpdateVariable(variable: ApplicationVariable) {
    try {
      saving = true;
      await api.patch(`/variables/${variable.id}`, {
        name: variable.name,
        label: variable.label,
        type: variable.type,
        description: variable.description,
        required: variable.required,
        placeholder: variable.placeholder,
        value: variable.value,
      });
      toasts.success("Variable updated");
    } catch (error) {
      captureException(error, {
        tags: { feature: "application-variables" },
        extra: { variableId: variable.id },
      });
      toasts.error("Failed to update variable");
      fetchVariables(); // Refresh to get original values
    } finally {
      saving = false;
    }
  }

  async function handleDeleteVariable(variable: ApplicationVariable) {
    try {
      await api.delete(`/variables/${variable.id}`);
      variables = variables.filter(v => v.id !== variable.id);
      toasts.success("Variable deleted");
    } catch (error) {
      captureException(error, {
        tags: { feature: "application-variables" },
        extra: { variableId: variable.id },
      });
      toasts.error("Failed to delete variable");
    }
  }

  function resetNewVariable() {
    newVariable = {
      name: "",
      label: "",
      type: "string",
      description: "",
      required: false,
      placeholder: "",
      value: "",
    };
  }

  function toggleShowValue(id: string) {
    showValues = { ...showValues, [id]: !showValues[id] };
  }

  function selectVariable(name: string) {
    dispatch("variableSelect", { name });
  }
</script>

<div class="variable-list">
  <div class="header">
    <div class="title-row">
      <h4>Application Variables</h4>
      <button
        class="info-icon"
        title="Define variables that can be used across all custom actions. Set values here for development/production use."
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading variables...</div>
  {:else}
    {#if variables.length === 0 && !isAddingVariable}
      <p class="empty-message">
        No variables defined. Create variables to reuse values across your custom actions.
      </p>
    {/if}

    <div class="variables">
      {#each variables as variable (variable.id)}
        <div class="variable-card">
          <div class="variable-row">
            <div class="field name-field">
              <label>Name</label>
              <Input
                value={variable.name}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) variable.name = target.value;
                }}
                placeholder="API_KEY"
              />
              <span class="variable-syntax">{`{{var.${variable.name || "NAME"}}}`}</span>
            </div>

            <div class="field label-field">
              <label>Label</label>
              <Input
                value={variable.label}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) variable.label = target.value;
                }}
                placeholder="API Key"
              />
            </div>

            <div class="field type-field">
              <label>Type</label>
              <Select
                value={variable.type}
                on:change={(e) => {
                  variable.type = e.detail.value as VariableType;
                }}
              >
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="secret">Secret</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </Select>
            </div>

            <div class="field value-field">
              <label>Value</label>
              <div class="value-input-row">
                <Input
                  value={variable.value || ""}
                  type={variable.type === "secret" && !showValues[variable.id] ? "password" : "text"}
                  on:input={(e) => {
                    const target = e.currentTarget as HTMLInputElement;
                    if (target) variable.value = target.value;
                  }}
                  placeholder={variable.placeholder || "Enter value..."}
                />
                {#if variable.type === "secret"}
                  <button
                    class="toggle-visibility-btn"
                    on:click={() => toggleShowValue(variable.id)}
                    type="button"
                    aria-label={showValues[variable.id] ? "Hide value" : "Show value"}
                  >
                    {#if showValues[variable.id]}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    {:else}
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    {/if}
                  </button>
                {/if}
              </div>
            </div>
          </div>

          <div class="variable-footer">
            <label class="required-toggle">
              <input
                type="checkbox"
                checked={variable.required}
                on:change={(e) => {
                  const target = e.target as HTMLInputElement;
                  variable.required = target.checked;
                }}
              />
              <span>Required</span>
            </label>

            <div class="actions">
              <Button variant="ghost" size="sm" on:click={() => selectVariable(variable.name)}>
                Use
              </Button>
              <Button variant="ghost" size="sm" on:click={() => handleUpdateVariable(variable)}>
                Save
              </Button>
              <button
                class="delete-btn"
                on:click={() => handleDeleteVariable(variable)}
                aria-label="Delete variable"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      {/each}

      {#if isAddingVariable}
        <div class="variable-card new-variable" transition:slide={{ duration: 150 }}>
          <div class="variable-row">
            <div class="field name-field">
              <label>Name *</label>
              <Input
                value={newVariable.name}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) newVariable.name = target.value;
                }}
                placeholder="API_KEY"
              />
              {#if newVariable.name}
                <span class="variable-syntax">{`{{var.${newVariable.name}}}`}</span>
              {/if}
            </div>

            <div class="field label-field">
              <label>Label *</label>
              <Input
                value={newVariable.label}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) newVariable.label = target.value;
                }}
                placeholder="API Key"
              />
            </div>

            <div class="field type-field">
              <label>Type</label>
              <Select
                value={newVariable.type}
                on:change={(e) => {
                  newVariable.type = e.detail.value as VariableType;
                }}
              >
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="secret">Secret</SelectItem>
                <SelectItem value="url">URL</SelectItem>
              </Select>
            </div>

            <div class="field value-field">
              <label>Initial Value</label>
              <Input
                value={newVariable.value || ""}
                type={newVariable.type === "secret" ? "password" : "text"}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) newVariable.value = target.value;
                }}
                placeholder="Enter value..."
              />
            </div>
          </div>

          <div class="variable-footer">
            <label class="required-toggle">
              <input
                type="checkbox"
                checked={newVariable.required}
                on:change={(e) => {
                  const target = e.target as HTMLInputElement;
                  newVariable.required = target.checked;
                }}
              />
              <span>Required</span>
            </label>

            <div class="actions">
              <Button variant="ghost" size="sm" on:click={() => { resetNewVariable(); isAddingVariable = false; }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" on:click={handleAddVariable} disabled={saving}>
                Add Variable
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if !isAddingVariable}
      <button class="add-variable-btn" on:click={() => (isAddingVariable = true)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Variable
      </button>
    {/if}
  {/if}
</div>

<style>
  .variable-list {
    padding: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .header {
    margin-bottom: var(--space-4);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .title-row h4 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text-primary);
  }

  .info-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: help;
  }

  .loading {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-message {
    margin: 0;
    padding: var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    text-align: center;
    background: var(--bg-primary);
    border-radius: var(--radius-md);
    border: 1px dashed var(--border-primary);
  }

  .variables {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .variable-card {
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
  }

  .variable-card.new-variable {
    border-color: var(--color-primary);
    border-width: 2px;
  }

  .variable-row {
    display: grid;
    grid-template-columns: 1.5fr 1fr 0.8fr 1.5fr;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--text-primary);
  }

  .variable-syntax {
    font-size: var(--text-xs);
    font-family: monospace;
    color: var(--text-tertiary);
  }

  .value-input-row {
    display: flex;
    gap: var(--space-1);
  }

  .value-input-row :global(input) {
    flex: 1;
  }

  .toggle-visibility-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .toggle-visibility-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .variable-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .required-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .required-toggle input {
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .delete-btn:hover {
    background: var(--bg-tertiary);
    color: var(--color-error);
  }

  .add-variable-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-variable-btn:hover {
    background: var(--color-primary);
    color: white;
  }

  @media (max-width: 768px) {
    .variable-row {
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    .name-field {
      grid-column: 1 / 2;
    }

    .label-field {
      grid-column: 2 / 3;
    }

    .type-field {
      grid-column: 1 / 2;
    }

    .value-field {
      grid-column: 2 / 3;
    }
  }
</style>
