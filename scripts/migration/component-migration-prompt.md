# Component Migration Prompt Template

Use this template with `claude -p` for pixel-perfect React to Svelte 5 migration.

## Usage

```bash
claude -p "$(cat scripts/migration/component-migration-prompt.md)

SOURCE: /path/to/Component.tsx
TARGET: /path/to/Component.svelte" \
  --allowedTools "Read,Write,Edit,Bash(deno task check *),Bash(deno fmt *)"
```

---

## Prompt

You are a UI migration specialist. Your task is to translate a React component to Svelte 5 while preserving visual fidelity AND white-label theming capability.

### Critical Rules

1. **WHITE-LABEL THEMING (MOST IMPORTANT)** - All components must remain themeable
   - Convert hardcoded colors to CSS variables from the design system
   - Support both light mode and dark mode via `hsl(var(--...))` tokens
   - The platform is white-labelable - enterprise customers customize colors

   **Color Mappings:**
   ```
   Source (React)              Target (Svelte)
   ─────────────               ───────────────
   rgb(249, 210, 0)            var(--brand-yellow)
   #111111, rgb(17,17,17)      hsl(var(--foreground))
   #616161, gray text          hsl(var(--muted-foreground))
   #6366f1, indigo             var(--brand-indigo) or hsl(var(--primary))
   white, #fff                 hsl(var(--background))
   borders                     hsl(var(--border))
   ```

   **Spacing & Typography:**
   ```
   padding: 16px               var(--space-4) or padding: 1rem
   padding: 32px               var(--space-8) or padding: 2rem
   font-size: 14px             var(--text-sm)
   font-size: 18px             var(--text-lg)
   font-family: Chubbo         var(--font-heading)
   font-family: Mulish         var(--font-body)
   ```

2. **TRANSLATE REACT PATTERNS TO SVELTE 5**
   ```
   React                          Svelte 5
   ─────                          ────────
   useState(x)                    let x = $state(initialValue)
   useEffect(() => {}, [deps])    $effect(() => { ... })
   useCallback(fn, [deps])        (not needed - just use fn)
   useMemo(() => x, [deps])       $derived(x) or $derived.by(() => x)
   useRef(null)                   let ref = $state(null) + bind:this
   props.children                 <slot />
   onClick={handler}              onclick={handler}
   className                      class
   style={{ color: 'red' }}       style="color: red"
   {condition && <X />}           {#if condition}<X />{/if}
   {items.map(i => <X />)}        {#each items as i}<X />{/each}
   ```

3. **TRANSLATE FRAMER MOTION TO SVELTE TRANSITIONS**
   ```
   React (Framer Motion)          Svelte
   ─────────────────────          ──────
   <motion.div                    <div
     initial={{ opacity: 0 }}       in:fly={{ y: 20, duration: 600 }}
     animate={{ opacity: 1 }}       out:fade
     transition={{ delay: 0.2 }}    style="animation-delay: 200ms"
   >                              >
   ```

4. **PRESERVE COMPONENT STRUCTURE**
   - Keep the same prop names
   - Keep the same event names (just lowercase: onClick → onclick)
   - Keep the same conditional rendering logic

5. **HANDLE IMPORTS**
   ```svelte
   <script lang="ts">
     import { fly, fade, slide } from 'svelte/transition';
     import { createEventDispatcher } from 'svelte';
     // Import other components from design system
   </script>
   ```

### Migration Process

1. **Read the source React component completely**
2. **Identify all CSS values** - colors, spacing, fonts, shadows, borders
3. **Map React hooks to Svelte runes**
4. **Convert JSX to Svelte template syntax**
5. **Write the Svelte component**
6. **Run `deno task check` to verify TypeScript**

### Output Requirements

- Write the complete Svelte component to the TARGET path
- Include all styles (inline or in `<style>` block)
- Add TypeScript types for all props
- Return "OK" if successful, "FAIL: reason" if not

### Props Interface Pattern

```svelte
<script lang="ts">
  interface Props {
    plan?: string;
    cost: string;
    benefits: string[];
    onclick?: () => void;
    disabled?: boolean;
    isLoading?: boolean;
  }

  let {
    plan = '',
    cost,
    benefits,
    onclick,
    disabled = false,
    isLoading = false,
  }: Props = $props();
</script>
```

### Event Dispatch Pattern

```svelte
<script lang="ts">
  const dispatch = createEventDispatcher<{
    click: { tier: string };
    select: { value: string };
  }>();

  function handleClick() {
    dispatch('click', { tier: 'PRO' });
  }
</script>
```

---

Now migrate the component:

SOURCE: {{SOURCE_PATH}}
TARGET: {{TARGET_PATH}}
