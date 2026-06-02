#!/usr/bin/env bash
# run-qa.sh — Master QA runner for SCC.
#
# Runs all QA checks in sequence and produces a consolidated report.
#
# Usage:
#   ./scripts/qa/run-qa.sh                  # full QA suite
#   ./scripts/qa/run-qa.sh --skip-build      # skip build verification
#   ./scripts/qa/run-qa.sh --skip-gameplay   # skip gameplay checks
#   ./scripts/qa/run-qa.sh --skip-touch      # skip touch checks
#   ./scripts/qa/run-qa.sh --json            # machine-readable output
#   ./scripts/qa/run-qa.sh --quick           # only fail-fast checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

TIMESTAMP="$(date +%Y-%m-%d\ %H:%M:%S)"
TIMESTAMP_FILE="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$PROJECT_DIR/backups/qa-reports"
mkdir -p "$REPORT_DIR"

# Parse flags
SKIP_BUILD=0
SKIP_GAMEPLAY=0
SKIP_TOUCH=0
JSON_OUTPUT=0
QUICK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)    SKIP_BUILD=1; shift ;;
    --skip-gameplay) SKIP_GAMEPLAY=1; shift ;;
    --skip-touch)    SKIP_TOUCH=1; shift ;;
    --json)          JSON_OUTPUT=1; shift ;;
    --quick)         QUICK=1; shift ;;
    *)               echo "Unknown option: $1"; exit 1 ;;
  esac
done

TOTAL_CHECKS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
OVERALL_EXIT=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "============================================"
  echo "  SCC QA Suite"
  echo "  $TIMESTAMP"
  echo "============================================"
  echo ""
fi

# --- Build Verification ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${BLUE}=== Phase 1: Build Verification ===${NC}"
    echo ""
  fi

  BUILD_REPORT="$REPORT_DIR/${TIMESTAMP_FILE}-build.txt"
  if bash "$SCRIPT_DIR/verify-build.sh" 2>&1 | tee "$BUILD_REPORT" >/dev/null; then
    BUILD_EXIT=0
  else
    # Count [FAIL] lines in the report (last line is the summary)
    BUILD_EXIT=$(grep -c '\[FAIL\]' "$BUILD_REPORT" 2>/dev/null || true)
    # Ensure it's a clean integer
    BUILD_EXIT=${BUILD_EXIT:-0}
  fi

  if [ "$BUILD_EXIT" -eq 0 ]; then
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${GREEN}Build verification: PASSED${NC}"
    fi
  else
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${RED}Build verification: FAILED (see report above)${NC}"
    fi
    OVERALL_EXIT=1
  fi
  echo ""
else
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${YELLOW}=== Phase 1: Build Verification ===${NC}"
    echo "  Sk (--skip-build)"
    echo ""
  fi
fi

# --- Gameplay Sanity Checks ---
if [ "$SKIP_GAMEPLAY" -eq 0 ]; then
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${BLUE}=== Phase 2: Gameplay Sanity Checks ===${NC}"
    echo ""
  fi

  GAMEPLAY_REPORT="$REPORT_DIR/${TIMESTAMP_FILE}-gameplay.txt"
  if node "$SCRIPT_DIR/gameplay-checks.js" 2>&1 | tee "$GAMEPLAY_REPORT"; then
    GAMEPLAY_EXIT=0
  else
    GAMEPLAY_EXIT=$?
  fi

  if [ "$GAMEPLAY_EXIT" -eq 0 ]; then
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${GREEN}Gameplay checks: PASSED${NC}"
    fi
  else
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${RED}Gameplay checks: FAILED (see report above)${NC}"
    fi
    OVERALL_EXIT=1
  fi
  echo ""
else
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${YELLOW}=== Phase 2: Gameplay Sanity Checks ===${NC}"
    echo "  Sk (--skip-gameplay)"
    echo ""
  fi
fi

# --- Touch & Responsiveness Checks ---
if [ "$SKIP_TOUCH" -eq 0 ]; then
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${BLUE}=== Phase 3: Touch & Responsiveness Checks ===${NC}"
    echo ""
  fi

  TOUCH_REPORT="$REPORT_DIR/${TIMESTAMP_FILE}-touch.txt"
  if node "$SCRIPT_DIR/touch-checks.js" 2>&1 | tee "$TOUCH_REPORT"; then
    TOUCH_EXIT=0
  else
    TOUCH_EXIT=$?
  fi

  if [ "$TOUCH_EXIT" -eq 0 ]; then
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${GREEN}Touch/responsiveness checks: PASSED${NC}"
    fi
  else
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${RED}Touch/responsiveness checks: FAILED (see report above)${NC}"
    fi
    OVERALL_EXIT=1
  fi
  echo ""
else
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${YELLOW}=== Phase 3: Touch & Responsiveness Checks ===${NC}"
    echo "  Sk (--skip-touch)"
    echo ""
  fi
fi

# --- Consolidated Report ---
if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "============================================"
  echo "  QA Suite Complete"
  echo "  $TIMESTAMP"
  echo "============================================"
  echo ""

  if [ "$OVERALL_EXIT" -eq 0 ]; then
    echo -e "  ${GREEN}OVERALL: ALL QA CHECKS PASSED${NC}"
  else
    echo -e "  ${RED}OVERALL: QA CHECKS FAILED${NC}"
  fi

  echo ""
  echo "  Reports saved to: $REPORT_DIR/"
  echo ""

  # List all reports
  if [ -d "$REPORT_DIR" ]; then
    REPORT_COUNT=$(ls "$REPORT_DIR"/*.txt 2>/dev/null | wc -l)
    if [ "$REPORT_COUNT" -gt 0 ]; then
      echo "  Latest reports:"
      ls -lt "$REPORT_DIR"/*.txt 2>/dev/null | head -5 | while read -r line; do
        echo "    $line"
      done
    fi
  fi
  echo ""

  # Quick summary
  echo "  Quick reference:"
  echo "    Build verification:  scripts/qa/verify-build.sh"
  echo "    Gameplay checks:     scripts/qa/gameplay-checks.js"
  echo "    Touch checks:        scripts/qa/touch-checks.js"
  echo "    Master runner:       scripts/qa/run-qa.sh"
  echo "    Pre-backup checklist: backups/QA_CHECKLIST.md"
  echo ""
else
  # JSON mode: output consolidated JSON
  # Collect per-phase results from the latest reports
  BUILD_RESULT="PASS"
  GAMEPLAY_RESULT="PASS"
  TOUCH_RESULT="PASS"
  if [ -d "$REPORT_DIR" ]; then
    LATEST_BUILD=$(ls -t "$REPORT_DIR"/*-build.txt 2>/dev/null | head -1)
    LATEST_GAMEPLAY=$(ls -t "$REPORT_DIR"/*-gameplay.txt 2>/dev/null | head -1)
    LATEST_TOUCH=$(ls -t "$REPORT_DIR"/*-touch.txt 2>/dev/null | head -1)

    if [ -n "$LATEST_BUILD" ] && grep -q '\[FAIL\]' "$LATEST_BUILD" 2>/dev/null; then
      BUILD_RESULT="FAIL"
    fi
    if [ -n "$LATEST_GAMEPLAY" ] && grep -q '\[FAIL\]' "$LATEST_GAMEPLAY" 2>/dev/null; then
      GAMEPLAY_RESULT="FAIL"
    fi
    if [ -n "$LATEST_TOUCH" ] && grep -q '\[FAIL\]' "$LATEST_TOUCH" 2>/dev/null; then
      TOUCH_RESULT="FAIL"
    fi
  fi

  cat <<JSONEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)",
  "project": "$PROJECT_DIR",
  "phases": {
    "build": "$BUILD_RESULT",
    "gameplay": "$GAMEPLAY_RESULT",
    "touch": "$TOUCH_RESULT"
  },
  "overall": "$([ $OVERALL_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')",
  "reports_dir": "$REPORT_DIR"
}
JSONEOF
fi

exit $OVERALL_EXIT
