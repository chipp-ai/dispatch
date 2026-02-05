# Svelte SPA Patterns

## Svelte 5 Runes

Svelte 5 uses runes for reactivity:

```svelte
<script lang="ts">
  // Reactive state
  let count = $state(0);

  // Derived values
  let doubled = $derived(count * 2);

  // Effects
  $effect(() => {
    console.log(`Count changed to ${count}`);
  });

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>
  Count: {count} (doubled: {doubled})
</button>
```

## SPA Routing (svelte-spa-router)

Hash-based routing for SPA:

```typescript
// web/src/routes.ts
import { wrap } from "svelte-spa-router/wrap";

export default {
  "/": Home,
  "/apps": wrap({ asyncComponent: () => import("./routes/Apps.svelte") }),
  "/apps/:id/*": wrap({
    asyncComponent: () => import("./routes/AppBuilderLayout.svelte"),
  }),
  "/settings/*": wrap({
    asyncComponent: () => import("./routes/SettingsLayout.svelte"),
  }),
  "/w/chat/:appNameId": wrap({
    asyncComponent: () => import("./routes/consumer/ConsumerLayout.svelte"),
  }),
  "*": NotFound,
};
```

## Nested Layout Pattern

**Problem:** SPA routing causes page flash when navigating between related pages because the entire component remounts.

**Solution:** Use a single layout component with wildcard routing that handles internal content switching.

**Pattern:**

```
routes.ts:
  "/feature/*": FeatureLayout.svelte    # Wildcard route

FeatureLayout.svelte:
  - Parses params.wild to determine active step/tab
  - Eagerly imports ALL content components (not lazy)
  - Renders shared UI (header, nav, card wrapper)
  - Conditionally renders content based on active step
  - Content components dispatch events for navigation

feature/
  ContentA.svelte                        # Just content, no layout
  ContentB.svelte
  ContentC.svelte
```

**Key requirements:**

1. **Eager imports** - Import all content at top of layout (prevents flash)
2. **Wildcard route** - Use `/path/*` so layout handles all sub-paths
3. **Event-driven navigation** - Content dispatches `next`/`select` events; layout calls `push()`
4. **Shared UI in layout** - Header, step indicator, wrapper card stay mounted

**Example:**

```svelte
<!-- routes/AppBuilderLayout.svelte -->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import BuildContent from "./builder/BuilderBuildContent.svelte";
  import ShareContent from "./builder/BuilderShareContent.svelte";
  import SettingsContent from "./builder/BuilderSettingsContent.svelte";

  export let params: { wild?: string } = {};

  $: segments = (params.wild || "").split("/");
  $: activeTab = segments[0] || "build";

  function handleNavigate(event: CustomEvent<string>) {
    push(`/apps/${appId}/${event.detail}`);
  }
</script>

<div class="layout">
  <TabNav {activeTab} on:select={handleNavigate} />

  {#if activeTab === "build"}
    <BuildContent on:navigate={handleNavigate} />
  {:else if activeTab === "share"}
    <ShareContent on:navigate={handleNavigate} />
  {:else if activeTab === "settings"}
    <SettingsContent on:navigate={handleNavigate} />
  {/if}
</div>
```

**Examples in codebase:**

- `routes/AppBuilderLayout.svelte` - Tabs: build, share, embed, analytics, settings
- `routes/OnboardingLayout.svelte` - Steps: profile, persona, invite, templates
- `routes/SettingsLayout.svelte` - Nested settings sections

## Svelte Stores

```typescript
// web/src/stores/auth.ts
import { writable, derived } from "svelte/store";

export const user = writable<User | null>(null);
export const isAuthenticated = derived(user, ($user) => $user !== null);

function createAppsStore() {
  const { subscribe, set, update } = writable<App[]>([]);

  return {
    subscribe,
    load: async () => {
      const response = await fetch("/api/applications");
      const { data } = await response.json();
      set(data);
    },
    add: (app: App) => update((apps) => [...apps, app]),
    remove: (id: string) => update((apps) => apps.filter((a) => a.id !== id)),
  };
}

export const apps = createAppsStore();
```

## Portal Pattern for Modals/Dialogs

**Problem:** Modals rendered inside the component tree can be affected by parent stacking contexts (transforms, z-index, overflow). This causes dialogs to appear clipped, positioned wrong, or with backdrops on wrong elements.

**Solution:** Use a portal pattern to render modal content directly into `document.body`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  export let open = false;

  let portalContainer: HTMLDivElement;

  onMount(() => {
    portalContainer = document.createElement("div");
    portalContainer.className = "dialog-portal";
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

  // Lock body scroll when open
  $: if (typeof document !== "undefined") {
    document.body.style.overflow = open ? "hidden" : "";
  }
</script>

{#if open}
  <div use:portal class="dialog-wrapper">
    <div class="dialog-overlay" on:click={() => (open = false)}>
      <div class="dialog-content" on:click|stopPropagation role="dialog" aria-modal="true">
        <slot />
      </div>
    </div>
  </div>
{/if}
```

**Key points:**

- Create portal container in `onMount`, remove in `onDestroy`
- Use Svelte action (`use:portal`) to move rendered content
- Lock body scroll when modal is open
- Set high z-index (9999+) on overlay

## Click-Outside Detection for Dropdowns

**Problem:** Backdrop-based click detection can fail with automation tools and complex z-index hierarchies.

**Solution:** Use a window-level click listener in capture phase:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  let open = false;
  let menuRef: HTMLElement;

  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      open = false;
    }
  }

  // Add/remove listener when open state changes
  $: if (typeof window !== "undefined") {
    if (open) {
      // Use setTimeout to avoid the opening click immediately closing
      setTimeout(() => {
        window.addEventListener("click", handleClickOutside, { capture: true });
      }, 0);
    } else {
      window.removeEventListener("click", handleClickOutside, { capture: true });
    }
  }

  onDestroy(() => {
    window.removeEventListener("click", handleClickOutside, { capture: true });
  });
</script>

<div bind:this={menuRef}>
  <button on:click|stopPropagation={() => (open = !open)}>Toggle</button>
  {#if open}
    <div class="dropdown-menu">...</div>
  {/if}
</div>
```

## Reacting to Store Changes (Workspace Filtering)

**Problem:** Pages showing filtered data need to reload when the filter (e.g., workspace) changes.

**Solution:** Subscribe to the store and track the last value to avoid double-loading on mount:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { currentWorkspace, type Workspace } from "../stores/workspace";

  let items: Item[] = [];
  let unsubscribe: (() => void) | undefined;
  let lastWorkspaceId: string | null | undefined = undefined;

  async function loadItems(workspaceId?: string) {
    let url = "/api/items";
    if (workspaceId) {
      url += `?workspaceId=${encodeURIComponent(workspaceId)}`;
    }
    const response = await fetch(url, { credentials: "include" });
    const result = await response.json();
    items = result.data || [];
  }

  onMount(() => {
    unsubscribe = currentWorkspace.subscribe((workspace: Workspace | null) => {
      const newWorkspaceId = workspace?.id ?? null;
      if (lastWorkspaceId === undefined || newWorkspaceId !== lastWorkspaceId) {
        lastWorkspaceId = newWorkspaceId;
        loadItems(newWorkspaceId ?? undefined);
      }
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>
```

## Normalizing API Responses

**Problem:** Backend may not return all fields the frontend expects.

**Solution:** Normalize/default missing fields after fetching:

```typescript
async function fetchWorkspaces() {
  const response = await fetch("/api/workspaces", { credentials: "include" });
  const data = await response.json();

  const workspaces = (data.data || []).map((w: Partial<Workspace>) => ({
    ...w,
    visibility: w.visibility || "PRIVATE",
    slug: w.slug || w.name?.toLowerCase().replace(/\s+/g, "-") || "",
  })) as Workspace[];

  return workspaces;
}
```

## Design System

Components are in `web/src/lib/design-system/`:

```
web/src/lib/design-system/
├── components/
│   ├── Button.svelte
│   ├── Card.svelte
│   ├── Modal.svelte
│   ├── chat/              # Chat-specific components
│   ├── builder/           # App builder components
│   └── settings/          # Settings components
├── styles/
│   └── variables.css
└── index.ts               # Re-exports
```
