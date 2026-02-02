#!/bin/bash
# =============================================================================
# Upload Svelte SPA to R2 Bucket
# =============================================================================
#
# This script uploads the built Svelte SPA to an R2 bucket for serving
# via the Cloudflare Worker.
#
# USAGE:
#   ./scripts/upload-assets.sh         # Upload to dev bucket (default)
#   ./scripts/upload-assets.sh --prod  # Upload to production bucket
#
# PREREQUISITES:
#   1. Build the SPA first: cd ../web && npm run build
#   2. Wrangler must be authenticated: npx wrangler login
#   3. R2 buckets must exist (created via Cloudflare dashboard)
#
# BUCKETS:
#   - chipp-deno-spa-dev  : Development/testing
#   - chipp-deno-spa      : Production
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$WORKER_DIR/../web"
DIST_DIR="$WEB_DIR/dist"

# Default to dev bucket
BUCKET_NAME="chipp-deno-spa-dev"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --prod|--production)
      BUCKET_NAME="chipp-deno-spa"
      echo "⚠️  PRODUCTION MODE - uploading to production bucket"
      read -p "Are you sure? (y/N) " confirm
      if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
      fi
      ;;
    --help|-h)
      echo "Usage: ./scripts/upload-assets.sh [--prod]"
      echo ""
      echo "Options:"
      echo "  --prod    Upload to production bucket (chipp-deno-spa)"
      echo "            Default is dev bucket (chipp-deno-spa-dev)"
      exit 0
      ;;
  esac
done

# Check if dist exists
if [ ! -d "$DIST_DIR" ]; then
  echo "❌ Error: dist directory not found at $DIST_DIR"
  echo ""
  echo "Build the SPA first:"
  echo "  cd $WEB_DIR && npm run build"
  exit 1
fi

# Count files to upload
FILE_COUNT=$(find "$DIST_DIR" -type f | wc -l | tr -d ' ')
echo "📦 Uploading $FILE_COUNT files to R2 bucket: $BUCKET_NAME"
echo ""

# Change to dist directory for relative paths
cd "$DIST_DIR"

# Upload each file with progress
UPLOADED=0
FAILED=0

find . -type f | while read -r file; do
  key="${file#./}"
  
  # Determine content type for proper serving
  case "$key" in
    *.html) CONTENT_TYPE="text/html; charset=utf-8" ;;
    *.js)   CONTENT_TYPE="application/javascript; charset=utf-8" ;;
    *.mjs)  CONTENT_TYPE="application/javascript; charset=utf-8" ;;
    *.css)  CONTENT_TYPE="text/css; charset=utf-8" ;;
    *.json) CONTENT_TYPE="application/json; charset=utf-8" ;;
    *.svg)  CONTENT_TYPE="image/svg+xml" ;;
    *.png)  CONTENT_TYPE="image/png" ;;
    *.jpg|*.jpeg) CONTENT_TYPE="image/jpeg" ;;
    *.ico)  CONTENT_TYPE="image/x-icon" ;;
    *.woff) CONTENT_TYPE="font/woff" ;;
    *.woff2) CONTENT_TYPE="font/woff2" ;;
    *.ttf)  CONTENT_TYPE="font/ttf" ;;
    *)      CONTENT_TYPE="application/octet-stream" ;;
  esac
  
  # Upload with content type
  if npx wrangler r2 object put "$BUCKET_NAME/$key" \
    --file "$file" \
    --content-type "$CONTENT_TYPE" \
    2>/dev/null; then
    UPLOADED=$((UPLOADED + 1))
    # Show progress every 20 files
    if [ $((UPLOADED % 20)) -eq 0 ]; then
      echo "  ✓ Uploaded $UPLOADED files..."
    fi
  else
    FAILED=$((FAILED + 1))
    echo "  ✗ Failed: $key"
  fi
done

echo ""
echo "✅ Upload complete!"
echo "   Bucket: $BUCKET_NAME"
echo "   Files: $FILE_COUNT"
echo ""
echo "The Cloudflare Worker will now serve these assets."
echo "Access via: http://localhost:8788 (local) or production URL"
