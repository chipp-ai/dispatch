---
name: chipp-design
description: Build UI components and pages following the Chipp brand design system for Svelte 5. Use this skill when creating Svelte components, pages, or UI elements for chipp-deno. Enforces the constellation design language with whitelabel-compatible CSS variables, light/dark mode, typography (Chubbo/Mulish), and component patterns.
---

This skill guides creation of UI components and pages using Chipp's **constellation design system** in Svelte 5. The system uses CSS custom properties (not Tailwind utilities) for all colors, spacing, and theming. Components support light/dark mode and whitelabel branding automatically.

**IMPORTANT: Chipp is multi-tenant whitelabel software.** Never hardcode colors. Always use CSS variables from `tokens.css`.

## File Structure

```
web/src/lib/design-system/
├── tokens.css           # All design tokens (colors, spacing, typography, shadows)
├── base.css             # Resets, constellation-bg gradient, markdown styling
├── constellation.css    # Card glow/hover effects, color variants
├── animations.css       # Shimmer, slide-up, float, skeleton loading
├── index.ts             # All component re-exports
└── components/
    ├── Button.svelte, Card.svelte, Input.svelte, Dialog.svelte, ...
    ├── chat/            # ChatMessage, ChatInput, TypingIndicator
    ├── consumer/        # End-user chat: headers, history, credit meter
    ├── builder/         # App builder: model selector, setup dialogs
    └── billing/         # Subscription plans, payment UI
```

## Brand Personality

Chipp is the "happy-go-lucky friend who's got your back."

- **Human & down to earth** - Talk like a friend, keep it real
- **Supportive & encouraging** - Welcome everyone regardless of experience
- **Positive & passionate** - Believe in users, show excitement

**NOT**: Immature, sophisticated/complicated, insincere/exaggerated

---

## Color System

### Two Color Formats

The system uses **two color formats** depending on context:

1. **HSL variables** (shadcn-style) - Used with `hsl()` wrapper for theme tokens:
   ```css
   color: hsl(var(--foreground));
   background: hsl(var(--card));
   border-color: hsl(var(--border));
   ```

2. **Direct value variables** - Used directly for brand/semantic colors:
   ```css
   background-color: var(--brand-color);
   color: var(--color-success);
   background: var(--bg-secondary);
   ```

### Brand Colors (Whitelabel - Direct Values)

Set by Cloudflare Worker brand injection. Defaults to Chipp yellow.

| Variable | Light Mode | Dark Mode | Usage |
|----------|------------|-----------|-------|
| `--brand-color` | `#f9db00` | same | Primary brand, CTAs |
| `--brand-color-light` | `#ffed48` | same | Hover states |
| `--brand-color-foreground` | `#000000` | same | Text on brand bg |
| `--brand-color-ui` | 90% brand + 10% black | `var(--brand-color)` | Buttons (better contrast) |
| `--brand-color-ui-hover` | 80% brand + 20% black | `var(--brand-color-light)` | Button hover |
| `--brand-color-glow` | `rgba(249,219,0,0.3)` | `0.35` opacity | Glow effects |
| `--brand-color-muted` | `rgba(249,219,0,0.15)` | `0.2` opacity | Subtle backgrounds |
| `--brand-color-card-glow` | `rgba(249,219,0,0.12)` | `0.15` opacity | Card hover glow |

### Theme Colors (HSL - Wrap with `hsl()`)

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--background` | `225 25% 98%` | `220 8% 10%` | Page background |
| `--foreground` | `240 15% 10%` | `220 5% 96%` | Primary text |
| `--card` | `0 0% 100%` | `220 6% 14%` | Card surfaces |
| `--muted` | `225 15% 94%` | `220 6% 17%` | Subtle backgrounds |
| `--muted-foreground` | `240 5% 45%` | `220 5% 60%` | Secondary text |
| `--accent` | `217 91% 55%` | `217 91% 60%` | Constellation blue highlights |
| `--border` | `225 15% 88%` | `220 6% 20%` | Borders |
| `--input` | `225 15% 88%` | `220 6% 20%` | Input borders |
| `--ring` | `217 91% 55%` | `217 91% 60%` | Focus rings |
| `--destructive` | `0 84% 60%` | `0 62% 55%` | Error/danger |
| `--primary` | `240 10% 15%` | `220 5% 96%` | Primary action |
| `--secondary` | `225 20% 96%` | `220 6% 17%` | Secondary elements |

### Semantic Colors (Direct Values)

```css
--color-success: #10b981;    --color-success-light: #d1fae5;
--color-warning: #f59e0b;    --color-warning-light: #fef3c7;
--color-error: #ef4444;      --color-error-light: #fee2e2;
--color-info: #3b82f6;       --color-info-light: #dbeafe;
```

### Background/Text/Border Aliases (Direct Values)

```css
/* Backgrounds */
--bg-primary     /* white / dark surface */
--bg-secondary   /* gray-50 / elevated dark */
--bg-tertiary    /* gray-100 / overlay dark */

/* Text */
--text-primary   /* gray-900 / gray-50 */
--text-secondary /* gray-600 / gray-300 */
--text-muted     /* gray-500 / gray-400 */

/* Borders */
--border-primary   /* gray-200 / gray-800 */
--border-secondary /* gray-300 / gray-700 */
```

### Surface Elevations (HSL)

```css
--surface-deep      /* Deepest layer */
--surface-base      /* Page background */
--surface-elevated  /* Cards, panels */
--surface-overlay   /* Modals, popovers */
```

### Constellation Accent Colors (HSL)

```css
--constellation-blue: 217 91% 55%;
--constellation-purple: 263 70% 60%;
--constellation-green: 160 60% 40%;
--constellation-orange: 30 90% 55%;
--constellation-pink: 330 80% 60%;
```

### Glow Colors (Direct rgba)

```css
--glow-blue: rgba(59, 130, 246, 0.12);    /* 0.15 in dark */
--glow-purple: rgba(139, 92, 246, 0.12);
--glow-green: rgba(16, 185, 129, 0.12);
--glow-orange: rgba(234, 88, 12, 0.12);
--glow-pink: rgba(236, 72, 153, 0.12);
```

### Button Branding Pattern (Critical)

Buttons use a CSS fallback chain for two branding contexts:

```css
/* In consumer chat: uses per-app color. Everywhere else: platform whitelabel */
background-color: var(--consumer-primary, var(--brand-color-ui));
```

- `--consumer-primary`: Set by `ConsumerLayout.svelte` for per-app branding
- `--brand-color-ui`: Platform whitelabel (auto-darkened in light mode for contrast)

### What NOT To Do

```svelte
<!-- BAD - hardcoded colors -->
<div style="background: white; color: #333; border: 1px solid #e5e7eb">
<button style="background: #f9db00">

<!-- BAD - Tailwind color utilities -->
<div class="bg-white text-gray-900 border-gray-200">

<!-- GOOD - CSS variables -->
<div style="background: hsl(var(--card)); color: hsl(var(--foreground)); border: 1px solid hsl(var(--border))">
<button style="background: var(--brand-color-ui); color: var(--brand-color-foreground)">
```

---

## Dark Mode

Dark mode activates via `.dark` class, `[data-theme="dark"]`, or `prefers-color-scheme: dark`. All CSS variables auto-switch. No conditional logic needed in components.

```svelte
<!-- This automatically works in both modes - no extra code needed -->
<div style="
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
">
```

For dark-mode-only overrides (rare), use:
```css
:global(.dark) .my-element { /* dark-only styles */ }
```

---

## Typography

### Font Families (CSS Variables)

```css
--font-sans: "Mulish", -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: "Chubbo", var(--font-sans);   /* Headings, buttons */
--font-serif: "Chubbo", var(--font-sans);      /* Same as display */
--font-mono: "SF Mono", ui-monospace, monospace;
```

### Font Sizes

```css
--text-xs: 0.75rem;   --text-sm: 0.875rem;  --text-base: 1rem;
--text-lg: 1.125rem;  --text-xl: 1.25rem;   --text-2xl: 1.5rem;
--text-3xl: 1.875rem; --text-4xl: 2.25rem;  --text-5xl: 3rem;
```

### Type Hierarchy

| Element | Font | CSS |
|---------|------|-----|
| H1-H3 | Chubbo | `font-family: var(--font-display); font-weight: var(--font-semibold)` |
| Body | Mulish | `font-family: var(--font-sans); font-size: var(--text-base)` |
| Labels | Mulish | `font-size: var(--text-sm); font-weight: var(--font-medium)` |
| Code | Mono | `font-family: var(--font-mono); font-size: var(--text-sm)` |

---

## Spacing & Radius

### Spacing Scale

```css
--space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
--space-4: 1rem;     --space-5: 1.25rem;   --space-6: 1.5rem;
--space-8: 2rem;     --space-10: 2.5rem;   --space-12: 3rem;
```

### Border Radius

```css
--radius-sm: 0.125rem;  --radius-md: 0.375rem;  --radius-lg: 0.5rem;
--radius-xl: 0.75rem;   --radius-2xl: 1rem;     --radius-3xl: 1.5rem;
--radius-full: 9999px;
```

### Shadows

```css
--shadow-sm   /* Subtle card shadow */
--shadow-md   /* Elevated elements */
--shadow-lg   /* Dropdowns, menus */
--shadow-xl   /* Modals */
--shadow-brand-glow     /* 24px brand glow */
--shadow-brand-glow-lg  /* 32px brand glow */
```

---

## Constellation Design Patterns

### Constellation Card (constellation.css)

Interactive cards with glow hover effects. Apply via CSS classes:

```svelte
<!-- Basic constellation card -->
<div class="constellation-card">
  <div style="padding: var(--space-4)">Content</div>
</div>

<!-- With color variant glow -->
<div class="constellation-card constellation-card--blue">...</div>
<div class="constellation-card constellation-card--purple">...</div>
<div class="constellation-card constellation-card--green">...</div>

<!-- Subtle variant (no lift, dimmer glow - good for sidebars) -->
<div class="constellation-card constellation-card--subtle">...</div>

<!-- Static variant (no hover effects at all) -->
<div class="constellation-card constellation-card--static">...</div>
```

Constellation cards get: hover lift (`translate: 0 -4px`), radial gradient glow from top, brand-color box-shadow, dark mode glass-morphism (`backdrop-filter: blur(8px)`).

### Constellation Background (base.css)

Apply `constellation-bg` class to `<body>` for the global gradient background:
- Light: Blue/purple radial gradients over off-white
- Dark: Brand color gradients over dark surface (whitelabel-aware)

### Constellation Animations (animations.css)

```css
/* Slide-up entrance with staggered delays (apply to list children) */
.constellation-animate-in          /* 0.4s slide-up from 12px */
.constellation-animate-in:nth-child(1)  /* delay: 0.05s */
.constellation-animate-in:nth-child(2)  /* delay: 0.10s */
/* ... up to :nth-child(8) at 0.40s */

/* Pulsing glow for emphasis */
.constellation-glow-pulse          /* Blue/purple glow pulse 3s */

/* Floating particles (decorative backgrounds) */
.constellation-particles + .constellation-particle
```

### Glow Utility Classes

```css
.glow-blue    .glow-purple    .glow-green    .glow-orange    .glow-pink
.hover\:glow-blue:hover    .hover\:glow-purple:hover
.shadow-brand-glow    .shadow-brand-glow-lg
```

### Other Animation Classes

```css
.animate-shimmer          /* Infinite text shimmer */
.animate-shimmer-slow     /* 3s text shimmer */
.animate-float            /* 3s vertical float */
.animate-shine            /* Horizontal shine sweep */
.animate-gradient-shift   /* Background gradient animation */
.skeleton-shimmer         /* Loading skeleton */
```

---

## Component Usage

### Import Pattern

```typescript
import { Button, Card, Input, Dialog, toasts } from '$lib/design-system';
import SlackSetupDialog from '$lib/design-system/components/builder/SlackSetupDialog.svelte';
```

### Button

```svelte
<Button variant="primary" on:click={handleClick}>Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="outline" disabled={true}>Disabled</Button>
<Button variant="ghost" size="lg">Ghost</Button>
<Button variant="danger" loading={true}>Delete</Button>
```

Variants: `primary` | `secondary` | `outline` | `ghost` | `danger` | `default` | `destructive`
Sizes: `sm` (32px) | `md` (40px) | `lg` (48px)
Props: `variant`, `size`, `disabled`, `loading`, `type`, `class`

### Card

```svelte
<Card padding="md" hoverable>
  <h3>Title</h3>
  <p>Content</p>
</Card>
```

Props: `padding` (`none` | `sm` | `md` | `lg`), `hoverable`, `animate`, `class`
Uses `hsl(var(--surface-elevated))` background, brand glow on hover.

### Input

```svelte
<Input
  label="Email"
  type="email"
  placeholder="you@example.com"
  bind:value={email}
  error={emailError}
  required
/>
```

Props: `type`, `value`, `placeholder`, `label`, `error`, `disabled`, `required`, `id`

### Dialog (Portal-based)

```svelte
<Dialog bind:open={showDialog}>
  <DialogHeader>
    <DialogTitle>Confirm</DialogTitle>
    <DialogDescription>Are you sure?</DialogDescription>
  </DialogHeader>
  <p>Dialog body content</p>
  <DialogFooter>
    <Button variant="outline" on:click={() => showDialog = false}>Cancel</Button>
    <Button variant="primary" on:click={confirm}>Confirm</Button>
  </DialogFooter>
</Dialog>
```

Props: `open`, `hideCloseButton`, `onOpenChange`
Auto-portals to body, locks scroll, Escape to close, backdrop blur.

### Toast Notifications

```typescript
import { toasts } from '$lib/design-system';

toasts.success('Saved!', 'Your changes have been saved.');
toasts.error('Error', 'Something went wrong.');
toasts.loading('Processing...', 'Please wait.');
```

---

## Svelte Patterns

### Component Props with Class Merging

```svelte
<script lang="ts">
  export let variant: 'primary' | 'secondary' = 'primary';
  let className: string = '';
  export { className as class };

  $: mergedClass = `my-component my-${variant} ${className}`.trim();
</script>

<div class={mergedClass} {...$$restProps}>
  <slot />
</div>
```

### Scoped Styles with Design Tokens

```svelte
<style>
  .my-component {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    transition: all var(--transition-fast);
  }

  .my-component:hover {
    border-color: hsl(var(--card-border-hover));
    background: hsl(var(--card-hover));
    box-shadow: var(--shadow-md);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
  }

  .heading {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    color: hsl(var(--foreground));
  }
</style>
```

### Transitions

```svelte
<script>
  import { fade, fly, scale } from 'svelte/transition';
</script>

<div transition:fade={{ duration: 150 }}>Fade</div>
<div transition:fly={{ y: 12, duration: 300 }}>Slide up</div>
<div transition:scale={{ start: 0.95, duration: 150 }}>Pop in</div>
```

### Svelte 5 Runes

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log(`Count: ${count}`);
  });
</script>
```

---

## Transitions & Z-Index

```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;

--z-dropdown: 1000;    --z-sticky: 1100;     --z-fixed: 1200;
--z-modal-backdrop: 1300;  --z-modal: 1400;  --z-popover: 1500;
--z-tooltip: 1600;     --z-toast: 1700;
```

---

## Copy Guidelines

- Use active voice, sentence case (not Title Case)
- First person plural for Chipp (we/our), second person for users (you/yours)
- Keep it conversational and simple

**Good**: "No code? No problem." / "Build it. Own it. Share it." / "We're here to help."
**Avoid**: Big words, jargon, ALL CAPS (except acronyms), over-promising

---

## Example: Constellation-Styled Component

```svelte
<script lang="ts">
  import { Button } from '$lib/design-system';
  import { createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';

  export let title: string;
  export let description: string;
  export let connected: boolean = false;

  const dispatch = createEventDispatcher();
</script>

<div class="integration-card constellation-card constellation-card--blue" transition:fly={{ y: 12, duration: 300 }}>
  <div class="card-content">
    <div class="header">
      <h3 class="title">{title}</h3>
      {#if connected}
        <span class="status-badge">Connected</span>
      {/if}
    </div>
    <p class="description">{description}</p>
    <Button
      variant={connected ? 'outline' : 'primary'}
      size="sm"
      on:click={() => dispatch('action')}
    >
      {connected ? 'Manage' : 'Connect'}
    </Button>
  </div>
</div>

<style>
  .card-content {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .status-badge {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-success);
    background: var(--color-success-light);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
  }

  .description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    line-height: var(--leading-relaxed);
    margin: 0;
  }
</style>
```

---

## Implementation Checklist

1. **Use CSS variables** - Never hardcode colors. `hsl(var(--foreground))` not `#333`
2. **Use design system components** - Check `$lib/design-system` before building custom
3. **Support dark mode** - All token-based styles auto-switch. Test both modes
4. **Typography** - `var(--font-display)` for headings, `var(--font-sans)` for body
5. **Constellation cards** - Use `constellation-card` class for interactive cards with glow
6. **Brand-aware** - Use `var(--brand-color-*)` for brand elements, never hardcode yellow
7. **Accessible** - Keyboard navigation, focus rings via `var(--ring)`, reduced motion support
8. **Responsive** - Start mobile-first
