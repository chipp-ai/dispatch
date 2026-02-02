# Streaming Animation Troubleshooting Guide

Quick reference for common issues with `StreamingMarkdown.svelte` and svelte-streamdown.

---

## Quick Diagnosis

| Symptom                                   | Likely Cause                        | Solution                                |
| ----------------------------------------- | ----------------------------------- | --------------------------------------- |
| Content shifts at end of streaming        | `display: inline-block` on spans    | Add CSS override (see below)            |
| First letters capitalized                 | Theme includes `capitalize`         | Add `text-transform: none`              |
| Spaces appear/disappear                   | Whitespace handling in inline-block | Add CSS override                        |
| Line breaks removed                       | `block.trim()` + inline-block       | Disable animation for formatted content |
| **Newlines collapse when streaming ends** | `white-space: pre-wrap` vs markdown | Add `white-space: pre-wrap` to `<p>`    |
| No animation visible                      | Config issue or `isMounted` false   | Check config and `animateOnMount`       |
| Animation works once then stops           | Object reference change             | Make config static (not reactive)       |

---

## CSS Fixes

### Fix Layout Shift (Most Common)

```css
/* Add to StreamingMarkdown.svelte or parent component */
.streaming-markdown-wrapper :global(span[style*="inline-block"]) {
  display: inline !important;
}
```

### Fix Capitalization

```css
.streaming-markdown-wrapper :global(*) {
  text-transform: none !important;
  font-variant: normal !important;
}
```

### Combined Fix

```css
.streaming-markdown-wrapper :global(span[style*="inline-block"]) {
  display: inline !important;
  text-transform: none !important;
}
```

---

## Configuration Issues

### Animation Not Working

Check these in order:

1. **Is `enabled` true?**

   ```javascript
   animation={{ enabled: true, ... }}
   ```

2. **Is `animateOnMount` needed?**

   ```javascript
   // If content exists on mount, you might need:
   animation={{ enabled: true, animateOnMount: true, ... }}
   ```

3. **Is config static?**

   ```javascript
   // BAD: Creates new object every render
   <Streamdown animation={{ enabled: streaming, ... }} />

   // GOOD: Static config
   const animationConfig = { enabled: true, ... };
   <Streamdown animation={animationConfig} />
   ```

4. **Are CSS keyframes loaded?**
   - Check for `@keyframes sd-fade` etc. in DevTools
   - svelte-streamdown defines these globally in Streamdown.svelte

### Animation Too Subtle

Increase duration:

```javascript
animation={{
  enabled: true,
  type: 'fade',
  duration: 300,  // Try 300-500ms
}}
```

Or use a more visible animation type:

```javascript
animation={{
  enabled: true,
  type: 'blur',  // More noticeable than 'fade'
  duration: 200,
}}
```

---

## Debugging Tips

### Log DOM Changes

Add a MutationObserver to see what's happening:

```javascript
// In browser console or component
const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    if (m.type === "childList") {
      console.log("DOM changed:", m.addedNodes, m.removedNodes);
    }
    if (m.type === "attributes") {
      console.log("Attr changed:", m.attributeName, m.target);
    }
  });
});

observer.observe(document.querySelector(".streaming-markdown-wrapper"), {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
});
```

### Check Animation Styles

In DevTools, inspect a text span during streaming:

- Should have `style` attribute with animation properties
- Should have `animation-name: sd-fade` (or similar)
- Check if `display` is being overridden

### Test Without Animation

Quickly isolate if animation is the problem:

```svelte
<Streamdown
  {content}
  parseIncompleteMarkdown={true}
  animation={{ enabled: false }}
/>
```

If this works without issues, animation is the culprit.

---

## Nuclear Option: Disable Animation

If all else fails and you just need stable rendering:

```svelte
<script>
  import { Streamdown } from "svelte-streamdown";

  export let content = "";
</script>

<Streamdown
  {content}
  parseIncompleteMarkdown={true}
  animation={{ enabled: false }}
  class="markdown-content"
/>
```

You still get:

- Incremental DOM updates (no full replacement)
- Incomplete markdown handling
- Keyed block rendering

You lose:

- Fade/blur/slide effects on new content

---

## Alternative: CSS-Only Animation

Instead of svelte-streamdown's animation, use CSS on the wrapper:

```svelte
<script>
  import { Streamdown } from "svelte-streamdown";

  export let content = "";
  export let streaming = false;
</script>

<div class="markdown-wrapper" class:streaming>
  <Streamdown
    {content}
    parseIncompleteMarkdown={true}
    animation={{ enabled: false }}
  />
</div>

<style>
  .markdown-wrapper {
    opacity: 1;
    transition: opacity 0.15s ease-out;
  }

  /* Optional: slight fade during active streaming */
  .markdown-wrapper.streaming :global(p:last-child) {
    opacity: 0.9;
  }
</style>
```

---

---

## Issue: Newlines Collapse When Streaming Ends

**This is the most common issue with streaming markdown.**

### Symptom

During streaming, content with newlines renders correctly:

```
Line 1
Line 2
Line 3
```

When streaming ends, it collapses to:

```
Line 1 Line 2 Line 3
```

### Why This Happens

1. **During streaming**: Each token is wrapped in `<span style="white-space: pre-wrap">`. This CSS property preserves newline characters as visual line breaks.

2. **After streaming**: Content is rendered as standard markdown. In markdown, a single newline within a paragraph is treated as a space, not a line break.

### How to Verify

Check the browser console for logs:

```
[StreamingMarkdown] === STREAMING ENDED ===
[StreamingMarkdown] Newline count: 5        ← Has newlines in content
[StreamingMarkdown] Double-newline count: 1 ← Only 1 proper paragraph break
```

If `Newline count` > `Double-newline count`, you'll see collapse.

### Fix: Add pre-wrap to Paragraphs

```css
/* In StreamingMarkdown.svelte or your styles */
.streaming-markdown-wrapper :global(p) {
  white-space: pre-wrap;
}
```

### Alternative Fixes

**1. Post-process content**: Convert `\n` to `  \n` (markdown soft break):

```javascript
const fixedContent = content.replace(/(?<! {2})\n(?!\n)/g, "  \n");
```

**2. Configure AI prompts**: Ask the AI to use `<br>` tags for line breaks.

**3. Use a custom renderer**: Skip markdown parsing for content that needs literal newlines.

### Testing Tools

**Browser Test Page:**

```
http://localhost:5174/#/debug/streaming-test
```

Interactive UI to test streaming with various content patterns. Select a pattern, click "Start Streaming", and verify newlines are preserved when streaming ends.

**API Test Endpoint:**

```
GET /dev/streaming-test?pattern=poem
GET /dev/streaming-test?pattern=newlines
GET /dev/streaming-test/patterns  # List all patterns
```

**IMPORTANT:** The test endpoint is at `/dev/*`, NOT `/api/dev/*`. The `/api/*` prefix applies auth middleware.

See [debugging-session-2026-01-25.md](./debugging-session-2026-01-25.md) for detailed testing instructions.

---

## Getting Help

1. Check [svelte-streamdown-deep-dive.md](./svelte-streamdown-deep-dive.md) for detailed internals
2. Check [README.md](./README.md) for architecture overview
3. Check [debugging-session-2026-01-25.md](./debugging-session-2026-01-25.md) for debugging workflow and architecture learnings
4. Search issues on https://github.com/beynar/svelte-streamdown
