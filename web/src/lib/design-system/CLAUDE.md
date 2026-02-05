# Design System

Svelte 5 component library with CSS custom properties. Supports whitelabel branding and light/dark modes.

## Theming (Critical)

**NEVER hardcode colors.** Use CSS variables from `tokens.css`:
- Platform branding: `--brand-color`, `--brand-color-ui`, `--brand-color-foreground`
- Semantic: `--background`, `--foreground`, `--primary`, `--muted`, `--accent`, `--destructive`
- Surfaces: `--card`, `--popover`, `--sidebar-background`

**Two branding contexts in Button/consumer components:**
```css
background-color: var(--consumer-primary, var(--brand-color-ui));
```
- `--consumer-primary`: Per-app branding (set by ConsumerLayout.svelte)
- `--brand-color`: Platform whitelabeling (set in tokens.css)

## Component Subdirectories

| Directory | Purpose |
|-----------|---------|
| `chat/` | ChatMessage, ChatInput, TypingIndicator, citations |
| `consumer/` | End-user chat: headers, history, credit meter |
| `builder/` | App builder: model selector, style cards, MCP |
| `billing/` | Subscription plans, payment UI |

## Import Pattern
```typescript
import { Button, Card, toasts } from '$lib/design-system';
import ChatMessage from '$lib/design-system/components/chat/ChatMessage.svelte';
```

## Key Stores
- `toasts` - Notifications: `success()`, `error()`, `loading()`
- `themes/` - Chat theme configs (chatThemes.ts)

## CSS Files
- `tokens.css` - Design tokens (colors, spacing, typography, shadows)
- `base.css` - Resets, markdown, `.constellation-bg` gradient
