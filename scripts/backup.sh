#!/usr/bin/env bash
# backup.sh — Create a milestone backup tag and a changelog entry.
# Safe for repeated runs. Skips if the tag already exists (unless --force).
#
# Usage:
#   ./scripts/backup.sh                          # auto-generates tag from date
#   ./scripts/backup.sh v0.2.0                   # explicit tag
#   ./scripts/backup.sh --force v0.2.0           # overwrite existing tag
#
# Produces:
#   - A lightweight git tag
#   - An entry in backups/CHANGELOG.md (creates file if missing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# --- helpers ---
error() { echo "ERROR: $*" >&2; exit 1; }
info()  { echo "[backup] $*"; }

# --- parse args ---
FORCE=0
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    *)       TAG="$1"; shift ;;
  esac
done

# --- defaults ---
if [ -z "$TAG" ]; then
  TAG="backup-$(date +%Y%m%d-%H%M%S)"
fi

# --- pre-flight ---
[ -d .git ] || error "Not a git repo"

if git tag -l "$TAG" | grep -q "$TAG"; then
  if [ "$FORCE" -eq 1 ]; then
    info "Tag $TAG exists — recreating with --force."
  else
    info "Tag $TAG already exists. Skipping (use --force to overwrite)."
    exit 0
  fi
fi

# --- create tag from current HEAD ---
COMMIT=$(git rev-parse HEAD)
COMMIT_MSG=$(git log -1 --pretty=format:'%s')
DATE=$(date +%Y-%m-%d\ %H:%M)

info "Tagging $TAG from $COMMIT ($COMMIT_MSG)..."
git tag "$TAG"
git push origin "$TAG" 2>&1 || error "tag push failed"

# --- update changelog ---
BACKUP_DIR="$PROJECT_DIR/backups"
mkdir -p "$BACKUP_DIR"
CHANGELOG="$BACKUP_DIR/CHANGELOG.md"

if [ ! -f "$CHANGELOG" ]; then
  echo "# SCC Milestone Backups" > "$CHANGELOG"
  echo "" >> "$CHANGELOG"
fi

# Append entry (idempotent: skip if tag already logged)
if grep -q "^## $TAG" "$CHANGELOG" 2>/dev/null; then
  info "Changelog entry for $TAG already exists — skipping."
else
  cat >> "$CHANGELOG" <<ENTRY
## $TAG
- **Created:** $DATE
- **Commit:** \`$COMMIT\`
- **Message:** $COMMIT_MSG

ENTRY
  info "Changelog updated."
fi

# --- push changelog ---
git add "$CHANGELOG"
git commit -m "docs: update backup changelog for $TAG" 2>/dev/null || true
git push origin main 2>&1 || true

echo ""
info "Backup complete: $TAG"
