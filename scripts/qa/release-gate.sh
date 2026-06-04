#!/usr/bin/env bash
# release-gate.sh — Release gate decision tool for SCC.
#
# Runs all QA checks and produces a release gate report with
# pass/fail thresholds. Useful before tagging a milestone or
# pushing to production.
#
# Usage:
#   ./scripts/qa/release-gate.sh              # full gate check
#   ./scripts/qa/release-gate.sh --json        # machine-readable output
#   ./scripts/qa/release-gate.sh --threshold 80  # fail if score < 80%
#   ./scripts/qa/release-gate.sh --skip-smoke  # skip runtime smoke tests
#   ./scripts/qa/release-gate.sh --tag v1.2.3  # tag this gate run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

JSON_OUTPUT=0
SKIP_SMOKE=0
THRESHOLD=80
TAG=""
GATE_ID="gate-$(date +%Y%m%d-%H%M%S)"
REPORT_FILE="$PROJECT_DIR/backups/qa-reports/${GATE_ID}-report.txt"
mkdir -p "$PROJECT_DIR/backups/qa-reports"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)        JSON_OUTPUT=1; shift ;;
    --skip-smoke)  SKIP_SMOKE=1; shift ;;
    --threshold)   THRESHOLD="$2"; shift 2 ;;
    --tag)         TAG="$2"; shift 2 ;;
    *)             echo "Unknown option: $1"; exit 1 ;;
  esac
done

TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
BUILD_SCORE=0
GAMEPLAY_SCORE=0
TOUCH_SCORE=0
SMOKE_SCORE=0
BUILD_PASS=0
BUILD_FAIL=0
GAMEPLAY_PASS=0
GAMEPLAY_FAIL=0
TOUCH_PASS=0
TOUCH_FAIL=0
SMOKE_PASS=0
SMOKE_FAIL=0

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "============================================"
  echo "  SCC Release Gate"
  echo "  $GATE_ID"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "============================================"
  echo ""
fi

# --- Phase 1: Build Verification ---
if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo -e "${BLUE}=== Phase 1: Build Verification ===${NC}"
  echo ""
fi

BUILD_OUTPUT=$(bash "$SCRIPT_DIR/verify-build.sh" 2>&1)
BUILD_EXIT=$?

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "$BUILD_OUTPUT" | grep -E '^\s+\[|Passed:|Failed:|Skipped:|BUILD' || true
  echo ""
fi

# Extract counts from build output
BUILD_PASS=$(echo "$BUILD_OUTPUT" | grep -c '\[PASS\]' 2>/dev/null || echo 0)
BUILD_PASS=$(echo "$BUILD_PASS" | tr -d '[:space:]')
BUILD_FAIL=$(echo "$BUILD_OUTPUT" | grep -c '\[FAIL\]' 2>/dev/null || echo 0)
BUILD_FAIL=$(echo "$BUILD_FAIL" | tr -d '[:space:]')
TOTAL_PASSED=$((TOTAL_PASSED + BUILD_PASS))
TOTAL_FAILED=$((TOTAL_FAILED + BUILD_FAIL))

if [ "$BUILD_FAIL" -eq 0 ]; then
  BUILD_SCORE=100
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${GREEN}Build: PASS ($BUILD_PASS checks)${NC}"
  fi
else
  BUILD_SCORE=$((BUILD_PASS * 100 / (BUILD_PASS + BUILD_FAIL)))
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${RED}Build: FAIL ($BUILD_FAIL issues, score ${BUILD_SCORE}%)${NC}"
  fi
fi

# --- Phase 2: Gameplay Sanity ---
if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo -e "${BLUE}=== Phase 2: Gameplay Sanity ===${NC}"
  echo ""
fi

GAMEPLAY_OUTPUT=$(node "$SCRIPT_DIR/gameplay-checks.js" 2>&1 || true)
GAMEPLAY_EXIT=$?

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "$GAMEPLAY_OUTPUT" | grep -E '^\s+\[|passed|failed|PASSED|PASSED' || true
  echo ""
fi

GAMEPLAY_PASS=$(echo "$GAMEPLAY_OUTPUT" | grep -c '\[PASS\]' 2>/dev/null || echo 0)
GAMEPLAY_PASS=$(echo "$GAMEPLAY_PASS" | tr -d '[:space:]')
GAMEPLAY_FAIL=$(echo "$GAMEPLAY_OUTPUT" | grep -c '\[FAIL\]' 2>/dev/null || echo 0)
GAMEPLAY_FAIL=$(echo "$GAMEPLAY_FAIL" | tr -d '[:space:]')
TOTAL_PASSED=$((TOTAL_PASSED + GAMEPLAY_PASS))
TOTAL_FAILED=$((TOTAL_FAILED + GAMEPLAY_FAIL))

if [ "$GAMEPLAY_FAIL" -eq 0 ]; then
  GAMEPLAY_SCORE=100
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${GREEN}Gameplay: PASS ($GAMEPLAY_PASS checks)${NC}"
  fi
else
  GAMEPLAY_SCORE=$((GAMEPLAY_PASS * 100 / (GAMEPLAY_PASS + GAMEPLAY_FAIL)))
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${RED}Gameplay: FAIL ($GAMEPLAY_FAIL issues, score ${GAMEPLAY_SCORE}%)${NC}"
  fi
fi

# --- Phase 3: Touch & Responsiveness ---
if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo -e "${BLUE}=== Phase 3: Touch & Responsiveness ===${NC}"
  echo ""
fi

TOUCH_OUTPUT=$(node "$SCRIPT_DIR/touch-checks.js" 2>&1 || true)
TOUCH_EXIT=$?

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "$TOUCH_OUTPUT" | grep -E '^\s+\[|passed|failed|PASSED|PASSED' || true
  echo ""
fi

TOUCH_PASS=$(echo "$TOUCH_OUTPUT" | grep -c '\[PASS\]' 2>/dev/null || echo 0)
TOUCH_PASS=$(echo "$TOUCH_PASS" | tr -d '[:space:]')
TOUCH_FAIL=$(echo "$TOUCH_OUTPUT" | grep -c '\[FAIL\]' 2>/dev/null || echo 0)
TOUCH_FAIL=$(echo "$TOUCH_FAIL" | tr -d '[:space:]')
TOTAL_PASSED=$((TOTAL_PASSED + TOUCH_PASS))
TOTAL_FAILED=$((TOTAL_FAILED + TOUCH_FAIL))

if [ "$TOUCH_FAIL" -eq 0 ]; then
  TOUCH_SCORE=100
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${GREEN}Touch: PASS ($TOUCH_PASS checks)${NC}"
  fi
else
  TOUCH_SCORE=$((TOUCH_PASS * 100 / (TOUCH_PASS + TOUCH_FAIL)))
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "  ${RED}Touch: FAIL ($TOUCH_FAIL issues, score ${TOUCH_SCORE}%)${NC}"
  fi
fi

# --- Phase 4: Runtime Smoke Tests ---
if [ "$SKIP_SMOKE" -eq 0 ]; then
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${BLUE}=== Phase 4: Runtime Smoke Tests ===${NC}"
    echo ""
  fi

  SMOKE_OUTPUT=$(bash "$SCRIPT_DIR/smoke-test.sh" 2>&1 || true)
  SMOKE_EXIT=$?

  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo "$SMOKE_OUTPUT" | grep -E '^\s+\[|Passed:|Failed:' || true
    echo ""
  fi

  SMOKE_PASS=$(echo "$SMOKE_OUTPUT" | grep -c '\[PASS\]' 2>/dev/null || echo 0)
  SMOKE_PASS=$(echo "$SMOKE_PASS" | tr -d '[:space:]')
  SMOKE_FAIL=$(echo "$SMOKE_OUTPUT" | grep -c '\[FAIL\]' 2>/dev/null || echo 0)
  SMOKE_FAIL=$(echo "$SMOKE_FAIL" | tr -d '[:space:]')
  TOTAL_PASSED=$((TOTAL_PASSED + SMOKE_PASS))
  TOTAL_FAILED=$((TOTAL_FAILED + SMOKE_FAIL))

  if [ "$SMOKE_FAIL" -eq 0 ]; then
    SMOKE_SCORE=100
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${GREEN}Smoke: PASS ($SMOKE_PASS checks)${NC}"
    fi
  else
    if [ $((SMOKE_PASS + SMOKE_FAIL)) -gt 0 ]; then
      SMOKE_SCORE=$((SMOKE_PASS * 100 / (SMOKE_PASS + SMOKE_FAIL)))
    fi
    if [ "$JSON_OUTPUT" -eq 0 ]; then
      echo -e "  ${RED}Smoke: FAIL ($SMOKE_FAIL issues, score ${SMOKE_SCORE}%)${NC}"
    fi
  fi
else
  if [ "$JSON_OUTPUT" -eq 0 ]; then
    echo -e "${YELLOW}=== Phase 4: Runtime Smoke Tests ===${NC}"
    echo "  Skipped (--skip-smoke)"
    echo ""
  fi
fi

# --- Gate Decision ---
TOTAL_CHECKS=$((TOTAL_PASSED + TOTAL_FAILED))
if [ "$TOTAL_CHECKS" -gt 0 ]; then
  OVERALL_SCORE=$((TOTAL_PASSED * 100 / TOTAL_CHECKS))
else
  OVERALL_SCORE=0
fi

if [ "$JSON_OUTPUT" -eq 0 ]; then
  echo "============================================"
  echo "  Release Gate Decision"
  echo "  $GATE_ID"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "============================================"
  echo ""
  echo -e "  ${BOLD}Per-Phase Scores:${NC}"
  echo -e "    Build verification:  ${BUILD_SCORE}%"
  echo -e "    Gameplay sanity:     ${GAMEPLAY_SCORE}%"
  echo -e "    Touch/responsiveness:${TOUCH_SCORE}%"
  if [ "$SKIP_SMOKE" -eq 0 ]; then
    echo -e "    Runtime smoke:       ${SMOKE_SCORE}%"
  else
    echo -e "    Runtime smoke:       SKIPPED"
  fi
  echo ""
  echo -e "  ${BOLD}Overall: ${OVERALL_SCORE}% ($TOTAL_PASSED/$TOTAL_CHECKS checks passed)${NC}"
  echo ""

  if [ "$OVERALL_SCORE" -ge "$THRESHOLD" ] && [ "$TOTAL_FAILED" -eq 0 ]; then
    GATE_RESULT="RELEASE"
    echo -e "  ${GREEN}${BOLD}GATE RESULT: RELEASE APPROVED${NC}"
  elif [ "$OVERALL_SCORE" -ge "$THRESHOLD" ]; then
    GATE_RESULT="CONDITIONAL"
    echo -e "  ${YELLOW}${BOLD}GATE RESULT: CONDITIONAL ($TOTAL_FAILED issue(s) below threshold)${NC}"
  else
    GATE_RESULT="BLOCKED"
    echo -e "  ${RED}${BOLD}GATE RESULT: RELEASE BLOCKED (score ${OVERALL_SCORE}% < ${THRESHOLD}% threshold)${NC}"
  fi
  echo ""
  echo "  Gate report saved to: $REPORT_FILE"
  echo ""

  # Save report
  cat > "$REPORT_FILE" <<EOF
SCC Release Gate Report
=======================
Gate ID:    $GATE_ID
Timestamp:  $(date '+%Y-%m-%d %H:%M:%S')
Tag:        ${TAG:-none}
Threshold:  $THRESHOLD%

Per-Phase Scores:
  Build:           ${BUILD_SCORE}% ($BUILD_PASS passed, $BUILD_FAIL failed)
  Gameplay:        ${GAMEPLAY_SCORE}% ($GAMEPLAY_PASS passed, $GAMEPLAY_FAIL failed)
  Touch:           ${TOUCH_SCORE}% ($TOUCH_PASS passed, $TOUCH_FAIL failed)
  Smoke:           ${SMOKE_SCORE}% ($SMOKE_PASS passed, $SMOKE_FAIL failed)

Overall:           ${OVERALL_SCORE}% ($TOTAL_PASSED passed, $TOTAL_FAILED failed)
Gate Result:       $GATE_RESULT

Files:
  Master runner:   scripts/qa/run-qa.sh
  Build verify:    scripts/qa/verify-build.sh
  Gameplay checks: scripts/qa/gameplay-checks.js
  Touch checks:    scripts/qa/touch-checks.js
  Smoke test:      scripts/qa/smoke-test.sh
  Release gate:    scripts/qa/release-gate.sh
  Checklist:       backups/QA_CHECKLIST.md
EOF
else
  # JSON mode
  cat <<JSONEOF
{
  "gate_id": "$GATE_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)",
  "tag": "${TAG:-none}",
  "threshold": $THRESHOLD,
  "phases": {
    "build": {"score": $BUILD_SCORE, "pass": $BUILD_PASS, "fail": $BUILD_FAIL},
    "gameplay": {"score": $GAMEPLAY_SCORE, "pass": $GAMEPLAY_PASS, "fail": $GAMEPLAY_FAIL},
    "touch": {"score": $TOUCH_SCORE, "pass": $TOUCH_PASS, "fail": $TOUCH_FAIL},
    "smoke": {"score": $SMOKE_SCORE, "pass": $SMOKE_PASS, "fail": $SMOKE_FAIL, "skipped": $SKIP_SMOKE}
  },
  "overall": {
    "score": $OVERALL_SCORE,
    "pass": $TOTAL_PASSED,
    "fail": $TOTAL_FAILED,
    "result": "$GATE_RESULT"
  },
  "report_file": "$REPORT_FILE"
}
JSONEOF
fi

exit $TOTAL_FAILED
