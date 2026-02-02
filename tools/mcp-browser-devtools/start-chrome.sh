#!/bin/bash
# Start Chrome with DevTools Protocol enabled
# This allows Claude to access console logs, network requests, screenshots, etc.

set -e

CDP_PORT="${CDP_PORT:-9222}"

# Check if Chrome is already running with debugging
if lsof -i ":$CDP_PORT" >/dev/null 2>&1; then
    echo "Chrome DevTools already running on port $CDP_PORT"
    echo "To restart, close Chrome first or use a different port:"
    echo "  CDP_PORT=9223 ./tools/mcp-browser-devtools/start-chrome.sh"
    exit 0
fi

# Detect OS and Chrome path
case "$(uname -s)" in
    Darwin)
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome"
        ;;
    Linux)
        CHROME_PATH=$(which google-chrome || which chromium-browser || which chromium)
        USER_DATA_DIR="$HOME/.config/google-chrome"
        ;;
    *)
        echo "Unsupported OS. Please start Chrome manually with:"
        echo "  chrome --remote-debugging-port=$CDP_PORT"
        exit 1
        ;;
esac

if [ ! -f "$CHROME_PATH" ] && [ ! -x "$CHROME_PATH" ]; then
    echo "Chrome not found at: $CHROME_PATH"
    echo "Please install Chrome or update the path in this script"
    exit 1
fi

echo "Starting Chrome with DevTools on port $CDP_PORT..."
echo "Chrome will open with your existing profile."
echo ""

# Start Chrome in background with debugging enabled
# Using existing profile so you have your bookmarks, extensions, etc.
"$CHROME_PATH" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$USER_DATA_DIR" \
    >/dev/null 2>&1 &

# Wait a moment for Chrome to start
sleep 2

# Verify it started
if lsof -i ":$CDP_PORT" >/dev/null 2>&1; then
    echo "Chrome DevTools ready on port $CDP_PORT"
    echo ""
    echo "You can now use browser_* tools in Claude Code."
    echo "Try: 'Check the browser console for errors'"
else
    echo "Failed to start Chrome with DevTools."
    echo "Try starting manually:"
    echo "  \"$CHROME_PATH\" --remote-debugging-port=$CDP_PORT"
fi
