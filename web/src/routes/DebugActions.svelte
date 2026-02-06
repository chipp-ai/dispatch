<script lang="ts">
  /**
   * Action Collections Debug Tool
   *
   * Visual debugging tool for tracking data transformations in the action collection flow.
   * Allows importing JSON action manifests and testing the full import/export pipeline.
   */

  import { onMount } from "svelte";
  import { params as routeParams } from "svelte-spa-router";
  import { captureException } from "$lib/sentry";
  import { api } from "../lib/api";
  import { currentUser } from "../stores/auth";
  import { currentWorkspace } from "../stores/workspace";
  import { push } from "svelte-spa-router";
  import Button from "../lib/design-system/components/Button.svelte";
  import Card from "../lib/design-system/components/Card.svelte";
  import Input from "../lib/design-system/components/Input.svelte";
  import Badge from "../lib/design-system/components/Badge.svelte";

  // State
  let loading = false;
  let error: string | null = null;
  let activeStep: "import" | "publish" | "importToApp" = "import";

  // Import state
  let fileInput: HTMLInputElement;
  let rawData: Record<string, unknown> | null = null;
  let parsedActions: Array<{
    name: string;
    url: string;
    method: string;
    description?: string;
    headers?: unknown[];
    queryParams?: unknown[];
    bodyParams?: unknown[];
    pathParams?: unknown[];
  }> = [];
  let importedTools: Array<{
    id: string;
    name: string;
    slug: string;
  }> = [];
  let importErrors: string[] = [];

  // Publish state
  let collectionName = "";
  let collectionId: string | null = null;
  let createdActionTemplates: unknown[] = [];
  let extractedVariables: unknown[] = [];
  let publishErrors: string[] = [];

  // Import to app state
  let targetAppId = "";
  let linkedCollection = false;
  let importedToApp: unknown[] = [];
  let importToAppErrors: string[] = [];

  // JSON viewer state
  let expandedSections = new Set<string>();
  let showRawJson = false;

  // Get current app ID from route params
  $: appId = $routeParams?.appId;

  function toggleSection(id: string) {
    if (expandedSections.has(id)) {
      expandedSections.delete(id);
    } else {
      expandedSections.add(id);
    }
    expandedSections = expandedSections;
  }

  async function handleFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const manifest = JSON.parse(text);

      console.log("[DEBUG] Raw manifest:", manifest);

      // Try different locations for customActions
      let actions = null;
      let foundLocation = null;

      if (manifest.customActions && Array.isArray(manifest.customActions)) {
        actions = manifest.customActions;
        foundLocation = "root.customActions";
      } else if (
        manifest.manifest?.customActions &&
        Array.isArray(manifest.manifest.customActions)
      ) {
        actions = manifest.manifest.customActions;
        foundLocation = "root.manifest.customActions";
      } else if (manifest.actions && Array.isArray(manifest.actions)) {
        actions = manifest.actions;
        foundLocation = "root.actions";
      } else if (Array.isArray(manifest)) {
        actions = manifest;
        foundLocation = "root (array)";
      }

      if (!actions) {
        throw new Error(
          `Could not find customActions array in JSON. Keys found: ${Object.keys(manifest).join(", ")}`
        );
      }

      rawData = manifest;
      parsedActions = actions;
      importErrors = [];

      console.log(`[DEBUG] Found ${actions.length} actions at ${foundLocation}`);
    } catch (err) {
      captureException(err, { tags: { page: "debug", feature: "import-parse" } });
      importErrors = [err instanceof Error ? err.message : "Failed to parse JSON"];
      rawData = null;
      parsedActions = [];
    }
  }

  async function simulateImportToApp() {
    if (!appId) {
      error = "No application context available";
      return;
    }

    loading = true;
    error = null;

    try {
      const imported: typeof importedTools = [];
      const errors: string[] = [];

      for (const action of parsedActions) {
        try {
          // Create the action as a user defined tool via API
          const response = await api.post<{
            data: { id: string; name: string; slug: string };
          }>(`/api/applications/${appId}/tools`, {
            title: action.name,
            description: action.description || "",
            url: action.url,
            method: action.method,
            headers: action.headers || [],
            queryParams: action.queryParams || [],
            bodyParams: action.bodyParams || [],
            pathParams: action.pathParams || [],
          });

          if (response.data) {
            imported.push(response.data);
            console.log("[DEBUG] Created tool:", response.data);
          }
        } catch (err) {
          const msg = `Failed to create ${action.name}: ${err instanceof Error ? err.message : "Unknown error"}`;
          errors.push(msg);
          captureException(err, { tags: { page: "debug", feature: "create-tool" } });
        }
      }

      importedTools = imported;
      importErrors = [...importErrors, ...errors];

      if (imported.length > 0) {
        activeStep = "publish";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to import tools";
    } finally {
      loading = false;
    }
  }

  async function publishToCollection() {
    if (!collectionName.trim()) {
      publishErrors = ["Please enter a collection name"];
      return;
    }

    if (!importedTools.length) {
      publishErrors = ["No tools available to publish"];
      return;
    }

    loading = true;
    error = null;

    try {
      // Create the collection
      const collectionResponse = await api.post<{
        data: { id: string; name: string; slug: string };
      }>("/api/action-collections", {
        name: collectionName,
        description: "Debug collection created from JSON import",
        sharingScope: "PRIVATE",
        workspaceId: $currentWorkspace?.id,
      });

      if (!collectionResponse.data) {
        throw new Error("Failed to create collection");
      }

      collectionId = collectionResponse.data.id;
      console.log("[DEBUG] Created collection:", collectionResponse.data);

      // Import tools to collection
      const toolIds = importedTools.map((t) => t.id);

      const importResponse = await api.post<{
        imported: number;
        variables?: unknown[];
      }>(`/api/action-collections/${collectionId}/actions`, {
        toolIds,
      });

      console.log("[DEBUG] Import result:", importResponse);

      extractedVariables = importResponse.variables || [];
      publishErrors = [];
      activeStep = "importToApp";
    } catch (err) {
      publishErrors = [err instanceof Error ? err.message : "Publishing failed"];
    } finally {
      loading = false;
    }
  }

  async function importCollectionToApp() {
    if (!targetAppId.trim()) {
      importToAppErrors = ["Please enter a target application ID"];
      return;
    }

    if (!collectionId) {
      importToAppErrors = ["No collection available to import"];
      return;
    }

    loading = true;
    error = null;

    try {
      // Link the collection to the app
      await api.post(`/api/applications/${targetAppId}/action-collections`, {
        collectionId,
        authConfig: {},
      });

      console.log("[DEBUG] Collection linked successfully");
      linkedCollection = true;

      // Import the tools
      const importResponse = await api.post<{
        imported: number;
        tools?: unknown[];
      }>(`/api/applications/${targetAppId}/action-collections/${collectionId}/import-tools`, {});

      console.log("[DEBUG] Import to app result:", importResponse);

      importedToApp = importResponse.tools || [];
      importToAppErrors = [];
    } catch (err) {
      importToAppErrors = [err instanceof Error ? err.message : "Import failed"];
    } finally {
      loading = false;
    }
  }

  async function resetImportedTools() {
    if (!importedTools.length) return;

    if (
      !confirm(
        `Are you sure you want to remove ${importedTools.length} imported tools? This cannot be undone.`
      )
    ) {
      return;
    }

    loading = true;
    let successCount = 0;
    let errorCount = 0;

    for (const tool of importedTools) {
      try {
        await api.delete(`/api/applications/${appId}/tools/${tool.id}`);
        successCount++;
      } catch (err) {
        captureException(err, { tags: { page: "debug", feature: "delete-tool" }, extra: { toolName: tool.name } });
        errorCount++;
      }
    }

    // Reset state
    rawData = null;
    parsedActions = [];
    importedTools = [];
    importErrors = [];
    collectionName = "";
    collectionId = null;
    createdActionTemplates = [];
    extractedVariables = [];
    publishErrors = [];
    targetAppId = "";
    linkedCollection = false;
    importedToApp = [];
    importToAppErrors = [];
    activeStep = "import";

    loading = false;

    console.log(`[DEBUG] Reset: ${successCount} removed, ${errorCount} failed`);
  }

  function clearState() {
    rawData = null;
    parsedActions = [];
    importedTools = [];
    importErrors = [];
    collectionName = "";
    collectionId = null;
    createdActionTemplates = [];
    extractedVariables = [];
    publishErrors = [];
    targetAppId = "";
    linkedCollection = false;
    importedToApp = [];
    importToAppErrors = [];
    activeStep = "import";

    if (fileInput) {
      fileInput.value = "";
    }
  }

  function formatJson(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
</script>

<div class="min-h-screen overflow-y-auto">
  <div class="container mx-auto p-6 max-w-7xl">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h1 class="text-3xl font-bold mb-2">Action Collections Debug Tool</h1>
          <p class="text-muted-foreground">
            Visual debugging tool for tracking data transformations in the action
            collection flow
          </p>
          <div class="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
            <p class="text-sm text-blue-700">
              Current App ID: <strong>{appId}</strong>
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          {#if importedTools.length > 0}
            <Button variant="destructive" size="sm" on:click={resetImportedTools}>
              Reset ({importedTools.length} tools)
            </Button>
          {/if}
          <Button variant="outline" size="sm" on:click={clearState}>
            Clear State
          </Button>
        </div>
      </div>
    </div>

    <!-- Progress Steps -->
    <div class="flex items-center justify-between mb-8 p-4 bg-muted/50 rounded-lg">
      <button
        class="flex items-center gap-2 {activeStep === 'import'
          ? 'text-blue-600 font-medium'
          : 'text-muted-foreground'}"
        on:click={() => (activeStep = "import")}
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span>Import JSON</span>
      </button>
      <svg
        class="w-5 h-5 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M14 5l7 7m0 0l-7 7m7-7H3"
        />
      </svg>
      <button
        class="flex items-center gap-2 {activeStep === 'publish'
          ? 'text-blue-600 font-medium'
          : 'text-muted-foreground'}"
        on:click={() => (activeStep = "publish")}
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <span>Publish to Collection</span>
      </button>
      <svg
        class="w-5 h-5 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M14 5l7 7m0 0l-7 7m7-7H3"
        />
      </svg>
      <button
        class="flex items-center gap-2 {activeStep === 'importToApp'
          ? 'text-blue-600 font-medium'
          : 'text-muted-foreground'}"
        on:click={() => (activeStep = "importToApp")}
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        <span>Import to App</span>
      </button>
    </div>

    <!-- Error Display -->
    {#if error}
      <div class="p-4 mb-6 bg-red-50 border border-red-200 rounded text-red-700">
        {error}
      </div>
    {/if}

    <!-- Step 1: Import JSON -->
    {#if activeStep === "import"}
      <Card title="Import Actions from JSON">
        <div class="space-y-4 p-4">
          <!-- File upload -->
          <div>
            <label class="block text-sm font-medium mb-2">Upload JSON Manifest</label>
            <input
              bind:this={fileInput}
              type="file"
              accept=".json"
              on:change={handleFileImport}
              class="hidden"
            />
            <Button
              variant="outline"
              on:click={() => fileInput?.click()}
              class="w-full"
            >
              Choose JSON File
            </Button>
          </div>

          <!-- Import to app button -->
          {#if parsedActions.length > 0}
            <div class="space-y-2">
              {#if !importedTools.length}
                <div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p class="text-sm text-yellow-800 font-medium">Next Step Required</p>
                  <p class="text-xs text-yellow-700 mt-1">
                    Click the button below to import these actions as tools in your
                    current app.
                  </p>
                </div>
              {/if}
              <Button
                on:click={simulateImportToApp}
                class="w-full"
                disabled={loading || importedTools.length > 0}
              >
                {#if importedTools.length > 0}
                  Already Imported {importedTools.length} Tools
                {:else if loading}
                  Importing...
                {:else}
                  Import {parsedActions.length} Actions to Current App
                {/if}
              </Button>
            </div>
          {/if}

          <!-- Display parsed data -->
          {#if rawData}
            <div class="border-t pt-4 mt-4 space-y-4">
              <!-- Raw JSON Toggle -->
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-medium">Raw JSON Data</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  on:click={() => (showRawJson = !showRawJson)}
                >
                  {showRawJson ? "Hide" : "Show"}
                </Button>
              </div>

              {#if showRawJson}
                <div class="max-h-[300px] overflow-auto border rounded p-2 bg-muted">
                  <pre class="text-xs font-mono whitespace-pre-wrap break-all"
                    >{formatJson(rawData)}</pre
                  >
                </div>
              {/if}

              <!-- Parsed Actions List -->
              <div>
                <h4 class="text-sm font-medium mb-2">
                  Parsed Actions ({parsedActions.length})
                </h4>
                <div class="space-y-2">
                  {#each parsedActions as action, idx}
                    <div class="p-2 border rounded text-sm">
                      <div class="font-medium">{action.name}</div>
                      <div class="text-xs text-muted-foreground">
                        {action.method} {action.url}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Imported Tools -->
              {#if importedTools.length > 0}
                <div>
                  <h4 class="text-sm font-medium mb-2 text-green-600">
                    Successfully Imported ({importedTools.length})
                  </h4>
                  <div class="space-y-2">
                    {#each importedTools as tool}
                      <div
                        class="p-2 border border-green-200 rounded text-sm bg-green-50"
                      >
                        <div class="font-medium">{tool.name}</div>
                        <div class="text-xs text-muted-foreground">
                          ID: {tool.id} | Slug: {tool.slug}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Errors -->
              {#if importErrors.length > 0}
                <div class="p-4 bg-red-50 border border-red-200 rounded">
                  <h4 class="text-sm font-medium text-red-700 mb-2">Errors</h4>
                  {#each importErrors as err}
                    <div class="text-xs text-red-600">{err}</div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </Card>
    {/if}

    <!-- Step 2: Publish to Collection -->
    {#if activeStep === "publish"}
      <Card title="Publish to Collection">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2">Collection Name</label>
            <Input
              bind:value={collectionName}
              placeholder="Enter collection name"
            />
          </div>

          <!-- Status Info -->
          <div class="p-3 bg-muted rounded text-xs space-y-1">
            <p>
              <strong>Status:</strong>
              {#if !parsedActions.length}
                <span class="text-red-600">No JSON loaded</span>
              {:else if !importedTools.length}
                <span class="text-yellow-600">
                  JSON loaded ({parsedActions.length} actions) - Import to app
                  first
                </span>
              {:else}
                <span class="text-green-600">
                  {importedTools.length} tools ready to publish
                </span>
              {/if}
            </p>
            <p><strong>Parsed actions:</strong> {parsedActions.length}</p>
            <p><strong>Imported tools:</strong> {importedTools.length}</p>
            {#if importedTools.length > 0}
              <p>
                <strong>Tool IDs:</strong>
                {importedTools.map((t) => t.id).join(", ")}
              </p>
            {/if}
          </div>

          <Button
            on:click={publishToCollection}
            class="w-full"
            disabled={loading || !importedTools.length || !collectionName}
          >
            {#if loading}
              Publishing...
            {:else}
              Publish {importedTools.length} Tools to Collection
            {/if}
          </Button>

          <!-- Created Collection Info -->
          {#if collectionId}
            <div class="p-3 bg-green-50 border border-green-200 rounded">
              <p class="text-sm text-green-700">
                Collection created: <strong>{collectionId}</strong>
              </p>
            </div>
          {/if}

          <!-- Errors -->
          {#if publishErrors.length > 0}
            <div class="p-4 bg-red-50 border border-red-200 rounded">
              <h4 class="text-sm font-medium text-red-700 mb-2">Errors</h4>
              {#each publishErrors as err}
                <div class="text-xs text-red-600">{err}</div>
              {/each}
            </div>
          {/if}
        </div>
      </Card>
    {/if}

    <!-- Step 3: Import to App -->
    {#if activeStep === "importToApp"}
      <Card title="Import Collection to Another App">
        <div class="space-y-4 p-4">
          <div>
            <label class="block text-sm font-medium mb-2"
              >Target Application ID</label
            >
            <Input
              bind:value={targetAppId}
              type="number"
              placeholder="Enter target application ID"
            />
          </div>

          <Button
            on:click={importCollectionToApp}
            class="w-full"
            disabled={loading || !collectionId || !targetAppId}
          >
            {#if loading}
              Importing...
            {:else}
              Import Collection to App
            {/if}
          </Button>

          <!-- Success Info -->
          {#if linkedCollection}
            <div class="p-3 bg-green-50 border border-green-200 rounded">
              <p class="text-sm text-green-700">
                Collection linked to app <strong>{targetAppId}</strong>
              </p>
              {#if importedToApp.length > 0}
                <p class="text-xs text-green-600 mt-1">
                  {importedToApp.length} tools imported
                </p>
              {/if}
            </div>
          {/if}

          <!-- Errors -->
          {#if importToAppErrors.length > 0}
            <div class="p-4 bg-red-50 border border-red-200 rounded">
              <h4 class="text-sm font-medium text-red-700 mb-2">Errors</h4>
              {#each importToAppErrors as err}
                <div class="text-xs text-red-600">{err}</div>
              {/each}
            </div>
          {/if}
        </div>
      </Card>
    {/if}

    <!-- Debug State Viewer -->
    <Card title="Complete Debug State" class="mt-8">
      <div class="p-4">
        <div class="max-h-[600px] overflow-auto border rounded p-4 bg-muted">
          <pre class="text-xs font-mono whitespace-pre-wrap break-all">{formatJson(
              {
                activeStep,
                jsonImport: {
                  hasRawData: !!rawData,
                  parsedActionsCount: parsedActions.length,
                  importedToolsCount: importedTools.length,
                  importedTools: importedTools,
                  errors: importErrors,
                },
                publishing: {
                  collectionName,
                  collectionId,
                  extractedVariablesCount: extractedVariables.length,
                  errors: publishErrors,
                },
                importing: {
                  targetAppId,
                  linkedCollection,
                  importedToAppCount: importedToApp.length,
                  errors: importToAppErrors,
                },
              }
            )}</pre>
        </div>
      </div>
    </Card>
  </div>
</div>

<style>
  .text-muted-foreground {
    color: var(--color-text-secondary, #6b7280);
  }

  .bg-muted {
    background-color: var(--color-bg-secondary, #f3f4f6);
  }

  .bg-muted\/50 {
    background-color: rgba(var(--color-bg-secondary-rgb, 243, 244, 246), 0.5);
  }
</style>
