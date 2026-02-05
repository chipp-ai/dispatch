---
name: chipp-design
description: Build UI components and pages following the Chipp brand design system for Svelte. Use this skill when creating Svelte components, pages, or UI elements for chipp-deno. Enforces whitelabel-compatible colors, typography (Chubbo/Mulish), and component patterns from the design system.
---

This skill guides creation of UI components and pages that follow Chipp's brand identity in Svelte. All components should feel warm, welcoming, playful yet professional.

**IMPORTANT: Chipp is multi-tenant whitelabel software.** Colors are injected via `window.__APP_BRAND__` and CSS variables. Always use CSS variables for brand colors.

## Brand Personality

Chipp is the "happy-go-lucky friend who's got your back." The brand voice is:

- **Human & down to earth**: Talk like a friend, keep it real
- **Supportive & encouraging**: Welcome everyone regardless of experience
- **Positive & passionate**: Believe in users, show excitement

**NOT**: Immature, sophisticated/complicated, insincere/exaggerated

## Color System

### Brand Colors (Dynamic via CSS Variables)

Brand colors are set by the Cloudflare Worker's brand injection. Use these CSS variables:

| CSS Variable           | Usage                      |
| ---------------------- | -------------------------- |
| `--brand-color`        | Primary CTAs, highlights   |
| `--brand-color-light`  | Hover states               |
| `--brand-color-dark`   | Active states              |
| `--brand-text-color`   | Text on brand backgrounds  |

### Semantic Colors (Tailwind)

| Tailwind Class                      | Usage                           |
| ----------------------------------- | ------------------------------- |
| `bg-white` / `bg-gray-50`           | Page backgrounds                |
| `bg-gray-100` / `bg-gray-200`       | Cards, surfaces                 |
| `text-gray-900`                     | Primary text                    |
| `text-gray-600`                     | Secondary text                  |
| `text-gray-400`                     | Muted text                      |
| `border-gray-200`                   | Borders, dividers               |
| `bg-red-500` / `text-red-600`       | Errors, destructive             |
| `bg-green-500` / `text-green-600`   | Success                         |
| `bg-yellow-500` / `text-yellow-600` | Warnings                        |

### Using Brand Colors in Svelte

```svelte
<script lang="ts">
  // Access brand from window.__APP_BRAND__
  import { onMount } from 'svelte';

  let brandColor = '#F9DB00'; // Default Chipp yellow

  onMount(() => {
    if (window.__APP_BRAND__?.color) {
      brandColor = window.__APP_BRAND__.color;
    }
  });
</script>

<style>
  .brand-button {
    background-color: var(--brand-color, #F9DB00);
    color: var(--brand-text-color, #000);
  }

  .brand-button:hover {
    background-color: var(--brand-color-light, #FFE94D);
  }
</style>

<button class="brand-button">
  Get Started
</button>
```

### What NOT To Do

```svelte
<!-- BAD - hardcoded brand colors -->
<button class="bg-[#F9DB00]">Click me</button>
<div style="background: yellow">Content</div>

<!-- GOOD - uses CSS variables -->
<button style="background: var(--brand-color)">Click me</button>
<div class="brand-bg">Content</div>
```

---

## Typography

### Font Families

```css
/* Headings, display, buttons */
font-family: "Chubbo", serif;

/* Body copy, UI elements */
font-family: "Mulish", sans-serif;
```

### Type Hierarchy

| Element     | Font   | Weight         | Usage                    |
| ----------- | ------ | -------------- | ------------------------ |
| H1 Heading  | Chubbo | Regular/Medium | Page titles              |
| H2/H3       | Chubbo | Light/Regular  | Section headings         |
| Body        | Mulish | Regular        | Paragraphs, content      |
| Button      | Chubbo | Regular        | CTAs, buttons            |
| UI Text     | Mulish | Regular/Medium | Labels, inputs, captions |

### Tailwind Typography

```svelte
<h1 class="font-['Chubbo'] text-3xl font-medium tracking-tight">
  Welcome to Chipp
</h1>

<p class="font-['Mulish'] text-base text-gray-600 leading-relaxed">
  Build AI chatbots without code.
</p>

<button class="font-['Chubbo'] text-sm font-medium tracking-wide">
  Get Started
</button>
```

---

## Component Architecture

### Design System Location

Components are in `web/src/lib/design-system/`:

```
web/src/lib/design-system/
├── components/
│   ├── Button.svelte
│   ├── Card.svelte
│   ├── Modal.svelte
│   ├── Input.svelte
│   ├── chat/              # Chat-specific components
│   ├── builder/           # App builder components
│   └── settings/          # Settings components
├── styles/
│   └── variables.css
└── index.ts               # Re-exports
```

### Button Component

```svelte
<!-- web/src/lib/design-system/components/Button.svelte -->
<script lang="ts">
  export let variant: 'primary' | 'secondary' | 'ghost' | 'destructive' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled: boolean = false;
</script>

<button
  class="rounded-xl font-['Chubbo'] transition-all {variant} {size}"
  class:opacity-50={disabled}
  class:cursor-not-allowed={disabled}
  {disabled}
  on:click
>
  <slot />
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  /* Variants */
  .primary {
    background-color: var(--brand-color, #111);
    color: var(--brand-text-color, #fff);
  }
  .primary:hover:not(:disabled) {
    background-color: var(--brand-color-light, #333);
  }

  .secondary {
    background-color: #f3f4f6;
    color: #374151;
  }
  .secondary:hover:not(:disabled) {
    background-color: #e5e7eb;
  }

  .ghost {
    background-color: transparent;
    color: #374151;
  }
  .ghost:hover:not(:disabled) {
    background-color: #f3f4f6;
  }

  .destructive {
    background-color: #ef4444;
    color: white;
  }
  .destructive:hover:not(:disabled) {
    background-color: #dc2626;
  }

  /* Sizes */
  .sm { padding: 0.5rem 1rem; font-size: 0.875rem; }
  .md { padding: 0.75rem 1.5rem; font-size: 1rem; }
  .lg { padding: 1rem 2rem; font-size: 1.125rem; }
</style>
```

### Card Component

```svelte
<!-- web/src/lib/design-system/components/Card.svelte -->
<script lang="ts">
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  export let shadow: boolean = true;
</script>

<div
  class="bg-white rounded-xl border border-gray-200"
  class:shadow-sm={shadow}
  class:p-0={padding === 'none'}
  class:p-4={padding === 'sm'}
  class:p-6={padding === 'md'}
  class:p-8={padding === 'lg'}
>
  <slot />
</div>
```

---

## Design Patterns

### Rounded Corners

Chipp uses soft, bubbly shapes:

- Small elements: `rounded-md` or `rounded-lg`
- Cards/containers: `rounded-xl`
- Pill shapes: `rounded-full`

### Shadows

Use soft, layered shadows:

```css
/* Subtle card shadow */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);

/* Elevated shadow */
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

/* Modal/dropdown shadow */
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
```

### Animations

```svelte
<script>
  import { fade, fly, scale } from 'svelte/transition';
</script>

<!-- Fade in -->
<div transition:fade={{ duration: 200 }}>Content</div>

<!-- Slide up -->
<div transition:fly={{ y: 20, duration: 300 }}>Content</div>

<!-- Pop in -->
<div transition:scale={{ start: 0.95, duration: 200 }}>Content</div>
```

### Spacing

- Use consistent padding: `p-4`, `p-6`, `p-8`
- Card gaps: `gap-4` or `gap-6`
- Section margins: `my-8` or `my-12`

---

## Svelte-Specific Patterns

### Portal Pattern for Modals

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let open = false;

  let portalContainer: HTMLDivElement;

  onMount(() => {
    portalContainer = document.createElement('div');
    portalContainer.className = 'modal-portal';
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
      }
    };
  }

  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : '';
  }
</script>

{#if open}
  <div use:portal class="fixed inset-0 z-50">
    <div class="fixed inset-0 bg-black/50" on:click={() => open = false}></div>
    <div class="fixed inset-0 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl p-6 max-w-md w-full" on:click|stopPropagation>
        <slot />
      </div>
    </div>
  </div>
{/if}
```

### Click-Outside Detection

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';

  let open = false;
  let menuRef: HTMLElement;

  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      open = false;
    }
  }

  $: if (typeof window !== 'undefined') {
    if (open) {
      setTimeout(() => {
        window.addEventListener('click', handleClickOutside, { capture: true });
      }, 0);
    } else {
      window.removeEventListener('click', handleClickOutside, { capture: true });
    }
  }

  onDestroy(() => {
    window.removeEventListener('click', handleClickOutside, { capture: true });
  });
</script>

<div bind:this={menuRef}>
  <button on:click|stopPropagation={() => open = !open}>Toggle</button>
  {#if open}
    <div class="dropdown-menu">...</div>
  {/if}
</div>
```

### Svelte 5 Runes

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
</script>

<button onclick={() => count++}>
  Count: {count} (doubled: {doubled})
</button>
```

---

## Copy Guidelines

When writing UI text:

- Use active voice
- Use sentence case (not Title Case)
- First person plural for Chipp (we/our)
- Second person for users (you/yours)
- Keep it conversational and simple

**Examples:**

- "No code? No problem."
- "Build it. Own it. Share it."
- "Yes, you can."
- "We're here to help."

**Avoid:**

- Big words, jargon
- ALL CAPS (except acronyms)
- Over-promising
- Too much slang

---

## Implementation Checklist

1. **Use CSS variables for brand colors** - Never hardcode brand colors
2. **Use design system components** - Check `web/src/lib/design-system/` first
3. **Use correct typography** - Chubbo for headings, Mulish for body
4. **Round the corners** - `rounded-xl` for cards, `rounded-full` for pills
5. **Keep copy friendly** - Active voice, sentence case, conversational
6. **Mobile-first responsive** - Start with mobile, add `md:` and `lg:` variants
7. **Test with brand injection** - Verify colors work with custom brands

---

## Example Component

```svelte
<!-- FeatureCard.svelte -->
<script lang="ts">
  import Button from '$lib/design-system/components/Button.svelte';

  export let title: string;
  export let description: string;
  export let onAction: () => void;
</script>

<div class="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
  <h3 class="font-['Chubbo'] text-lg font-medium text-gray-900 mb-2">
    {title}
  </h3>
  <p class="font-['Mulish'] text-gray-600 mb-4">
    {description}
  </p>
  <Button variant="primary" on:click={onAction}>
    Learn more
  </Button>
</div>
```

---

## Related Documentation

- **Design system components**: `web/src/lib/design-system/`
- **Svelte routes**: `web/src/routes/`
- **Brand injection**: `cloudflare-worker/src/brand-inject.ts`
- **CSS variables**: `web/src/app.css`
