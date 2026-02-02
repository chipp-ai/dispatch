# MCP Browser DevTools Server

Chrome DevTools Protocol MCP server for Claude Code. Provides access to browser console logs, network requests, screenshots, JavaScript execution, **multi-tab management**, and **style comparison tools** for UI parity testing.

## Quick Start

```bash
# Install dependencies
cd tools/mcp-browser-devtools && npm install

# Start Chrome with DevTools enabled
./tools/mcp-browser-devtools/start-chrome.sh
```

Then restart Claude Code. The MCP server will auto-connect when you use any `browser_*` tool.

## Available Tools

### Core Tools

| Tool                           | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `browser_get_console_logs`     | Get buffered console logs (log, warn, error, etc.) |
| `browser_get_network_requests` | Get buffered network requests with status codes    |
| `browser_take_screenshot`      | Capture current page as PNG/JPEG                   |
| `browser_execute_js`           | Run JavaScript in browser context                  |
| `browser_get_page_info`        | Get current URL, title, document state             |
| `browser_navigate`             | Navigate to a URL                                  |
| `browser_reload`               | Reload current page                                |
| `browser_connection_status`    | Check CDP connection status                        |
| `browser_start_chrome`         | Start Chrome with DevTools debugging enabled       |

### Interaction Tools

| Tool                  | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `browser_click`       | Click an element by CSS selector or text content     |
| `browser_type`        | Type text into an input field                        |
| `browser_wait_for`    | Wait for an element to appear on the page            |
| `browser_get_element` | Get element info: text, attributes, visibility, size |
| `browser_select`      | Select option from a dropdown by value, text, index  |
| `browser_hover`       | Hover over an element to trigger hover states        |

### Multi-Tab Management

| Tool                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `browser_list_tabs`  | List all open browser tabs with IDs, URLs, titles |
| `browser_open_tab`   | Open a new tab with a URL                         |
| `browser_switch_tab` | Switch active tab by tab ID                       |
| `browser_close_tab`  | Close a tab by ID                                 |

### Style Comparison Tools

| Tool                            | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| `browser_get_computed_styles`   | Get computed CSS styles for an element                   |
| `browser_compare_screenshots`   | Compare screenshots between two tabs with visual diff    |
| `browser_style_diff`            | Compare computed styles between two pages                |
| `browser_extract_design_tokens` | Extract design tokens (colors, fonts, spacing) from page |
| `browser_batch_style_compare`   | Compare multiple elements between two pages at once      |

## Use Case: UI Parity Testing

These tools were built to compare UI between two versions of an application (e.g., Next.js vs Svelte). Here's a typical workflow:

### 1. Open Both Versions

```
"Open a new tab with http://localhost:3000/dashboard"
"Open another tab with http://localhost:5174/dashboard"
"List all open tabs"
```

### 2. Visual Comparison

```
"Compare screenshots between tab-0 and tab-1"
```

This returns:

- Side-by-side dimensions
- Pixel difference percentage
- Base64-encoded diff image highlighting differences in red

### 3. Style Comparison

```
"Compare styles between tab-0 and tab-1 for selector '.main-header'"
```

Returns differences in computed styles like:

- font-family: "Inter" vs "Mulish"
- padding-top: "16px" vs "12px"

### 4. Batch Comparison

```
"Compare styles for .header, .sidebar, .main-content between the two tabs"
```

### 5. Extract Design Tokens

```
"Extract design tokens from tab-0"
```

Returns structured data:

- Colors (backgrounds, text, borders)
- Typography (fonts, sizes, weights)
- Spacing (padding, margins, gaps)

## Example Usage in Claude

### Basic Usage

```
"Check the browser console for errors"
"Take a screenshot of the current page"
"What network requests failed?"
"Execute: document.querySelector('.button').click()"
```

### Multi-Tab Usage

```
"List all open tabs"
"Open a new tab to https://example.com"
"Switch to tab-1"
"Close tab-2"
```

### Style Debugging

```
"Get computed styles for the .navbar element"
"What are the styles on the button with selector #submit-btn?"
"Extract all design tokens from this page"
```

### UI Comparison

```
"Compare screenshots between tab-0 and tab-1"
"Show me the style differences for .card between the two tabs"
"Batch compare .header, .footer, .sidebar between app versions"
```

## Manual Chrome Start

If you prefer to start Chrome manually:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# With existing profile (recommended)
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
```

## Configuration

Environment variables (set in `.mcp.json`):

| Variable       | Default     | Description                    |
| -------------- | ----------- | ------------------------------ |
| `CDP_HOST`     | `localhost` | Chrome DevTools host           |
| `CDP_PORT`     | `9222`      | Chrome DevTools port           |
| `MAX_LOGS`     | `500`       | Max console logs to buffer     |
| `MAX_REQUESTS` | `200`       | Max network requests to buffer |

## Troubleshooting

**"Failed to connect to Chrome DevTools"**

- Make sure Chrome is running with `--remote-debugging-port=9222`
- Check if port 9222 is available: `lsof -i :9222`
- Try restarting Chrome with the script: `./tools/mcp-browser-devtools/start-chrome.sh`

**Tools not appearing in Claude**

- Restart Claude Code after setup
- Check `.mcp.json` includes `browser-devtools` server
- Verify dependencies: `cd tools/mcp-browser-devtools && npm ls`

**Tab comparison not working**

- Ensure you have at least 2 tabs open: use `browser_list_tabs`
- Tab IDs are returned from `browser_list_tabs` - use those exact IDs
- Both tabs must be fully loaded before comparison

**Screenshot comparison shows high difference %**

- Pages may still be loading - use `browser_wait_for` first
- Dynamic content (animations, timestamps) will cause differences
- Viewport sizes should match between tabs for accurate comparison
