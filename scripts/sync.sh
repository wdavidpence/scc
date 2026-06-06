#!/usr/bin/env bash
# sync.sh — Push latest code to GitHub, optionally create a release tag.
# Safe for repeated runs. Creates nothing that can't be undone.
#
# Usage:
#   ./scripts/sync.sh                     # push only, no tag
#   ./scripts/sync.sh v0.2.0              # push + lightweight tag
#   ./scripts/sync.sh --force v0.2.0      # push + force-create tag (overwrite)
#
# Requires: git, a configured remote named "origin"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# --- helpers ---
error() { echo "ERROR: $*" >&2; exit 1; }
info()  { echo "[sync] $*"; }

# --- parse args ---
FORCE=0
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    *)       TAG="$1"; shift ;;
  esac
done

# --- pre-flight ---
[ -d .git ] || error "Not a git repo"

REMOTE_URL=$(git remote get-url origin 2>/dev/null) || error "No remote named 'origin'"
info "Remote: $REMOTE_URL"

# Check if remote is a GitHub repo (simple heuristic)
if [[ "$REMOTE_URL" != *"github.com"* ]]; then
  info "Remote does not look like GitHub — still pushing."
fi

# --- fetch first (don't overwrite local) ---
info "Fetching origin..."
git fetch origin --prune 2>&1 || error "git fetch failed"

# --- push ---
info "Pushing main..."
git push origin main 2>&1 || error "git push failed"

# --- optional tag ---
if [ -n "$TAG" ]; then
  if git tag -l "$TAG" | grep -q "$TAG"; then
    if [ "$FORCE" -eq 1 ]; then
      info "Tag $TAG exists — force-creating with --force flag."
      git tag -f "$TAG"
      git push origin "$TAG" --force 2>&1 || error "tag push failed"
    else
      info "Tag $TAG already exists. Use --force to overwrite."
    fi
  else
    info "Creating lightweight tag $TAG..."
    git tag "$TAG"
    git push origin "$TAG" 2>&1 || error "tag push failed"
  fi
else
  info "No tag specified — push only."
fi

echo ""
info "Sync complete."
