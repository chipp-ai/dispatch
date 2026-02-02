<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import { Button, Input, Label, Textarea, Select, SelectItem } from "./index";
  import { get } from "svelte/store";
  import { workspaces } from "../../../stores/workspace";
  import { toasts } from "../stores/toast";
  import { MODELS, DEFAULT_MODEL_ID } from "./builder/modelConfig";

  export let open: boolean = false;

  const dispatch = createEventDispatcher();

  let name = "";
  let description = "";
  let systemPrompt = "";
  let workspaceId = "";
  let modelId = DEFAULT_MODEL_ID;
  let isPublic = false;
  let loading = false;

  function close() {
    open = false;
    name = "";
    description = "";
    systemPrompt = "";
    workspaceId = "";
    modelId = DEFAULT_MODEL_ID;
    isPublic = false;
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toasts.error("Name required", "Please enter an app name");
      return;
    }

    const workspace = get(workspaces).find((w) => w.id === workspaceId);
    if (!workspace) {
      toasts.error("Workspace required", "Please select a workspace");
      return;
    }

    loading = true;
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          workspaceId: workspaceId || workspace.id,
          modelId: modelId,
          isPublic: isPublic,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create app");
      }

      const result = await response.json();
      toasts.success("App created", `${name} has been created`);
      dispatch("success", result.data);
      close();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create app";
      toasts.error("Failed to create app", message);
    } finally {
      loading = false;
    }
  }

  // Set default workspace when available
  $: {
    const ws = get(workspaces);
    if (ws.length > 0 && !workspaceId) {
      workspaceId = ws[0].id;
    }
  }
</script>

<Modal bind:open on:close={close}>
  <div class="modal-header">
    <h2>Create New App</h2>
    <p class="modal-description">
      Create a new AI application. You can customize settings after creation.
    </p>
  </div>

  <form on:submit|preventDefault={handleSubmit} class="modal-form">
    <div class="form-field">
      <Label for="app-name">Name *</Label>
      <Input
        id="app-name"
        bind:value={name}
        placeholder="My AI App"
        required
        disabled={loading}
      />
    </div>

    <div class="form-field">
      <Label for="app-description">Description</Label>
      <Textarea
        id="app-description"
        bind:value={description}
        placeholder="What does this app do?"
        rows={3}
        disabled={loading}
      />
    </div>

    <div class="form-field">
      <Label for="app-workspace">Workspace</Label>
      <Select
        id="app-workspace"
        bind:value={workspaceId}
        disabled={loading}
        on:change={(e) => {
          if (e.detail?.value) {
            workspaceId = e.detail.value;
          }
        }}
      >
        {#each $workspaces as workspace}
          <SelectItem value={workspace.id} selected={workspaceId === workspace.id}>
            {workspace.name}
          </SelectItem>
        {/each}
      </Select>
    </div>

    <div class="form-field">
      <Label for="app-model">Model</Label>
      <Select
        id="app-model"
        bind:value={modelId}
        disabled={loading}
        on:change={(e) => {
          if (e.detail?.value) {
            modelId = e.detail.value;
          }
        }}
      >
        {#each MODELS as model}
          <SelectItem value={model.id} selected={modelId === model.id}>{model.name}</SelectItem>
        {/each}
      </Select>
    </div>

    <div class="modal-footer">
      <Button
        type="button"
        variant="outline"
        on:click={close}
        disabled={loading}
      >
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? "Creating..." : "Create App"}
      </Button>
    </div>
  </form>
</Modal>

<style>
  .modal-header {
    margin-bottom: var(--space-6);
  }

  .modal-header h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-2) 0;
  }

  .modal-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
</style>

