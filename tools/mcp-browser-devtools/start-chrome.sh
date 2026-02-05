#!/bin/bash
# Start Chrome with DevTools Protocol enabled
# This allows Claude to access console logs, network requests, screenshots, etc.

set -e

CDP_PORT="${CDP_PORT:-9222}"

# Detect OS and Chrome path
case "$(uname -s)" in
    Darwin)
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome-DevTools"
        ;;
    Linux)
        CHROME_PATH=$(which google-chrome || which chromium-browser || which chromium)
        USER_DATA_DIR="$HOME/.config/google-chrome-devtools"
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

# Check if Chrome DevTools is already running on the port
if lsof -i ":$CDP_PORT" >/dev/null 2>&1; then
    echo "Chrome DevTools already running on port $CDP_PORT"
    exit 0
fi

# If Chrome is running without debugging, kill it and restart with DevTools
if pgrep -x "Google Chrome" >/dev/null 2>&1 || pgrep -f "Google Chrome" >/dev/null 2>&1; then
    echo "Chrome is running without DevTools. Restarting with debugging enabled..."
    # Gracefully quit first, then force kill any stragglers (helpers, GPU, renderer)
    case "$(uname -s)" in
        Darwin)
            osascript -e 'quit app "Google Chrome"' 2>/dev/null || true
            sleep 2
            # Force kill any remaining Chrome processes (helpers linger and block restart)
            pkill -9 -f "Google Chrome" 2>/dev/null || true
            ;;
        *)
            pkill -f "Google Chrome" 2>/dev/null || true
            sleep 1
            pkill -9 -f "Google Chrome" 2>/dev/null || true
            ;;
    esac
    # Wait for all Chrome processes to be gone
    for i in $(seq 1 10); do
        if ! pgrep -f "Google Chrome" >/dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
    sleep 1
fi

echo "Starting Chrome with DevTools on port $CDP_PORT..."
echo ""

# Start Chrome in background with debugging enabled
# Uses a separate data dir (Chrome requires non-default for remote debugging)
"$CHROME_PATH" \
    --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --noerrdialogs \
    >/dev/null 2>&1 &

# Wait for Chrome to start listening on the debug port (up to 10 seconds)
for i in $(seq 1 20); do
    if lsof -i ":$CDP_PORT" >/dev/null 2>&1; then
        echo "Chrome DevTools ready on port $CDP_PORT"
        echo ""
        echo "You can now use browser_* tools in Claude Code."
        exit 0
    fi
    sleep 0.5
done

echo "Failed to start Chrome with DevTools."
echo "Try starting manually:"
echo "  \"$CHROME_PATH\" --remote-debugging-port=$CDP_PORT"
