<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import {
    KNOWN_MCP_PROVIDERS,
    AGGREGATOR_ONLY_PROVIDERS,
    type McpProvider,
    type AggregatorOnlyProvider,
  } from "$lib/mcp/mcpProviders";

  export let open = false;
  export let applicationId: string | null = null;

  const dispatch = createEventDispatcher();

  type Screen = "grid" | "detail" | "configure";

  let screen: Screen = "grid";
  let selectedProvider: McpProvider | null = null;
  let searchText = "";

  // Configure screen state
  let configUrl = "";
  let configTransport: "http" | "sse" = "http";
  let configAuthType = "";
  let configToken = "";
  let configApiKey = "";
  let configApiKeyName = "X-API-Key";

  // Tool discovery state
  let discoveredTools: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
  let selectedTools: Record<string, boolean> = {};
  let testLoading = false;
  let testError = "";
  let testDurationMs = 0;

  // Save state
  let saveLoading = false;
  let saveError = "";
  let saveSuccess = false;

  // Existing integrations
  let existingIntegrations: Array<{
    id: number;
    name: string | null;
    mcpServerUrl: string;
    mcpAuthType: string;
    isActive: boolean;
    actions: Array<{ remoteToolName: string | null }>;
  }> = [];

  // Category mapping
  type VisualCategory = "crm" | "dev" | "productivity" | "data" | "comms" | "other";

  const categoryMap: Record<string, VisualCategory> = {
    CRM: "crm",
    "Customer Support": "crm",
    SEO: "data",
    Productivity: "productivity",
    Monitoring: "dev",
    "Enterprise Storage": "data",
    CMS: "productivity",
    Automation: "dev",
    RAG: "data",
    "Data Analysis": "data",
    "Web Data": "data",
    Payments: "crm",
    "E-Commerce": "crm",
    Communication: "comms",
    "Software Development": "dev",
    "AI Platform": "dev",
    "Service Discovery": "dev",
    Forecasting: "data",
  };

  function getVisualCategory(provider: McpProvider | AggregatorOnlyProvider): VisualCategory {
    const cat = provider.category;
    if (cat && categoryMap[cat]) return categoryMap[cat];
    return "other";
  }

  // Filtering
  $: query = searchText.toLowerCase().trim();

  $: filteredProviders = KNOWN_MCP_PROVIDERS.filter((p) => {
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.key.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  });

  $: filteredAggregators = AGGREGATOR_ONLY_PROVIDERS.filter((p) => {
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.key.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    );
  });

  // Group by visual category
  $: crmProviders = filteredProviders.filter((p) => getVisualCategory(p) === "crm");
  $: devProviders = filteredProviders.filter((p) => getVisualCategory(p) === "dev");
  $: productivityProviders = filteredProviders.filter((p) => getVisualCategory(p) === "productivity");
  $: dataProviders = filteredProviders.filter((p) => getVisualCategory(p) === "data");
  $: commsProviders = filteredProviders.filter((p) => getVisualCategory(p) === "comms");
  $: otherProviders = filteredProviders.filter((p) => getVisualCategory(p) === "other");
  $: isEmpty = filteredProviders.length === 0 && filteredAggregators.length === 0;

  function handleSelectProvider(provider: McpProvider) {
    selectedProvider = provider;

    // Check if already connected
    const existing = existingIntegrations.find(
      (i) => i.mcpServerUrl === provider.serverUrl
    );

    if (existing) {
      // Pre-populate with existing config
      configUrl = provider.serverUrl;
      configTransport = provider.transport;
      configAuthType = existing.mcpAuthType || provider.defaultAuthType || "";
      // Pre-fill discovered tools from existing actions
      discoveredTools = existing.actions
        .filter((a) => a.remoteToolName)
        .map((a) => ({ name: a.remoteToolName! }));
      selectedTools = {};
      for (const action of existing.actions) {
        if (action.remoteToolName) {
          selectedTools[action.remoteToolName] = true;
        }
      }
      screen = "configure";
    } else {
      screen = "detail";
    }
  }

  function handleConnectFromDetail() {
    if (!selectedProvider) return;
    // Pre-fill from provider metadata
    configUrl = selectedProvider.serverUrl;
    configTransport = selectedProvider.transport;
    configAuthType = selectedProvider.defaultAuthType || "";
    configToken = "";
    configApiKey = "";
    configApiKeyName = "X-API-Key";
    discoveredTools = [];
    selectedTools = {};
    testError = "";
    saveError = "";
    saveSuccess = false;
    screen = "configure";
  }

  async function handleTestConnection() {
    if (!applicationId) {
      testError = "No application selected";
      return;
    }

    testLoading = true;
    testError = "";
    discoveredTools = [];
    selectedTools = {};

    const authConfig: Record<string, string> = {};
    if (configAuthType === "BEARER" && configToken) {
      authConfig.token = configToken;
    } else if (configAuthType === "API_KEY" && configApiKey) {
      authConfig.apiKey = configApiKey;
      authConfig.apiKeyName = configApiKeyName;
    }

    try {
      const res = await fetch("/api/integrations/mcp/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId,
          serverUrl: configUrl,
          transport: configTransport,
          authType: configAuthType,
          authConfig,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        testError = data.error || "Connection failed";
      } else {
        discoveredTools = data.tools || [];
        testDurationMs = data.durationMs || 0;
        // Auto-select all tools
        selectedTools = {};
        for (const tool of discoveredTools) {
          selectedTools[tool.name] = true;
        }
      }
    } catch (err) {
      testError = err instanceof Error ? err.message : "Network error";
    } finally {
      testLoading = false;
    }
  }

  async function handleSave() {
    if (!applicationId || !selectedProvider) return;

    saveLoading = true;
    saveError = "";
    saveSuccess = false;

    const authConfig: Record<string, string> = {};
    if (configAuthType === "BEARER" && configToken) {
      authConfig.token = configToken;
    } else if (configAuthType === "API_KEY" && configApiKey) {
      authConfig.apiKey = configApiKey;
      authConfig.apiKeyName = configApiKeyName;
    }

    const tools = discoveredTools
      .filter((t) => selectedTools[t.name])
      .map((t) => ({
        name: t.name,
        schemaSnapshot: t.inputSchema || undefined,
      }));

    // Find existing integration for this server URL
    const existing = existingIntegrations.find(
      (i) => i.mcpServerUrl === selectedProvider!.serverUrl
    );

    try {
      const res = await fetch("/api/integrations/mcp/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId,
          integrationId: existing?.id,
          name: selectedProvider.name + " MCP",
          logo: selectedProvider.iconUrl || undefined,
          serverUrl: configUrl,
          transport: configTransport,
          authType: configAuthType,
          authConfig,
          selectedTools: tools,
          isActive: true,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        saveError = data.error || "Save failed";
      } else {
        saveSuccess = true;
        // Refresh integrations list
        await loadIntegrations();
        dispatch("saved", { integration: data.integration });
        // After a brief success message, go back to grid
        setTimeout(() => {
          screen = "grid";
          selectedProvider = null;
          saveSuccess = false;
        }, 1500);
      }
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Network error";
    } finally {
      saveLoading = false;
    }
  }

  async function loadIntegrations() {
    if (!applicationId) return;
    try {
      const res = await fetch(
        `/api/integrations/mcp?applicationId=${applicationId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      existingIntegrations = data.data || [];
    } catch {
      // Silently fail on list
    }
  }

  function handleBack() {
    if (screen === "configure") {
      screen = "detail";
    } else if (screen === "detail") {
      screen = "grid";
      selectedProvider = null;
    } else {
      handleClose();
    }
  }

  function handleClose() {
    open = false;
    screen = "grid";
    selectedProvider = null;
    searchText = "";
    configToken = "";
    configApiKey = "";
    discoveredTools = [];
    selectedTools = {};
    testError = "";
    saveError = "";
    saveSuccess = false;
  }

  function getAuthLabel(provider: McpProvider): string {
    if (provider.oauth || provider.appLevelOauth) return "OAuth";
    switch (provider.defaultAuthType) {
      case "BEARER": return "API Key";
      case "API_KEY": return "API Key";
      case "BASIC": return "Basic Auth";
      case "CUSTOM_HEADER": return "Custom";
      default: return "No Auth";
    }
  }

  function isProviderConnected(provider: McpProvider): boolean {
    return existingIntegrations.some((i) => i.mcpServerUrl === provider.serverUrl && i.isActive);
  }

  $: selectedToolCount = Object.values(selectedTools).filter(Boolean).length;

  // Portal
  let portalContainer: HTMLDivElement;

  onMount(() => {
    portalContainer = document.createElement("div");
    portalContainer.className = "pro-action-portal";
    document.body.appendChild(portalContainer);
  });

  onDestroy(() => {
    portalContainer?.remove();
  });

  function portal(node: HTMLElement) {
    portalContainer.appendChild(node);
    return {
      destroy() {
        node.parentNode?.removeChild(node);
      },
    };
  }

  // Load integrations when open
  $: if (open && applicationId) {
    loadIntegrations();
  }

  // Lock body scroll
  $: if (typeof document !== "undefined") {
    document.body.style.overflow = open ? "hidden" : "";
  }

  // Escape to close/back
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (screen === "configure" || screen === "detail") {
        handleBack();
      } else {
        handleClose();
      }
    }
  }

  $: if (typeof window !== "undefined") {
    if (open) {
      window.addEventListener("keydown", handleKeydown);
    } else {
      window.removeEventListener("keydown", handleKeydown);
    }
  }
</script>

{#if open}
  <div use:portal class="pa-overlay" on:click|self={handleClose} role="presentation">
    <div class="pa-modal" role="dialog" aria-modal="true" on:click|stopPropagation>

      {#if screen === "grid"}
        <!-- Grid Screen -->
        <button class="pa-close-btn" on:click={handleClose} aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>

        <div class="pa-container">
          <div class="pa-grid-lines" aria-hidden="true"></div>

          <div class="pa-header">
            <div class="pa-header-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3" stroke-width="1.5" />
                <circle cx="12" cy="4" r="1.5" stroke-width="1.5" />
                <circle cx="4" cy="12" r="1.5" stroke-width="1.5" />
                <circle cx="20" cy="12" r="1.5" stroke-width="1.5" />
                <circle cx="12" cy="20" r="1.5" stroke-width="1.5" />
                <path d="M12 9V5.5" stroke-width="1" stroke-linecap="round" opacity="0.6" />
                <path d="M12 18.5V15" stroke-width="1" stroke-linecap="round" opacity="0.6" />
                <path d="M9 12H5.5" stroke-width="1" stroke-linecap="round" opacity="0.6" />
                <path d="M18.5 12H15" stroke-width="1" stroke-linecap="round" opacity="0.6" />
              </svg>
            </div>
            <h2 class="pa-title">Tools</h2>
            <p class="pa-description">
              Extend your AI with powerful integrations and real-world capabilities
            </p>
          </div>

          <div class="pa-search-container">
            <div class="pa-search-wrapper">
              <svg class="pa-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                class="pa-search-input"
                placeholder="Search integrations..."
                bind:value={searchText}
              />
            </div>
          </div>

          <div class="pa-grid-scroll">
            {#if isEmpty}
              <div class="pa-empty">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                  <rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />
                </svg>
                <p>No integrations match your search</p>
              </div>
            {:else}
              {#each [
                { key: "crm", label: "CRM & Sales", items: crmProviders },
                { key: "dev", label: "Development", items: devProviders },
                { key: "productivity", label: "Productivity", items: productivityProviders },
                { key: "data", label: "Data & Storage", items: dataProviders },
                { key: "comms", label: "Communication", items: commsProviders },
                { key: "other", label: "Other", items: otherProviders },
              ] as section}
                {#if section.items.length > 0}
                  <div class="pa-category">
                    <div class="pa-category-header">
                      <span class="pa-category-label">{section.label}</span>
                      <div class="pa-category-line"></div>
                      <span class="pa-category-count">{section.items.length}</span>
                    </div>
                    <div class="pa-provider-grid">
                      {#each section.items as provider, i (provider.key)}
                        <button
                          class="pa-provider-card"
                          class:pa-connected={isProviderConnected(provider)}
                          data-category={section.key}
                          style="animation-delay: {0.03 + i * 0.03}s"
                          on:click={() => handleSelectProvider(provider)}
                        >
                          {#if isProviderConnected(provider)}
                            <span class="pa-connected-badge">Connected</span>
                          {:else if provider.oauth || provider.appLevelOauth}
                            <span class="pa-oauth-badge">OAuth</span>
                          {/if}
                          <div class="pa-card-icon">
                            {#if provider.iconUrl}
                              <img src={provider.iconUrl} alt={provider.name} width="26" height="26" />
                            {:else}
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            {/if}
                          </div>
                          <span class="pa-card-label">{provider.name}</span>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              {/each}

              {#if filteredAggregators.length > 0}
                <div class="pa-category">
                  <div class="pa-category-header">
                    <span class="pa-category-label">Via Aggregators</span>
                    <div class="pa-category-line"></div>
                    <span class="pa-category-count">{filteredAggregators.length}</span>
                  </div>
                  <div class="pa-provider-grid">
                    {#each filteredAggregators as provider, i (provider.key)}
                      <div
                        class="pa-provider-card pa-aggregator-card"
                        data-category="custom"
                        style="animation-delay: {0.03 + i * 0.03}s"
                      >
                        <span class="pa-oauth-badge">Aggregator</span>
                        <div class="pa-card-icon">
                          {#if provider.iconUrl}
                            <img src={provider.iconUrl} alt={provider.name} width="26" height="26" />
                          {:else}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                          {/if}
                        </div>
                        <span class="pa-card-label">{provider.name}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        </div>

      {:else if screen === "detail" && selectedProvider}
        <!-- Detail Screen -->
        <div class="pa-container pa-detail">
          <div class="pa-grid-lines" aria-hidden="true"></div>

          <button class="pa-back-btn" on:click={handleBack} aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <button class="pa-close-btn" on:click={handleClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <div class="pa-detail-header">
            <div class="pa-detail-icon">
              {#if selectedProvider.iconUrl}
                <img src={selectedProvider.iconUrl} alt={selectedProvider.name} width="48" height="48" />
              {/if}
            </div>
            <h2 class="pa-title">{selectedProvider.name}</h2>
            <div class="pa-badges">
              {#if selectedProvider.category}
                <span class="pa-meta-badge">{selectedProvider.category}</span>
              {/if}
              {#if selectedProvider.maintainer}
                <span class="pa-meta-badge">by {selectedProvider.maintainer}</span>
              {/if}
              <span class="pa-meta-badge pa-auth-type-badge">
                {getAuthLabel(selectedProvider)}
              </span>
            </div>

            {#if selectedProvider.description}
              <p class="pa-detail-desc">{selectedProvider.description}</p>
            {:else}
              <p class="pa-detail-desc">Connect {selectedProvider.name} to your AI assistant via MCP.</p>
            {/if}
          </div>

          <div class="pa-detail-content">
            {#if selectedProvider.useCases && selectedProvider.useCases.length > 0}
              <div class="pa-detail-section">
                <h3 class="pa-section-title">Use Cases</h3>
                <div class="pa-use-cases">
                  {#each selectedProvider.useCases as useCase}
                    <div class="pa-use-case">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pa-check-icon">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{useCase}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedProvider.tools && selectedProvider.tools.length > 0}
              <div class="pa-detail-section">
                <h3 class="pa-section-title">
                  Available Tools
                  <span class="pa-tool-count">{selectedProvider.tools.length}</span>
                </h3>
                <div class="pa-tool-list">
                  {#each selectedProvider.tools as tool}
                    <div class="pa-tool-item">
                      <div class="pa-tool-dot"></div>
                      <div class="pa-tool-info">
                        <span class="pa-tool-name">{tool.name}</span>
                        <span class="pa-tool-desc">{tool.description}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Connect button -->
            <div class="pa-detail-section">
              <button class="pa-connect-btn" on:click={handleConnectFromDetail}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
                Connect {selectedProvider.name}
              </button>
            </div>

            <div class="pa-detail-section">
              <h3 class="pa-section-title">Server</h3>
              <div class="pa-server-info">
                <code class="pa-server-url">{selectedProvider.serverUrl}</code>
                <span class="pa-transport-badge">{selectedProvider.transport.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

      {:else if screen === "configure" && selectedProvider}
        <!-- Configure Screen -->
        <div class="pa-container pa-configure">
          <div class="pa-grid-lines" aria-hidden="true"></div>

          <button class="pa-back-btn" on:click={handleBack} aria-label="Back">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <button class="pa-close-btn" on:click={handleClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <div class="pa-config-header">
            <div class="pa-detail-icon">
              {#if selectedProvider.iconUrl}
                <img src={selectedProvider.iconUrl} alt={selectedProvider.name} width="48" height="48" />
              {/if}
            </div>
            <h2 class="pa-title">Configure {selectedProvider.name}</h2>
            <p class="pa-description">Set up the connection to this MCP server</p>
          </div>

          <div class="pa-config-form">
            <!-- Server URL -->
            <div class="pa-field">
              <label class="pa-label" for="mcp-url">Server URL</label>
              <input
                id="mcp-url"
                type="url"
                class="pa-input"
                placeholder="https://mcp.example.com/mcp"
                bind:value={configUrl}
              />
            </div>

            <!-- Transport -->
            <div class="pa-field">
              <label class="pa-label" for="mcp-transport">Transport</label>
              <select id="mcp-transport" class="pa-select" bind:value={configTransport}>
                <option value="http">HTTP (Streamable)</option>
                <option value="sse">SSE (Legacy)</option>
              </select>
            </div>

            <!-- Auth Type -->
            <div class="pa-field">
              <label class="pa-label" for="mcp-auth">Authentication</label>
              <select id="mcp-auth" class="pa-select" bind:value={configAuthType}>
                <option value="">None</option>
                <option value="BEARER">Bearer Token / API Key</option>
                <option value="API_KEY">API Key (Custom Header)</option>
              </select>
            </div>

            <!-- Bearer Token input -->
            {#if configAuthType === "BEARER"}
              <div class="pa-field">
                <label class="pa-label" for="mcp-token">Bearer Token</label>
                <input
                  id="mcp-token"
                  type="password"
                  class="pa-input"
                  placeholder="Enter your API key or token"
                  bind:value={configToken}
                />
              </div>
            {/if}

            <!-- API Key inputs -->
            {#if configAuthType === "API_KEY"}
              <div class="pa-field">
                <label class="pa-label" for="mcp-api-key">API Key</label>
                <input
                  id="mcp-api-key"
                  type="password"
                  class="pa-input"
                  placeholder="Enter your API key"
                  bind:value={configApiKey}
                />
              </div>
              <div class="pa-field">
                <label class="pa-label" for="mcp-header-name">Header Name</label>
                <input
                  id="mcp-header-name"
                  type="text"
                  class="pa-input"
                  placeholder="X-API-Key"
                  bind:value={configApiKeyName}
                />
              </div>
            {/if}

            <!-- Test Connection -->
            <button
              class="pa-test-btn"
              on:click={handleTestConnection}
              disabled={testLoading || !configUrl}
            >
              {#if testLoading}
                <div class="pa-spinner"></div>
                Testing connection...
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
                Test &amp; List Tools
              {/if}
            </button>

            {#if testError}
              <div class="pa-error">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {testError}
              </div>
            {/if}

            <!-- Discovered Tools -->
            {#if discoveredTools.length > 0}
              <div class="pa-tools-section">
                <div class="pa-tools-header">
                  <h3 class="pa-section-title">
                    Discovered Tools
                    <span class="pa-tool-count">{discoveredTools.length}</span>
                  </h3>
                  {#if testDurationMs > 0}
                    <span class="pa-duration">{testDurationMs}ms</span>
                  {/if}
                </div>
                <p class="pa-tools-hint">Select which tools to enable for your AI</p>

                <div class="pa-tool-select-list">
                  {#each discoveredTools as tool (tool.name)}
                    <label class="pa-tool-checkbox" for="tool-{tool.name}">
                      <input
                        id="tool-{tool.name}"
                        type="checkbox"
                        bind:checked={selectedTools[tool.name]}
                      />
                      <div class="pa-tool-checkbox-info">
                        <span class="pa-tool-name">{tool.name}</span>
                        {#if tool.description}
                          <span class="pa-tool-desc">{tool.description}</span>
                        {/if}
                      </div>
                    </label>
                  {/each}
                </div>

                <!-- Save button -->
                <button
                  class="pa-save-btn"
                  on:click={handleSave}
                  disabled={saveLoading || selectedToolCount === 0}
                >
                  {#if saveLoading}
                    <div class="pa-spinner"></div>
                    Saving...
                  {:else if saveSuccess}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Connected!
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save &amp; Enable ({selectedToolCount} tool{selectedToolCount !== 1 ? "s" : ""})
                  {/if}
                </button>

                {#if saveError}
                  <div class="pa-error">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {saveError}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Overlay */
  .pa-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  /* Modal */
  .pa-modal {
    position: relative;
    width: 90vw;
    max-width: 720px;
    max-height: 85vh;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
  }

  /* Container with neural background */
  .pa-container {
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    max-height: 85vh;
    background:
      radial-gradient(ellipse 100% 100% at 0% 0%, rgba(99, 102, 241, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse 80% 80% at 100% 100%, rgba(0, 184, 148, 0.04) 0%, transparent 50%),
      #0a0b10;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Scan lines */
  .pa-grid-lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .pa-grid-lines::before,
  .pa-grid-lines::after {
    content: "";
    position: absolute;
    background: linear-gradient(90deg, transparent, #6366f1, transparent);
    height: 1px;
    width: 100%;
    animation: pa-scan 8s linear infinite;
  }
  .pa-grid-lines::before { top: 30%; opacity: 0.12; }
  .pa-grid-lines::after { top: 70%; animation-delay: -4s; opacity: 0.08; }

  @keyframes pa-scan {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* Close button */
  .pa-close-btn {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(224, 224, 232, 0.65);
  }
  .pa-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.12);
    color: #f4f4f8;
  }

  /* Back button */
  .pa-back-btn {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(224, 224, 232, 0.65);
  }
  .pa-back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.12);
    color: #f4f4f8;
  }

  /* Header */
  .pa-header {
    position: relative;
    z-index: 1;
    padding: 2rem 2rem 1.25rem;
    text-align: center;
  }
  .pa-header-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1.25rem;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e0e0e8;
  }
  .pa-header-icon::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, #6366f1, #00d4aa);
    border-radius: 16px;
    opacity: 0.15;
    animation: pa-pulse 3s ease-in-out infinite;
  }
  .pa-header-icon::after {
    content: "";
    position: absolute;
    inset: -2px;
    background: linear-gradient(135deg, #6366f1, #00d4aa);
    border-radius: 18px;
    opacity: 0.3;
    filter: blur(8px);
    animation: pa-pulse 3s ease-in-out infinite;
  }
  .pa-header-icon svg {
    position: relative;
    z-index: 1;
  }
  @keyframes pa-pulse {
    0%, 100% { opacity: 0.15; transform: scale(1); }
    50% { opacity: 0.25; transform: scale(1.02); }
  }
  .pa-title {
    font-size: 1.625rem;
    font-weight: 700;
    color: #f4f4f8;
    margin: 0 0 0.5rem;
    letter-spacing: -0.02em;
  }
  .pa-description {
    font-size: 0.875rem;
    color: rgba(224, 224, 232, 0.65);
    max-width: 420px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* Search */
  .pa-search-container {
    position: relative;
    z-index: 1;
    padding: 0 1.5rem;
    margin-bottom: 1rem;
  }
  .pa-search-wrapper { position: relative; }
  .pa-search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: #e0e0e8;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    outline: none;
    box-sizing: border-box;
  }
  .pa-search-input::placeholder { color: rgba(224, 224, 232, 0.4); }
  .pa-search-input:focus {
    border-color: #6366f1;
    background: rgba(18, 20, 28, 0.85);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
  }
  .pa-search-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(224, 224, 232, 0.4);
    pointer-events: none;
  }

  /* Grid scroll area */
  .pa-grid-scroll {
    position: relative;
    z-index: 1;
    padding: 0 1.5rem 2rem;
  }

  /* Empty state */
  .pa-empty {
    text-align: center;
    padding: 3rem 2rem;
    color: rgba(224, 224, 232, 0.4);
    font-size: 0.875rem;
  }
  .pa-empty p { margin: 1rem 0 0; }

  /* Category */
  .pa-category { margin-bottom: 1.75rem; }
  .pa-category:last-child { margin-bottom: 0; }
  .pa-category-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.875rem;
    padding: 0 0.25rem;
  }
  .pa-category-label {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(224, 224, 232, 0.4);
    white-space: nowrap;
  }
  .pa-category-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%);
  }
  .pa-category-count {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 0.6rem;
    color: rgba(224, 224, 232, 0.4);
    padding: 0.2rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  /* Provider grid */
  .pa-provider-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }
  @media (max-width: 640px) {
    .pa-provider-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 480px) {
    .pa-provider-grid { grid-template-columns: repeat(2, 1fr); }
  }

  /* Provider card */
  .pa-provider-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 0.625rem;
    background: rgba(18, 20, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px);
    overflow: hidden;
    min-height: 96px;
    color: #e0e0e8;
    animation: pa-slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    opacity: 0;
  }
  .pa-provider-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, var(--card-glow, transparent) 0%, transparent 60%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .pa-provider-card::after {
    content: "";
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    background: var(--card-accent, rgba(224, 224, 232, 0.4));
    border-radius: 50%;
    opacity: 0;
    transition: all 0.3s ease;
    box-shadow: 0 0 8px var(--card-accent, transparent);
  }
  .pa-provider-card:hover {
    background: rgba(26, 28, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .pa-provider-card:hover::before { opacity: 1; }
  .pa-provider-card:hover::after { opacity: 1; }
  .pa-provider-card:active { transform: translateY(-1px); }

  /* Connected state */
  .pa-connected {
    border-color: rgba(0, 212, 170, 0.3) !important;
  }
  .pa-connected::after {
    opacity: 1 !important;
    background: #00d4aa !important;
    box-shadow: 0 0 8px rgba(0, 212, 170, 0.5) !important;
  }
  .pa-connected-badge {
    position: absolute;
    bottom: 0.35rem;
    right: 0.35rem;
    font-family: "SF Mono", monospace;
    font-size: 0.5rem;
    font-weight: 600;
    padding: 0.125rem 0.3rem;
    border-radius: 3px;
    background: rgba(0, 212, 170, 0.12);
    color: #00d4aa;
    border: 1px solid rgba(0, 212, 170, 0.2);
    z-index: 2;
  }

  /* Category accent colors */
  .pa-provider-card[data-category="crm"] { --card-glow: rgba(0, 212, 170, 0.2); --card-accent: #00d4aa; }
  .pa-provider-card[data-category="dev"] { --card-glow: rgba(99, 102, 241, 0.2); --card-accent: #6366f1; }
  .pa-provider-card[data-category="productivity"] { --card-glow: rgba(245, 158, 11, 0.2); --card-accent: #f59e0b; }
  .pa-provider-card[data-category="data"] { --card-glow: rgba(236, 72, 153, 0.2); --card-accent: #ec4899; }
  .pa-provider-card[data-category="comms"] { --card-glow: rgba(59, 130, 246, 0.2); --card-accent: #3b82f6; }
  .pa-provider-card[data-category="custom"] { --card-glow: rgba(139, 92, 246, 0.2); --card-accent: #8b5cf6; }

  .pa-provider-card[data-category="crm"]:hover .pa-card-icon { background: rgba(0, 212, 170, 0.12); border-color: rgba(0, 212, 170, 0.3); }
  .pa-provider-card[data-category="dev"]:hover .pa-card-icon { background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.3); }
  .pa-provider-card[data-category="productivity"]:hover .pa-card-icon { background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.3); }
  .pa-provider-card[data-category="data"]:hover .pa-card-icon { background: rgba(236, 72, 153, 0.12); border-color: rgba(236, 72, 153, 0.3); }
  .pa-provider-card[data-category="comms"]:hover .pa-card-icon { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); }
  .pa-provider-card[data-category="custom"]:hover .pa-card-icon { background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); }

  @keyframes pa-slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Card icon */
  .pa-card-icon {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.04);
    transition: all 0.25s ease;
  }
  .pa-card-icon img {
    width: 26px;
    height: 26px;
    object-fit: contain;
    border-radius: 4px;
  }
  .pa-card-icon svg {
    width: 20px;
    height: 20px;
    stroke: #e0e0e8;
    stroke-width: 1.5;
  }

  /* Card label */
  .pa-card-label {
    position: relative;
    z-index: 1;
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0e8;
    text-align: center;
    line-height: 1.25;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* OAuth badge */
  .pa-oauth-badge {
    position: absolute;
    bottom: 0.35rem;
    right: 0.35rem;
    font-family: "SF Mono", monospace;
    font-size: 0.5rem;
    font-weight: 600;
    padding: 0.125rem 0.3rem;
    border-radius: 3px;
    background: rgba(99, 102, 241, 0.12);
    color: #6366f1;
    border: 1px solid rgba(99, 102, 241, 0.2);
    z-index: 2;
  }

  /* Aggregator card */
  .pa-aggregator-card {
    cursor: default;
    opacity: 0.6;
  }
  .pa-aggregator-card:hover {
    transform: none !important;
    box-shadow: none !important;
    background: rgba(18, 20, 28, 0.85) !important;
    border-color: rgba(255, 255, 255, 0.08) !important;
  }

  /* Scrollbar */
  .pa-container::-webkit-scrollbar { width: 6px; }
  .pa-container::-webkit-scrollbar-track { background: transparent; }
  .pa-container::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 3px; }
  .pa-container::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.12); }

  /* ====== Detail Screen ====== */
  .pa-detail {
    padding-bottom: 2rem;
  }
  .pa-detail-header {
    position: relative;
    z-index: 1;
    padding: 2.5rem 2rem 1.5rem;
    text-align: center;
  }
  .pa-detail-icon {
    width: 60px;
    height: 60px;
    margin: 0 auto 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
  }
  .pa-detail-icon img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: 8px;
  }
  .pa-badges {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .pa-meta-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(224, 224, 232, 0.65);
  }
  .pa-auth-type-badge {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }
  .pa-detail-desc {
    font-size: 0.875rem;
    color: rgba(224, 224, 232, 0.65);
    line-height: 1.6;
    max-width: 480px;
    margin: 0 auto 0.75rem;
  }
  .pa-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: #6366f1;
    text-decoration: none;
    transition: color 0.2s;
  }
  .pa-link:hover { color: #818cf8; }

  /* Detail content */
  .pa-detail-content {
    position: relative;
    z-index: 1;
    padding: 0 2rem;
  }
  .pa-detail-section {
    margin-bottom: 1.5rem;
  }
  .pa-section-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #f4f4f8;
    margin: 0 0 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Use cases */
  .pa-use-cases {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .pa-use-case {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(0, 184, 148, 0.04) 100%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    font-size: 0.8rem;
    color: rgba(224, 224, 232, 0.8);
    line-height: 1.4;
  }
  .pa-check-icon {
    flex-shrink: 0;
    color: #00d4aa;
    margin-top: 1px;
  }

  /* Tool list */
  .pa-tool-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }
  .pa-tool-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: rgba(18, 20, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    transition: all 0.2s ease;
  }
  .pa-tool-item:hover {
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  .pa-tool-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #6366f1;
    flex-shrink: 0;
    margin-top: 6px;
  }
  .pa-tool-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .pa-tool-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0e0e8;
  }
  .pa-tool-desc {
    font-size: 0.7rem;
    color: rgba(224, 224, 232, 0.5);
    line-height: 1.4;
  }
  .pa-tool-count {
    font-family: "SF Mono", monospace;
    font-size: 0.65rem;
    color: rgba(224, 224, 232, 0.4);
    padding: 0.15rem 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  /* Connect button (detail screen) */
  .pa-connect-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pa-connect-btn:hover {
    background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
    transform: translateY(-1px);
  }
  .pa-connect-btn:active {
    transform: translateY(0);
  }

  /* Server info */
  .pa-server-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(18, 20, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
  }
  .pa-server-url {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 0.75rem;
    color: rgba(224, 224, 232, 0.6);
    word-break: break-all;
    flex: 1;
  }
  .pa-transport-badge {
    font-family: "SF Mono", monospace;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 4px;
    color: #6366f1;
    flex-shrink: 0;
  }

  .pa-tool-list::-webkit-scrollbar { width: 4px; }
  .pa-tool-list::-webkit-scrollbar-track { background: transparent; }
  .pa-tool-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }

  /* ====== Configure Screen ====== */
  .pa-configure {
    padding-bottom: 2rem;
  }
  .pa-config-header {
    position: relative;
    z-index: 1;
    padding: 2.5rem 2rem 1rem;
    text-align: center;
  }
  .pa-config-form {
    position: relative;
    z-index: 1;
    padding: 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Form fields */
  .pa-field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .pa-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(224, 224, 232, 0.65);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pa-input,
  .pa-select {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #e0e0e8;
    font-size: 0.875rem;
    font-family: "SF Mono", "JetBrains Mono", monospace;
    transition: all 0.2s ease;
    outline: none;
    box-sizing: border-box;
  }
  .pa-input::placeholder { color: rgba(224, 224, 232, 0.3); }
  .pa-input:focus,
  .pa-select:focus {
    border-color: #6366f1;
    background: rgba(18, 20, 28, 0.85);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
  .pa-select {
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
  }
  .pa-select option {
    background: #0a0b10;
    color: #e0e0e8;
  }

  /* Test button */
  .pa-test-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #e0e0e8;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pa-test-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.5);
  }
  .pa-test-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Error */
  .pa-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    font-size: 0.8rem;
    color: #f87171;
  }

  /* Tools section */
  .pa-tools-section {
    margin-top: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .pa-tools-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pa-tools-hint {
    font-size: 0.75rem;
    color: rgba(224, 224, 232, 0.4);
    margin: 0;
  }
  .pa-duration {
    font-family: "SF Mono", monospace;
    font-size: 0.65rem;
    color: #00d4aa;
    padding: 0.15rem 0.5rem;
    background: rgba(0, 212, 170, 0.1);
    border-radius: 4px;
  }

  /* Tool checkboxes */
  .pa-tool-select-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    max-height: 260px;
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .pa-tool-checkbox {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    background: rgba(18, 20, 28, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pa-tool-checkbox:hover {
    border-color: rgba(99, 102, 241, 0.3);
    background: rgba(26, 28, 40, 0.95);
  }
  .pa-tool-checkbox input[type="checkbox"] {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    accent-color: #6366f1;
    cursor: pointer;
  }
  .pa-tool-checkbox-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .pa-tool-select-list::-webkit-scrollbar { width: 4px; }
  .pa-tool-select-list::-webkit-scrollbar-track { background: transparent; }
  .pa-tool-select-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }

  /* Save button */
  .pa-save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.875rem 1.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .pa-save-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #00e4ba 0%, #00d4aa 100%);
    box-shadow: 0 4px 16px rgba(0, 212, 170, 0.4);
    transform: translateY(-1px);
  }
  .pa-save-btn:active:not(:disabled) {
    transform: translateY(0);
  }
  .pa-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Spinner */
  .pa-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: pa-spin 0.6s linear infinite;
  }
  @keyframes pa-spin {
    to { transform: rotate(360deg); }
  }
</style>
