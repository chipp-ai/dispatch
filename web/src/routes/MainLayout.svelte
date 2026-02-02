<!--
  Main Layout

  Shared layout for main navigation pages (dashboard, apps, workspaces, marketplace, plans).
  Keeps GlobalNavBar mounted to prevent flash during navigation between these pages.

  This is the catch-all route that handles:
  - / (root - redirects to dashboard)
  - /dashboard
  - /apps (list view, not /apps/:appId which goes to AppBuilderLayout)
  - /workspaces
  - /marketplace
  - /marketplace/results
  - /plans
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import GlobalSearchModal from "../lib/design-system/components/GlobalSearchModal.svelte";
  import { openSearch, isSearchOpen } from "../stores/globalSearch";

  // Content components - eagerly imported to prevent flash
  import DashboardContent from "./DashboardV2.svelte";
  import AppsContent from "./Apps.svelte";
  import WorkspacesContent from "./Workspaces.svelte";
  import MarketplaceContent from "./Marketplace.svelte";
  import MarketplaceResultsContent from "./MarketplaceResults.svelte";
  import PlansContent from "./Plans.svelte";
  import NotFound from "./NotFound.svelte";

  export let params: { wild?: string } = {};

  // Global keyboard shortcut for Cmd+K / Ctrl+K
  function handleGlobalKeydown(e: KeyboardEvent) {
    // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (!$isSearchOpen) {
        openSearch();
      }
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleGlobalKeydown);
  });

  // Valid main layout pages
  const validPages = ["", "dashboard", "apps", "workspaces", "marketplace", "marketplace/results", "plans"];

  // Parse active page from URL
  $: activePage = parseActivePage(params.wild);
  $: isValidPage = checkValidPage(params.wild);

  function parseActivePage(wild: string | undefined): string {
    // Root or empty goes to dashboard
    if (!wild || wild === "" || wild === "dashboard") return "dashboard";

    // Handle marketplace/results specifically
    if (wild === "marketplace/results") return "marketplace-results";

    const page = wild.split("/")[0];
    const knownPages = ["dashboard", "apps", "workspaces", "marketplace", "plans"];
    return knownPages.includes(page) ? page : "not-found";
  }

  function checkValidPage(wild: string | undefined): boolean {
    if (!wild || wild === "") return true; // Root is valid
    if (validPages.includes(wild)) return true;

    // Check if it's a valid single-segment page
    const page = wild.split("/")[0];
    return ["dashboard", "apps", "workspaces", "marketplace", "plans"].includes(page) && !wild.includes("/");
  }

  // Get page title for document title
  $: pageTitle = getPageTitle(activePage);

  function getPageTitle(page: string): string {
    const titles: Record<string, string> = {
      dashboard: "Dashboard",
      apps: "Applications",
      workspaces: "Workspaces",
      marketplace: "Marketplace",
      "marketplace-results": "Marketplace Results",
      plans: "Plans",
      "not-found": "Not Found",
    };
    return titles[page] || "Chipp";
  }
</script>

<svelte:head>
  <title>{pageTitle} - Chipp</title>
</svelte:head>

<div class="main-layout">
  <GlobalNavBar sticky={true} />

  <main class="main-content">
    {#if activePage === "dashboard"}
      <DashboardContent />
    {:else if activePage === "apps"}
      <AppsContent />
    {:else if activePage === "workspaces"}
      <WorkspacesContent />
    {:else if activePage === "marketplace"}
      <MarketplaceContent />
    {:else if activePage === "marketplace-results"}
      <MarketplaceResultsContent />
    {:else if activePage === "plans"}
      <PlansContent />
    {:else}
      <NotFound />
    {/if}
  </main>
</div>

<!-- Global Search Modal (Cmd+K) -->
<GlobalSearchModal />

<style>
  .main-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: hsl(var(--background));
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
</style>
