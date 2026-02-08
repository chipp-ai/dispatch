# Feature Migration Report: App Generator Step Tracker / Progress Tracker

## Executive Summary
- **What it does**: An animated vertical progress list that shows real-time generation stages (7-8 tasks) as an AI app is created. The active task stays sticky at the top, completed tasks scroll above, pending tasks wait below. The entire list auto-scrolls to keep the active item centered. A "dominoes" effect cascades through the stages.
- **Complexity**: Medium (the CSS/animation system is intricate but self-contained)
- **Dependencies**: The step tracker itself is a standalone visual component. The orchestrating logic (API calls, stage management) lives in a separate store/hook.
- **ChippDeno Status**: **Already fully ported.** ChippDeno has `AppGeneratorProgress.svelte`, `AppGenerator.svelte`, `AppGeneratorSuccess.svelte`, and `appGenerator.ts` store. Also has `OnboardingStepper.svelte` for the onboarding flow.

---

## Component Inventory

There are **4 distinct step tracker components** in ChippMono, each with its own visual language:

### 1. Simple Stepper (Legacy Onboarding)
- **File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/general/Stepper/Stepper.tsx`
- **Purpose**: Horizontal dot progress bar for old onboarding flow (5 questions)
- **Visual**: Thin rounded bars (`h-[6px]`) with active=yellow, inactive=gray
- **Animation**: None - purely CSS class swapping

### 2. OnboardingStepper V2 (Builder Onboarding)
- **File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/OnboardingStepper.tsx`
- **Purpose**: Horizontal step indicator with icons for 4-step onboarding (Build, Train, Share, Unlock)
- **Visual**: Circular icons with connector lines, Framer Motion animations
- **Animation**: Framer Motion `scale`, `opacity` transitions with staggered delays

### 3. AppGenerationProgress (The Main "Dominoes" Component)
- **File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx`
- **Purpose**: The primary vertical scrolling progress tracker for the app generator
- **Visual**: Card-based list with sticky active item, shimmer effects, glowing borders
- **Animation**: CSS `@keyframes`, auto-scroll, sticky positioning

### 4. SuccessScreen
- **File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx`
- **Purpose**: Celebration screen shown after all generation stages complete
- **Visual**: Logo showcase with callout arrow, gradient glow card, animated CTA
- **Animation**: Framer Motion spring/fly transitions, canvas-confetti

---

## Component 1: Simple Stepper (Legacy)

### Source File
`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/general/Stepper/Stepper.tsx`

### Props
```typescript
interface StepperProps {
  numSteps: number;     // Total number of steps
  activeStep: number;   // Currently active step index (0-based)
  onClick?: (index: number) => void;  // Optional click handler
}
```

### Markup
```jsx
<div className="w-full flex justify-stretch gap-[16px]">
  {[...Array(numSteps)].map((_, index) => (
    <div
      key={index}
      className={clsx("h-[6px] grow rounded-full", {
        "bg-yellow-500": index === activeStep,
        "bg-random-90": index !== activeStep,
        "cursor-pointer": typeof onClick !== "undefined",
      })}
      onClick={onClick?.bind(null, index)}
    />
  ))}
</div>
```

### CSS Details
| Property | Active | Inactive |
|----------|--------|----------|
| Height | `6px` | `6px` |
| Border radius | `rounded-full` (9999px) | `rounded-full` |
| Background | `bg-yellow-500` (`#eab308`) | `bg-random-90` (custom gray) |
| Layout | `flex`, `gap: 16px`, `grow` | Same |
| Cursor | `pointer` if onClick | Default |

### Animation
None. Pure CSS class toggle.

---

## Component 2: OnboardingStepper V2

### Source File
`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/OnboardingStepper.tsx`

### Props
```typescript
interface OnboardingStepperProps {
  currentStep: OnboardingStep;           // "build" | "train" | "share" | "unlock"
  completedSteps: OnboardingStep[];      // Array of completed step IDs
  compact?: boolean;                     // Mobile mode (default: false)
}
```

### Step Configuration
```typescript
const STEP_ICONS: Record<OnboardingStep, Component> = {
  build: Sparkles,
  train: BookOpen,
  share: Share2,
  unlock: Unlock,
};
```

### Full Mode Markup Structure
```
stepper (space-y-4)
  step-bar (flex items-center gap-1)
    for each step:
      step-container (flex items-center flex-1)
        motion.div (flex flex-col items-center gap-1 flex-1)
          motion.div (w-8 h-8 rounded-full - the circle)
            CheckCircle2 or StepIcon
          span (text-[10px] - the label)
        div (h-0.5 flex-1 mx-1 rounded-full - connector line)
  step-header
    p (text-xs - "Step X of Y")
    h1 (text-2xl font-['Chubbo'] - step label)
    p (text-sm - step description)
```

### Framer Motion Animations

**Circle entrance (staggered):**
```typescript
initial={{ opacity: 0, scale: 0.8 }}
animate={{ opacity: 1, scale: 1 }}
transition={{
  duration: 0.3,
  delay: index * 0.05,     // 50ms stagger between each step
  ease: [0.23, 1, 0.32, 1] // Custom cubic-bezier (ease-out quint)
}}
```

**Active circle scale:**
```typescript
initial={false}
animate={{ scale: isCurrent ? 1.1 : 1 }}
transition={{ duration: 0.2 }}
```

### CSS Details

**Circle (32x32px):**
| State | Background | Shadow | Text Color |
|-------|-----------|--------|------------|
| Current | `bg-brand` | `shadow-brand-glow` | `text-brand-foreground` |
| Completed | `bg-brand` | `shadow-brand-glow` | `text-brand-foreground` (Check icon) |
| Upcoming | `bg-muted` | None | `text-muted-foreground` |

**Connector line (0.5 height):**
| State | Background |
|-------|-----------|
| Before current | `bg-brand/40` |
| After current | `bg-muted` |

**Labels:**
| State | Color | Weight |
|-------|-------|--------|
| Current | `text-foreground` | `font-medium` |
| Completed | `text-brand` | Normal |
| Upcoming | `text-muted-foreground` | Normal |

**Typography:**
- Step label: `font-['Mulish']`, `text-[10px]`, `text-center`
- Step counter: `font-['Mulish']`, `text-xs`, `text-muted-foreground`
- Step title: `font-['Chubbo']`, `text-2xl`, `font-medium`, `tracking-tight`
- Step description: `font-['Mulish']`, `text-sm`, `text-muted-foreground`

### Compact Mode (Mobile)
Same structure without labels or step header. Just circles + connector lines.

Compact differences:
- Completed non-current: `bg-brand/20`, `text-brand` (Check icon)
- Active: Same as full mode
- Connector active: `bg-brand/30` (vs `bg-brand/40`)

---

## Component 3: AppGenerationProgress (Main "Dominoes" Tracker)

### Source File
`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx`

### Props
```typescript
interface TaskItem {
  id: string | number;
  name: string;           // Display name (changes per status: "Create" / "Creating" / "Created")
  description: string;
  icon: string;           // Emoji
  status: "pending" | "active" | "completed";
  preview?: string;       // Optional preview text for completed items
  completedAt?: Date;     // Timestamp for "X ago" display
}

interface AppGenerationProgressProps {
  items: TaskItem[];
  onComplete?: (itemId: string | number) => void;
  title?: string;         // Default: "Task Progress"
  subtitle?: string;      // Default: "Active task stays at the top..."
}
```

### Overall Layout Structure
```
max-w-3xl mx-auto p-4 sm:p-6
  header (mb-6 sm:mb-8 mt-12 sm:mt-0)
    h1.title
    p.subtitle
  progress-wrapper (bg-transparent rounded-lg overflow-hidden relative)
    scroll-container (h-[calc(100dvh-240px)] overflow-y-auto scrollbar-hide)
      items-container (relative pt-12 sm:pt-24)
        completed items...
        active item (sticky top-0 z-10)
        pending items...
        bottom padding (h-48 sm:h-96)
    fade-top overlay (z-200)
    fade-bottom overlay (z-200)
```

### Completed Item Card
```
div (rounded-xl sm:rounded-2xl p-3 sm:p-5 mb-2 sm:mb-3 min-h-[60px] sm:min-h-[100px])
  transition: all 0.5s
  background: bg-background/40 backdrop-blur-sm
  border: 1px solid border/30
  hover: bg-background/50

  flex layout (gap-3 sm:gap-4):
    icon (w-8 h-8 sm:w-10 sm:h-10):
      gradient: from-green-400 to-green-500
      rounded-lg sm:rounded-xl
      shadow: shadow-lg shadow-green-500/20
      content: CheckCircle2 (white)
    info:
      h3: font-medium text-foreground text-sm
      p: text-xs text-muted-foreground (time ago)
    badge: text-xs text-muted-foreground font-mono "Done"
```

### Active Item Card (THE KEY VISUAL)
```
div.sticky (top-0 z-10 mb-2 sm:mb-3)
  animate: slide-in-from-bottom-2 duration-500

  glow-effect (absolute -inset-1):
    gradient: from-blue-400 via-purple-400 to-blue-400
    rounded-xl sm:rounded-2xl
    blur: blur-lg sm:blur-xl
    opacity: 0.7, hover:1.0
    animation: gradientPulse 2s ease-in-out infinite (opacity 0.7 -> 1.0 -> 0.7)

  main-card:
    background: bg-background/90 backdrop-blur-sm
    border: 1px solid border/50
    shadow: shadow-2xl
    rounded-xl sm:rounded-2xl
    overflow: hidden

    background-pattern (opacity-[0.03]):
      radial-gradient(circle_at_20%_50%, rgba(120,119,198,0.3), transparent_50%)
      radial-gradient(circle_at_80%_50%, rgba(120,119,198,0.3), transparent_50%)

    shimmer-effect:
      translateX(-100%) -> translateX(200%)
      animation: shimmer 3s infinite
      gradient: transparent -> white/20 -> transparent

    content (p-3 sm:p-5):
      icon (w-8 h-8 sm:w-10 sm:h-10):
        bg-background rounded-lg sm:rounded-xl
        shadow-md border-border
        Loader2 (animate-spin text-muted-foreground)
        green pulsing dot:
          solid: w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500
          ping: bg-green-400 animate-ping
      info:
        h3: font-semibold text-foreground text-sm sm:text-base
        p: text-xs text-muted-foreground "In progress..."
```

### Pending Item Card
```
div (rounded-xl sm:rounded-2xl p-3 sm:p-5 mb-2 sm:mb-3 min-h-[60px] sm:min-h-[100px])
  transition: all 0.3s
  background: bg-background/20 backdrop-blur-sm
  border: 1px solid border/20
  hover: bg-background/30 border-border/30 shadow-md
  animation-delay: index * 50ms

  flex layout (gap-3 sm:gap-4):
    icon (w-8 h-8 sm:w-10 sm:h-10):
      gradient: from-gray-100 to-gray-200
      hover: from-gray-200 to-gray-300
      rounded-lg sm:rounded-xl
      content: emoji (text-base sm:text-xl, hover:scale-110)
    info:
      h3: font-medium text-muted-foreground text-sm, hover:text-foreground
      p: text-xs text-muted-foreground "Waiting..."
    badge: text-xs text-gray-300 font-mono opacity-0 hover:opacity-1 "Up next"
```

### Fade Overlays
```css
/* Top fade - matches page background #FCFBF7 */
.fade-top {
  position: absolute;
  top: 0;
  height: 60px (sm: 80px);
  z-index: 200;
  background: linear-gradient(
    to bottom,
    #FCFBF7,
    rgba(252, 251, 247, 0.8),
    rgba(252, 251, 247, 0.3),
    transparent
  );
}

/* Bottom fade */
.fade-bottom {
  position: absolute;
  bottom: 0;
  height: 80px (sm: 120px);
  z-index: 200;
  background: linear-gradient(
    to top,
    #FCFBF7,
    rgba(252, 251, 247, 0.6),
    transparent
  );
}
```

### @keyframes Definitions

```css
@keyframes shimmer {
  to {
    transform: translateX(200%);
  }
}

@keyframes gradient {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

@keyframes slide-in-from-bottom-2 {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes fade-in-50 {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### Auto-Scroll Mechanics

The scroll is driven by JavaScript, not CSS animation:

1. **Trigger**: `useEffect` fires whenever `items` array changes (re-renders on status change)
2. **Calculation**: Measures DOM heights of completed items + header
3. **Center formula**: `scrollTop = completedSectionHeight + topPadding - (containerHeight - activeItemHeight) / 2`
4. **Behavior**: `scrollTo({ behavior: "smooth" })` - native CSS smooth scroll
5. **Delay**: 50ms timeout to ensure DOM is updated before measuring
6. **Initial position**: Set immediately on mount (100ms delay, no smooth scroll)

### Empty State
```
div (p-8 sm:p-12 text-center animate-in fade-in-50 duration-1000)
  icon (w-12 h-12 sm:w-16 sm:h-16):
    gradient: from-green-400 to-green-500
    rounded-xl sm:rounded-2xl
    shadow: shadow-lg shadow-green-500/25
    content: CheckCircle2 (white)
  p: text-foreground font-semibold text-base sm:text-lg
  p: text-muted-foreground text-sm "All tasks completed successfully"
```

### Page Background
The entire page uses `bg-[#FCFBF7]` (warm off-white) with a dot pattern overlay:
```css
.dot-pattern {
  opacity: 0.05;
  background-image: radial-gradient(#000 1px, transparent 1px);
  background-size: 20px 20px;
}
```

### Scrollbar Hiding
```css
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

---

## Component 4: SuccessScreen

### Source File
`/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx`

### Key Visual Elements

**Card glow effect:**
```css
.glow {
  position: absolute;
  inset: -8px (sm: -16px);
  border-radius: 2xl (sm: 3xl);
  filter: blur(16px) (sm: blur(24px));
  opacity: 0.2;
  animation: gradientPulse 2s ease-in-out infinite;
  background: linear-gradient(to right, primaryColor+80, primaryColor, primaryColor+60);
  /* Fallback: linear-gradient(to right, #9333ea, #ec4899, #8b5cf6) */
}
```

**Logo showcase:**
- Framer Motion spring: `stiffness: 260, damping: 20`
- Scale from 0 with -10deg rotation
- Size: `w-16 h-16 sm:w-20 sm:h-20`, `rounded-xl sm:rounded-2xl`

**Hand-drawn callout ("Your new logo!"):**
- Positioned: `left: -90px sm:-136px, top: -8px sm:-12px`
- Rotation: `rotate(-8deg)`
- Bubble: `bg-gray-900 text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full`
- SVG curved arrow with arrowhead marker pointing to logo
- Entry: spring animation with delay 600ms

**CTA Button:**
- Gradient background matching app's primary color
- Glow behind: `-inset-0.5 blur opacity-75 hover:opacity-100`
- Scale on hover: `group-hover:scale-[1.02]`
- Arrow animation: `x: [0, 5, 0]` looping every 1.5s

**Confetti (canvas-confetti):**
```typescript
// 3 bursts with staggered timing
canvasConfetti({ particleCount: 100, spread: 70, origin: { x: 0.5, y: 0.6 } });
// 250ms later: left burst (angle: 60, spread: 55, origin: { x: 0, y: 0.6 })
// 400ms later: right burst (angle: 120, spread: 55, origin: { x: 1, y: 0.6 })
// Colors: primaryColor + ["#FFD700", "#FF69B4", "#00CED1", "#FF6347", "#98FB98"]
```

---

## Stage / Task Data

### Task Templates (7 standard + 1 conditional)

| Index | ID | Pending Name | Active Name | Completed Name | Icon |
|-------|-----|-------------|-------------|----------------|------|
| 0 | `app-details` | Create Your App | Creating Your App | Created Your App | Target |
| 1 | `logo-description` | Design Your Logo | Designing Your Logo | Designed Your Logo | Palette |
| 2 | `system-prompt` | Build AI Personality | Building AI Personality | Built AI Personality | Brain |
| 3 | `conversation-starters` | Add Conversation Starters | Adding Conversation Starters | Added Conversation Starters | Speech |
| 4 | `starting-message` | Craft Welcome Message | Crafting Welcome Message | Crafted Welcome Message | Wave |
| 5 | `logo-generation` | Generate Logo | Generating Logo | Generated Logo | Sparkle |
| 6 | `splash-screens` | Prepare Mobile Experience | Generating Mobile Experience | Mobile Experience Ready | Phone |
| 7* | `company-knowledge` | Learn About Your Company | Learning About Your Company | Learned About Your Company | Globe |

*Step 7 is conditional on company email detection.

### Animation Timing Constants
```typescript
export const ANIMATION_TIMING = {
  STAGE_TRANSITION: 1500,       // Delay between advancing to next stage
  STAGE_ACTIVE_DURATION: 1000,  // How long to show stage as "active"
  STAGE_COMPLETED_HOLD: 2500,   // Pause after final completion before success
  LOGO_GENERATION_DELAY: 2000,  // Extra delay before logo description step
  CONFETTI_DELAY: 100,          // Delay before confetti after success screen
  CONFETTI_SECOND_BURST: 250,   // Delay for second confetti burst
  CONFETTI_THIRD_BURST: 400,    // Delay for third confetti burst
};
```

---

## Color System

### Hardcoded Colors to Map to CSS Variables

| ChippMono Hardcoded | Purpose | ChippDeno Variable |
|---------------------|---------|-------------------|
| `#FCFBF7` | Page background | Should use `hsl(var(--background))` or a warm variant |
| `from-green-400 to-green-500` / `#4ade80 to #22c55e` | Completed icon gradient | Keep as accent green |
| `shadow-green-500/20` | Completed icon shadow | Keep as accent |
| `from-blue-400 via-purple-400 to-blue-400` / `#60a5fa, #a78bfa, #60a5fa` | Active glow | Could map to `var(--brand-color)` gradient |
| `from-gray-100 to-gray-200` / `#f3f4f6 to #e5e7eb` | Pending icon | `hsl(var(--muted))` |
| `text-gray-300` / `#d1d5db` | "Up next" label | `hsl(var(--muted-foreground))` with opacity |
| `rgba(120,119,198,0.3)` | Active card radial gradient | Decorative, could use brand color |
| `white/20` | Shimmer highlight | Keep as `hsl(var(--background) / 0.2)` |
| `#9333ea` (purple-600) | Default gradient fallback | `var(--brand-color)` |
| `#ec4899` (pink-600) | Default gradient fallback | Keep or use brand secondary |
| `bg-gray-900` / `rgb(17 24 39)` | Callout bubble | `hsl(var(--foreground))` |
| `bg-blue-100 text-blue-600` | Company modal icon | Semantic, keep |

### Dynamic Colors (from app primaryColor)

The `colorUtils.ts` functions create dynamic gradients from the generated app's primary color:
- `adjustColor(hex, +40)` for lighter variant
- `adjustColor(hex, -20)` for darker variant
- Default fallback: `#5B72EE`

---

## ChippDeno Existing Implementation

### Already Ported Files

| ChippMono Source | ChippDeno Equivalent |
|-----------------|---------------------|
| `AppGenerationProgress.tsx` | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGeneratorProgress.svelte` |
| `SuccessScreen.tsx` | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGeneratorSuccess.svelte` |
| `client.tsx` (orchestrator) | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGenerator.svelte` |
| `useAppGeneration.ts` + `stageUtils.ts` | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts` |
| `colorUtils.ts` | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/utils/colorUtils.ts` |
| `OnboardingStepper.tsx` (V2) | `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/onboarding/OnboardingStepper.svelte` |

### Quality of ChippDeno Port

The Svelte port is **faithful and complete**. It reproduces:

1. All 6 `@keyframes` animations (shimmer, gradientPulse, slideInFromBottom, fadeIn, spin, ping)
2. The sticky active item with glow effect
3. The auto-scroll logic using `tick()` instead of `useEffect`
4. The fade overlays with `#FCFBF7` gradient
5. The scrollbar hiding
6. All 3 card states (completed, active, pending) with identical visual treatment
7. The responsive breakpoints (640px)
8. The SuccessScreen with logo callout, gradient glow, gradient CTA button, and bounce arrow

### Differences in ChippDeno Port

1. **Uses CSS custom properties** instead of Tailwind utility classes (good for whitelabel)
2. **Uses Svelte transitions** (`svelte/transition`: `fade`, `fly`, `scale`) instead of Framer Motion
3. **No `data-` attribute selectors** for completed items -- uses `[data-completed-item]` instead of `[class*="bg-background/40"]` (better)
4. **Background color hardcoded** to `#FCFBF7` in fade overlays -- should use CSS variable for whitelabel
5. **Store-based** state management instead of React hooks

### Gaps / Whitelabel Issues

1. **`#FCFBF7` hardcoded in fade overlays** -- both top and bottom fades use this warm white. For dark mode / whitelabel, this should be `hsl(var(--background))` or a CSS variable
2. **Green accent colors hardcoded** -- `#4ade80`, `#22c55e` for completed state are not variable-ized. These work for most themes but could clash with certain brand colors.
3. **Active glow uses blue/purple hardcoded** -- `#60a5fa, #a78bfa` in the ChippDeno port. Could use `var(--brand-color)` for whitelabel.
4. **Pending gray gradients hardcoded** -- `#f3f4f6 to #e5e7eb` should use `hsl(var(--muted))` variants
5. **Missing CompanyWebsiteModal** -- ChippDeno does not appear to have ported the company email detection modal

---

## Complete Animation Catalog

### CSS Keyframes

| Name | Duration | Easing | Description |
|------|----------|--------|-------------|
| `shimmer` | 3s | `infinite` (linear) | Translates pseudo-element from -100% to 200% creating a sweeping highlight |
| `gradientPulse` / `gradient` | 2-3s | `ease-in-out infinite` | Oscillates opacity between 0.7 and 1.0 (active glow pulsing) |
| `slideInFromBottom` | 0.5s | `ease` | Translates 8px up from bottom with opacity 0->1 (active card entrance) |
| `fadeIn` | 1s | `ease` | Simple opacity 0->1 (empty state) |
| `spin` | 1s | `linear infinite` | 360deg rotation (Loader2 spinner icon) |
| `ping` | 1s | `cubic-bezier(0, 0, 0.2, 1) infinite` | Scale to 2x with opacity->0 (green dot pulse) |
| `bounce` | 1.5s | `infinite` | X translation 0->5px->0 (arrow on CTA button) |

### CSS Transitions

| Element | Property | Duration | Easing |
|---------|----------|----------|--------|
| Completed card | `all` | 0.5s | Default ease |
| Pending card | `all` | 0.3s | Default ease |
| Active glow hover | `opacity` | Default (0.15s) | Default |
| Icon hover (pending) | `all` | 0.3s | Default ease |
| Pending emoji | `transform` | 0.3s | Default ease |
| Pending name color | `color` | 0.3s | Default ease |
| "Up next" opacity | `opacity` | 0.3s | Default ease |

### Framer Motion Animations (OnboardingStepper V2 only)

| Element | Property | Duration | Delay | Easing |
|---------|----------|----------|-------|--------|
| Step circle entrance | opacity+scale | 0.3s | `index * 0.05` (50ms stagger) | `[0.23, 1, 0.32, 1]` |
| Active circle scale | scale (1.0<->1.1) | 0.2s | 0 | Default |
| Success card entrance | opacity+scale | 0.5s | 0 | `easeOut` |
| Logo spring | scale+rotate | Spring | 0.1s | `stiffness: 260, damping: 20` |
| Callout spring | opacity+scale+rotate | Spring | 0.6s | `stiffness: 150, damping: 12` |
| Facts stagger | opacity+x | 0.4s | `0.7 + index * 0.08` | `[0.23, 1, 0.32, 1]` |
| CTA entrance | y+opacity | 0.5s | 0.9s | Default |
| Arrow bounce | x `[0, 5, 0]` | 1.5s | Infinite | Default |

### Svelte Transition Equivalents (in ChippDeno port)

| Framer Motion | Svelte Equivalent |
|---------------|-------------------|
| `initial={{ opacity: 0, scale: 0.95 }}` | `in:scale={{ duration: 500, start: 0.95 }}` |
| `initial={{ y: -20, opacity: 0 }}` | `in:fly={{ y: -20, duration: 500, delay: 200 }}` |
| `initial={{ opacity: 0, x: -10 }}` | `in:fly={{ x: -10, duration: 400, delay: 700 + index * 80 }}` |
| `animate={{ x: [0, 5, 0] }}` (keyframe) | CSS `@keyframes bounce` |

---

## Responsive Breakpoints

All components use a single breakpoint at `640px` (Tailwind's `sm:`):

| Element | Mobile (<640px) | Desktop (>=640px) |
|---------|-----------------|-------------------|
| Container padding | `p-4` (16px) | `p-6` (24px) |
| Card border-radius | `rounded-xl` (12px) | `rounded-2xl` (16px) |
| Card padding | `p-3` (12px) | `p-5` (20px) |
| Card margin-bottom | `mb-2` (8px) | `mb-3` (12px) |
| Card min-height | `60px` | `100px` |
| Icon size | `w-8 h-8` (32px) | `w-10 h-10` (40px) |
| Active min-height | `70px` | `100px` |
| Glow blur | `blur-lg` | `blur-xl` |
| Scroll height | `calc(100dvh - 240px)` | `calc(100vh - 280px)` |
| Fade top height | `60px` | `80px` |
| Fade bottom height | `80px` | `120px` |
| Bottom padding | `h-48` (192px) | `h-96` (384px) |
| Top padding | `pt-12` (48px) | `pt-24` (96px) |
| Title | `text-2xl` | `text-4xl` to `text-5xl` |

---

## Migration Recommendations

### This feature is already fully ported to ChippDeno.

The main areas that could be improved in the existing ChippDeno port:

### 1. Whitelabel the Background Color
The `#FCFBF7` warm off-white is hardcoded in both the page background and the fade overlays. For dark mode / whitelabel:
```css
/* Instead of hardcoded #FCFBF7 */
.fade-top {
  background: linear-gradient(
    to bottom,
    hsl(var(--background)),
    hsl(var(--background) / 0.8),
    hsl(var(--background) / 0.3),
    transparent
  );
}
```

### 2. Whitelabel the Active Glow
Replace the hardcoded blue/purple with brand color:
```css
/* Instead of #60a5fa, #a78bfa */
.active-glow {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--brand-color) 60%, #60a5fa),
    var(--brand-color),
    color-mix(in srgb, var(--brand-color) 60%, #a78bfa)
  );
}
```

### 3. Dark Mode Support
The pending icon gradients (`from-gray-100 to-gray-200`) are light-mode-only. Need dark variants using `hsl(var(--muted))`.

### 4. Company Website Modal
Not ported to ChippDeno. This modal (auto-detected company email -> offer to add website as knowledge source) would need a Svelte implementation if that feature is desired.

### Files to Reference

1. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/AppGenerationProgress.tsx` - Main progress component (React)
2. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/components/SuccessScreen.tsx` - Success celebration (React)
3. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/constants.ts` - Timing, colors, text constants
4. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/stageUtils.ts` - Task templates and stage logic
5. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/utils/colorUtils.ts` - Color manipulation utilities
6. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/create-app-from-landing/hooks/useAppGeneration.ts` - Orchestration logic
7. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/components/OnboardingStepper.tsx` - Onboarding stepper (React)
8. `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/onboarding-v2/onboardingV2Flow.ts` - Step config and templates
9. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGeneratorProgress.svelte` - ChippDeno port (Svelte)
10. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/AppGeneratorSuccess.svelte` - ChippDeno success port (Svelte)
11. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/stores/appGenerator.ts` - ChippDeno store
12. `/Users/hunterhodnett/code/chipp-deno/web/src/lib/design-system/components/onboarding/OnboardingStepper.svelte` - ChippDeno onboarding stepper

---

## Related Features
- **App Generator API** - The `/generate/*` endpoints that power the actual AI generation
- **Onboarding V2** - Uses the OnboardingStepper in a 4-step wizard flow
- **Company Email Detection** - `detectCompanyDomain()` utility triggers the company knowledge step
- **Canvas Confetti** - `canvas-confetti` library used for success celebration
- **Chat Preview** - The OnboardingLayout shows a live chat preview panel alongside the stepper
