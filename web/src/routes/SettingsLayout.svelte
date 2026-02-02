<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { push } from "svelte-spa-router";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import GlobalSearchModal from "../lib/design-system/components/GlobalSearchModal.svelte";
  import SettingsSidebar from "../lib/design-system/components/settings/SettingsSidebar.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { currentOrganization } from "../stores/organization";
  import { openSearch, isSearchOpen } from "../stores/globalSearch";

  // Content components
  import AccountContent from "./settings/content/AccountContent.svelte";
  import HQContent from "./settings/content/HQContent.svelte";
  import HelpCenterContent from "./settings/content/HelpCenterContent.svelte";
  import MemoryContent from "./settings/content/MemoryContent.svelte";
  import OrganizationSettingsContent from "./settings/content/OrganizationSettingsContent.svelte";
  import SourcesContent from "./settings/content/SourcesContent.svelte";
  import TeamContent from "./settings/content/TeamContent.svelte";
  import WhitelabelContent from "./settings/content/WhitelabelContent.svelte";
  import WorkspaceMembersContent from "./settings/content/WorkspaceMembersContent.svelte";
  import WorkspaceSettingsContent from "./settings/content/WorkspaceSettingsContent.svelte";
  import SettingsHomeContent from "./settings/content/SettingsHomeContent.svelte";

  // Billing sub-page components
  import BillingPlanContent from "./settings/content/BillingPlanContent.svelte";
  import BillingCreditsContent from "./settings/content/BillingCreditsContent.svelte";
  import BillingPaymentContent from "./settings/content/BillingPaymentContent.svelte";
  import BillingAutoTopupContent from "./settings/content/BillingAutoTopupContent.svelte";

  export let params: { wild?: string } = {};

  // Always show billing sub-pages (usage-based billing is default for all plans)

  // Parse active page and sub-page from URL
  $: activePage = parseActivePage(params.wild);
  $: billingSubPage = parseBillingSubPage(params.wild);

  function parseActivePage(wild: string | undefined): string {
    if (!wild || wild === "") return "home";
    const page = wild.split("/")[0];
    const validPages = [
      "account",
      "billing",
      "hq",
      "help-center",
      "memory",
      "organization-settings",
      "sources",
      "team",
      "whitelabel",
      "workspace-members",
      "workspace-settings",
    ];
    return validPages.includes(page) ? page : "home";
  }

  function parseBillingSubPage(wild: string | undefined): string {
    if (!wild || wild === "") return "plan";
    const parts = wild.split("/");
    if (parts[0] !== "billing") return "plan";
    const validSubPages = ["plan", "credits", "payment", "auto-topup"];
    return parts[1] && validSubPages.includes(parts[1]) ? parts[1] : "plan";
  }

  // Redirect /settings/billing to /settings/billing/plan
  $: {
    if (params.wild === "billing") {
      push("/settings/billing/plan");
    }
  }

  // Get page title for document title
  $: pageTitle = getPageTitle(activePage, billingSubPage);

  function getPageTitle(page: string, billingPage: string): string {
    if (page === "billing") {
      const billingTitles: Record<string, string> = {
        plan: "Plan",
        credits: "Credits",
        payment: "Payment",
        "auto-topup": "Auto Top-up",
      };
      return billingTitles[billingPage] || "Billing";
    }
    const titles: Record<string, string> = {
      home: "Settings",
      account: "Account",
      hq: "HQ",
      "help-center": "Help Center",
      memory: "Memory",
      "organization-settings": "Organization Settings",
      sources: "Sources",
      team: "Team",
      whitelabel: "Whitelabel",
      "workspace-members": "Workspace Members",
      "workspace-settings": "Workspace Settings",
    };
    return titles[page] || "Settings";
  }

  // Global keyboard shortcut for Cmd+K / Ctrl+K
  function handleGlobalKeydown(e: KeyboardEvent) {
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
</script>

<svelte:head>
  <title>{pageTitle} - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="settings-layout">
  <SettingsSidebar />

  <div class="settings-main">
    <div class="settings-content">
      <!-- Mobile back button -->
      {#if activePage !== "home"}
        <a href="#/settings" class="back-link">
          <ArrowLeft size={16} />
          <span>Back to Settings</span>
        </a>
      {/if}

      {#if activePage === "home"}
        <SettingsHomeContent />
      {:else if activePage === "account"}
        <AccountContent />
      {:else if activePage === "billing"}
        {#if billingSubPage === "plan"}
          <BillingPlanContent />
        {:else if billingSubPage === "credits"}
          <BillingCreditsContent />
        {:else if billingSubPage === "payment"}
          <BillingPaymentContent />
        {:else if billingSubPage === "auto-topup"}
          <BillingAutoTopupContent />
        {/if}
      {:else if activePage === "hq"}
        <HQContent />
      {:else if activePage === "help-center"}
        <HelpCenterContent />
      {:else if activePage === "memory"}
        <MemoryContent />
      {:else if activePage === "organization-settings"}
        <OrganizationSettingsContent />
      {:else if activePage === "sources"}
        <SourcesContent />
      {:else if activePage === "team"}
        <TeamContent />
      {:else if activePage === "whitelabel"}
        <WhitelabelContent />
      {:else if activePage === "workspace-members"}
        <WorkspaceMembersContent />
      {:else if activePage === "workspace-settings"}
        <WorkspaceSettingsContent />
      {/if}
    </div>
  </div>
</div>

<!-- Global Search Modal (Cmd+K) -->
<GlobalSearchModal />

<style>
  .settings-layout {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 64px; /* Account for fixed navbar */
  }

  .settings-main {
    flex: 1;
    overflow-y: auto;
    margin-left: 256px; /* Sidebar width */
  }

  .settings-content {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .back-link {
    display: none;
    align-items: center;
    gap: var(--space-2);
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: var(--text-sm);
    margin-bottom: var(--space-4);
    transition: color 0.2s;
  }

  .back-link:hover {
    color: hsl(var(--foreground));
  }

  @media (max-width: 768px) {
    .settings-main {
      margin-left: 0;
    }

    .back-link {
      display: flex;
    }

    .settings-content {
      padding: var(--space-4);
    }
  }
</style>
