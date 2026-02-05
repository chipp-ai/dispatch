#!/bin/bash
# =============================================================================
# Component Migration Script
# =============================================================================
#
# Migrates React components to Svelte 5 using parallel Claude sessions.
# Each component gets its own fresh Claude context for unbiased translation.
#
# USAGE:
#   ./scripts/migration/migrate-components.sh [options]
#
# OPTIONS:
#   --dry-run       Show commands without executing
#   --parallel N    Run N migrations in parallel (default: 3)
#   --component X   Migrate only component X
#   --report FILE   Use specific migration report
#
# EXAMPLES:
#   ./scripts/migration/migrate-components.sh --dry-run
#   ./scripts/migration/migrate-components.sh --component PlanCard
#   ./scripts/migration/migrate-components.sh --parallel 5
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$REPO_ROOT/.scratch/migration-reports"
PROMPT_TEMPLATE="$SCRIPT_DIR/component-migration-prompt.md"
LOG_DIR="$REPO_ROOT/.scratch/migration-logs"

# Defaults
DRY_RUN=false
PARALLEL=3
SPECIFIC_COMPONENT=""
SPECIFIC_REPORT=""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --parallel)
      PARALLEL="$2"
      shift 2
      ;;
    --component)
      SPECIFIC_COMPONENT="$2"
      shift 2
      ;;
    --report)
      SPECIFIC_REPORT="$2"
      shift 2
      ;;
    --help|-h)
      head -30 "$0" | tail -25
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

mkdir -p "$LOG_DIR"

# -----------------------------------------------------------------------------
# Component definitions
# -----------------------------------------------------------------------------
# Format: "SourcePath|TargetPath|Description"
# These are extracted from migration reports

declare -a PLANS_PAGE_COMPONENTS=(
  "/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlanCard.tsx|$REPO_ROOT/web/src/lib/components/billing/PlanCard.svelte|Plan pricing card"
  "/Users/hunterhodnett/code/chipp-monorepo/apps/chipp-admin/app/plans/PlansNavigation.tsx|$REPO_ROOT/web/src/lib/components/billing/PlansNavigation.svelte|Plans page header nav"
)

declare -a BILLING_SETTINGS_COMPONENTS=(
  # Add billing settings components here
)

declare -a UPGRADE_MODAL_COMPONENTS=(
  # Add upgrade modal components here
)

# Combine all components
declare -a ALL_COMPONENTS=(
  "${PLANS_PAGE_COMPONENTS[@]}"
  "${BILLING_SETTINGS_COMPONENTS[@]}"
  "${UPGRADE_MODAL_COMPONENTS[@]}"
)

# -----------------------------------------------------------------------------
# Migration function
# -----------------------------------------------------------------------------
migrate_component() {
  local source_path="$1"
  local target_path="$2"
  local description="$3"
  local component_name=$(basename "$source_path" .tsx)
  local log_file="$LOG_DIR/${component_name}.log"

  echo -e "${BLUE}Migrating:${NC} $component_name"
  echo -e "  Source: $source_path"
  echo -e "  Target: $target_path"

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY RUN] Would execute claude -p${NC}"
    return 0
  fi

  # Ensure target directory exists
  mkdir -p "$(dirname "$target_path")"

  # Build the prompt
  local prompt="You are a UI migration specialist. Migrate this React component to Svelte 5 with PIXEL-PERFECT accuracy.

CRITICAL RULES:
1. PRESERVE EXACT CSS VALUES - Never approximate colors, spacing, fonts
   - rgb(249, 210, 0) stays rgb(249, 210, 0) (not yellow-500)
   - padding: 16px stays as-is (not p-4)
2. TRANSLATE REACT TO SVELTE 5:
   - useState(x) → let x = \$state(initial)
   - useEffect → \$effect()
   - onClick → onclick
   - className → class
   - {condition && <X />} → {#if condition}<X />{/if}
   - {items.map()} → {#each items as item}{/each}
3. FRAMER MOTION → SVELTE TRANSITIONS:
   - motion.div with initial/animate → in:fly, in:fade, etc.
4. PROPS: Use \$props() with TypeScript interface
5. KEEP EXACT SAME visual appearance

SOURCE FILE: $source_path
TARGET FILE: $target_path

Steps:
1. Read the source file completely
2. Write the Svelte 5 component to the target path
3. Run: deno fmt $target_path
4. Run: deno task check

Reply with just 'OK' if successful or 'FAIL: reason' if not."

  # Execute Claude
  echo -e "  ${YELLOW}Running Claude...${NC}"

  local result
  result=$(claude -p "$prompt" \
    --allowedTools "Read,Write,Edit,Bash(deno fmt *),Bash(deno task check),Bash(mkdir *)" \
    2>&1 | tee "$log_file")

  if echo "$result" | grep -q "^OK"; then
    echo -e "  ${GREEN}SUCCESS${NC}"
    return 0
  else
    echo -e "  ${RED}FAILED${NC}"
    echo -e "  Check log: $log_file"
    return 1
  fi
}

# -----------------------------------------------------------------------------
# Main execution
# -----------------------------------------------------------------------------
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Component Migration Script${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo "Reports dir: $REPORTS_DIR"
echo "Log dir: $LOG_DIR"
echo "Parallel: $PARALLEL"
echo "Dry run: $DRY_RUN"
echo ""

# Filter components if specific one requested
if [ -n "$SPECIFIC_COMPONENT" ]; then
  echo -e "${YELLOW}Filtering for component: $SPECIFIC_COMPONENT${NC}"
  declare -a FILTERED_COMPONENTS=()
  for component in "${ALL_COMPONENTS[@]}"; do
    if echo "$component" | grep -q "$SPECIFIC_COMPONENT"; then
      FILTERED_COMPONENTS+=("$component")
    fi
  done
  ALL_COMPONENTS=("${FILTERED_COMPONENTS[@]}")
fi

# Check if we have components
if [ ${#ALL_COMPONENTS[@]} -eq 0 ]; then
  echo -e "${RED}No components found to migrate${NC}"
  exit 1
fi

echo -e "${GREEN}Found ${#ALL_COMPONENTS[@]} components to migrate${NC}"
echo ""

# Track results
SUCCESS_COUNT=0
FAIL_COUNT=0

# Migrate each component
for component in "${ALL_COMPONENTS[@]}"; do
  IFS='|' read -r source target desc <<< "$component"

  if migrate_component "$source" "$target" "$desc"; then
    ((SUCCESS_COUNT++))
  else
    ((FAIL_COUNT++))
  fi

  echo ""
done

# Summary
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Migration Complete${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "  ${GREEN}Success: $SUCCESS_COUNT${NC}"
echo -e "  ${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${YELLOW}Check logs in: $LOG_DIR${NC}"
  exit 1
fi
