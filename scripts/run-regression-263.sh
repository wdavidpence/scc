#!/bin/bash
# full suite v247-v263 on current bundle
cd "$(dirname "$0")/.."
FAIL=0
for g in verify-v247-grade verify-v248-chips verify-v249-accent verify-v250-fx verify-v251-hud verify-v252-accent-ring verify-v253-edgeclamp verify-v254-patrol-dust verify-v255-rally-queue-trail verify-v256-radar-voice-weather verify-v257-fx3 verify-v258-crisp verify-v259-foglift verify-v260-keycut verify-v261-mm-sky-dust verify-v262-go-panel verify-v263-edgescrub; do
  if [ ! -f scripts/$g.cjs ]; then echo "SKIP $g (missing)"; continue; fi
  out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/$g.cjs 2>&1 | tail -2)
  if echo "$out" | grep -q "PASS"; then echo "OK   $g :: $(echo "$out" | grep -oE 'GATE-V[0-9]+ [0-9]+/[0-9]+')"; else echo "FAIL $g :: $out"; FAIL=1; fi
done
[ $FAIL -eq 0 ] && echo "SUITE GREEN" || echo "SUITE RED"
exit $FAIL
