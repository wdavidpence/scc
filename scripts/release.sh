#!/usr/bin/env bash
# release.sh — Full release workflow: build, sync, backup, and generate update.
# Safe for repeated runs. Exits 0 on success.
#
# Usage:
#   ./scripts/release.sh                         # build + sync + backup (auto-tag)
#   ./scripts/release.sh v0.2.0                  # build + sync + backup (explicit tag)
#   ./scripts/release.sh --skip-build v0.2.0     # skip vite build, just sync/backup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

error() { echo "ERROR: $*" >&2; exit 1; }
info()  { echo "[release] $*"; }

# --- parse args ---
SKIP_BUILD=0
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    *)            TAG="$1"; shift ;;
  esac
done

# --- build ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  info "Building project..."
  npm run build 2>&1 || error "Build failed"
  info "Build output: dist/"
else
  info "Skipping build (--skip-build)."
fi

# --- sync ---
info "Syncing to GitHub..."
bash "$SCRIPT_DIR/sync.sh" "$TAG" 2>&1 || error "Sync failed"

# --- backup ---
info "Creating backup..."
bash "$SCRIPT_DIR/backup.sh" "$TAG" 2>&1 || error "Backup failed"

# --- generate daily update if file doesn't exist ---
TODAY=$(date +%Y-%m-%d)
DAILY_FILE="$PROJECT_DIR/backups/DAILY-$TODAY.md"
TEMPLATE="$SCRIPT_DIR/../backups/UPDATE_TEMPLATE.md"

if [ ! -f "$DAILY_FILE" ]; then
  info "Generating daily update: $DAILY_FILE"
  cp "$TEMPLATE" "$DAILY_FILE"
  sed -i '' "s/YYYY-MM-DD/$TODAY/" "$DAILY_FILE" 2>/dev/null || \
  sed -i "s/YYYY-MM-DD/$TODAY/" "$DAILY_FILE" 2>/dev/null || true
fi

# --- summary ---
echo ""
info "========================================="
info "Release complete."
if [ -n "$TAG" ]; then
  info "  Tag: $TAG"
else
  TAG=$(git tag -l 'backup-*' | sort | tail -1)
  info "  Latest backup tag: $TAG"
fi
info "  Files: scripts/sync.sh scripts/backup.sh scripts/release.sh"
info "  Templates: backups/UPDATE_TEMPLATE.md"
info "  Changelog: backups/CHANGELOG.md"
info "========================================="
