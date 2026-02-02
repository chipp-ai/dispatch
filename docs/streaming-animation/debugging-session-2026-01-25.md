# Streaming Animation Debugging Session - January 25, 2026

## Problem Statement

During streaming, AI responses render correctly with beautiful animations. However, when streaming ends, the content visually shifts - specifically, **single newlines collapse onto a single line** instead of being preserved.

## Root Cause Analysis

### The Core Issue

The problem stems from a CSS difference between streaming and non-streaming states:

| State                | CSS Behavior                                                       | Newline Handling                   |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| **During streaming** | Animated spans have `display: inline-block; white-space: pre-wrap` | Newlines preserved                 |
| **After streaming**  | Standard markdown rendering                                        | Single newlines collapse to spaces |

### Technical Deep Dive

1. **svelte-streamdown behavior during streaming:**

   - Each text token is wrapped in `<span style="display: inline-block; white-space: pre-wrap; opacity: ...">`
   - The `white-space: pre-wrap` preserves newline characters visually
   - Located in `context.svelte.js` → `animationTextStyle`

2. **Standard markdown behavior:**

   - Markdown spec: single newlines become spaces, double newlines create paragraphs
   - When streaming ends, `isMounted` becomes true in svelte-streamdown
   - Text nodes are no longer wrapped in animated spans
   - Standard markdown rendering collapses single newlines

3. **The `block.trim()` issue:**
   - In `Block.svelte`, the library calls `block.trim()` before parsing
   - This strips leading/trailing whitespace from blocks
   - Can affect newline preservation at block boundaries

## Solution Applied

Added CSS rule to preserve newlines in paragraphs after streaming ends:

```css
/* In StreamingMarkdown.svelte */
.streaming-markdown-wrapper :global(p) {
  white-space: pre-wrap;
}
```

This ensures paragraphs maintain `white-space: pre-wrap` even after the animated spans are removed.

## Debugging Tools Created

### 1. StreamingTest.svelte (Frontend Test Page)

**Location:** `web/src/routes/debug/StreamingTest.svelte`

**Route:** `http://localhost:5174/#/debug/streaming-test`

**Features:**

- Select from multiple test patterns (poem, newlines, paragraphs, code, etc.)
- Control streaming delay (ms per character)
- Start/stop streaming manually
- View raw content with escaped newlines
- Compare StreamingMarkdown output during vs after streaming

**Usage:**

1. Start dev server: `./scripts/dev.sh`
2. Navigate to `http://localhost:5174/#/debug/streaming-test`
3. Select a pattern and click "Start Streaming"
4. Watch for content shift when streaming ends

### 2. Streaming Test API Endpoint

**Location:** `src/api/routes/dev/streaming-test.ts`

**Endpoint:** `GET /dev/streaming-test?pattern=<name>&delay=<ms>`

**Available patterns:**

- `newlines` - Text with single newlines
- `paragraphs` - Text with double newlines (proper paragraph breaks)
- `softbreaks` - Text with two spaces + newline (markdown soft breaks)
- `mixed` - Combination of all patterns
- `poem` - Multi-line poem with single newlines
- `code` - Code block with newlines

**Example:**

```bash
curl -N "http://localhost:8000/dev/streaming-test?pattern=poem&delay=50"
```

### 3. Debug Logging in StreamingMarkdown

Added console logging to track streaming state transitions:

```javascript
// Logs when streaming state changes
console.log(`[StreamingMarkdown] streaming: ${prevStreaming} → ${streaming}`);

// Logs when streaming ends
console.log("[StreamingMarkdown] === STREAMING ENDED ===");
console.log("[StreamingMarkdown] Final content length:", content.length);
console.log(
  "[StreamingMarkdown] Newline count:",
  (content.match(/\n/g) || []).length
);
```

Also added DOM structure inspection after streaming ends to verify whitespace handling.

## Architecture Learnings

### Entry Point Discovery

**CRITICAL:** The chipp-deno app has TWO potential entry points:

| File               | Purpose                  | Used By                 |
| ------------------ | ------------------------ | ----------------------- |
| `app.ts`           | **ACTUAL** entry point   | `main.ts` imports this  |
| `src/api/index.ts` | Alternative/legacy entry | Not used by main server |

**When adding routes, modify `app.ts`, NOT `src/api/index.ts`.**

### Adding Dev Routes

Dev-only routes should be added inside the environment check in `app.ts`:

```typescript
// Debug routes (dev only - browser console log capture)
if (Deno.env.get("ENVIRONMENT") !== "production") {
  app.route("/debug", debugRoutes);
  // Add new dev routes here
  app.route("/dev", streamingTestRoutes);
}
```

### Import Consistency

**IMPORTANT:** Use consistent import paths for Hono:

```typescript
// CORRECT - uses import map
import { Hono } from "hono";

// WRONG - bypasses import map, may cause type mismatches
import { Hono } from "npm:hono";
```

Using `npm:hono` can cause the route handlers to not be recognized by the main app because they're technically different Hono instances.

### SPA Route Registration

Routes for the Svelte SPA are defined in `web/src/routes.ts`:

```typescript
// Add debug routes without auth requirement
"/debug/streaming-test": wrapRoute({
  asyncComponent: () => import("./routes/debug/StreamingTest.svelte"),
}),
```

## Files Modified

| File                                                            | Change                         |
| --------------------------------------------------------------- | ------------------------------ |
| `web/src/lib/design-system/components/StreamingMarkdown.svelte` | Added CSS fix + debug logging  |
| `web/src/routes/debug/StreamingTest.svelte`                     | Created test page              |
| `web/src/routes.ts`                                             | Added debug route              |
| `src/api/routes/dev/streaming-test.ts`                          | Created SSE streaming endpoint |
| `app.ts`                                                        | Mounted streaming test routes  |

## Testing Checklist

To verify the fix works:

1. [ ] Start dev server: `./scripts/dev.sh`
2. [ ] Navigate to `http://localhost:5174/#/debug/streaming-test`
3. [ ] Select "poem" pattern
4. [ ] Click "Start Streaming"
5. [ ] Watch content stream in with animations
6. [ ] When streaming ends, verify:
   - No visible content shift
   - Newlines remain preserved
   - Each line of the poem stays on its own line

## Known Limitations

1. **CSS fix may affect other content:** Adding `white-space: pre-wrap` to all paragraphs might affect content that intentionally uses single newlines for soft wrapping

2. **Only addresses paragraphs:** The fix targets `<p>` elements. Other block elements may still have issues.

3. **Markdown semantic meaning:** Standard markdown treats single newlines as spaces. This fix changes that behavior visually, which may not always be desired.

## Future Improvements

1. **Selective application:** Only apply `pre-wrap` to content known to have intentional newlines
2. **Custom markdown processor:** Use a markdown processor that preserves newlines (like GitHub Flavored Markdown's `breaks` option)
3. **Component-level opt-in:** Add a prop to StreamingMarkdown to enable/disable newline preservation

## Related Documentation

- `docs/streaming-animation/README.md` - Main architecture overview
- `docs/streaming-animation/svelte-streamdown-deep-dive.md` - Library internals
- `docs/streaming-animation/troubleshooting.md` - Quick fixes reference
