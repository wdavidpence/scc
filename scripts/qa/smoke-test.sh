#!/usr/bin/env bash
# smoke-test.sh — Runtime smoke checks for SCC.
#
# Starts a temporary http-server on a free port, fires HTTP requests
# against the built dist/ directory, and validates that all expected
# endpoints return 200 with non-empty content.
#
# Usage:
#   ./scripts/qa/smoke-test.sh              # full smoke test
#   ./scripts/qa/smoke-test.sh --skip-build  # skip npm run build
#   ./scripts/qa/smoke-test.sh --json        # machine-readable output
#   ./scripts/qa/smoke-test.sh --port 8787   # use specific port

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

PASS=0
FAIL=0
SKIP=0
JSON_OUTPUT=0
SKIP_BUILD=0
CUSTOM_PORT=""
SERVER_PID=""
SERVER_PORT=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}[FAIL]${NC} $1"; }
skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}[SKIP]${NC} $1"; }

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)  SKIP_BUILD=1; shift ;;
    --json)        JSON_OUTPUT=1; shift ;;
    --port)        CUSTOM_PORT="$2"; shift 2 ;;
    *)             echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "============================================"
  echo "  SCC Runtime Smoke Tests"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "============================================"
  echo ""
fi

# --- Pre-flight: ensure dist/ exists ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  if [ ! -d "dist" ]; then
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo "--- Running npm run build first ---"
    fi
    npm run build >/dev/null 2>&1
    if [ $? -ne 0 ]; then
      fail "Build failed; smoke tests cannot proceed"
      echo ""
      echo "  Passed: $PASS  Failed: $FAIL  Skipped: $SKIP"
      exit 1
    fi
  fi
fi

if [ ! -d "dist" ]; then
  fail "dist/ directory missing (run npm run build first)"
  echo ""
  echo "  Passed: $PASS  Failed: $FAIL  Skipped: $SKIP"
  exit 1
fi

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "--- Starting http-server on dist/ ---"
fi

# Find a free port
if [ -n "$CUSTOM_PORT" ]; then
  SERVER_PORT="$CUSTOM_PORT"
else
  # Use a random high port
  SERVER_PORT=$((RANDOM % 10000 + 30000))
fi

# Start http-server in background
npx --yes http-server dist -p "$SERVER_PORT" -s -c-1 --cors &>/dev/null &
SERVER_PID=$!

# Wait for server to be ready
READY=0
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$SERVER_PORT/" 2>/dev/null | grep -q "200"; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -eq 0 ]; then
  fail "http-server failed to start on port $SERVER_PORT"
  echo ""
  echo "  Passed: $PASS  Failed: $FAIL  Skipped: $SKIP"
  exit 1
fi

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "  Server running on http://localhost:$SERVER_PORT (PID $SERVER_PID)"
  echo ""
fi

# --- Endpoint checks ---
if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "--- HTTP Endpoint Checks ---"
fi

# Vite bundles everything into a single JS file, so we check for the bundle
BUNDLED_JS=$(ls dist/assets/*.js 2>/dev/null | grep -v '.map' | head -1)
BUNDLED_NAME=""
if [ -n "$BUNDLED_JS" ]; then
  BUNDLED_NAME=$(basename "$BUNDLED_JS")
fi

check_endpoint() {
  local url="$1"
  local desc="$2"
  local expected_code="${3:-200}"
  local expected_min_size="${4:-0}"

  local http_code
  local content_size

  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
  content_size=$(curl -s "$url" 2>/dev/null | wc -c | tr -d ' ')

  if [ "$http_code" = "$expected_code" ]; then
    if [ "$content_size" -ge "$expected_min_size" ]; then
      pass "$desc (HTTP $http_code, ${content_size} bytes)"
    else
      fail "$desc returned HTTP $http_code but content is empty (${content_size} bytes)"
    fi
  else
    fail "$desc returned HTTP $http_code (expected $expected_code)"
  fi
}

# Core endpoints
check_endpoint "http://localhost:$SERVER_PORT/" "index.html (root)" 200 100

# Vite-bundled JS (single bundle)
if [ -n "$BUNDLED_NAME" ]; then
  check_endpoint "http://localhost:$SERVER_PORT/assets/$BUNDLED_NAME" "Vite JS bundle ($BUNDLED_NAME)" 200 100
else
  fail "No JS bundle found in dist/assets/"
fi

# Check that Phaser library loads (in the local JS bundle, since Vite bundles it)
PHASER_CHECK_FILE="dist/assets/${BUNDLED_NAME:-*.js}"
if [ -n "$BUNDLED_NAME" ] && [ -f "dist/assets/$BUNDLED_NAME" ]; then
  if grep -qi 'phaser' "dist/assets/$BUNDLED_NAME"; then
    pass "JS bundle references Phaser library"
  else
    fail "Phaser library not found in JS bundle"
  fi
else
  # Check source index.html as fallback
  if grep -q 'phaser' index.html 2>/dev/null; then
    pass "index.html references Phaser library (source)"
  else
    fail "Phaser library not found in build artifacts"
  fi
fi

# Check served index.html references the JS bundle
BUNDLED_IN_HTML=$(curl -s "http://localhost:$SERVER_PORT/" 2>/dev/null)
if [ -n "$BUNDLED_NAME" ] && echo "$BUNDLED_IN_HTML" | grep -q "$BUNDLED_NAME"; then
  pass "Served index.html references JS bundle"
else
  fail "Served index.html does not reference JS bundle"
fi

# Check for mobile-specific meta in served HTML
if echo "$BUNDLED_IN_HTML" | grep -q 'viewport'; then
  pass "Served index.html has viewport meta"
else
  fail "Served index.html missing viewport meta"
fi

if echo "$BUNDLED_IN_HTML" | grep -q 'touch-action'; then
  pass "Served index.html has touch-action: none"
else
  fail "Served index.html missing touch-action: none"
fi

# Check 404 handling (should return 404, not crash)
local_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$SERVER_PORT/nonexistent-page-xyz" 2>/dev/null || echo "000")
if [ "$local_code" = "404" ]; then
  pass "404 handling works (non-existent page returns 404)"
else
  fail "404 handling broken (expected 404, got $local_code)"
fi

# Check CORS headers (if http-server --cors was used)
local_headers=$(curl -s -I "http://localhost:$SERVER_PORT/" 2>/dev/null | head -20)
if echo "$local_headers" | grep -qi 'access-control'; then
  pass "CORS headers present (cross-origin safe)"
else
  skip "CORS headers not present (acceptable if no cross-origin usage)"
fi

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo ""
  echo "============================================"
  echo "  Smoke Test Summary"
  echo "============================================"
  echo -e "  ${GREEN}Passed: $PASS${NC}"
  echo -e "  ${RED}Failed: $FAIL${NC}"
  echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
  echo ""

  if [ "$FAIL" -eq 0 ]; then
    echo -e "  ${GREEN}SMOKE TESTS: ALL PASSED${NC}"
  else
    echo -e "  ${RED}SMOKE TESTS: $FAIL issue(s) found${NC}"
  fi
  echo ""
  echo "  Server stopped."
  echo ""
else
  # JSON mode
  cat <<JSONEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)",
  "project": "$PROJECT_DIR",
  "server_port": $SERVER_PORT,
  "results": {
    "pass": $PASS,
    "fail": $FAIL,
    "skip": $SKIP
  },
  "overall": "$([ $FAIL -eq 0 ] && echo 'PASS' || echo 'FAIL')"
}
JSONEOF
fi

# Cleanup happens in trap
exit $FAIL
