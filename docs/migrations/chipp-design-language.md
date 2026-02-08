# Chipp Design Language: Visual Patterns from ProActionModal and KnowledgeSourceModal

## Executive Summary

Two flagship modal components in ChippMono establish the "Chipp design language": the **ProActionModal** (MCP Provider Grid) and the **KnowledgeSourceModal** (ConstellationGrid). Both use a shared visual vocabulary of radial gradient backgrounds, category-colored card glows, staggered entrance animations, and a dark/light adaptive theme system. This document extracts the exact CSS, animation code, and structural patterns needed to replicate this visual quality in Svelte 5 with CSS custom properties.

**Key insight**: ChippDeno already has the constellation card system (`constellation.css`, `animations.css`) ported. What it does NOT yet have are the **modal-specific patterns**: the gradient atmosphere backgrounds, the category-colored glow system, the circuit pattern overlay, the scanning animation, the icon container treatments, and the staggered card entrance choreography.

---

## 1. Shared Design Language Patterns

### 1.1 Gradient Atmosphere Background

Both modals use the same dual-radial-gradient technique to create a "cosmic" backdrop:

```css
/* The "constellation atmosphere" - used by both modals */
.modal-container {
  background:
    radial-gradient(
      ellipse 120% 80% at 20% 0%,
      var(--gradient-blue) 0%,       /* top-left blue wash */
      transparent 40%
    ),
    radial-gradient(
      ellipse 100% 60% at 80% 100%,
      var(--gradient-purple) 0%,     /* bottom-right purple wash */
      transparent 40%
    ),
    hsl(var(--background));          /* solid base */
}
```

**Token values (light mode)**:
```css
--gradient-blue: rgba(59, 130, 246, 0.08);
--gradient-purple: rgba(139, 92, 246, 0.06);
```

**Token values (dark mode)**:
```css
--gradient-blue: rgba(96, 165, 250, 0.12);
--gradient-purple: rgba(167, 139, 250, 0.1);
```

### 1.2 Category-Colored Card Glow System

Both modals assign each card a `data-category` attribute, which sets `--card-glow` and `--card-accent` CSS variables. On hover, a radial gradient overlay fades in from the top center:

```css
/* The card glow pseudo-element - IDENTICAL pattern in both modals */
.card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 0%,
    var(--card-glow, transparent) 0%,
    transparent 60-70%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.card:hover::before {
  opacity: 1;
}
```

### 1.3 Staggered Entrance Animation

Both modals use a slide-up animation with incrementing delays:

```css
/* Entrance animation */
.animate-in {
  animation: slide-up 0.4s ease-out forwards;
  opacity: 0;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(12-16px);  /* KS uses 12px, PA uses 16px */
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Stagger pattern** - applied via inline `style` in React:
```tsx
// KnowledgeSource: 50ms base + 50ms per card
style={{ animationDelay: `${0.05 + animationIndex * 0.05}s` }}

// ProAction: 30ms base + 30ms per card (faster, more items)
style={{ animationDelay: `${0.03 + animationIndex * 0.03}s` }}
```

CSS nth-child fallback (for cases where inline styles aren't used):
```css
.card:nth-child(1) { animation-delay: 0.05s; }
.card:nth-child(2) { animation-delay: 0.1s; }
.card:nth-child(3) { animation-delay: 0.15s; }
.card:nth-child(4) { animation-delay: 0.2s; }
.card:nth-child(5) { animation-delay: 0.25s; }
.card:nth-child(6) { animation-delay: 0.3s; }
```

### 1.4 Card Hover Lift Effect

```css
/* KnowledgeSource: subtle 2px lift */
.ks-source-card:hover {
  transform: translateY(-2px);
}

/* ProAction: more dramatic 3px lift with shadow */
.pa-provider-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px var(--pa-shadow-color);
}

/* Both use spring-back on click */
.card:active {
  transform: translateY(0);  /* or translateY(-1px) for PA */
}
```

### 1.5 Category Section Headers

Both use the same label + gradient line pattern:

```css
.category-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75-0.875rem;
  padding: 0 0.25rem;
}

.category-label {
  font-size: 0.65-0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1-0.15em;
  color: var(--muted-foreground-dimmed);  /* ~0.4-0.7 opacity */
  white-space: nowrap;
}

.category-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(
    90deg,
    hsl(var(--border)) 0%,
    transparent 100%
  );
}
```

### 1.6 Icon Container Treatment

```css
/* KnowledgeSource icon container: 36x36, 10px radius */
.ks-card-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid hsl(var(--border));
}

/* ProAction icon container: 42x42, 10px radius */
.pa-card-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--pa-elevated-bg);  /* rgba(0,0,0,0.02) light / rgba(255,255,255,0.05) dark */
  border: 1px solid var(--pa-border-dim);
  transition: all 0.25s ease;
}

/* Icon SVGs: 20px, thin stroke */
.card-icon svg {
  width: 20px;
  height: 20px;
  stroke: var(--foreground);
  stroke-width: 1.5;
}

/* Logo images: 22-26px, contain */
.card-icon img {
  width: 22-26px;
  height: 22-26px;
  object-fit: contain;
}
```

**Hover: icon background colorizes by category**:
```css
/* Example: cloud category on hover */
.card[data-category="cloud"]:hover .card-icon {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.3);
}
```

---

## 2. ProActionModal (MCPProviderGrid) - Unique Patterns

**Source files:**
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/MCPProviderGrid.tsx`
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/build/components/pro-action-modal.css`

### 2.1 Circuit Pattern Overlay (Dark Mode Only)

```css
.dark .pa-modal-container {
  background:
    /* Circuit pattern - SVG inline data URL */
    url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0v15M30 45v15M0 30h15M45 30h15' stroke='%23ffffff' stroke-opacity='0.02' stroke-width='1'/%3E%3Ccircle cx='30' cy='30' r='2' fill='%23ffffff' fill-opacity='0.02'/%3E%3C/svg%3E"),
    /* Gradient atmosphere (same as above) */
    radial-gradient(ellipse 100% 100% at 0% 0%, var(--pa-gradient-primary) 0%, transparent 50%),
    radial-gradient(ellipse 80% 80% at 100% 100%, var(--pa-gradient-secondary) 0%, transparent 50%),
    var(--pa-bg-void);
}
```

This creates a subtle grid-dot pattern behind the content. Only visible in dark mode.

### 2.2 Scanning Line Animation

Two horizontal lines sweep across the modal continuously:

```css
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
  background: linear-gradient(90deg, transparent, var(--pa-primary), transparent);
  height: 1px;
  width: 100%;
  animation: pa-scan 8s linear infinite;
}

.pa-grid-lines::before {
  top: 30%;
  animation-delay: 0s;
  opacity: var(--pa-scan-opacity);  /* 0.08 light, 0.15 dark */
}

.pa-grid-lines::after {
  top: 70%;
  animation-delay: -4s;
  opacity: calc(var(--pa-scan-opacity) * 0.66);
}

@keyframes pa-scan {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

### 2.3 Header Icon with Pulsing Glow

The header icon has a gradient background AND a blurred glow layer that pulses:

```css
.pa-header-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 1.25rem;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Gradient fill behind icon */
.pa-header-icon::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--pa-accent-dev), var(--pa-accent-crm));
  /* indigo (#6366f1) to teal (#00d4aa) */
  border-radius: 16px;
  opacity: 0.15;
  animation: pa-pulse-glow 3s ease-in-out infinite;
}

/* Outer glow ring (blurred) */
.pa-header-icon::after {
  content: "";
  position: absolute;
  inset: -2px;
  background: linear-gradient(135deg, var(--pa-accent-dev), var(--pa-accent-crm));
  border-radius: 18px;
  opacity: 0.3;
  filter: blur(8px);
  animation: pa-pulse-glow 3s ease-in-out infinite;
}

@keyframes pa-pulse-glow {
  0%, 100% { opacity: 0.15; transform: scale(1); }
  50% { opacity: 0.25; transform: scale(1.02); }
}

/* Icon itself sits above */
.pa-header-icon svg,
.pa-header-icon img {
  position: relative;
  z-index: 1;
  width: 36px;
  height: 36px;
}
```

### 2.4 Connection Dot (Hover Reveal)

Cards show a small colored dot in the top-right corner on hover:

```css
.pa-provider-card::after {
  content: "";
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  background: var(--card-accent, var(--pa-text-muted));
  border-radius: 50%;
  opacity: 0;
  transition: all 0.3s ease;
  box-shadow: 0 0 8px var(--card-accent, transparent);
}

.pa-provider-card:hover::after {
  opacity: 1;
}
```

### 2.5 Category Color Palette

| Category | Accent Color | Glow (light) | Glow (dark) |
|----------|-------------|-------------|------------|
| CRM | `#00b894` / `#00d4aa` | `rgba(0, 184, 148, 0.15)` | `rgba(0, 212, 170, 0.2)` |
| Dev | `#6366f1` | `rgba(99, 102, 241, 0.15)` | `rgba(99, 102, 241, 0.2)` |
| Productivity | `#f59e0b` | `rgba(245, 158, 11, 0.15)` | `rgba(245, 158, 11, 0.2)` |
| Data | `#ec4899` | `rgba(236, 72, 153, 0.15)` | `rgba(236, 72, 153, 0.2)` |
| Comms | `#3b82f6` | `rgba(59, 130, 246, 0.15)` | `rgba(59, 130, 246, 0.2)` |
| Custom | `#8b5cf6` | `rgba(139, 92, 246, 0.15)` | `rgba(139, 92, 246, 0.2)` |

### 2.6 Filter Chips

```css
.pa-filter-chip {
  padding: 0.375rem 0.875rem;
  background: var(--pa-elevated-bg);
  border: 1px solid var(--pa-border-subtle);
  border-radius: 20px;
  color: var(--pa-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pa-filter-chip[data-active="true"] {
  background: var(--pa-primary-glow);    /* rgba(99, 102, 241, 0.2-0.3) */
  border-color: var(--pa-primary);       /* #6366f1 */
  color: var(--pa-text-bright);
}
```

### 2.7 Custom Server Card (Dashed Border)

```css
.pa-custom-server-card {
  background: linear-gradient(135deg,
    rgba(139, 92, 246, 0.08) 0%,
    rgba(99, 102, 241, 0.08) 100%
  );
  border: 1px dashed var(--pa-border-glow);
}

.pa-custom-server-card:hover {
  background: linear-gradient(135deg,
    rgba(139, 92, 246, 0.12) 0%,
    rgba(99, 102, 241, 0.12) 100%
  );
  border-style: solid;
  border-color: var(--pa-accent-custom);  /* #8b5cf6 */
}
```

### 2.8 Monospace Typography (Tech Feel)

ProAction uses monospace fonts for category labels, badges, and tool counts:

```css
.pa-category-label {
  font-family: "JetBrains Mono", "SF Mono", monospace;
}

.pa-connected-badge,
.pa-pending-badge,
.pa-oauth-badge,
.pa-category-count,
.pa-tool-count {
  font-family: "JetBrains Mono", monospace;
}
```

### 2.9 Badge Styling

```css
/* Connected badge - top right corner */
.pa-connected-badge {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  background: rgba(0, 212, 170, 0.15);
  color: var(--pa-accent-crm);
  border: 1px solid rgba(0, 212, 170, 0.25);
}

/* OAuth badge - bottom right */
.pa-oauth-badge {
  position: absolute;
  bottom: 0.35rem;
  right: 0.35rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.5rem;
  font-weight: 600;
  padding: 0.125rem 0.3rem;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--pa-accent-dev);
  border: 1px solid rgba(99, 102, 241, 0.2);
}
```

### 2.10 Grid Layout

```css
.pa-provider-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

/* Responsive breakpoints */
@media (max-width: 900px) { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 640px) { grid-template-columns: repeat(3, 1fr); }
@media (max-width: 480px) { grid-template-columns: repeat(2, 1fr); }
```

### 2.11 Modal Dimensions

```css
/* DialogContent wrapper */
max-width: 1100px;
height: 720px;
padding: 0;
border: 0;
background: transparent;
```

---

## 3. KnowledgeSourceModal (ConstellationGrid) - Unique Patterns

**Source files:**
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/features/knowledge-sources/components/KnowledgeSourceModal/ConstellationGrid.tsx`
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/features/knowledge-sources/components/KnowledgeSourceModal/knowledge-source-modal.css`
- `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/features/knowledge-sources/components/KnowledgeSourceModal/index.tsx`

### 3.1 Header Icon (Constellation Node SVG)

```html
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
  <circle cx="12" cy="5" r="1.5" stroke-width="1.5"/>
  <circle cx="5" cy="12" r="1.5" stroke-width="1.5"/>
  <circle cx="19" cy="12" r="1.5" stroke-width="1.5"/>
  <circle cx="12" cy="19" r="1.5" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="2" stroke-width="1.5"/>
  <path d="M12 7v3M12 14v3M9 12H7M17 12h-3" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
  <path d="M9.5 9.5l-2-2M14.5 9.5l2-2M9.5 14.5l-2 2M14.5 14.5l2 2" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
</svg>
```

Icon container (glass effect):
```css
.ks-header-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 1rem;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(96, 165, 250, 0.2));
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid hsl(var(--border));
  backdrop-filter: blur(8px);
}
```

### 3.2 Category Color Palette

| Category | Accent Color (HSL var) | Glow | Hover Icon BG |
|----------|----------------------|------|---------------|
| Cloud | `hsl(var(--constellation-blue))` | `var(--glow-blue)` | `rgba(96, 165, 250, 0.15)` |
| Social | `hsl(var(--constellation-orange))` | `var(--glow-orange)` | `rgba(251, 146, 60, 0.15)` |
| Docs | `hsl(var(--constellation-purple))` | `var(--glow-purple)` | `rgba(167, 139, 250, 0.15)` |
| Media | `hsl(var(--constellation-green))` | `var(--glow-green)` | `rgba(52, 211, 153, 0.15)` |
| API | `hsl(var(--constellation-pink))` | `var(--glow-pink)` | `rgba(244, 114, 182, 0.15)` |

### 3.3 Floating Particles (Disabled but Defined)

Currently `display: none` but the animation system is preserved:

```css
.ks-particle {
  position: absolute;
  width: 2px;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  animation: ks-float 20s ease-in-out infinite;
}

/* 8 particles at different positions and timing */
.ks-particle:nth-child(1) { left: 10%; top: 20%; animation-delay: 0s; animation-duration: 25s; }
.ks-particle:nth-child(2) { left: 20%; top: 40%; animation-delay: -5s; animation-duration: 20s; }
/* ... through :nth-child(8) */

@keyframes ks-float {
  0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
  25%      { transform: translateY(-20px) translateX(10px); opacity: 0.5; }
  50%      { transform: translateY(-10px) translateX(-5px); opacity: 0.2; }
  75%      { transform: translateY(-30px) translateX(15px); opacity: 0.4; }
}
```

### 3.4 Primary Button (Gradient + Shadow Lift)

```css
.ks-btn-primary {
  background: linear-gradient(135deg,
    hsl(var(--constellation-purple)),  /* purple */
    hsl(var(--constellation-blue))     /* blue */
  );
  border: none;
  color: white;
  box-shadow: 0 2px 8px rgba(167, 139, 250, 0.3);
}

.ks-btn-primary:hover {
  box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
  transform: translateY(-1px);
}

.ks-btn-primary:active {
  transform: translateY(0);
}
```

### 3.5 Progress Bar (Brand Gradient)

```css
.ks-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand-color), var(--brand-color-light));
  border-radius: 2px;
  transition: width 0.3s ease;
}
```

### 3.6 Input Focus Glow

```css
.ks-input:focus {
  border-color: var(--brand-color);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 3px var(--brand-color-glow);
}
```

### 3.7 Footer Fade-Out Gradient

```css
.ks-footer {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
  background: linear-gradient(to top, hsl(var(--background)) 80%, transparent);
  border-top: 1px solid hsl(var(--border));
  z-index: 10;
}
```

### 3.8 Section Divider

```css
.ks-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, hsl(var(--border)), transparent);
  margin: 1.5rem 0;
}
```

### 3.9 Grid Layout

```css
.ks-source-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

@media (max-width: 640px) {
  grid-template-columns: repeat(2, 1fr);
}
```

### 3.10 Modal Dimensions

```css
/* DialogContent wrapper */
width: 800px;
height: 600px;
padding: 0;
border: 0;
background: transparent;
```

---

## 4. Typography Scale

| Element | Font Size | Weight | Letter Spacing | Font Family |
|---------|-----------|--------|---------------|-------------|
| Modal title | 1.5-1.625rem | 700 | -0.02em | System / Chubbo |
| Modal description | 0.875-0.9rem | 400 | 0 | System / Mulish |
| Category label | 0.65-0.7rem | 600 | 0.1-0.15em | JetBrains Mono (PA) / System (KS) |
| Card label | 0.8rem | 600 | 0 | System |
| Badge text | 0.5-0.6rem | 600-700 | 0.03-0.05em | JetBrains Mono (PA) / System (KS) |
| Filter chip | 0.75rem | 500 | 0.05em | System |
| Input text | 0.875-0.9rem | 400 | 0 | System |
| Form label | 0.75-0.8rem | 600 | 0.01-0.05em | System |

---

## 5. Transition / Easing Reference

| Element | Duration | Easing | Property |
|---------|----------|--------|----------|
| Card hover | 0.2-0.25s | `ease` / `cubic-bezier(0.4, 0, 0.2, 1)` | all |
| Card glow reveal | 0.3s | `ease` | opacity |
| Entrance animation | 0.4s | `ease-out` / `cubic-bezier(0.4, 0, 0.2, 1)` | opacity + transform |
| Input focus | 0.2s | `ease` | all |
| Scan line | 8s | `linear` | transform (infinite) |
| Pulse glow | 3s | `ease-in-out` | opacity + transform (infinite) |
| Float particle | 20-28s | `ease-in-out` | transform + opacity (infinite) |
| Loader spin | 0.8s | `linear` | transform (infinite) |

---

## 6. Dark Mode Strategy

Both modals use a **layered variable strategy**:

1. **Component-level CSS variables** (e.g., `--pa-bg-card`, `--ks-text-primary`) are defined in `:root`
2. **Dark overrides** in `.dark { }` change only the values that differ
3. **Global tokens** (`--background`, `--foreground`, `--border`, etc.) are inherited from the design system

**Light mode** uses:
- Subtle rgba backgrounds: `rgba(0, 0, 0, 0.02-0.03)` for elevated surfaces
- Lower opacity glows: 0.12-0.15
- Lighter shadows: `rgba(0, 0, 0, 0.15)`

**Dark mode** uses:
- Deep backgrounds: `#06060a`, `#0a0b10`, `rgba(18, 20, 28, 0.85)`
- Higher opacity glows: 0.15-0.2
- backdrop-filter: `blur(8px)` on cards
- Heavier shadows: `rgba(0, 0, 0, 0.4-0.5)`

---

## 7. Svelte 5 Implementation Guide

### 7.1 Card Component Pattern

```svelte
<script lang="ts">
  type Category = 'cloud' | 'social' | 'docs' | 'media' | 'api' | 'dev' | 'crm' | 'custom';

  interface Props {
    category?: Category;
    animationIndex?: number;
    disabled?: boolean;
    onclick?: () => void;
  }

  let { category = 'docs', animationIndex = 0, disabled = false, onclick }: Props = $props();
</script>

<button
  class="modal-card animate-in"
  data-category={category}
  data-disabled={disabled}
  style:animation-delay="{0.03 + animationIndex * 0.03}s"
  onclick={disabled ? undefined : onclick}
  {disabled}
>
  <div class="card-icon">
    <slot name="icon" />
  </div>
  <span class="card-label">
    <slot />
  </span>
  <slot name="badge" />
</button>

<style>
  .modal-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 0.625rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px);
    overflow: hidden;
    min-height: 96px;
  }

  .modal-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 0%,
      var(--card-glow, transparent) 0%,
      transparent 60%
    );
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .modal-card:hover {
    background: hsl(var(--card-hover));
    border-color: hsl(var(--card-border-hover));
    transform: translateY(-3px);
    box-shadow: 0 8px 24px hsl(var(--foreground) / 0.1);
  }

  .modal-card:hover::before { opacity: 1; }
  .modal-card:active { transform: translateY(-1px); }

  /* Category glow mapping */
  .modal-card[data-category="cloud"] { --card-glow: var(--glow-blue); }
  .modal-card[data-category="docs"]  { --card-glow: var(--glow-purple); }
  .modal-card[data-category="social"] { --card-glow: var(--glow-orange); }
  .modal-card[data-category="media"] { --card-glow: var(--glow-green); }
  .modal-card[data-category="api"]   { --card-glow: var(--glow-pink); }
  .modal-card[data-category="dev"]   { --card-glow: rgba(99, 102, 241, 0.2); }
  .modal-card[data-category="crm"]   { --card-glow: rgba(0, 212, 170, 0.2); }
  .modal-card[data-category="custom"] { --card-glow: rgba(139, 92, 246, 0.2); }

  /* Disabled state */
  .modal-card[data-disabled="true"] {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .modal-card[data-disabled="true"]:hover {
    transform: none;
    background: hsl(var(--card));
    border-color: hsl(var(--border));
    box-shadow: none;
  }

  /* Entrance animation */
  .animate-in {
    animation: slide-up 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    opacity: 0;
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Icon container */
  .card-icon {
    position: relative;
    z-index: 1;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: hsl(var(--muted) / 0.3);
    border: 1px solid hsl(var(--border) / 0.5);
    transition: all 0.25s ease;
  }

  .card-label {
    position: relative;
    z-index: 1;
    font-size: 0.8rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-align: center;
    line-height: 1.25;
  }
</style>
```

### 7.2 Modal Atmosphere Background

```svelte
<style>
  .modal-atmosphere {
    background:
      radial-gradient(ellipse 120% 80% at 20% 0%, var(--gradient-blue) 0%, transparent 40%),
      radial-gradient(ellipse 100% 60% at 80% 100%, var(--gradient-purple) 0%, transparent 40%),
      hsl(var(--background));
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    border-radius: 12px;
  }
</style>
```

### 7.3 Scanning Lines (Svelte)

```svelte
<div class="scan-lines" aria-hidden="true"></div>

<style>
  .scan-lines {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .scan-lines::before,
  .scan-lines::after {
    content: "";
    position: absolute;
    background: linear-gradient(90deg, transparent, hsl(var(--primary)), transparent);
    height: 1px;
    width: 100%;
    animation: scan 8s linear infinite;
  }
  .scan-lines::before { top: 30%; opacity: 0.08; }
  .scan-lines::after { top: 70%; animation-delay: -4s; opacity: 0.05; }

  :global(.dark) .scan-lines::before { opacity: 0.15; }
  :global(.dark) .scan-lines::after { opacity: 0.1; }

  @keyframes scan {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
</style>
```

### 7.4 CSS Variables to Add to tokens.css

ChippDeno already has the constellation tokens. These are the **missing** component-specific tokens that should be added when building modals like these:

```css
:root {
  /* Elevated surface (slightly lifted from background) */
  --elevated-bg: rgba(0, 0, 0, 0.02);

  /* Scan animation opacity (light mode is subtle) */
  --scan-opacity: 0.08;

  /* Footer fade */
  --footer-fade: hsl(var(--background) / 0.95);

  /* Shadow color for card hover */
  --shadow-color: rgba(0, 0, 0, 0.15);
}

.dark {
  --elevated-bg: rgba(255, 255, 255, 0.05);
  --scan-opacity: 0.15;
  --footer-fade: rgba(6, 6, 10, 0.95);
  --shadow-color: rgba(0, 0, 0, 0.4);
}
```

---

## 8. Key Differences: ProAction vs KnowledgeSource

| Aspect | ProAction (PA) | KnowledgeSource (KS) |
|--------|---------------|---------------------|
| **Theme** | "Neural Command" - tech/circuit | "Constellation" - cosmic/nodes |
| **Grid** | 5-column (wider modal) | 3-column |
| **Card size** | Smaller cards, more dense | Larger cards, more spacious |
| **Icon size** | 42x42 | 36x36 |
| **Animation delay** | 30ms increments | 50ms increments |
| **translateY on hover** | -3px + shadow | -2px, no shadow |
| **Background extra** | Circuit SVG pattern + scan lines | Floating particles (disabled) |
| **Typography** | JetBrains Mono for tech labels | System font for labels |
| **Header icon** | Gradient glow pulse animation | Glass-morphism card |
| **Search** | Built-in search + filter chips | None |
| **Badges** | Connected, OAuth, Pending, Aggregator | "New" badge only |
| **Category colors** | CRM/Dev/Productivity/Data/Comms/Custom | Cloud/Social/Docs/Media/API |
| **Modal size** | 1100x720 | 800x600 |
| **Primary button** | Indigo-to-teal gradient | Purple-to-blue gradient |

---

## 9. Reduced Motion Support

Both modals should respect `prefers-reduced-motion`. ChippDeno already has this in `animations.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Whitelabel Compatibility Notes

1. **All background gradients** use `var(--gradient-blue)` and `var(--gradient-purple)` which are already defined in ChippDeno's `tokens.css`. These use constellation colors, not brand colors, so they remain consistent across whitelabel configurations.

2. **Card glows** use the `--glow-*` tokens which are also constellation-based (not brand-based). Safe for whitelabel.

3. **Brand-sensitive elements**: Input focus (`--brand-color`), progress bars (`--brand-color`), and primary buttons should use brand tokens. The KS modal already does this correctly.

4. **PA modal's accent colors** (teal, indigo, amber, etc.) are hardcoded category colors -- NOT brand colors. These should remain fixed even under whitelabel. They are functional category indicators, not branding.

5. **Fonts**: PA uses `JetBrains Mono` for its tech aesthetic. This should map to a `--font-mono` variable in Svelte: `font-family: var(--font-mono, 'JetBrains Mono', 'SF Mono', monospace)`.
