#!/usr/bin/env bash
# verify-build.sh — Build verification for SCC QA harness.
# Checks:
#   1. npm install succeeds (or node_modules exists)
#   2. npm run build succeeds
#   3. dist/ contains expected assets (index.html, JS, CSS)
#   4. No console errors in the built index.html (basic HTML validation)
#
# Usage:
#   ./scripts/qa/verify-build.sh              # full check
#   ./scripts/qa/verify-build.sh --skip-install  # skip npm install
#   ./scripts/qa/verify-build.sh --quick          # only check dist/ exists

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

PASS=0
FAIL=0
SKIP=0
TIMESTAMP="$(date +%Y-%m-%d\ %H:%M:%S)"
RESULTS_FILE="$PROJECT_DIR/backups/qa-reports/$(date +%Y%m%d-%H%M%S)-build.txt"
mkdir -p "$PROJECT_DIR/backups/qa-reports"

# Color codes (terminal only)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}[FAIL]${NC} $1"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}[SKIP]${NC} $1"; }

echo "============================================"
echo "  SCC Build Verification"
echo "  $TIMESTAMP"
echo "============================================"
echo ""

# --- Parse flags ---
SKIP_INSTALL=0
QUICK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1; shift ;;
    --quick)        QUICK=1; shift ;;
    *)              echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Check 1: Node modules ---
if [ "$QUICK" -eq 0 ]; then
  echo "--- Pre-flight: Dependencies ---"
  if [ -d "node_modules" ] && [ -f "package-lock.json" ]; then
    pass "node_modules and package-lock.json exist"
  else
    if [ "$SKIP_INSTALL" -eq 1 ]; then
      skip "Skipping npm install (flag --skip-install)"
    else
      echo "  Running npm install..."
      if npm install --prefer-offline 2>&1 | tail -1; then
        pass "npm install succeeded"
      else
        fail "npm install failed"
      fi
    fi
  fi
  echo ""
fi

# --- Check 2: Build ---
echo "--- Build: npm run build ---"
if [ -d "node_modules" ] || [ "$SKIP_INSTALL" -eq 1 ]; then
  BUILD_OUTPUT=$(npm run build 2>&1)
  BUILD_EXIT=$?
  if [ $BUILD_EXIT -eq 0 ]; then
    pass "Vite build exited cleanly (exit 0)"
  else
    fail "Vite build failed (exit $BUILD_EXIT)"
    echo "  Build output: $(echo "$BUILD_OUTPUT" | head -5)"
  fi
else
  skip "Skipping build (no node_modules, run npm install first)"
fi
echo ""

# --- Check 3: Dist output ---
echo "--- Dist output validation ---"
if [ -d "dist" ]; then
  DIST_FILES=$(find dist -type f 2>/dev/null | sort)
  DIST_COUNT=$(echo "$DIST_FILES" | grep -c . || true)

  if [ "$DIST_COUNT" -gt 0 ]; then
    pass "dist/ contains $DIST_COUNT file(s)"
  else
    fail "dist/ is empty"
  fi

  # Check for HTML
  if echo "$DIST_FILES" | grep -q "index.html"; then
    pass "dist/index.html exists"
  else
    fail "dist/index.html missing"
  fi

  # Check for JS bundles
  JS_COUNT=$(echo "$DIST_FILES" | grep -cE '\.js$' || true)
  if [ "$JS_COUNT" -gt 0 ]; then
    pass "dist/ contains $JS_COUNT JS file(s)"
  else
    fail "No JS bundles found in dist/"
  fi

  # Check for CSS (if any)
  CSS_COUNT=$(echo "$DIST_FILES" | grep -cE '\.css$' || true)
  if [ "$CSS_COUNT" -gt 0 ]; then
    pass "dist/ contains $CSS_COUNT CSS file(s)"
  else
    skip "No CSS bundles (acceptable for this project)"
  fi

  # Check for sourcemaps (if configured)
  if echo "$DIST_FILES" | grep -q '\.map$'; then
    pass "Sourcemaps present (vite.config.js sourcemap: true)"
  else
    skip "No sourcemaps (check if vite.config.js has sourcemap: true)"
  fi

  # Check HTML references correct scripts (Vite uses importmap/esm, not script tag)
  if grep -q 'phaser' dist/index.html 2>/dev/null || grep -q 'assets/' dist/index.html 2>/dev/null; then
    pass "dist/index.html references game assets"
  else
    fail "dist/index.html missing game asset references"
  fi

  # Check viewport meta is preserved
  if grep -q 'viewport' dist/index.html 2>/dev/null; then
    pass "Viewport meta tag preserved in build"
  else
    fail "Viewport meta tag missing from build"
  fi

  # Check mobile-specific meta tags
  if grep -q 'apple-mobile-web-app-capable' dist/index.html 2>/dev/null; then
    pass "iOS PWA meta tags preserved"
  else
    fail "iOS PWA meta tags missing from build"
  fi

  # Check touch-action CSS
  if grep -q 'touch-action' dist/index.html 2>/dev/null; then
    pass "touch-action: none preserved (mobile critical)"
  else
    fail "touch-action CSS missing from build"
  fi

  # Check for oversized assets (warn if non-sourcemap file > 2MB)
  # Exclude .map files (sourcemaps are expected with vite sourcemap: true)
  LARGE_FILES=$(find dist -type f ! -name '*.map' -size +2M 2>/dev/null | wc -l)
  if [ "$LARGE_FILES" -gt 0 ]; then
    fail "$LARGE_FILES non-sourcemap file(s) exceed 2MB — may impact mobile load times"
  else
    pass "No non-sourcemap files exceed 2MB (mobile-friendly)"
  fi

  # Check total dist size
  TOTAL_SIZE=$(du -sh dist/ 2>/dev/null | awk '{print $1}')
  if [ -n "$TOTAL_SIZE" ]; then
    SIZE_NUM=$(echo "$TOTAL_SIZE" | sed 's/[^0-9]//g')
    if [ "$SIZE_NUM" -lt 5000 ]; then
      pass "Total dist/ size is $TOTAL_SIZE (under 5MB)"
    else
      fail "Total dist/ size is $TOTAL_SIZE (exceeds 5MB target for mobile)"
    fi
  fi
else
  fail "dist/ directory does not exist (build may not have run)"
fi
echo ""

# --- Check 4: Source integrity ---
echo "--- Source integrity ---"

# Check all scenes are referenced in createGame.js
if [ -f "src/game/createGame.js" ]; then
  SCENES_IN_CODE=$(grep -oP "import \w+ from" src/game/createGame.js | wc -l)
  SCENES_EXPECTED=5  # Boot, Preload, Menu, Battle, Hud
  if [ "$SCENES_IN_CODE" -ge "$SCENES_EXPECTED" ]; then
    pass "createGame.js imports $SCENES_IN_CODE scenes (expected >= $SCENES_EXPECTED)"
  else
    fail "createGame.js imports only $SCENES_IN_CODE scenes (expected >= $SCENES_EXPECTED)"
  fi

  # Check scale mode
  if grep -q 'RESIZE' src/game/createGame.js; then
    pass "Scale mode is RESIZE (responsive)"
  else
    fail "Scale mode is not RESIZE — may not adapt to screen sizes"
  fi

  # Check active pointers
  if grep -q 'activePointers' src/game/createGame.js; then
    AP=$(grep 'activePointers' src/game/createGame.js | grep -oP '\d+' | head -1)
    if [ -n "$AP" ] && [ "$AP" -ge 3 ]; then
      pass "Multi-touch support: activePointers=$AP (>= 3)"
    else
      fail "Multi-touch support: activePointers=$AP (should be >= 3 for mobile)"
    fi
  else
    fail "activePointers not configured — single-touch only"
  fi
else
  fail "src/game/createGame.js not found"
fi

# Check race data completeness
if [ -f "src/game/data/races.js" ]; then
  RACES=$(grep -c "id:" src/game/data/races.js)
  if [ "$RACES" -ge 3 ]; then
    pass "Race data defines $RACES races (expected >= 3)"
  else
    fail "Race data defines only $RACES races (expected >= 3)"
  fi

  # Check each race has required fields
  for race_id in terran zerg protoss; do
    if grep -q "id: '$race_id'" src/game/data/races.js; then
      # Check worker has cost
      if grep -A5 "id: '$race_id'" src/game/data/races.js | grep -q "cost:"; then
        pass "Race '$race_id' has cost data"
      else
        fail "Race '$race_id' missing cost data"
      fi

      # Check units have hp
      if grep -A3 "$race_id" src/game/data/races.js | grep -q "hp:"; then
        pass "Race '$race_id' units have HP data"
      else
        fail "Race '$race_id' units missing HP data"
      fi
    fi
  done
else
  fail "src/game/data/races.js not found"
fi
echo ""

# --- Summary ---
echo "============================================"
echo "  Build Verification Summary"
echo "  $TIMESTAMP"
echo "============================================"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo ""

TOTAL=$((PASS + FAIL))
if [ "$TOTAL" -gt 0 ]; then
  SCORE=$((PASS * 100 / TOTAL))
else
  SCORE=0
fi

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}BUILD VERIFICATION: PASSED ($SCORE/$TOTAL checks)${NC}"
  RESULT=0
else
  echo -e "  ${RED}BUILD VERIFICATION: FAILED ($SCORE/$TOTAL checks)${NC}"
  RESULT=1
fi

# Save report
cat > "$RESULTS_FILE" <<EOF
SCC Build Verification Report
Timestamp: $TIMESTAMP
Passed: $PASS
Failed: $FAIL
Skipped: $SKIP
Score: $SCORE/$TOTAL
Result: $([ $RESULT -eq 0 ] && echo "PASS" || echo "FAIL")
EOF

echo ""
echo "  Report saved to: $RESULTS_FILE"
echo ""

exit $RESULT
