# Integration Setup Visual Design Report: ChippMono

## Executive Summary

- **What this covers**: The visual design language, CSS patterns, HTML structure, and component styling used across all integration setup dialogs (WhatsApp, Slack, Email, PWA, Voice) in ChippMono's Share/Deploy page
- **Complexity**: Medium - the design language is consistent but uses sophisticated CSS (constellation cards, radial glow gradients, layered box-shadows)
- **Design System**: "Constellation" theme with radial gradient glow cards, blue/purple accents, brand-color-aware theming
- **Key Finding**: ChippDeno already has the constellation CSS ported 1:1 in `web/src/lib/design-system/constellation.css`. The missing piece is the actual component HTML/structure patterns.

---

## 1. Page Layout: Share/Deploy Page

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/SharePage.tsx`

The Share page uses a split-panel layout:

```
+-------------------------------------+------------------------+
|  Left Panel (30%)                   |  Right Panel (70%)     |
|  - Share/Deploy tab switcher        |  - Tutorial videos     |
|  - Integration cards stacked        |  - YouTube embeds      |
|  - Each card has icon + title       |  - Loom embeds         |
|    + description + "Add Deployment" |                        |
|    button                           |                        |
+-------------------------------------+------------------------+
```

### Tab Switcher

```tsx
<Tabs defaultValue="share">
  <TabsList className="flex justify-center gap-2 w-fit">
    <TabsTrigger value="share" className={tabStyles}>Share</TabsTrigger>
    <TabsTrigger value="deploy" className={tabStyles}>Deploy</TabsTrigger>
  </TabsList>
  <TabsContent value="deploy">
    <div className="flex flex-col gap-4 mt-4">
      <DeploySlackCard />
      <DeployWhatsAppCard />
      <DeployEmailCard />
      <DeployPWACard />
    </div>
  </TabsContent>
</Tabs>
```

Whitelabel tab styling uses brand color detection:
```tsx
const tabStyles = hasCompanyColor
  ? `data-[state=active]:!bg-accent ${useLightText ? "data-[state=active]:!text-white" : "data-[state=active]:!text-black"}`
  : "";
```

---

## 2. Integration Deploy Cards

All deploy cards follow an identical structure pattern:

### Card Pattern (Consistent Across All Integrations)

**File Pattern**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/Deploy*.tsx`

```tsx
<Card>
  <CardHeader className="flex flex-row justify-start items-center gap-4">
    {/* Icon: 35x35px */}
    <Image src="/assets/deploy-icons/{name}-logo.png" width={35} height={35} />
    {/* OR for non-image icons: */}
    <div className="flex h-[35px] min-w-[35px] items-center justify-center rounded-lg bg-primary/10">
      <LucideIcon className="h-5 w-5 text-primary" />
    </div>
    <div>
      <CardTitle>Deploy to {Name}</CardTitle>
      <CardDescription className="mt-2">
        {description text}
      </CardDescription>
    </div>
  </CardHeader>
  <CardContent>
    <Button className="rounded-xl w-full">{buttonText}</Button>
  </CardContent>
</Card>
```

### Card Component CSS (constellation-card)

**File**: `/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/components/primitives/card.tsx`

The `Card` component applies the `constellation-card` class:
```tsx
<div className={cn(
  "rounded-xl border bg-card text-card-foreground shadow relative constellation-card",
  !animated && !subtle && "constellation-card--static",
  subtle && "constellation-card--subtle",
)}>
```

Deploy cards use the **default (static)** variant -- no hover lift or glow.

### Card CSS Properties

```css
.constellation-card {
  position: relative;
  background: hsl(var(--card));           /* White in light mode */
  border: 1px solid hsl(var(--border));    /* Light gray border */
  border-radius: var(--radius);            /* 0.5rem = 8px */
  overflow: hidden;
}

/* Static variant (used by deploy cards) - NO hover effects */
.constellation-card--static {
  transition: none;
}
.constellation-card--static::before {
  display: none !important;  /* No glow gradient */
}
.constellation-card--static:hover {
  translate: none !important;
  box-shadow: none !important;
}
```

### Card Padding/Spacing

```css
CardHeader: "flex flex-col space-y-1.5 p-6"     /* padding: 24px */
CardTitle:  "font-semibold leading-none tracking-tight"
CardDescription: "text-sm text-muted-foreground"  /* 14px, gray */
CardContent: "p-6 pt-0"                           /* padding: 24px, no top */
```

### Icon Sizing

Two icon patterns at 35x35px:
1. **Image logos** (Slack, WhatsApp, Smartsheet): `<Image width={35} height={35} />`
2. **Lucide icons** (Email, Voice): Wrapped in a 35x35 colored circle:
   ```tsx
   <div className="flex h-[35px] min-w-[35px] items-center justify-center rounded-lg bg-primary/10">
     <Mail className="h-5 w-5 text-primary" />
   </div>
   ```
3. **SVG gradient** (PWA): Custom SVG with blue-to-purple gradient:
   ```xml
   <linearGradient id="gradient" x1="0" y1="0" x2="35" y2="35">
     <stop stopColor="#3B82F6" />       /* Blue 500 */
     <stop offset="1" stopColor="#9333EA" />  /* Purple 600 */
   </linearGradient>
   ```

### Button Styling

The "Add Deployment" button:
```tsx
<Button className="rounded-xl w-full">Add Deployment</Button>
```

Button variant `default`:
```css
bg-foreground text-background
shadow-[0px_0.48px_1.25px_-1.17px_rgba(0,0,0,0.1),
        0px_1.83px_4.76px_-2.33px_rgba(0,0,0,0.09),
        0px_8px_20.8px_-3.5px_rgba(0,0,0,0.05),
        inset_0px_-2px_9px_0px_rgba(255,255,255,0.49),
        0px_0px_0px_2px_rgba(0,0,0,0.2)]
border-[0.5px] border-[#989897]
hover:bg-foreground/90

/* Dark mode variant */
dark:bg-accent dark:text-accent-foreground
dark:border-accent/50
dark:shadow-[0px_0px_20px_rgba(96,165,250,0.15)]
dark:hover:bg-accent/90
dark:hover:shadow-[0px_0px_25px_rgba(96,165,250,0.25)]
```

Key visual: Multi-layered box-shadow creating depth. Inset white shadow for inner glow. Border ring for definition. In dark mode, blue constellation glow.

---

## 3. Setup Dialog Modal Pattern

All integration setup dialogs share a consistent modal structure.

### Dialog Container

```tsx
<DialogContent className="max-w-full md:max-w-[600px] max-h-[90vh] md:h-[600px] pt-6 md:pt-12 overflow-y-auto p-6">
```

**Dialog CSS** (`dialog.tsx`):
```css
/* Position */
fixed left-[50%] top-[50%] z-50
translate-x-[-50%] translate-y-[-50%]

/* Sizing */
w-full max-w-lg  /* default, overridden per dialog */
gap-4 border

/* Colors */
bg-background text-foreground shadow-xl

/* Dark mode enhancement */
dark:bg-background/95
dark:border-white/10
dark:backdrop-blur-xl
dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_24px_rgba(96,165,250,0.1)]

/* Animations */
duration-200
data-[state=open]:animate-in
data-[state=closed]:animate-out
data-[state=closed]:fade-out-0
data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95
data-[state=open]:zoom-in-95
data-[state=closed]:slide-out-to-left-1/2
data-[state=closed]:slide-out-to-top-[48%]
data-[state=open]:slide-in-from-left-1/2
data-[state=open]:slide-in-from-top-[48%]

/* Overlay */
fixed inset-0 z-50 bg-black/50  /* 50% opacity black overlay */
```

### Dialog Header (Centered)

WhatsApp and Slack dialogs center the header:
```tsx
<DialogHeader className="flex flex-col gap-2 items-center h-fit">
  <DialogTitle>WhatsApp Configuration</DialogTitle>
  <DialogDescription className="text-center max-w-[65%] mx-auto">
    Connect your app to WhatsApp to deploy your application
  </DialogDescription>
</DialogHeader>
```

Email and PWA dialogs use left-aligned headers (standard):
```tsx
<DialogHeader>
  <DialogTitle>Email Configuration</DialogTitle>
  <DialogDescription>
    Allow users to interact with your assistant via email
  </DialogDescription>
</DialogHeader>
```

### Dialog Body

Form content centered in a constrained column:
```tsx
<div className="w-full flex justify-center p-4 md:p-8">
  <div className="w-full max-w-full md:max-w-[400px] flex flex-col gap-4">
    {/* Form fields */}
  </div>
</div>
```

### Input Field Pattern

```tsx
<div className="flex flex-col gap-2">
  <Label>Field Name</Label>
  <Input
    className="border-2 rounded-xl focus-visible:ring-2 h-10 bg-background"
    value={value}
    onChange={handler}
    placeholder="..."
  />
  <p className="text-xs text-muted-foreground">Helper text</p>
</div>
```

**Input CSS** (`input.tsx`):
```css
flex h-9 w-full rounded-md border border-input
bg-transparent px-3 py-1 text-sm shadow-sm
transition-all
placeholder:text-muted-foreground
focus-visible:outline-none
focus-visible:ring-1 focus-visible:ring-ring
hover:border-foreground/30
focus-visible:border-foreground/40
focus-visible:shadow-[0_0_8px_rgba(0,0,0,0.1)]

/* Dark mode */
dark:bg-background/50
dark:border-white/10
dark:hover:border-white/20
dark:focus-visible:border-accent/50
dark:focus-visible:ring-accent/30
dark:focus-visible:shadow-[0_0_12px_rgba(96,165,250,0.15)]
```

The dialog overrides inputs with: `border-2 rounded-xl focus-visible:ring-2 h-10 bg-background`

### Copyable URL/Token Field

```tsx
<div
  className="h-10 pl-4 pr-2 bg-muted rounded-xl cursor-pointer overflow-hidden flex items-center justify-between"
  onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied!"); }}
>
  <p className="text-sm truncate">{value}</p>
  <div className="bg-muted rounded-full p-2">
    <Copy size={16} />
  </div>
</div>
```

Visual: `bg-muted` (light gray), `rounded-xl`, fixed height 40px, truncated text, copy icon in a circle.

### Sticky Footer

```tsx
<div className="mt-10 bg-background sticky -bottom-6 left-0 right-0 p-4 flex justify-end -m-6 border-t border-t-2 border-border">
  <div className="flex gap-2">
    {hasExistingConfig && (
      <Button className="rounded-xl" variant="destructive">Disconnect</Button>
    )}
    <Button className="rounded-xl" disabled={loading || !allValid}>
      {loading ? "Saving..." : "Save Configuration"}
    </Button>
  </div>
</div>
```

The sticky footer is a key visual element: it sticks to the bottom of the dialog, uses negative margin to extend full width, and has a 2px top border.

---

## 4. Status Indicators and Info Boxes

### Colored Info/Status Boxes

Used extensively in Slack, Email, and PWA dialogs:

**Blue info box** (instructions/tips):
```tsx
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
  <h4 className="font-medium text-blue-900 mb-2">Setup Instructions:</h4>
  <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
    <li>Step text</li>
  </ol>
</div>
```

**Green success box** (configured/ready):
```tsx
<div className="bg-green-50 border border-green-200 rounded-lg p-4">
  <p className="text-green-800 text-sm">Configured and ready.</p>
</div>
```

Or with icon:
```tsx
<div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
  <div className="text-sm text-green-800">...</div>
</div>
```

**Yellow/amber warning box**:
```tsx
<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
  <div className="text-sm text-yellow-800">Warning text</div>
</div>
```

**Amber action-required box** (stronger emphasis):
```tsx
<div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
  <div className="flex items-start gap-3">
    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="font-semibold text-amber-900 mb-2">Action Required: ...</p>
    </div>
  </div>
</div>
```

**Red error box**:
```tsx
<div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
  <p className="text-red-800 text-sm">{error}</p>
</div>
```

### Color Pattern Summary

| Severity | Background | Border | Text | Icon Color |
|----------|-----------|--------|------|------------|
| Info | `bg-blue-50` | `border-blue-200` | `text-blue-800` / `text-blue-900` | `text-blue-600` |
| Success | `bg-green-50` | `border-green-200` | `text-green-800` | `text-green-600` |
| Warning | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` | `text-yellow-600` |
| Action Required | `bg-amber-50` | `border-2 border-amber-300` | `text-amber-900` | `text-amber-600` |
| Error | `bg-red-50` | `border-red-200` | `text-red-800` | n/a |

**IMPORTANT for whitelabel**: These Tailwind color classes (blue-50, green-200, etc.) are **hardcoded** and would NOT change with whitelabel theming. They should be converted to use semantic CSS variables in ChippDeno, or kept as-is since they represent semantic status colors (info, success, warning, error) which are typically not branded.

### PWA Status Indicator

```tsx
<div className="bg-muted rounded-lg p-4">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span className="text-sm font-medium">PWA Ready</span>
    </div>
    <span className="text-xs text-muted-foreground">
      Last updated: {date}
    </span>
  </div>
</div>
```

The pulsing green dot (`w-2 h-2 bg-green-500 rounded-full animate-pulse`) is a nice connected/active indicator.

### Badge (Voice Card)

```tsx
<Badge variant="secondary">
  <Phone className="h-3 w-3 mr-1" />
  Active
</Badge>
```

Badge CSS:
```css
/* Default */
"inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold"

/* Secondary variant */
"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
```

### Beta Badge (WhatsAppConfig older version)

```tsx
<Badge
  variant="secondary"
  className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 rounded-full"
>
  Beta
</Badge>
```

---

## 5. Per-Dialog Design Differences

### WhatsApp Dialog

- **Size**: `max-w-[600px]`, fixed height `h-[600px]`
- **Header**: Centered, with 65% max-width description
- **Body**: Form fields in constrained 400px column
- **Sections**: Access Token / Phone Number ID / Business Account ID, then Separator, then Callback URL + Verify Token as copyable fields
- **Footer**: Sticky with Disconnect (destructive) + Save (primary) buttons

### Slack Dialog

- **Size**: Same `max-w-[600px]`, `h-[600px]`
- **Header**: Centered
- **Two states**:
  1. **Setup mode**: Blue info box with numbered instructions, JSON manifest section, three credential inputs, sticky save footer
  2. **Configured mode**: Green success box, "Install to Slack" button, code example with copy, "Edit Credentials" outline button

### Email Dialog

- **Size**: Slightly wider `max-w-[700px]`, no fixed height
- **Header**: Left-aligned
- **Tabs**: Configuration / Webhook (standard TabsList)
- **Complex state**: Shows different info boxes based on shared vs custom domain
- **Switch toggle**: For "Enable Email Deployment"
- **Whitelist management**: Hidden tab accessible via link, not visible in TabsList

### PWA Dialog

- **Size**: `max-w-2xl`
- **Header**: Left-aligned
- **Rich content**: Status indicator with pulsing dot, installation instructions with iOS/Android sections, splash screen thumbnails grid, feature checklist with green checkmarks

### Voice Dialog

- **Size**: `max-w-4xl` (widest)
- **Header**: Standard left-aligned
- **Internal tabs**: Custom tab bar (not ShadCN Tabs) with `border-b-2 border-blue-600 text-blue-600` active state
- **Connected state**: Green `CheckCircle` + phone number display
- **Getting started box**: `bg-muted/50 rounded-lg p-4` with numbered steps

---

## 6. Loading States

```tsx
/* Full-dialog spinner */
<div className="flex items-center justify-center h-full">
  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
</div>

/* Button loading */
<Button disabled={isSaving}>
  {isSaving ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Saving...
    </>
  ) : "Save Configuration"}
</Button>

/* Refreshing state */
<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
```

---

## 7. Typography Hierarchy

| Element | CSS | Size/Weight |
|---------|-----|-------------|
| Dialog Title | `text-lg font-semibold leading-none tracking-tight` | 18px, 600 |
| Card Title | `font-semibold leading-none tracking-tight` | Inherit (14-16px), 600 |
| Card Description | `text-sm text-muted-foreground` | 14px, normal, gray |
| Label | `text-sm font-medium` (via ShadCN) | 14px, 500 |
| Helper Text | `text-xs text-muted-foreground` | 12px, normal, gray |
| Info Box Title | `font-medium text-{color}-900 mb-2` | 14-16px, 500, dark color |
| Info Box Body | `text-sm text-{color}-800` | 14px, normal, medium color |
| Section Heading | `font-semibold` or `text-lg font-semibold` | varies |

Font family: `Mulish` (body), `Chubbo` (headings/display)

---

## 8. Spacing Patterns

| Context | Value |
|---------|-------|
| Card padding (CardHeader/CardContent) | `p-6` (24px) |
| Dialog padding | `p-6` (24px) |
| Dialog body inner padding | `p-4 md:p-8` |
| Form field gap | `gap-4` (16px) between fields |
| Field label to input gap | `gap-2` (8px) |
| Card list gap (Deploy tab) | `gap-4` (16px) |
| Info box inner padding | `p-4` (16px) |
| Icon gap in card header | `gap-4` (16px) |
| Button footer gap | `gap-2` (8px) |

---

## 9. Constellation Theme CSS Variables (Complete Reference)

### Light Mode

```css
:root {
  --background: 225 25% 98%;      /* Soft off-white with blue tint */
  --foreground: 240 15% 10%;      /* Near black */
  --card: 0 0% 100%;              /* Pure white */
  --card-foreground: 240 15% 10%;
  --muted: 225 15% 94%;           /* Light gray */
  --muted-foreground: 240 5% 45%; /* Medium gray */
  --accent: 217 91% 55%;          /* Constellation blue (#3B82F6) */
  --accent-foreground: 0 0% 100%;
  --primary: 240 10% 15%;         /* Very dark blue-gray */
  --primary-foreground: 0 0% 98%;
  --border: 225 15% 88%;
  --input: 225 15% 88%;
  --destructive: 0 84% 60%;       /* Red */
  --radius: 0.5rem;

  /* Brand defaults */
  --brand-color: #f9db00;          /* Chipp yellow */
  --brand-color-glow: rgba(249, 219, 0, 0.3);
  --brand-color-muted: rgba(249, 219, 0, 0.15);

  /* Constellation glow effects */
  --glow-blue: rgba(59, 130, 246, 0.12);
  --glow-purple: rgba(139, 92, 246, 0.12);
}
```

### Dark Mode

```css
.dark {
  --background: 240 25% 4%;         /* Deep space near-black */
  --foreground: 240 5% 96%;         /* Almost white */
  --card: 240 20% 7%;               /* Dark card surface */
  --muted: 240 15% 12%;             /* Slightly lighter dark */
  --muted-foreground: 240 5% 60%;   /* Gray */
  --accent: 217 91% 60%;            /* Slightly brighter blue */
  --border: 240 12% 16%;
  --glow-blue: rgba(96, 165, 250, 0.15);
  --glow-purple: rgba(167, 139, 250, 0.15);
}
```

### Body Background Gradient

```css
body {
  background:
    radial-gradient(ellipse 120% 80% at 20% 0%, var(--gradient-blue) 0%, transparent 40%),
    radial-gradient(ellipse 100% 60% at 80% 100%, var(--gradient-purple) 0%, transparent 40%),
    hsl(var(--background));
}
```

---

## 10. Primary CTA Highlight (Animated Gradient Border)

Used on featured cards with `highlight={true}`:

```css
.primary-cta-highlight {
  position: absolute;
  inset: 1px;
  background: linear-gradient(-90deg, #f0ec00da, #9ef900, #f900ec, #f0d800);
  background-size: 400% 100%;
  animation: primary-cta-animation 8s ease-in-out infinite;
}

.primary-cta-highlight::after {
  content: "";
  position: absolute;
  background-size: inherit;
  background-image: inherit;
  animation: inherit;
  left: 0; right: 0; top: 2px; height: 100%;
  filter: blur(0.5rem);  /* Glow effect */
}

@keyframes primary-cta-animation {
  50% { background-position: 140% 50%; }
}
```

This creates an animated gradient border that shifts through yellow, green, magenta, and gold -- used for "hero" call-to-action cards.

---

## 11. Migration Recommendations for ChippDeno

### Already Ported

- Constellation card CSS: `web/src/lib/design-system/constellation.css` (1:1 match)
- Design tokens: `web/src/lib/design-system/tokens.css` (1:1 match with ChippAdmin)
- Font definitions (Chubbo, Mulish)
- Brand color system with whitelabel support

### Needs to Be Built (Svelte Components)

1. **IntegrationCard** - The deploy card pattern with icon + title + description + button
   - Use `constellation-card constellation-card--static` classes
   - Support both image and icon-based icons at 35x35px
   - Full-width rounded-xl button

2. **IntegrationSetupDialog** - Reusable dialog shell with:
   - Centered or left-aligned header options
   - Constrained form body (max-w-[400px] centered)
   - Sticky footer with action buttons
   - Loader2 spinner loading state

3. **CopyableField** - The read-only URL/token display:
   - `bg-muted rounded-xl h-10` container
   - Truncated text + copy icon
   - Click-to-copy with toast

4. **StatusBox** - Colored info/success/warning/error boxes:
   - Use semantic colors (NOT hardcoded Tailwind colors for whitelabel)
   - Map to ChippDeno tokens: `--color-info`, `--color-info-light`, `--color-success`, `--color-success-light`, etc.
   - Icon + text layout with `flex gap-3`

5. **StatusDot** - Pulsing connection indicator:
   - `w-2 h-2 rounded-full animate-pulse` with semantic color

### Color Mapping (ChippMono -> ChippDeno)

| ChippMono (hardcoded) | ChippDeno (semantic) |
|----------------------|---------------------|
| `bg-blue-50 border-blue-200 text-blue-800` | `bg-[var(--color-info-light)] border-[var(--color-info)]/30 text-[var(--color-info)]` or keep as Tailwind since these are semantic status colors |
| `bg-green-50 border-green-200 text-green-800` | `bg-[var(--color-success-light)] border-[var(--color-success)]/30 text-[var(--color-success)]` |
| `bg-yellow-50 border-yellow-200 text-yellow-800` | `bg-[var(--color-warning-light)] border-[var(--color-warning)]/30 text-[var(--color-warning)]` |
| `bg-red-50 border-red-200 text-red-800` | `bg-[var(--color-error-light)] border-[var(--color-error)]/30 text-[var(--color-error)]` |
| `border-blue-600 text-blue-600` (active tab) | `border-[hsl(var(--accent))] text-[hsl(var(--accent))]` |
| `bg-green-500` (status dot) | `bg-[var(--color-success)]` |
| `text-green-600` (checkmark) | `text-[var(--color-success)]` |

### Implementation Notes

1. **Dialog Sizing**: WhatsApp/Slack use `max-w-[600px] h-[600px]`, Email uses `max-w-[700px]`, PWA uses `max-w-2xl`, Voice uses `max-w-4xl`. Consider making size a prop.

2. **Form Inputs**: Override the default input with `border-2 rounded-xl focus-visible:ring-2 h-10 bg-background` in setup dialogs for a more "setup wizard" feel.

3. **Sticky Footer**: The `-m-6` + `-bottom-6` trick extends the footer to full dialog width. In Svelte, this can be done with absolute positioning or a dedicated dialog footer slot.

4. **Animation**: Use `animate-spin` for loaders, `animate-pulse` for status dots. The `Loader2` icon from lucide rotates with CSS animation.

5. **Separator**: Simple `<hr>` styled as `my-2` between form sections.

### Key Differences (React -> Svelte)

- `onClick` -> `on:click` or `onclick` (Svelte 5)
- `className` -> `class`
- `useState` -> `$state()` runes
- `useEffect` -> `$effect()`
- `DialogTrigger asChild` -> Svelte slot-based trigger
- Framer Motion animations -> Svelte transitions (`fade`, `slide`, `fly`)

---

## 12. File Reference (ChippMono)

### Deploy Cards
| File | Purpose |
|------|---------|
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployWhatsAppCard.tsx` | WhatsApp card |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeploySlackCard.tsx` | Slack card |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployEmailCard.tsx` | Email card |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployPWACard.tsx` | PWA card |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/cards/DeployVoiceCard.tsx` | Voice card |

### Setup Dialogs
| File | Purpose |
|------|---------|
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/WhatsAppDeploySetupDialog.tsx` | WhatsApp setup (share page) |
| `apps/chipp-admin/app/(authenticated)/onboarding-v2/components/WhatsAppSetupDialog.tsx` | WhatsApp setup (onboarding) |
| `apps/chipp-admin/components/whatsappComponents/WhatsAppConfig.tsx` | WhatsApp config (older version) |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/SlackDeploySetupDialog.tsx` | Slack setup |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/EmailDeploySetupDialog.tsx` | Email setup |
| `apps/chipp-admin/app/(authenticated)/app_builder/[appId]/share/components/PWADeploySetupDialog.tsx` | PWA setup |

### Primitives
| File | Purpose |
|------|---------|
| `apps/chipp-admin/components/primitives/card.tsx` | Card with constellation variants |
| `apps/chipp-admin/components/primitives/dialog.tsx` | Dialog with animations |
| `apps/chipp-admin/components/primitives/button.tsx` | Button with layered shadows |
| `apps/chipp-admin/components/primitives/badge.tsx` | Badge with glow variants |
| `apps/chipp-admin/components/primitives/input.tsx` | Input with dark mode glow |

### CSS
| File | Purpose |
|------|---------|
| `apps/chipp-admin/app/globals.css` | Theme variables + constellation card CSS |
| `apps/chipp-admin/styles/globals.css` | Font faces + primary-cta-highlight animation |

### ChippDeno (already exists)
| File | Purpose |
|------|---------|
| `web/src/lib/design-system/tokens.css` | Design tokens (1:1 match) |
| `web/src/lib/design-system/constellation.css` | Constellation card CSS (1:1 match) |
| `web/src/lib/design-system/base.css` | Base styles |
| `web/src/lib/design-system/animations.css` | Animation utilities |
