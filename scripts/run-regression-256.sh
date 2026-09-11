#!/bin/bash
cd "$(dirname "$0")/.."
FAIL=0
for g in verify-v254-patrol-dust verify-v255-rally-queue-trail verify-v256-radar-voice-weather; do
  out=$(node scripts/$g.cjs 2>&1 | tail -2)
  if echo "$out" | grep -q "PASS"; then echo "OK   $g"; else echo "FAIL $g :: $out"; FAIL=1; fi
done
[ $FAIL -eq 0 ] && echo "SUITE GREEN" || echo "SUITE RED"
exit $FAIL
