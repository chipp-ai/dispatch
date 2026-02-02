# svelte-streamdown Deep Dive

> **Version Analyzed**: Latest from npm (January 2026)
> **Repository**: https://github.com/beynar/svelte-streamdown > **Purpose**: Streaming markdown renderer for AI applications

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Component Deep Dive](#component-deep-dive)
4. [Animation System](#animation-system)
5. [Incomplete Markdown Parser](#incomplete-markdown-parser)
6. [Theming System](#theming-system)
7. [Known Issues & Workarounds](#known-issues--workarounds)
8. [Integration Guide](#integration-guide)
9. [Configuration Reference](#configuration-reference)

---

## Overview

svelte-streamdown is a Svelte 5 port of Vercel's Streamdown library, designed specifically for AI-powered streaming applications. It provides:

- **Streaming-optimized rendering**: Handles incomplete/unterminated markdown gracefully
- **Built-in animations**: Fade, blur, slide effects on new content
- **Security features**: Whitelist allowed image/link sources
- **Full markdown support**: GFM, math, mermaid, citations, MDX components
- **Customizable theming**: Tailwind-based with full snippet overrides

### Key Difference from Standard Markdown Renderers

Unlike traditional `{@html marked.parse(content)}` which replaces the entire DOM on each update, svelte-streamdown:

1. Parses content into block-level chunks
2. Renders each block as a keyed Svelte component
3. Only updates changed blocks, preserving animation state

---

## Architecture

### Data Flow

```
Content String
      │
      ▼
┌─────────────────────────────────────────┐
│           parseBlocks()                  │
│   (marked lexer → block-level tokens)    │
│   Filters out 'space' and 'footnote'     │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│         Streamdown.svelte                │
│   {#each blocks as block (key)}          │
│   Keyed iteration preserves DOM          │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│           Block.svelte                   │
│   parseIncompleteMarkdown(block.trim())  │
│   lex() → inline tokens                  │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│          Element.svelte                  │
│   Renders each token type (p, h1, li)    │
│   Applies block-level animation style    │
└─────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────┐
│        AnimatedText.svelte               │
│   Tokenizes text (word or char)          │
│   Wraps each token in animated <span>    │
└─────────────────────────────────────────┘
```

### File Structure

```
svelte-streamdown/dist/
├── Streamdown.svelte      # Main entry point
├── Block.svelte           # Block-level renderer
├── AnimatedText.svelte    # Text animation wrapper
├── context.svelte.js      # StreamdownContext class
├── theme.js               # Default themes (tailwind, shadcn)
├── marked/
│   ├── index.js           # parseBlocks(), lex()
│   ├── marked-*.js        # Extension plugins
│   └── ...
├── utils/
│   ├── parse-incomplete-markdown.js  # Streaming-safe parser
│   └── ...
└── Elements/
    ├── Element.svelte     # Token → HTML element mapper
    ├── Code.svelte        # Code blocks with Shiki
    ├── Mermaid.svelte     # Diagram rendering
    ├── Math.svelte        # KaTeX rendering
    └── ...
```

---

## Component Deep Dive

### Streamdown.svelte

The main component that orchestrates everything.

```svelte
<script>
  // Key props
  let {
    content = '',           // Markdown string
    animation,              // Animation config
    parseIncompleteMarkdown, // Enable streaming mode
    theme,                  // Custom theme overrides
    sources,                // Citation sources
    // ... many more
  } = $props();

  // Create context for child components
  streamdown = new StreamdownContext({...});

  // Parse content into blocks
  const blocks = $derived(
    isStatic ? content : parseBlocks(content, streamdown.extensions)
  );
</script>

<div bind:this={element} class={className}>
  {#each blocks as block, index (`${id}-block-${index}`)}
    <Block {block} />
  {/each}
</div>
```

**Key Insight**: The `{#each ... (key)}` pattern with stable keys is what preserves DOM across updates. Each block gets a unique key based on its index, so existing blocks aren't recreated.

### Block.svelte

Handles individual block rendering with incomplete markdown support.

```svelte
<script>
  let { block, static: isStatic = false } = $props();

  const streamdown = useStreamdown();

  // Parse the block into tokens
  const tokens = $derived(
    lex(
      isStatic ? block : parseIncompleteMarkdown(block.trim()),
      streamdown.extensions
    )
  );
</script>

{#snippet renderChildren(tokens)}
  {#each tokens as token}
    <Element {token}>
      {#if isTextOnlyNode}
        {#if streamdown.animation.enabled && !insidePopover && !isStatic}
          <AnimatedText text={token.text || ''} />
        {:else}
          {token.text}
        {/if}
      {:else}
        {@render renderChildren(children)}
      {/if}
    </Element>
  {/each}
{/snippet}
```

**Key Insight**: `block.trim()` is called before parsing. This removes leading/trailing whitespace which can affect how incomplete markdown is completed.

### AnimatedText.svelte

The core animation component that wraps each text token.

```svelte
<script>
  let { text } = $props();
  const streamdown = useStreamdown();

  const tokenizeNewContent = (text) => {
    if (!text) return [];

    // Choose tokenization strategy
    let splitRegex;
    if (streamdown.animation.tokenize === 'word') {
      splitRegex = /(\s+)/;  // Split on whitespace, keep delimiters
    } else {
      splitRegex = /(.)/;    // Split on every character
    }

    return text.split(splitRegex).filter((token) => token.length > 0);
  };

  const tokens = $derived(tokenizeNewContent(text));
</script>

{#if streamdown.isMounted}
  {#each tokens as token}
    <span style={streamdown.animationTextStyle}>
      {token}
    </span>
  {/each}
{:else}
  {text}
{/if}
```

**Critical Detail**: When `isMounted` is false, text renders without spans. When true, each token gets wrapped in an animated span.

---

## Animation System

### How Animations Work

1. **isMounted State**: Controls whether animation spans are rendered

   - `false` on initial render (unless `animateOnMount: true`)
   - Becomes `true` after `onMount()` or when `animation.enabled` is true via `$effect`

2. **animationTextStyle**: Inline styles applied to each text token span

   ```css
   animation-name: sd-fade; /* or sd-blur, sd-slideUp, sd-slideDown */
   animation-duration: 500ms;
   animation-timing-function: ease-in;
   animation-iteration-count: 1;
   animation-fill-mode: forwards;
   white-space: pre-wrap;
   display: inline-block; /* ⚠️ CAUSES LAYOUT SHIFT */
   text-decoration: inherit;
   ```

3. **CSS Keyframes**: Defined globally in Streamdown.svelte

   ```css
   @keyframes sd-fade {
     from {
       opacity: 0;
     }
     to {
       opacity: 1;
     }
   }

   @keyframes sd-blur {
     from {
       opacity: 0;
       filter: blur(5px);
     }
     to {
       opacity: 1;
       filter: blur(0px);
     }
   }

   @keyframes sd-slideUp {
     from {
       transform: translateY(10%);
       opacity: 0;
     }
     to {
       transform: translateY(0);
       opacity: 1;
     }
   }
   ```

### Animation Configuration

```typescript
interface AnimationConfig {
  enabled: boolean; // Master toggle
  type: "fade" | "blur" | "slideUp" | "slideDown";
  duration: number; // In milliseconds
  timingFunction: string; // CSS timing function
  tokenize: "word" | "char"; // Granularity
  animateOnMount: boolean; // Animate initial content
}
```

### The Layout Shift Problem

**Root Cause**: `display: inline-block` on animated spans.

When text is wrapped in `inline-block` spans:

- Whitespace is rendered differently than normal inline text
- Line breaking behavior changes
- Content shifts when animation completes or streaming ends

**Visual Example**:

```
During streaming (with inline-block spans):
"Hello[span]world[/span]" → "Helloworld" (no visible space)

After streaming (normal text):
"Hello world" → "Hello world" (space appears)
```

---

## Incomplete Markdown Parser

The `parseIncompleteMarkdown` function is crucial for streaming. It completes unterminated markdown syntax so the lexer can parse it.

### Plugin Architecture

```javascript
class IncompleteMarkdownParser {
  plugins = [];
  state = {
    currentLine: 0,
    context: "normal",
    blockingContexts: new Set(), // 'code', 'math', etc.
    lineContexts: [], // Per-line context tracking
  };

  parse(text) {
    // 1. Run preprocess hooks
    // 2. Process each line with each plugin
    // 3. Run postprocess hooks
    return result;
  }
}
```

### Default Plugins

| Plugin           | Pattern           | What It Fixes                               |
| ---------------- | ----------------- | ------------------------------------------- |
| `contextManager` | -                 | Tracks code/math blocks, auto-closes at end |
| `bold`           | `/\*\*/`          | Completes `**text` → `**text**`             |
| `italic`         | `/\*/`            | Completes `*text` → `*text*`                |
| `strikethrough`  | `/~~/`            | Completes `~~text` → `~~text~~`             |
| `inlineCode`     | `/\`/`            | Completes `` `code `` → `` `code` ``        |
| `inlineMath`     | `/\$/`            | Completes `$x` → `$x$`                      |
| `blockMath`      | `/\$\$/`          | Closes unclosed `$$` blocks                 |
| `linksAndImages` | `/(!?\[.*]$/`     | Completes `[text` → `[text](incomplete)`    |
| `footnoteRef`    | `/\[\^[^\]\s,]*/` | Handles `[^ref`                             |
| `mdx`            | -                 | Closes unclosed MDX tags                    |

### How It Handles Streaming

**Example: Bold text streaming in**

```
Chunk 1: "Hello **wor"
  → parseIncompleteMarkdown → "Hello **wor**"  (auto-closed)
  → Renders as: Hello <strong>wor</strong>

Chunk 2: "Hello **world"
  → parseIncompleteMarkdown → "Hello **world**"
  → Renders as: Hello <strong>world</strong>

Chunk 3: "Hello **world**"
  → parseIncompleteMarkdown → "Hello **world**" (already complete)
  → Renders as: Hello <strong>world</strong>
```

### Plugin Interface

```typescript
interface IncompleteMarkdownPlugin {
  name: string;
  pattern?: RegExp; // Line matching pattern
  skipInBlockTypes?: string[]; // Skip in code/math blocks
  preprocess?: (ctx) => string | { text; state };
  handler?: (ctx) => string; // Transform line
  postprocess?: (ctx) => string;
}
```

---

## Theming System

### Default Themes

Two built-in themes:

- `theme` - Vanilla Tailwind with gray color palette
- `shadcnTheme` - shadcn/ui compatible with CSS variables

### Theme Structure

```javascript
const theme = {
  link: {
    base: "text-blue-600 font-medium underline",
    blocked: "text-gray-500",
  },
  h1: { base: "mt-6 mb-2 text-3xl font-semibold" },
  h2: { base: "mt-6 mb-2 text-2xl font-semibold" },
  // ... all elements
  paragraph: { base: "" },
  ul: { base: "ml-4 list-inside list-disc" },
  code: {
    base: "my-4 w-full overflow-hidden rounded-xl border",
    container: "relative bg-gray-100 p-2 font-mono text-sm",
    header: "flex items-center justify-between",
    // ... nested structure for complex elements
  },
};
```

### Custom Theme Merging

```svelte
<Streamdown
  content={content}
  baseTheme="shadcn"
  theme={{
    paragraph: { base: 'text-lg leading-relaxed' },
    code: { base: 'my-2 rounded-lg' }
  }}
/>
```

The `mergeTheme()` function uses `tailwind-merge` to intelligently combine classes.

---

## Known Issues & Workarounds

### Issue 1: Layout Shift on Streaming Complete

**Symptom**: Content jumps/shifts when streaming finishes.

**Root Cause**: `display: inline-block` on animated spans renders whitespace differently than normal inline text.

**Workaround**: Override the inline-block style:

```css
/* In your component's styles */
.streaming-markdown-wrapper :global(span[style*="inline-block"]) {
  display: inline !important;
}
```

**Trade-off**: This may affect some animation types (slideUp/slideDown rely on transform which works better with inline-block).

### Issue 2: Capitalization Changes

**Symptom**: First letter of chunks appears capitalized at end of streaming.

**Root Cause**: Theme includes `capitalize` on certain elements (alerts).

**Workaround**: Add explicit text-transform override:

```css
.streaming-markdown-wrapper :global(*) {
  text-transform: none !important;
}
```

### Issue 3: Space Insertion Between Chunks

**Symptom**: No space during streaming, space appears after.

**Root Cause**: Same as Issue 1 - inline-block whitespace handling.

**Workaround**: Same CSS override as Issue 1.

### Issue 4: Line Breaks Removed

**Symptom**: Poem or formatted text loses line breaks at end of streaming.

**Root Cause**: Combination of `block.trim()` in Block.svelte and whitespace handling changes.

**Workaround**: Disable animation for content that relies on precise formatting.

### Issue 5: Animation Doesn't Appear

**Symptom**: No fade-in effect visible.

**Possible Causes**:

1. `animation.enabled` is false
2. `isMounted` is false (check `animateOnMount`)
3. CSS keyframes not loaded (check for global styles)
4. Animation duration too short to perceive

**Debug**: Check if spans have the animation styles applied in DevTools.

---

## Integration Guide

### Basic Usage

```svelte
<script>
  import { Streamdown } from 'svelte-streamdown';

  export let content: string = '';
  export let streaming: boolean = false;
</script>

<Streamdown
  {content}
  parseIncompleteMarkdown={true}
  animation={{
    enabled: streaming,
    type: 'fade',
    duration: 150,
    tokenize: 'word',
    animateOnMount: false
  }}
/>
```

### With Custom Styling (Our Implementation)

```svelte
<!-- StreamingMarkdown.svelte -->
<script lang="ts">
  import { Streamdown } from "svelte-streamdown";

  export let content: string = "";
  export let streaming: boolean = false;
  export let forceDarkMode: boolean = false;

  // Static config to prevent object reference changes
  const animationConfig = {
    enabled: true,
    type: "fade" as const,
    duration: 100,
    tokenize: "char" as const,
    timingFunction: "ease-out" as const,
    animateOnMount: false,
  };
</script>

<div class="streaming-markdown-wrapper" class:streaming class:dark={forceDarkMode}>
  <Streamdown
    {content}
    parseIncompleteMarkdown={true}
    animation={animationConfig}
    class="markdown-content"
  />
</div>

<style>
  /* Override inline-block to prevent layout shift */
  .streaming-markdown-wrapper :global(span[style*="inline-block"]) {
    display: inline !important;
  }

  /* Your custom markdown styles... */
</style>
```

### Disabling Animation (Fallback)

If animation issues persist, disable it entirely:

```svelte
<Streamdown
  {content}
  parseIncompleteMarkdown={true}
  animation={{ enabled: false }}
/>
```

You still get the benefit of:

- Incremental DOM updates (no full replacement)
- Incomplete markdown handling
- Proper streaming support

---

## Configuration Reference

### Full Props Interface

```typescript
interface StreamdownProps {
  // Content
  content: string;
  static?: boolean; // Disable streaming optimizations

  // Parsing
  parseIncompleteMarkdown?: boolean;
  extensions?: MarkedExtension[];

  // Animation
  animation?: {
    enabled: boolean;
    type?: "fade" | "blur" | "slideUp" | "slideDown";
    duration?: number; // ms, default 500
    timingFunction?: string; // CSS, default 'ease-in'
    tokenize?: "word" | "char"; // default 'word'
    animateOnMount?: boolean; // default false
  };

  // Theming
  theme?: Partial<Theme>;
  baseTheme?: "default" | "shadcn";
  mergeTheme?: boolean; // default true

  // Security
  allowedLinkPrefixes?: string[]; // ['*'] = all
  allowedImagePrefixes?: string[]; // ['*'] = all
  defaultOrigin?: string;

  // Features
  renderHtml?: boolean | ((token) => string);
  controls?: {
    code?: boolean; // Copy button
    mermaid?: boolean; // Pan/zoom/fullscreen
    table?: boolean; // Download button
  };

  // Syntax Highlighting
  shikiTheme?: string;
  shikiThemes?: Record<string, string>;
  shikiLanguages?: string[];

  // Math
  katexConfig?: KatexOptions;

  // Diagrams
  mermaidConfig?: MermaidConfig;

  // Citations
  sources?: Record<string, CitationSource>;
  inlineCitationsMode?: "carousel" | "list";

  // MDX
  mdxComponents?: Record<string, Component>;

  // Customization
  components?: {
    code?: Component;
    mermaid?: Component;
    math?: Component;
  };
  icons?: Record<string, Component>;
  translations?: Record<string, string>;

  // Snippets (Svelte 5 render functions)
  heading?: Snippet;
  paragraph?: Snippet;
  // ... all element types
}
```

### CSS Variables (shadcn theme)

When using `baseTheme="shadcn"`, these CSS variables are expected:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --card: 0 0% 100%;
  --popover: 0 0% 100%;
  --destructive: 0 84.2% 60.2%;
}
```

---

## Summary

svelte-streamdown is a powerful library for streaming markdown, but its animation system has inherent issues due to the `display: inline-block` styling required for certain animation effects. For production use, consider:

1. **Use animation sparingly** - Only for initial reveal, not during active streaming
2. **Override inline-block** - If you must animate during streaming
3. **Test thoroughly** - Different content types (prose, code, lists, tables) may behave differently
4. **Have a fallback** - Disable animation if issues persist

The library still provides significant value even without animation:

- Incremental DOM updates
- Incomplete markdown handling
- Keyed block rendering that preserves state
