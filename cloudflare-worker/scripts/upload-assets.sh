#!/bin/bash
# =============================================================================
# Upload Svelte SPA to R2 Bucket (Incremental)
# =============================================================================
#
# Manifest-based incremental upload: only uploads files that have changed
# since the last deploy. Stores a .deploy-manifest.json in R2 to track
# file hashes between deploys.
#
# USAGE:
#   ./scripts/upload-assets.sh                      # Incremental to dev bucket
#   ./scripts/upload-assets.sh --prod               # Incremental to prod bucket
#   ./scripts/upload-assets.sh --prod --ci          # Prod, no confirmation prompt
#   ./scripts/upload-assets.sh --full               # Full upload (skip diffing)
#   ./scripts/upload-assets.sh --prod --cleanup     # Also delete stale R2 objects
#
# MODES:
#   --incremental  (default) Only upload changed files based on manifest diff
#   --full         Upload all files (escape hatch, same as old behavior)
#   --cleanup      Delete stale files from R2 that no longer exist in build
#   --ci           Skip interactive confirmation for --prod
#   --dry-run      Show what would be uploaded/deleted without doing it
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

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$WORKER_DIR/../web"
DIST_DIR="$WEB_DIR/dist"
MANIFEST_KEY=".deploy-manifest.json"

# Defaults
BUCKET_NAME="chipp-deno-spa-dev"
MODE="incremental"
CLEANUP=false
CI_MODE=false
DRY_RUN=false

# Files that should always be uploaded regardless of hash (small + critical)
ALWAYS_UPLOAD=(
  "index.html"
  "version.json"
  "manifest.json"
  "consumer-sw.js"
  "builder-sw.js"
  "pwa-init.js"
  "offline.html"
)

# Files that should never be deleted during cleanup
NEVER_DELETE=(
  "index.html"
  "version.json"
  "manifest.json"
  "consumer-sw.js"
  "builder-sw.js"
  "pwa-init.js"
  "offline.html"
  "$MANIFEST_KEY"
)

# --- Argument Parsing ---

for arg in "$@"; do
  case $arg in
    --prod|--production)
      BUCKET_NAME="chipp-deno-spa"
      ;;
    --dev)
      BUCKET_NAME="chipp-deno-spa-dev"
      ;;
    --full)
      MODE="full"
      ;;
    --incremental)
      MODE="incremental"
      ;;
    --cleanup)
      CLEANUP=true
      ;;
    --ci)
      CI_MODE=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      echo "Usage: ./scripts/upload-assets.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --prod         Upload to production bucket (chipp-deno-spa)"
      echo "  --dev          Upload to dev bucket (default: chipp-deno-spa-dev)"
      echo "  --incremental  Only upload changed files (default)"
      echo "  --full         Upload all files (skip manifest diffing)"
      echo "  --cleanup      Delete stale files from R2 not in current build"
      echo "  --ci           Skip interactive confirmation prompt"
      echo "  --dry-run      Show what would happen without uploading"
      exit 0
      ;;
  esac
done

# Confirm production upload (unless --ci)
if [[ "$BUCKET_NAME" == "chipp-deno-spa" && "$CI_MODE" == "false" ]]; then
  echo "WARNING: PRODUCTION MODE - uploading to production bucket"
  read -p "Are you sure? (y/N) " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Check if dist exists
if [ ! -d "$DIST_DIR" ]; then
  echo "Error: dist directory not found at $DIST_DIR"
  echo ""
  echo "Build the SPA first:"
  echo "  cd $WEB_DIR && npm run build"
  exit 1
fi

# --- Helper Functions ---

# Cross-platform MD5: macOS uses md5 -q, Linux uses md5sum
compute_md5() {
  if command -v md5sum &>/dev/null; then
    md5sum "$1" | awk '{print $1}'
  elif command -v md5 &>/dev/null; then
    md5 -q "$1"
  else
    echo "Error: no md5 command found" >&2
    exit 1
  fi
}

# Determine content type from file extension
get_content_type() {
  local key="$1"
  case "$key" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.mjs)  echo "application/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.ico)  echo "image/x-icon" ;;
    *.woff) echo "font/woff" ;;
    *.woff2) echo "font/woff2" ;;
    *.ttf)  echo "font/ttf" ;;
    *.webp) echo "image/webp" ;;
    *.gif)  echo "image/gif" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

# Upload a single file to R2 with retry
upload_file() {
  local file="$1"
  local key="$2"
  local max_retries=3
  local retry=0
  local content_type
  content_type=$(get_content_type "$key")

  while [ $retry -lt $max_retries ]; do
    if npx wrangler r2 object put "$BUCKET_NAME/$key" \
      --file "$file" \
      --content-type "$content_type" \
      >/dev/null 2>&1; then
      return 0
    fi
    retry=$((retry + 1))
    sleep $((retry * 2))
  done
  return 1
}

# Check if a value is in an array
in_array() {
  local needle="$1"
  shift
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

# --- Generate Local Manifest ---

generate_local_manifest() {
  local manifest_file="$1"
  echo "{" > "$manifest_file"
  local first=true

  cd "$DIST_DIR"
  while IFS= read -r file; do
    local key="${file#./}"

    # Skip source maps
    [[ "$key" == *.map ]] && continue

    local hash
    hash=$(compute_md5 "$file")

    if [ "$first" = true ]; then
      first=false
    else
      echo "," >> "$manifest_file"
    fi
    printf '  "%s": "%s"' "$key" "$hash" >> "$manifest_file"
  done < <(find . -type f | sort)

  echo "" >> "$manifest_file"
  echo "}" >> "$manifest_file"
  cd - >/dev/null
}

# --- Download Remote Manifest ---

download_remote_manifest() {
  local output_file="$1"
  if npx wrangler r2 object get "$BUCKET_NAME/$MANIFEST_KEY" --pipe > "$output_file" 2>/dev/null; then
    # Validate it's valid JSON
    if python3 -c "import json; json.load(open('$output_file'))" 2>/dev/null; then
      return 0
    fi
  fi
  # No valid manifest found - return empty
  echo "{}" > "$output_file"
  return 0
}

# --- Diff Manifests ---
# Outputs three files: to_upload, to_delete, unchanged

diff_manifests() {
  local local_manifest="$1"
  local remote_manifest="$2"
  local to_upload="$3"
  local to_delete="$4"
  local unchanged="$5"

  python3 << PYEOF
import json, sys

with open("$local_manifest") as f:
    local_m = json.load(f)
with open("$remote_manifest") as f:
    remote_m = json.load(f)

always_upload = set(${ALWAYS_UPLOAD_JSON})

to_upload = []
unchanged = []
to_delete = []

# Files in local build
for path, hash in local_m.items():
    if path in always_upload:
        to_upload.append(path)
    elif path not in remote_m or remote_m[path] != hash:
        to_upload.append(path)
    else:
        unchanged.append(path)

# Files in remote but not in local (stale)
for path in remote_m:
    if path not in local_m:
        to_delete.append(path)

with open("$to_upload", "w") as f:
    items = sorted(to_upload)
    if items:
        f.write("\n".join(items) + "\n")
with open("$to_delete", "w") as f:
    items = sorted(to_delete)
    if items:
        f.write("\n".join(items) + "\n")
with open("$unchanged", "w") as f:
    items = sorted(unchanged)
    if items:
        f.write("\n".join(items) + "\n")
PYEOF
}

# --- Main ---

echo "=== R2 Asset Upload ==="
echo "Bucket: $BUCKET_NAME"
echo "Mode:   $MODE"
echo ""

# Build the JSON array string for always-upload files (used in Python)
ALWAYS_UPLOAD_JSON='['
for i in "${!ALWAYS_UPLOAD[@]}"; do
  [[ $i -gt 0 ]] && ALWAYS_UPLOAD_JSON+=','
  ALWAYS_UPLOAD_JSON+="\"${ALWAYS_UPLOAD[$i]}\""
done
ALWAYS_UPLOAD_JSON+=']'

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

LOCAL_MANIFEST="$TMPDIR/local-manifest.json"
REMOTE_MANIFEST="$TMPDIR/remote-manifest.json"
TO_UPLOAD="$TMPDIR/to-upload.txt"
TO_DELETE="$TMPDIR/to-delete.txt"
UNCHANGED="$TMPDIR/unchanged.txt"

# Generate local manifest (always needed - we upload it at the end)
echo "Generating local file manifest..."
generate_local_manifest "$LOCAL_MANIFEST"
LOCAL_COUNT=$(python3 -c "import json; print(len(json.load(open('$LOCAL_MANIFEST'))))")
echo "Local build: $LOCAL_COUNT files (excluding source maps)"

if [[ "$MODE" == "incremental" ]]; then
  # Download remote manifest
  echo "Downloading remote manifest from R2..."
  download_remote_manifest "$REMOTE_MANIFEST"
  REMOTE_COUNT=$(python3 -c "import json; print(len(json.load(open('$REMOTE_MANIFEST'))))")

  if [[ "$REMOTE_COUNT" == "0" ]]; then
    echo "No previous manifest found - first incremental deploy, uploading all files"
  else
    echo "Previous deploy: $REMOTE_COUNT files"
  fi

  # Diff
  diff_manifests "$LOCAL_MANIFEST" "$REMOTE_MANIFEST" "$TO_UPLOAD" "$TO_DELETE" "$UNCHANGED"

  UPLOAD_COUNT=$(grep -c . "$TO_UPLOAD" 2>/dev/null) || UPLOAD_COUNT=0
  DELETE_COUNT=$(grep -c . "$TO_DELETE" 2>/dev/null) || DELETE_COUNT=0
  UNCHANGED_COUNT=$(grep -c . "$UNCHANGED" 2>/dev/null) || UNCHANGED_COUNT=0

  echo ""
  echo "Diff results:"
  echo "  Upload:    $UPLOAD_COUNT files (new or changed)"
  echo "  Unchanged: $UNCHANGED_COUNT files (skipped)"
  echo "  Stale:     $DELETE_COUNT files (in R2 but not in build)"

else
  # Full mode: upload everything
  cd "$DIST_DIR"
  find . -type f ! -name "*.map" -printf '%P\n' 2>/dev/null \
    || find . -type f ! -name "*.map" | sed 's|^\./||' \
    > "$TO_UPLOAD"
  cd - >/dev/null
  : > "$TO_DELETE"
  : > "$UNCHANGED"

  UPLOAD_COUNT=$(grep -c . "$TO_UPLOAD" 2>/dev/null) || UPLOAD_COUNT=0
  echo "Full mode: uploading all $UPLOAD_COUNT files"
fi

echo ""

# --- Dry Run ---

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Would upload $UPLOAD_COUNT files:"
  if [[ "$UPLOAD_COUNT" -gt 0 ]]; then
    head -20 "$TO_UPLOAD"
    [[ "$UPLOAD_COUNT" -gt 20 ]] && echo "  ... and $((UPLOAD_COUNT - 20)) more"
  fi
  if [[ "$CLEANUP" == "true" && -s "$TO_DELETE" ]]; then
    echo ""
    echo "[DRY RUN] Would delete $DELETE_COUNT stale files:"
    head -20 "$TO_DELETE"
    [[ "$DELETE_COUNT" -gt 20 ]] && echo "  ... and $((DELETE_COUNT - 20)) more"
  fi
  echo ""
  echo "[DRY RUN] No changes made."
  exit 0
fi

# --- Upload Changed Files ---

if [[ "$UPLOAD_COUNT" -gt 0 ]]; then
  echo "Uploading $UPLOAD_COUNT files..."

  UPLOADED=0
  FAILED=0

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue
    local_file="$DIST_DIR/$key"

    if upload_file "$local_file" "$key"; then
      UPLOADED=$((UPLOADED + 1))
      # Progress every 20 files or for small batches show each
      if [[ "$UPLOAD_COUNT" -le 20 ]]; then
        echo "  + $key"
      elif [[ $((UPLOADED % 20)) -eq 0 ]]; then
        echo "  Uploaded $UPLOADED / $UPLOAD_COUNT..."
      fi
    else
      FAILED=$((FAILED + 1))
      echo "  FAILED: $key"
    fi
  done < "$TO_UPLOAD"

  echo "Uploaded $UPLOADED files ($FAILED failed)"
else
  echo "No files to upload - everything is up to date."
fi

# --- Upload Manifest ---

echo ""
echo "Uploading deploy manifest..."
if npx wrangler r2 object put "$BUCKET_NAME/$MANIFEST_KEY" \
  --file "$LOCAL_MANIFEST" \
  --content-type "application/json" \
  >/dev/null 2>&1; then
  echo "Deploy manifest updated."
else
  echo "WARNING: Failed to upload deploy manifest. Next deploy will do a full upload."
fi

# --- Cleanup Stale Files ---

if [[ "$CLEANUP" == "true" && -s "$TO_DELETE" ]]; then
  echo ""
  echo "Cleaning up $DELETE_COUNT stale files from R2..."

  DELETED=0
  SKIPPED=0

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    # Safety: never delete critical files
    if in_array "$key" "${NEVER_DELETE[@]}"; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    if npx wrangler r2 object delete "$BUCKET_NAME/$key" >/dev/null 2>&1; then
      DELETED=$((DELETED + 1))
      echo "  - $key"
    else
      echo "  FAILED to delete: $key"
    fi
  done < "$TO_DELETE"

  echo "Deleted $DELETED stale files ($SKIPPED protected)"
fi

# --- Summary ---

echo ""
echo "=== Upload Complete ==="
echo "Bucket:    $BUCKET_NAME"
echo "Mode:      $MODE"
echo "Uploaded:  ${UPLOADED:-0} files"
[[ "${UNCHANGED_COUNT:-0}" -gt 0 ]] && echo "Skipped:   $UNCHANGED_COUNT unchanged"
[[ "${DELETED:-0}" -gt 0 ]] && echo "Deleted:   $DELETED stale files"
echo ""
