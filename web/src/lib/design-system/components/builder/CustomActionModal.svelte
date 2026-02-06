<script context="module" lang="ts">
  // Re-export types for backwards compatibility
  export type { Parameter, CustomAction } from "./types";
</script>

<script lang="ts">
  import type { Parameter, CustomAction } from "./types";
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { slide } from "svelte/transition";
  import { Input, Select, SelectItem, Button, toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import parseCurl from "$lib/utils/parseCurl";
  import ApplicationVariableList from "./ApplicationVariableList.svelte";
  import RequestTester from "./RequestTester.svelte";

  export let open: boolean = false;
  export let editingAction: CustomAction | null = null;
  export let applicationId: string = "";

  const dispatch = createEventDispatcher<{
    close: void;
    submit: { action: CustomAction };
  }>();

  // Form state
  let name = "";
  let description = "";
  let endpoint = "";
  let method: CustomAction["method"] = "POST";
  let headers: Parameter[] = [];
  let queryParams: Parameter[] = [];
  let bodyParams: Parameter[] = [];
  let pathParams: Parameter[] = [];
  let activeTab: "parameters" | "headers" | "variables" = "parameters";

  // Import from cURL state
  let showCurlImport = false;
  let curlCommand = "";

  // Import/Export JSON state
  let showJsonImport = false;
  let jsonInput = "";
  let fileInputElement: HTMLInputElement;

  // Request tester state
  let showRequestTester = false;

  // Initialize from editing action
  $: if (open) {
    if (editingAction) {
      name = editingAction.name;
      description = editingAction.description;
      endpoint = editingAction.endpoint;
      method = editingAction.method;
      headers = editingAction.headers?.map(h => ({ ...h })) || [];
      queryParams = editingAction.queryParams?.map(q => ({ ...q })) || [];
      bodyParams = editingAction.bodyParams?.map(b => ({ ...b })) || [];
      pathParams = editingAction.pathParams?.map(p => ({ ...p })) || [];
    } else {
      resetForm();
    }
  }

  function resetForm() {
    name = "";
    description = "";
    endpoint = "";
    method = "POST";
    headers = [];
    queryParams = [];
    bodyParams = [];
    pathParams = [];
    activeTab = "parameters";
    showCurlImport = false;
    curlCommand = "";
    showJsonImport = false;
    jsonInput = "";
    showRequestTester = false;
  }

  // Convert parseCurl parameter to our format
  function convertParameter(p: { id?: string; key: string; value: string; isAIGenerated: boolean; aiDescription?: string }): Parameter {
    return {
      id: p.id || crypto.randomUUID(),
      key: p.key,
      value: p.value,
      isAIGenerated: p.isAIGenerated,
      aiDescription: p.aiDescription || "",
    };
  }

  // Import from cURL handler
  function handleImportCurl() {
    if (!curlCommand.trim()) {
      toasts.error("Please enter a cURL command");
      return;
    }

    try {
      const parsed = parseCurl(curlCommand);

      // Update form fields
      endpoint = parsed.url;
      method = parsed.method as CustomAction["method"];

      // Filter out empty parameters and convert
      headers = parsed.headers
        .filter(h => h.key.trim())
        .map(convertParameter);
      queryParams = parsed.queryParams
        .filter(q => q.key.trim())
        .map(convertParameter);
      bodyParams = parsed.bodyParams
        .filter(b => b.key.trim())
        .map(convertParameter);
      pathParams = parsed.pathParams
        .filter(p => p.key.trim())
        .map(convertParameter);

      // Close the import section
      showCurlImport = false;
      curlCommand = "";

      toasts.success("cURL command imported successfully");
    } catch (error) {
      captureException(error, {
        tags: { feature: "custom-actions" },
        extra: { context: "curl-import" },
      });
      toasts.error("Failed to parse cURL command");
    }
  }

  // Export to JSON file
  function handleExportJson() {
    const action = {
      name: name.trim(),
      description: description.trim(),
      endpoint: endpoint.trim(),
      method,
      headers: headers.filter(h => h.key.trim()),
      queryParams: queryParams.filter(q => q.key.trim()),
      bodyParams: bodyParams.filter(b => b.key.trim()),
      pathParams: pathParams.filter(p => p.key.trim()),
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };

    const dataStr = JSON.stringify(action, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const filename = `custom-action-${(name || "untitled").toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", filename);
    linkElement.click();

    toasts.success("Action exported to JSON");
  }

  // Import from JSON text/file
  function handleImportJson() {
    if (!jsonInput.trim()) {
      toasts.error("Please enter or paste JSON data");
      return;
    }

    try {
      const data = JSON.parse(jsonInput);

      // Populate form fields
      if (data.name) name = data.name;
      if (data.description) description = data.description;
      if (data.endpoint) endpoint = data.endpoint;
      if (data.url) endpoint = data.url; // Support 'url' as alias for 'endpoint'
      if (data.method) method = data.method as CustomAction["method"];

      // Import parameters
      if (data.headers && Array.isArray(data.headers)) {
        headers = data.headers.map((h: any) => ({
          id: h.id || crypto.randomUUID(),
          key: h.key || "",
          value: h.value || "",
          isAIGenerated: h.isAIGenerated || false,
          aiDescription: h.aiDescription || "",
        }));
      }

      if (data.queryParams && Array.isArray(data.queryParams)) {
        queryParams = data.queryParams.map((q: any) => ({
          id: q.id || crypto.randomUUID(),
          key: q.key || "",
          value: q.value || "",
          isAIGenerated: q.isAIGenerated || false,
          aiDescription: q.aiDescription || "",
        }));
      }

      if (data.bodyParams && Array.isArray(data.bodyParams)) {
        bodyParams = data.bodyParams.map((b: any) => ({
          id: b.id || crypto.randomUUID(),
          key: b.key || "",
          value: b.value || "",
          isAIGenerated: b.isAIGenerated || false,
          aiDescription: b.aiDescription || "",
        }));
      }

      if (data.pathParams && Array.isArray(data.pathParams)) {
        pathParams = data.pathParams.map((p: any) => ({
          id: p.id || crypto.randomUUID(),
          key: p.key || "",
          value: p.value || "",
          isAIGenerated: p.isAIGenerated || false,
          aiDescription: p.aiDescription || "",
        }));
      }

      showJsonImport = false;
      jsonInput = "";
      toasts.success("Action imported from JSON");
    } catch (error) {
      captureException(error, {
        tags: { feature: "custom-actions" },
        extra: { context: "json-import" },
      });
      toasts.error("Failed to parse JSON data");
    }
  }

  // Handle file upload
  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      jsonInput = content;
      handleImportJson();
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    input.value = "";
  }

  function close() {
    open = false;
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function addParameter(type: "headers" | "queryParams" | "bodyParams" | "pathParams") {
    const newParam: Parameter = {
      id: crypto.randomUUID(),
      key: "",
      value: "",
      isAIGenerated: false,
    };
    if (type === "headers") {
      headers = [...headers, newParam];
    } else if (type === "queryParams") {
      queryParams = [...queryParams, newParam];
    } else if (type === "pathParams") {
      pathParams = [...pathParams, newParam];
    } else {
      bodyParams = [...bodyParams, newParam];
    }
  }

  function updateParameter(
    type: "headers" | "queryParams" | "bodyParams" | "pathParams",
    id: string,
    field: "key" | "value" | "isAIGenerated" | "aiDescription",
    value: string | boolean
  ) {
    const update = (params: Parameter[]) =>
      params.map(p => (p.id === id ? { ...p, [field]: value } : p));

    if (type === "headers") {
      headers = update(headers);
    } else if (type === "queryParams") {
      queryParams = update(queryParams);
    } else if (type === "pathParams") {
      pathParams = update(pathParams);
    } else {
      bodyParams = update(bodyParams);
    }
  }

  function deleteParameter(type: "headers" | "queryParams" | "bodyParams" | "pathParams", id: string) {
    if (type === "headers") {
      headers = headers.filter(p => p.id !== id);
    } else if (type === "queryParams") {
      queryParams = queryParams.filter(p => p.id !== id);
    } else if (type === "pathParams") {
      pathParams = pathParams.filter(p => p.id !== id);
    } else {
      bodyParams = bodyParams.filter(p => p.id !== id);
    }
  }

  function handleSubmit() {
    if (!name.trim()) {
      toasts.error("Action name is required");
      return;
    }
    if (!description.trim()) {
      toasts.error("Description is required");
      return;
    }
    if (!endpoint.trim()) {
      toasts.error("API endpoint is required");
      return;
    }

    // Validate URL format
    try {
      new URL(endpoint);
    } catch {
      toasts.error("Invalid URL format");
      return;
    }

    const action: CustomAction = {
      id: editingAction?.id || crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      endpoint: endpoint.trim(),
      method,
      headers: headers.filter(h => h.key.trim()),
      queryParams: queryParams.filter(q => q.key.trim()),
      bodyParams: bodyParams.filter(b => b.key.trim()),
      pathParams: pathParams.filter(p => p.key.trim()),
    };

    dispatch("submit", { action });
    close();
  }

  $: showBodyParams = ["POST", "PUT", "PATCH"].includes(method);
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    class="modal-overlay"
    transition:fade={{ duration: 150 }}
    on:click={handleOverlayClick}
    role="presentation"
  >
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      transition:scale={{ duration: 150, start: 0.95 }}
    >
      <!-- Header -->
      <div class="modal-header">
        <h2 id="modal-title">{editingAction ? "Edit" : "Create"} Custom Action</h2>
        <button class="close-btn" on:click={close} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Import from cURL -->
      {#if !editingAction}
        <div class="curl-import-section">
          <button
            class="curl-import-toggle"
            on:click={() => (showCurlImport = !showCurlImport)}
            type="button"
          >
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import from cURL
            <svg
              class="chevron"
              class:rotated={showCurlImport}
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {#if showCurlImport}
            <div class="curl-import-content" transition:slide={{ duration: 150 }}>
              <textarea
                class="curl-textarea"
                placeholder={`Paste your cURL command here...

Example:
curl -X POST 'https://api.example.com/data' \\
  -H 'Authorization: Bearer token' \\
  -H 'Content-Type: application/json' \\
  -d '{"key": "value"}'
`}
                bind:value={curlCommand}
              ></textarea>
              <div class="curl-actions">
                <Button variant="ghost" size="sm" on:click={() => (showCurlImport = false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" on:click={handleImportCurl}>
                  Import
                </Button>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- JSON Import/Export -->
      <div class="json-import-section">
        <div class="json-buttons">
          {#if editingAction}
            <button
              class="json-action-btn"
              on:click={handleExportJson}
              type="button"
            >
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Export JSON
            </button>
          {/if}
          <button
            class="json-action-btn"
            on:click={() => (showJsonImport = !showJsonImport)}
            type="button"
          >
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import JSON
            <svg
              class="chevron"
              class:rotated={showJsonImport}
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {#if showJsonImport}
          <div class="json-import-content" transition:slide={{ duration: 150 }}>
            <div class="json-import-options">
              <label class="file-upload-label">
                <input
                  type="file"
                  accept=".json,application/json"
                  bind:this={fileInputElement}
                  on:change={handleFileUpload}
                  hidden
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Choose File
              </label>
              <span class="or-divider">or paste JSON below</span>
            </div>
            <textarea
              class="json-textarea"
              placeholder={`Paste exported action JSON here...

{
  "name": "My Action",
  "description": "Action description",
  "endpoint": "https://api.example.com/endpoint",
  "method": "GET",
  "headers": [],
  "queryParams": [],
  "bodyParams": []
}`}
              bind:value={jsonInput}
            ></textarea>
            <div class="json-actions">
              <Button variant="ghost" size="sm" on:click={() => { showJsonImport = false; jsonInput = ""; }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" on:click={handleImportJson}>
                Import
              </Button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Body -->
      <div class="modal-body">
        <!-- Basic Info Section -->
        <div class="section">
          <div class="form-field">
            <label for="action-name">Title *</label>
            <Input
              id="action-name"
              placeholder="e.g., Get Weather Data"
              value={name}
              on:input={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                if (target) name = target.value;
              }}
              maxlength={50}
            />
          </div>

          <div class="form-field">
            <label for="action-description">Description *</label>
            <textarea
              id="action-description"
              class="description-textarea"
              placeholder="Describe what this action does so the AI knows when to use it"
              bind:value={description}
              maxlength={500}
            ></textarea>
            <span class="char-count">{description.length}/500</span>
          </div>
        </div>

        <!-- Method & URL Section -->
        <div class="section">
          <div class="method-url-row">
            <div class="form-field method-field">
              <label for="action-method">Method *</label>
              <Select
                value={method}
                on:change={(e) => {
                  method = e.detail.value as CustomAction["method"];
                }}
              >
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </Select>
            </div>

            <div class="form-field url-field">
              <label for="action-url">URL *</label>
              <Input
                id="action-url"
                placeholder="https://api.example.com/endpoint"
                value={endpoint}
                on:input={(e) => {
                  const target = e.currentTarget as HTMLInputElement;
                  if (target) endpoint = target.value;
                }}
              />
            </div>
          </div>

          <div class="url-hint">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span>Use <code>{"{{variable}}"}</code> syntax for dynamic values the AI will provide</span>
          </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === "parameters"}
            on:click={() => (activeTab = "parameters")}
          >
            Parameters
            {#if queryParams.length > 0 || bodyParams.length > 0 || pathParams.length > 0}
              <span class="badge">{queryParams.length + bodyParams.length + pathParams.length}</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === "headers"}
            on:click={() => (activeTab = "headers")}
          >
            Headers
            {#if headers.length > 0}
              <span class="badge">{headers.length}</span>
            {/if}
          </button>
          {#if applicationId}
            <button
              class="tab"
              class:active={activeTab === "variables"}
              on:click={() => (activeTab = "variables")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" />
                <path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
              </svg>
              Variables
            </button>
          {/if}
        </div>

        <!-- Tab Content -->
        <div class="tab-content">
          {#if activeTab === "parameters"}
            <!-- Query Parameters -->
            <div class="param-section">
              <div class="param-header">
                <h4>Query Parameters</h4>
                <button class="add-param-btn" on:click={() => addParameter("queryParams")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add
                </button>
              </div>
              {#if queryParams.length === 0}
                <p class="no-params">No query parameters defined</p>
              {:else}
                <div class="params-list">
                  {#each queryParams as param (param.id)}
                    <div class="param-row">
                      <Input
                        placeholder="Key"
                        value={param.key}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("queryParams", param.id, "key", target.value);
                        }}
                      />
                      <Input
                        placeholder={param.isAIGenerated ? "AI will generate" : "Value"}
                        value={param.value}
                        disabled={param.isAIGenerated}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("queryParams", param.id, "value", target.value);
                        }}
                      />
                      <label class="ai-toggle">
                        <input
                          type="checkbox"
                          checked={param.isAIGenerated}
                          on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            updateParameter("queryParams", param.id, "isAIGenerated", target.checked);
                          }}
                        />
                        <span class="toggle-label">AI</span>
                      </label>
                      <button
                        class="delete-param-btn"
                        on:click={() => deleteParameter("queryParams", param.id)}
                        aria-label="Delete parameter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    {#if param.isAIGenerated}
                      <div class="ai-description-row">
                        <Input
                          placeholder="Describe what value the AI should provide..."
                          value={param.aiDescription || ""}
                          on:input={(e) => {
                            const target = e.currentTarget as HTMLInputElement;
                            if (target) updateParameter("queryParams", param.id, "aiDescription", target.value);
                          }}
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Body Parameters (only for POST/PUT/PATCH) -->
            {#if showBodyParams}
              <div class="param-section">
                <div class="param-header">
                  <h4>Body Parameters</h4>
                  <button class="add-param-btn" on:click={() => addParameter("bodyParams")}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add
                  </button>
                </div>
                {#if bodyParams.length === 0}
                  <p class="no-params">No body parameters defined</p>
                {:else}
                  <div class="params-list">
                    {#each bodyParams as param (param.id)}
                      <div class="param-row">
                        <Input
                          placeholder="Key"
                          value={param.key}
                          on:input={(e) => {
                            const target = e.currentTarget as HTMLInputElement;
                            if (target) updateParameter("bodyParams", param.id, "key", target.value);
                          }}
                        />
                        <Input
                          placeholder={param.isAIGenerated ? "AI will generate" : "Value"}
                          value={param.value}
                          disabled={param.isAIGenerated}
                          on:input={(e) => {
                            const target = e.currentTarget as HTMLInputElement;
                            if (target) updateParameter("bodyParams", param.id, "value", target.value);
                          }}
                        />
                        <label class="ai-toggle">
                          <input
                            type="checkbox"
                            checked={param.isAIGenerated}
                            on:change={(e) => {
                              const target = e.target as HTMLInputElement;
                              updateParameter("bodyParams", param.id, "isAIGenerated", target.checked);
                            }}
                          />
                          <span class="toggle-label">AI</span>
                        </label>
                        <button
                          class="delete-param-btn"
                          on:click={() => deleteParameter("bodyParams", param.id)}
                          aria-label="Delete parameter"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                      {#if param.isAIGenerated}
                        <div class="ai-description-row">
                          <Input
                            placeholder="Describe what value the AI should provide..."
                            value={param.aiDescription || ""}
                            on:input={(e) => {
                              const target = e.currentTarget as HTMLInputElement;
                              if (target) updateParameter("bodyParams", param.id, "aiDescription", target.value);
                            }}
                          />
                        </div>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Path Parameters -->
            {#if pathParams.length > 0}
              <div class="param-section">
                <div class="param-header">
                  <h4>Path Parameters</h4>
                  <span class="path-param-hint">Used in URL like <code>/users/{"{{userId}}"}</code></span>
                </div>
                <div class="params-list">
                  {#each pathParams as param (param.id)}
                    <div class="param-row">
                      <Input
                        placeholder="Parameter name"
                        value={param.key}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("pathParams", param.id, "key", target.value);
                        }}
                      />
                      <Input
                        placeholder={param.isAIGenerated ? "AI will generate" : "Default value"}
                        value={param.value}
                        disabled={param.isAIGenerated}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("pathParams", param.id, "value", target.value);
                        }}
                      />
                      <label class="ai-toggle">
                        <input
                          type="checkbox"
                          checked={param.isAIGenerated}
                          on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            updateParameter("pathParams", param.id, "isAIGenerated", target.checked);
                          }}
                        />
                        <span class="toggle-label">AI</span>
                      </label>
                      <button
                        class="delete-param-btn"
                        on:click={() => deleteParameter("pathParams", param.id)}
                        aria-label="Delete parameter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    {#if param.isAIGenerated}
                      <div class="ai-description-row">
                        <Input
                          placeholder="Describe what value the AI should provide..."
                          value={param.aiDescription || ""}
                          on:input={(e) => {
                            const target = e.currentTarget as HTMLInputElement;
                            if (target) updateParameter("pathParams", param.id, "aiDescription", target.value);
                          }}
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
          {:else if activeTab === "headers"}
            <!-- Headers -->
            <div class="param-section">
              <div class="param-header">
                <h4>Request Headers</h4>
                <button class="add-param-btn" on:click={() => addParameter("headers")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add
                </button>
              </div>
              {#if headers.length === 0}
                <p class="no-params">No headers defined</p>
              {:else}
                <div class="params-list">
                  {#each headers as param (param.id)}
                    <div class="param-row">
                      <Input
                        placeholder="Header name (e.g., Authorization)"
                        value={param.key}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("headers", param.id, "key", target.value);
                        }}
                      />
                      <Input
                        placeholder={param.isAIGenerated ? "AI will generate" : "Value"}
                        value={param.value}
                        disabled={param.isAIGenerated}
                        on:input={(e) => {
                          const target = e.currentTarget as HTMLInputElement;
                          if (target) updateParameter("headers", param.id, "value", target.value);
                        }}
                      />
                      <label class="ai-toggle">
                        <input
                          type="checkbox"
                          checked={param.isAIGenerated}
                          on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            updateParameter("headers", param.id, "isAIGenerated", target.checked);
                          }}
                        />
                        <span class="toggle-label">AI</span>
                      </label>
                      <button
                        class="delete-param-btn"
                        on:click={() => deleteParameter("headers", param.id)}
                        aria-label="Delete parameter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    {#if param.isAIGenerated}
                      <div class="ai-description-row">
                        <Input
                          placeholder="Describe what value the AI should provide..."
                          value={param.aiDescription || ""}
                          on:input={(e) => {
                            const target = e.currentTarget as HTMLInputElement;
                            if (target) updateParameter("headers", param.id, "aiDescription", target.value);
                          }}
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {:else if activeTab === "variables"}
            <!-- Variables -->
            <div class="variables-tab-content">
              <div class="variables-intro">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span>Variables can be used across all custom actions. Reference them in values using <code>{"{{variableName}}"}</code></span>
              </div>
              <ApplicationVariableList
                {applicationId}
                on:variableSelect={(e) => {
                  // Copy variable reference to clipboard
                  const variableRef = `{{${e.detail.name}}}`;
                  navigator.clipboard.writeText(variableRef);
                  toasts.success(`Copied ${variableRef} to clipboard`);
                }}
              />
            </div>
          {/if}
        </div>

        <!-- Request Tester Section -->
        {#if applicationId && endpoint}
          <div class="request-tester-section">
            <button
              class="tester-toggle"
              on:click={() => (showRequestTester = !showRequestTester)}
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Test Request
              <svg
                class="chevron"
                class:rotated={showRequestTester}
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {#if showRequestTester}
              <div class="tester-container" transition:slide={{ duration: 200 }}>
                <RequestTester
                  {applicationId}
                  url={endpoint}
                  {method}
                  headers={headers.map((h) => ({
                    key: h.key,
                    value: h.value,
                    sampleValue: h.aiDescription,
                    isAIGenerated: h.isAIGenerated,
                  }))}
                  queryParams={queryParams.map((q) => ({
                    key: q.key,
                    value: q.value,
                    sampleValue: q.aiDescription,
                    isAIGenerated: q.isAIGenerated,
                  }))}
                  bodyParams={bodyParams.map((b) => ({
                    key: b.key,
                    value: b.value,
                    sampleValue: b.aiDescription,
                    isAIGenerated: b.isAIGenerated,
                  }))}
                  pathParams={pathParams.map((p) => ({
                    key: p.key,
                    value: p.value,
                    sampleValue: p.aiDescription,
                    isAIGenerated: p.isAIGenerated,
                  }))}
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <Button variant="ghost" on:click={close}>Cancel</Button>
        <Button variant="primary" on:click={handleSubmit}>
          {editingAction ? "Update" : "Create"} Action
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 700px;
    max-height: 90vh;
    margin: var(--space-4);
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  /* cURL Import Section */
  .curl-import-section {
    padding: var(--space-3) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .curl-import-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .curl-import-toggle:hover {
    color: var(--text-primary);
    border-color: var(--color-primary);
  }

  .curl-import-toggle .chevron {
    margin-left: auto;
    transition: transform 0.2s ease;
  }

  .curl-import-toggle .chevron.rotated {
    transform: rotate(180deg);
  }

  .curl-import-content {
    margin-top: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
  }

  .curl-textarea {
    width: 100%;
    min-height: 120px;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-family: monospace;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    resize: vertical;
  }

  .curl-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .curl-textarea::placeholder {
    color: var(--text-tertiary);
  }

  .curl-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  /* JSON Import/Export Section */
  .json-import-section {
    padding: var(--space-3) var(--space-6);
    border-bottom: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  .json-buttons {
    display: flex;
    gap: var(--space-2);
  }

  .json-action-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .json-action-btn:hover {
    color: var(--text-primary);
    border-color: var(--color-primary);
  }

  .json-action-btn .chevron {
    margin-left: auto;
    transition: transform 0.2s ease;
  }

  .json-action-btn .chevron.rotated {
    transform: rotate(180deg);
  }

  .json-import-content {
    margin-top: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
  }

  .json-import-options {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .file-upload-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px dashed var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .file-upload-label:hover {
    color: var(--text-primary);
    border-color: var(--color-primary);
    background: var(--bg-secondary);
  }

  .or-divider {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .json-textarea {
    width: 100%;
    min-height: 140px;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-family: monospace;
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    resize: vertical;
  }

  .json-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .json-textarea::placeholder {
    color: var(--text-tertiary);
  }

  .json-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6);
  }

  .section {
    padding: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .form-field:last-child {
    margin-bottom: 0;
  }

  .form-field label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .description-textarea {
    width: 100%;
    min-height: 80px;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-family: inherit;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    resize: vertical;
  }

  .description-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
  }

  .char-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: right;
  }

  .method-url-row {
    display: flex;
    gap: var(--space-3);
  }

  .method-field {
    width: 120px;
    flex-shrink: 0;
  }

  .url-field {
    flex: 1;
  }

  .url-hint {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    background: var(--bg-primary);
    border-radius: var(--radius-md);
  }

  .url-hint code {
    padding: 2px 6px;
    font-family: monospace;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tab:hover {
    background: var(--bg-tertiary);
  }

  .tab.active {
    color: white;
    background: var(--color-primary);
  }

  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
    background: rgba(79, 70, 229, 0.15);
    border-radius: 9px;
  }

  .tab.active .badge {
    color: white;
    background: rgba(255, 255, 255, 0.2);
  }

  .tab-content {
    min-height: 200px;
  }

  .param-section {
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .param-section:last-child {
    margin-bottom: 0;
  }

  .param-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .param-header h4 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .path-param-hint {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .path-param-hint code {
    padding: 2px 4px;
    font-family: monospace;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
  }

  .add-param-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-primary);
    background: transparent;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-param-btn:hover {
    background: var(--color-primary);
    color: white;
  }

  .no-params {
    margin: 0;
    padding: var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    text-align: center;
    background: var(--bg-primary);
    border-radius: var(--radius-md);
    border: 1px dashed var(--border-primary);
  }

  .params-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .param-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .param-row :global(input) {
    flex: 1;
  }

  .ai-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    white-space: nowrap;
  }

  .ai-toggle input {
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .ai-toggle:has(input:checked) {
    color: var(--color-primary);
    background: rgba(79, 70, 229, 0.1);
    border-color: var(--color-primary);
  }

  .toggle-label {
    font-weight: 500;
  }

  .delete-param-btn {
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

  .delete-param-btn:hover {
    background: var(--bg-tertiary);
    color: var(--color-error);
  }

  .ai-description-row {
    margin-top: var(--space-2);
    margin-left: 0;
    padding-left: var(--space-2);
    border-left: 2px solid var(--color-primary);
  }

  .ai-description-row :global(input) {
    font-size: var(--text-xs);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-secondary);
  }

  /* Variables Tab */
  .variables-tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .variables-intro {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-primary);
  }

  .variables-intro svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-primary);
  }

  .variables-intro code {
    padding: 2px 6px;
    font-family: monospace;
    font-size: var(--text-xs);
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
  }

  /* Request Tester Section */
  .request-tester-section {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-primary);
  }

  .tester-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tester-toggle:hover {
    background: var(--bg-tertiary);
    border-color: var(--color-primary);
  }

  .tester-toggle svg:first-child {
    color: var(--color-primary);
  }

  .tester-toggle .chevron {
    margin-left: auto;
    color: var(--text-tertiary);
    transition: transform 0.2s ease;
  }

  .tester-toggle .chevron.rotated {
    transform: rotate(180deg);
  }

  .tester-container {
    margin-top: var(--space-3);
  }

  @media (max-width: 640px) {
    .modal-content {
      margin: var(--space-2);
      max-height: 95vh;
    }

    .method-url-row {
      flex-direction: column;
    }

    .method-field {
      width: 100%;
    }

    .param-row {
      flex-wrap: wrap;
    }

    .param-row :global(input) {
      min-width: 120px;
    }
  }
</style>
