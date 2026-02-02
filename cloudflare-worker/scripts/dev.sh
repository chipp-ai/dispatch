#!/bin/bash
# =============================================================================
# Cloudflare Worker Development with Full R2 Integration
# =============================================================================
#
# This script is for STANDALONE Worker development when you need to:
#   - Build and upload SPA assets to R2
#   - Test brand injection end-to-end
#   - Debug Worker-specific issues
#
# For normal development, use the main dev.sh script instead:
#   cd apps/chipp-deno && ./scripts/dev.sh
#
# That script starts ALL services (API, Vite, Worker) together.
#
# USE THIS SCRIPT WHEN:
# ---------------------
# 1. You've made changes to the SPA and need to update R2
# 2. You want to test production-like R2 serving
# 3. You're debugging Worker-specific brand injection issues
#
# WHAT THIS SCRIPT DOES:
# ----------------------
# 1. Builds the Svelte SPA (npm run build)
# 2. Uploads built assets to dev R2 bucket (chipp-deno-spa-dev)
# 3. Starts Worker with --remote flag (connects to real R2, not simulation)
#
# USAGE:
#   ./scripts/dev.sh                    # Full: build + upload + run
#   ./scripts/dev.sh --skip-build       # Upload existing build + run
#   ./scripts/dev.sh --skip-upload      # Build + run (use existing R2 assets)
#   ./scripts/dev.sh --worker-only      # Just start Worker (fastest)
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$WORKER_DIR/../web"
DIST_DIR="$WEB_DIR/dist"

DEV_BUCKET="chipp-deno-spa-dev"
SKIP_BUILD=false
SKIP_UPLOAD=false
WORKER_ONLY=false
WORKER_PORT=8788
API_ORIGIN="http://localhost:8000"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --skip-build)
      SKIP_BUILD=true
      ;;
    --skip-upload)
      SKIP_UPLOAD=true
      ;;
    --worker-only)
      WORKER_ONLY=true
      SKIP_BUILD=true
      SKIP_UPLOAD=true
      ;;
    --port=*)
      WORKER_PORT="${arg#*=}"
      ;;
    --api=*)
      API_ORIGIN="${arg#*=}"
      ;;
    --help|-h)
      echo "Usage: ./scripts/dev.sh [options]"
      echo ""
      echo "Options:"
      echo "  --skip-build    Skip SPA build (use existing dist/)"
      echo "  --skip-upload   Skip R2 upload (use existing R2 assets)"
      echo "  --worker-only   Just start Worker (skip build and upload)"
      echo "  --port=PORT     Worker port (default: 8788)"
      echo "  --api=URL       API origin (default: http://localhost:8000)"
      echo ""
      echo "Examples:"
      echo "  ./scripts/dev.sh                    # Full rebuild and upload"
      echo "  ./scripts/dev.sh --worker-only      # Quick start, use existing assets"
      echo "  ./scripts/dev.sh --skip-build       # Upload existing build"
      exit 0
      ;;
  esac
done

echo "🚀 Cloudflare Worker Development Environment"
echo "   Bucket: $DEV_BUCKET"
echo "   Port: $WORKER_PORT"
echo "   API: $API_ORIGIN"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Build the Svelte SPA
# -----------------------------------------------------------------------------
if [ "$SKIP_BUILD" = false ]; then
  echo "📦 Building Svelte SPA..."
  cd "$WEB_DIR"
  npm run build
  echo "✅ Build complete"
  echo ""
fi

# Verify dist exists (unless worker-only mode)
if [ "$WORKER_ONLY" = false ] && [ ! -d "$DIST_DIR" ]; then
  echo "❌ Error: dist directory not found at $DIST_DIR"
  echo ""
  echo "Build the SPA first:"
  echo "  cd $WEB_DIR && npm run build"
  echo ""
  echo "Or run with --worker-only to use existing R2 assets"
  exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: Upload to dev R2 bucket
# -----------------------------------------------------------------------------
if [ "$SKIP_UPLOAD" = false ]; then
  echo "☁️  Uploading assets to R2 bucket: $DEV_BUCKET"
  cd "$DIST_DIR"

  FILE_COUNT=$(find . -type f | wc -l | tr -d ' ')
  echo "   Found $FILE_COUNT files to upload"

  # Upload each file with proper content types
  UPLOADED=0
  find . -type f | while read -r file; do
    key="${file#./}"
    
    # Determine content type
    case "$key" in
      *.html) CT="--content-type text/html" ;;
      *.js|*.mjs) CT="--content-type application/javascript" ;;
      *.css) CT="--content-type text/css" ;;
      *.json) CT="--content-type application/json" ;;
      *.svg) CT="--content-type image/svg+xml" ;;
      *.png) CT="--content-type image/png" ;;
      *.jpg|*.jpeg) CT="--content-type image/jpeg" ;;
      *.woff2) CT="--content-type font/woff2" ;;
      *.woff) CT="--content-type font/woff" ;;
      *.ttf) CT="--content-type font/ttf" ;;
      *) CT="" ;;
    esac
    
    if npx wrangler r2 object put "$DEV_BUCKET/$key" --file "$file" $CT 2>/dev/null; then
      UPLOADED=$((UPLOADED + 1))
      if [ $((UPLOADED % 20)) -eq 0 ]; then
        echo "   ✓ Uploaded $UPLOADED files..."
      fi
    fi
  done
  echo "✅ Upload complete"
  echo ""
fi

# -----------------------------------------------------------------------------
# Step 3: Start the Cloudflare Worker
# -----------------------------------------------------------------------------
# The --remote flag is CRITICAL: it connects to real R2 instead of local simulation.
# Without --remote, Miniflare simulates an empty bucket and assets won't load.
# -----------------------------------------------------------------------------
echo "🔧 Starting Cloudflare Worker..."
echo ""
echo "   Local URL: http://localhost:$WORKER_PORT"
echo "   Consumer: http://localhost:$WORKER_PORT/#/w/chat/{app-slug}"
echo ""
echo "   Features available:"
echo "   ✓ Brand injection (window.__APP_BRAND__)"
echo "   ✓ App-specific splash screen"
echo "   ✓ PWA manifest serving"
echo "   ✓ API proxying to $API_ORIGIN"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

cd "$WORKER_DIR"
npx wrangler dev \
  --remote \
  --port "$WORKER_PORT" \
  --var API_ORIGIN:"$API_ORIGIN"
