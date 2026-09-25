#!/bin/bash
# full suite v247-v263 on current bundle
cd "$(dirname "$0")/.."
FAIL=0
# Phase-1 kernel gates (pure Node, no browser)
for g in verify-rng verify-fixed-tick verify-input-queue verify-sim-timers verify-order-golden verify-desync-report verify-replay-runner verify-worker-flow; do
  out=$(node scripts/$g.cjs 2>&1 | tail -1)
  if echo "$out" | grep -q "PASS"; then echo "OK   $g :: $out"; else echo "FAIL $g :: $out"; FAIL=1; fi
done
for g in verify-v247-grade verify-v248-chips verify-v249-accent verify-v250-fx verify-v251-hud verify-v252-accent-ring verify-v253-edgeclamp verify-v254-patrol-dust verify-v255-rally-queue-trail verify-v256-radar-voice-weather verify-v257-fx3 verify-v258-crisp verify-v259-foglift verify-v260-keycut verify-v261-mm-sky-dust verify-v262-go-panel verify-v263-edgescrub; do
  if [ ! -f scripts/$g.cjs ]; then echo "SKIP $g (missing)"; continue; fi
  out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/$g.cjs 2>&1 | tail -2)
  if echo "$out" | grep -q "PASS"; then echo "OK   $g :: $(echo "$out" | grep -oE 'GATE-V[0-9]+ [0-9]+/[0-9]+')"; else echo "FAIL $g :: $out"; FAIL=1; fi
done
# P0.018 seeded routing (pure Node, oracle-checked)
out=$(node scripts/verify-routing-seeded.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "fail=0"; then echo "OK   routing-seeded :: $out"; else echo "FAIL routing-seeded :: $out"; FAIL=1; fi
# P1.027-i3 command-queue live wiring (browser, manual-clock harness)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-cmd-live.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "PASS 8/8"; then echo "OK   cmd-live :: $out"; else echo "FAIL cmd-live :: $out"; FAIL=1; fi
# P1.029 tick-split parity (browser, manual-clock harness — needs QA server)
# P1.036 per-tick hash ring (browser, manual-clock harness)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-hash-ring.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "HASH-RING PASS"; then echo "OK   hash-ring :: $out"; else echo "FAIL hash-ring :: $out"; FAIL=1; fi
# P1.029 tick-split parity (browser, manual-clock harness — needs QA server)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-tick-parity.cjs 2>&1 | tail -1)
if echo "$out" | grep -q "PASS"; then echo "OK   tick-parity :: $out"; else echo "FAIL tick-parity :: $out"; FAIL=1; fi
# P1.039 player-economy chain (browser, ~3 min: deploy + train + 100 s hands-off mining)
out=$(SCC_URL=${SCC_URL:-http://127.0.0.1:4177/scc/} node scripts/verify-economy-live.cjs 2>&1 | tail -3)
if echo "$out" | grep -q "ACCEPTANCE PASS"; then echo "OK   economy-live :: chain hands-off"; else echo "FAIL economy-live :: $out"; FAIL=1; fi
[ $FAIL -eq 0 ] && echo "SUITE GREEN" || echo "SUITE RED"
exit $FAIL
