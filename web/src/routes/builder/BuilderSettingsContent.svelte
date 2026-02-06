<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { push } from "svelte-spa-router";
  import { captureException } from "$lib/sentry";
  import { Card, Button, toasts, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "$lib/design-system";
  import { AlertTriangle, Languages, Trash2 } from "lucide-svelte";

  const dispatch = createEventDispatcher<{ reload: void; deleted: void }>();

  export let appId: string;
  export let app: {
    id: string;
    name: string;
    language?: string;
    text_direction?: string;
  };

  let isSaving = false;

  // Language settings
  let selectedLanguage = app?.language || "EN";
  let isRTL = app?.text_direction === "RTL";

  // Delete confirmation
  let deleteDialogOpen = false;
  let deleteConfirmText = "";
  let isDeleting = false;

  const LANGUAGES = [
    { value: "EN", label: "English" },
    { value: "ES", label: "Spanish" },
    { value: "FR", label: "French" },
    { value: "DE", label: "German" },
    { value: "PT", label: "Portuguese" },
    { value: "IT", label: "Italian" },
    { value: "NL", label: "Dutch" },
    { value: "PL", label: "Polish" },
    { value: "RU", label: "Russian" },
    { value: "JA", label: "Japanese" },
    { value: "KO", label: "Korean" },
    { value: "ZH", label: "Chinese" },
    { value: "AR", label: "Arabic" },
    { value: "HE", label: "Hebrew" },
    { value: "HI", label: "Hindi" },
    { value: "TH", label: "Thai" },
    { value: "VI", label: "Vietnamese" },
    { value: "TR", label: "Turkish" },
    { value: "UK", label: "Ukrainian" },
    { value: "CS", label: "Czech" },
  ];

  // Sync with app prop changes
  $: if (app) {
    selectedLanguage = app.language || "EN";
    isRTL = app.text_direction === "RTL";
  }

  async function saveLanguage() {
    if (!app) return;

    try {
      isSaving = true;
      const response = await fetch(`/api/applications/${app.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedLanguage,
          textDirection: isRTL ? "RTL" : "LTR",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save language settings");
      }

      toasts.success("Saved", "Language settings updated");
      dispatch("reload");
    } catch (e) {
      captureException(e, { tags: { feature: "builder-settings" }, extra: { action: "save-language", appId: app?.id, language: selectedLanguage } });
      toasts.error("Error", "Failed to save language settings");
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!app || deleteConfirmText !== app.name) {
      toasts.error("Error", "Please type the app name to confirm deletion");
      return;
    }

    try {
      isDeleting = true;
      const response = await fetch(`/api/applications/${app.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete app");
      }

      toasts.success("Deleted", "Application has been deleted");
      dispatch("deleted");
    } catch (e) {
      captureException(e, { tags: { feature: "builder-settings" }, extra: { action: "delete-app", appId: app?.id } });
      toasts.error("Error", "Failed to delete application");
    } finally {
      isDeleting = false;
      deleteDialogOpen = false;
    }
  }

  function openDeleteDialog() {
    deleteConfirmText = "";
    deleteDialogOpen = true;
  }
</script>

<div class="settings-content">
  <div class="settings-grid">
    <!-- Language Card -->
    <Card padding="lg" class="settings-card">
      <div class="card-header">
        <div class="card-icon">
          <Languages size={20} />
        </div>
        <div>
          <h3>Language</h3>
          <p class="card-description">This is the language users see when interacting with your app</p>
        </div>
      </div>

      <div class="card-content">
        <div class="form-group">
          <label for="language">Display Language</label>
          <select
            id="language"
            bind:value={selectedLanguage}
            on:change={saveLanguage}
            class="select-input"
          >
            {#each LANGUAGES as lang}
              <option value={lang.value}>{lang.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <div class="checkbox-row">
            <input
              type="checkbox"
              id="rtl"
              bind:checked={isRTL}
              on:change={saveLanguage}
            />
            <label for="rtl">
              <span class="checkbox-label">Right-to-left text direction</span>
              <span class="checkbox-description">Enable for languages like Arabic, Hebrew, etc.</span>
            </label>
          </div>
        </div>
      </div>
    </Card>

    <!-- Danger Zone Card -->
    <Card padding="lg" class="settings-card danger-card">
      <div class="card-header">
        <div class="card-icon danger">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h3>Danger Zone</h3>
          <p class="card-description">Irreversible actions for this application</p>
        </div>
      </div>

      <div class="card-content">
        <div class="danger-action">
          <div>
            <strong>Delete this application</strong>
            <p>Once deleted, this application and all its data will be permanently removed.</p>
          </div>
          <Button variant="danger" on:click={openDeleteDialog}>
            <Trash2 size={16} />
            Delete App
          </Button>
        </div>
      </div>
    </Card>
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog bind:open={deleteDialogOpen}>
  <DialogHeader>
    <DialogTitle>Delete Application</DialogTitle>
    <DialogDescription>
      This action cannot be undone. This will permanently delete the application
      <strong>{app?.name}</strong> and all associated data.
    </DialogDescription>
  </DialogHeader>

  <div class="delete-confirm-input">
    <label for="confirm-delete">
      Type <strong>{app?.name}</strong> to confirm:
    </label>
    <input
      id="confirm-delete"
      type="text"
      bind:value={deleteConfirmText}
      placeholder="Enter app name"
      class="text-input"
    />
  </div>

  <DialogFooter>
    <Button variant="ghost" on:click={() => deleteDialogOpen = false}>
      Cancel
    </Button>
    <Button
      variant="danger"
      on:click={handleDelete}
      disabled={deleteConfirmText !== app?.name || isDeleting}
    >
      {#if isDeleting}
        Deleting...
      {:else}
        Delete Application
      {/if}
    </Button>
  </DialogFooter>
</Dialog>

<style>
  .settings-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 800px;
  }

  .settings-card :global(.card) {
    background: hsl(var(--card));
  }

  .card-header {
    display: flex;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .card-icon.danger {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .card-header h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .card-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0 0;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .form-group label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .select-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .select-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
  }

  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
  }

  .checkbox-row input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    cursor: pointer;
  }

  .checkbox-row label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    cursor: pointer;
  }

  .checkbox-label {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .checkbox-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .danger-card :global(.card) {
    border: 1px solid hsl(var(--destructive) / 0.3);
  }

  .danger-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
  }

  .danger-action strong {
    display: block;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-1);
  }

  .danger-action p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .delete-confirm-input {
    padding: var(--space-4);
  }

  .delete-confirm-input label {
    display: block;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .text-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
  }

  .text-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
  }

  @media (max-width: 768px) {
    .settings-content {
      padding: var(--space-4);
    }

    .danger-action {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
