#!/bin/bash
# Run v2.46-v2.53.1 regression gates sequentially against local preview :4177
cd "$(dirname "$0")/.."
FAIL=0
for g in verify-v246-chrome verify-v247-grade verify-v248-chips verify-v249-accent verify-v250-fx verify-v251-hud verify-v252-accent-ring verify-v253-edgeclamp verify-v2531-tipcorner; do
  out=$(node scripts/$g.cjs 2>&1 | tail -2)
  if echo "$out" | grep -q "PASS"; then
    echo "OK   $g :: $(echo "$out" | grep -o 'PASS.*' | head -1)"
  else
    echo "FAIL $g :: $out"
    FAIL=1
  fi
done
[ $FAIL -eq 0 ] && echo "SUITE GREEN" || echo "SUITE RED"
exit $FAIL
