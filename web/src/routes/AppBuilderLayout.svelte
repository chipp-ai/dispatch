<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import GlobalSearchModal from "../lib/design-system/components/GlobalSearchModal.svelte";
  import { openSearch, isSearchOpen } from "../stores/globalSearch";
  import { toasts } from "../lib/design-system/stores/toast";
  import { captureException } from "$lib/sentry";

  // Eagerly import all tab content components
  import BuilderBuildContent from "./builder/BuilderBuildContent.svelte";
  import BuilderShareContent from "./builder/BuilderShareContent.svelte";
  import BuilderAccessContent from "./builder/BuilderAccessContent.svelte";
  import BuilderMetricsContent from "./builder/BuilderMetricsContent.svelte";
  import BuilderChatsContent from "./builder/BuilderChatsContent.svelte";
  import BuilderTagsContent from "./builder/BuilderTagsContent.svelte";
  import BuilderEvalsContent from "./builder/BuilderEvalsContent.svelte";
  import BuilderSettingsContent from "./builder/BuilderSettingsContent.svelte";
  import BuilderHelpContent from "./builder/BuilderHelpContent.svelte";
  import BuilderCallsContent from "./builder/BuilderCallsContent.svelte";
  import BuilderVoiceContent from "./builder/BuilderVoiceContent.svelte";
  import BuilderVoiceTalkContent from "./builder/BuilderVoiceTalkContent.svelte";

  export let params: { appId?: string; wild?: string } = {};

  // Parse active tab from URL
  $: activeTab = parseActiveTab(params.wild);

  function parseActiveTab(wild: string | undefined): string {
    if (!wild || wild === "" || wild === "build") return "build";
    // Handle paths like "settings", "chats", "voice/talk", etc.
    // Special case for voice/talk
    if (wild === "voice/talk") return "voice-talk";
    const tab = wild.split("/")[0];
    const validTabs = ["build", "share", "access", "metrics", "chats", "calls", "voice", "voice-talk", "tags", "evals", "settings", "help"];
    return validTabs.includes(tab) ? tab : "build";
  }

  // App data type
  interface AppData {
    id: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    model: string;
    appNameId: string;
    customDomain?: string;
    language?: string;
    textDirection?: string;
    brandStyles: {
      inputTextHint?: string;
      disclaimerText?: string;
      primaryColor?: string;
      botMessageColor?: string;
      userMessageColor?: string;
      logoUrl?: string;
    } | null;
    welcomeMessages: string[] | null;
    suggestedMessages: string[] | null;
    settings?: {
      temperature?: number;
      maxTokens?: number;
      streamResponses?: boolean;
      requireAuth?: boolean;
      showSources?: boolean;
    } | null;
    embeddingConfig?: {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    } | null;
    knowledgeSources?: { id: string; type: 'file' | 'url'; name: string; url?: string }[];
    custom_actions?: { id: string; name: string; description: string; endpoint: string; method: "GET" | "POST" | "PUT" | "DELETE" }[];
  }

  // State
  let app: AppData | null = null;
  let isLoading = true;
  let isSaving = false;
  let isPublishing = false;
  let lastSaved: Date | null = null;

  // Global keyboard shortcut for Cmd+K / Ctrl+K
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (!$isSearchOpen) {
        openSearch();
      }
    }
  }

  onMount(async () => {
    window.addEventListener("keydown", handleGlobalKeydown);

    if (!params.appId) {
      push("/apps");
      return;
    }
    await loadApp();
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleGlobalKeydown);
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          push("/login");
          return;
        }
        if (response.status === 404) {
          push("/apps");
          return;
        }
        throw new Error("Failed to load application");
      }

      const data = await response.json();
      app = data.data;
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-layout", feature: "load-app" }, extra: { appId: params.appId } });
      push("/apps");
    } finally {
      isLoading = false;
    }
  }

  // Reload app data (called by children after updates)
  async function reloadApp() {
    if (!params.appId) return;
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        app = data.data;
      }
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-layout", feature: "reload-app" }, extra: { appId: params.appId } });
    }
  }

  function handleShare() {
    push(`/apps/${params.appId}/share`);
  }

  async function handlePublish() {
    if (!params.appId || isPublishing) return;

    isPublishing = true;
    try {
      const response = await fetch(`/api/applications/${params.appId}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to publish application");
      }

      const result = await response.json();

      if (result.alreadyPublished) {
        toasts.info("Already published", "This version is already live. No changes to publish.");
      } else {
        toasts.success("Published!", "Your app is now live with the latest changes.");
      }

      await reloadApp();
    } catch (error) {
      captureException(error, { tags: { page: "app-builder-layout", feature: "publish" }, extra: { appId: params.appId } });
      toasts.error("Failed to publish", "Something went wrong. Please try again.");
    } finally {
      isPublishing = false;
    }
  }

  // Get current page name for header
  $: currentPage = getPageName(activeTab);

  function getPageName(tab: string): string {
    const names: Record<string, string> = {
      build: "Build",
      share: "Share",
      access: "Access",
      metrics: "Metrics",
      chats: "Chats",
      calls: "Calls",
      voice: "Voice",
      "voice-talk": "Voice",
      tags: "Tags",
      evals: "Evals",
      settings: "Settings",
      help: "Help",
    };
    return names[tab] || "Build";
  }

  // Whether to hide publish button on this tab
  $: hidePublish = activeTab !== "build";
</script>

<svelte:head>
  <title>{app?.name || "Loading"} - {currentPage} - Chipp</title>
</svelte:head>

<div class="app-builder">
  <BuilderSidebar appId={params.appId || ""} {activeTab} />

  <div class="main-content">
    <BuilderHeader
      appName={app?.name || ""}
      appId={params.appId || ""}
      appLogoUrl={app?.brandStyles?.logoUrl || ""}
      {currentPage}
      onShare={handleShare}
      onPublish={handlePublish}
      {isSaving}
      {isPublishing}
      {lastSaved}
      {hidePublish}
    />

    <div class="content-area">
      {#if app}
        {#if activeTab === "build"}
          <BuilderBuildContent
            appId={params.appId || ""}
            {app}
            bind:isSaving
            bind:lastSaved
            on:reload={reloadApp}
          />
        {:else if activeTab === "share"}
          <BuilderShareContent appId={params.appId || ""} {app} />
        {:else if activeTab === "access"}
          <BuilderAccessContent appId={params.appId || ""} {app} />
        {:else if activeTab === "metrics"}
          <BuilderMetricsContent appId={params.appId || ""} {app} />
        {:else if activeTab === "chats"}
          <BuilderChatsContent appId={params.appId || ""} {app} />
        {:else if activeTab === "calls"}
          <BuilderCallsContent appId={params.appId || ""} {app} />
        {:else if activeTab === "voice"}
          <BuilderVoiceContent appId={params.appId || ""} {app} />
        {:else if activeTab === "voice-talk"}
          <BuilderVoiceTalkContent appId={params.appId || ""} {app} />
        {:else if activeTab === "tags"}
          <BuilderTagsContent appId={params.appId || ""} {app} />
        {:else if activeTab === "evals"}
          <BuilderEvalsContent appId={params.appId || ""} {app} />
        {:else if activeTab === "settings"}
          <BuilderSettingsContent
            appId={params.appId || ""}
            {app}
            on:reload={reloadApp}
            on:deleted={() => push("/apps")}
          />
        {:else if activeTab === "help"}
          <BuilderHelpContent appId={params.appId || ""} {app} />
        {/if}
      {/if}
    </div>
  </div>
</div>

<!-- Global Search Modal (Cmd+K) -->
<GlobalSearchModal />

<style>
  .app-builder {
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  @media (min-width: 1024px) {
    .main-content {
      margin-left: 100px; /* Sidebar width */
    }
  }

  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-top: 72px; /* Account for fixed header */
  }
</style>
